import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Monitor, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';

export default function ConvertModeDialog({ ticket, ticketTypes, occurrence, open, onClose, onConverted }) {
  const [loading, setLoading] = useState(false);
  const [inPersonOccurrences, setInPersonOccurrences] = useState([]);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState('');
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState('');
  const [targetTicketTypes, setTargetTicketTypes] = useState([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);

  const isCurrentlyOnline = ticket?.attendance_mode === 'online';
  const targetMode = isCurrentlyOnline ? 'in_person' : 'online';

  useEffect(() => {
    if (!open || !ticket) return;
    setSelectedOccurrenceId('');
    setSelectedTicketTypeId('');
    setTargetTicketTypes([]);

    if (isCurrentlyOnline) {
      loadInPersonOccurrences();
    } else {
      // Converting to online — find online ticket types for current occurrence
      const onlineTypes = Object.values(ticketTypes).filter(
        tt => tt.attendance_mode === 'online' && tt.is_active !== false && tt.occurrence_id === ticket.occurrence_id
      );
      setTargetTicketTypes(onlineTypes);
      if (onlineTypes.length === 1) {
        setSelectedTicketTypeId(onlineTypes[0].id);
      }
    }
  }, [open, ticket]);

  async function loadInPersonOccurrences() {
    setLoadingOccurrences(true);
    // Get the same week's occurrences that have in-person ticket types
    const allOccs = await base44.entities.EventOccurrence.filter({
      status: 'published',
      is_published: true
    });

    // Filter to same week and has in-person capability (exclude current occurrence)
    const currentDate = occurrence?.event_date;
    let relevantOccs = allOccs;

    if (currentDate) {
      const current = new Date(currentDate + 'T00:00:00');
      const dayOfWeek = current.getDay();
      const weekStart = new Date(current);
      weekStart.setDate(current.getDate() - dayOfWeek);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      relevantOccs = allOccs.filter(o => {
        if (o.id === occurrence.id) return false;
        const d = new Date(o.event_date + 'T00:00:00');
        return d >= weekStart && d <= weekEnd;
      });
    } else {
      relevantOccs = allOccs.filter(o => o.id !== occurrence?.id);
    }

    // Sort by date
    relevantOccs.sort((a, b) => a.event_date.localeCompare(b.event_date));
    setInPersonOccurrences(relevantOccs);
    setLoadingOccurrences(false);
  }

  async function handleOccurrenceSelect(occId) {
    setSelectedOccurrenceId(occId);
    setSelectedTicketTypeId('');
    // Load in-person ticket types for that occurrence
    const tts = await base44.entities.TicketType.filter({ occurrence_id: occId });
    const inPersonTypes = tts.filter(tt => tt.attendance_mode === 'in_person' && tt.is_active !== false);
    setTargetTicketTypes(inPersonTypes);
    if (inPersonTypes.length === 1) {
      setSelectedTicketTypeId(inPersonTypes[0].id);
    }
  }

  async function handleConvert() {
    if (!selectedTicketTypeId) return;
    setLoading(true);

    const payload = {
      ticket_id: ticket.id,
      target_ticket_type_id: selectedTicketTypeId,
    };
    // If converting to in-person at a different occurrence
    if (isCurrentlyOnline && selectedOccurrenceId && selectedOccurrenceId !== ticket.occurrence_id) {
      payload.target_occurrence_id = selectedOccurrenceId;
    }

    const res = await base44.functions.invoke('convertTicketMode', payload);

    setLoading(false);
    if (res.data.success) {
      onConverted(res.data);
      onClose();
    } else {
      alert(res.data.error || 'Failed to convert ticket');
    }
  }

  if (!ticket) return null;

  const modeLabel = isCurrentlyOnline ? 'In-Person' : 'Online';
  const ModeIcon = isCurrentlyOnline ? MapPin : Monitor;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ModeIcon className="h-5 w-5" />
            Convert to {modeLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Converting <strong>{ticket.attendee_first_name} {ticket.attendee_last_name}</strong> from{' '}
            <Badge variant="secondary" className="text-xs">{ticket.attendance_mode === 'online' ? 'Online' : 'In-Person'}</Badge>
            {' → '}
            <Badge variant="default" className="text-xs">{modeLabel}</Badge>
          </p>

          {isCurrentlyOnline && (
            <div className="space-y-2">
              <Label>Select In-Person Event</Label>
              {loadingOccurrences ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading events...
                </div>
              ) : inPersonOccurrences.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No other published events found for this week.</p>
              ) : (
                <Select value={selectedOccurrenceId} onValueChange={handleOccurrenceSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {inPersonOccurrences.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} — {new Date(o.event_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {targetTicketTypes.length > 0 && (isCurrentlyOnline ? selectedOccurrenceId : true) && (
            <div className="space-y-2">
              <Label>Ticket Type</Label>
              {targetTicketTypes.length === 1 ? (
                <p className="text-sm font-medium py-1">{targetTicketTypes[0].name}</p>
              ) : (
                <Select value={selectedTicketTypeId} onValueChange={setSelectedTicketTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ticket type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetTicketTypes.map(tt => {
                      const remaining = tt.capacity_limit != null ? tt.capacity_limit - (tt.quantity_sold || 0) : null;
                      return (
                        <SelectItem key={tt.id} value={tt.id} disabled={remaining !== null && remaining <= 0}>
                          {tt.name}
                          {remaining !== null ? ` (${remaining} spots left)` : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {targetTicketTypes.length === 0 && !loadingOccurrences && (isCurrentlyOnline ? selectedOccurrenceId : true) && (
            <p className="text-sm text-muted-foreground">
              No {isCurrentlyOnline ? 'in-person' : 'online'} ticket types available{isCurrentlyOnline ? ' for this event' : ''}.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            An email will be sent to {ticket.attendee_email} with their updated ticket details
            {isCurrentlyOnline ? ' and QR code for check-in' : ' and online access link'}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConvert}
            disabled={!selectedTicketTypeId || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ModeIcon className="h-4 w-4 mr-1.5" />}
            Convert to {modeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}