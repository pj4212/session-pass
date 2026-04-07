import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2 } from 'lucide-react';

export default function VenueConfirmDialog({ open, onOpenChange, event, locations, onConfirmed }) {
  const [venues, setVenues] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [venueData, setVenueData] = useState({
    venue_id: '',
    venue_name: '',
    venue_link: '',
    parking_link: '',
    venue_details: ''
  });

  useEffect(() => {
    if (open && event) {
      setShowDetails(false);
      setVenueData({
        venue_id: event.venue_id || '',
        venue_name: event.venue_name || '',
        venue_link: event.venue_link || '',
        parking_link: event.parking_link || '',
        venue_details: event.venue_details || ''
      });
      base44.entities.Venue.filter({ is_active: true }).then(setVenues);
    }
  }, [open, event?.id]);

  if (!event) return null;

  const filteredVenues = event.location_id
    ? venues.filter(v => v.location_id === event.location_id || !v.location_id)
    : venues;

  const handleSelectVenue = (venueId) => {
    if (venueId === 'custom') {
      setVenueData({ venue_id: '', venue_name: '', venue_link: '', parking_link: '', venue_details: '' });
      setShowDetails(true);
      return;
    }
    const venue = venues.find(v => v.id === venueId);
    if (venue) {
      setVenueData({
        venue_id: venue.id,
        venue_name: venue.name,
        venue_link: venue.venue_link || '',
        parking_link: venue.parking_link || '',
        venue_details: [venue.name, venue.address].filter(Boolean).join(', ')
      });
      setShowDetails(false);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    const update = {
      venue_id: venueData.venue_id,
      venue_name: venueData.venue_name,
      venue_link: venueData.venue_link,
      parking_link: venueData.parking_link,
      venue_details: venueData.venue_details,
      venue_confirmed: true
    };
    await base44.entities.EventOccurrence.update(event.id, update);
    onConfirmed(event.id, update);
    setSaving(false);
    onOpenChange(false);
  };

  const loc = locations[event.location_id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Confirm Venue</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select and confirm the venue for <strong>{event.name}</strong> on{' '}
          {new Date(event.event_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          {loc && <span className="text-foreground"> — {loc.name}</span>}.
        </p>

        <div className="space-y-3 mt-1">
          <div>
            <Label>Venue</Label>
            <Select value={venueData.venue_id || 'custom'} onValueChange={handleSelectVenue}>
              <SelectTrigger><SelectValue placeholder="Select a venue..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom / Manual Entry</SelectItem>
                {filteredVenues.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}{v.address ? ` — ${v.address}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showDetails && (
            <>
              <div>
                <Label>Venue Name</Label>
                <Input value={venueData.venue_name} onChange={e => setVenueData(p => ({ ...p, venue_name: e.target.value }))} placeholder="e.g. Deakin University, Room 301" />
              </div>
              <div>
                <Label>Venue Details</Label>
                <Input value={venueData.venue_details} onChange={e => setVenueData(p => ({ ...p, venue_details: e.target.value }))} placeholder="Full address or directions" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Venue Link (Google Maps)</Label>
                  <Input value={venueData.venue_link} onChange={e => setVenueData(p => ({ ...p, venue_link: e.target.value }))} placeholder="https://maps.google.com/..." />
                </div>
                <div>
                  <Label>Parking Link</Label>
                  <Input value={venueData.parking_link} onChange={e => setVenueData(p => ({ ...p, parking_link: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-3 justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving || (!venueData.venue_id && !venueData.venue_name)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}