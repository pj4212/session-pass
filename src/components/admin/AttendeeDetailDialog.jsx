import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Trash2, Loader2, CheckCircle2, Circle, Monitor, MapPin } from 'lucide-react';
import ConvertModeDialog from './ConvertModeDialog';

export default function AttendeeDetailDialog({ ticket, ticketType, leader, order, occurrence, ticketTypes, open, onClose, onUpdate }) {
  const [actionLoading, setActionLoading] = useState(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);

  if (!ticket) return null;


  const isCheckedIn = ticket.check_in_status === 'checked_in';
  const isActive = ticket.ticket_status === 'active';
  const isPaid = order?.payment_status === 'completed' && order?.total_amount > 0;



  const handleDelete = async () => {
    if (!confirm(`Permanently delete this ticket for ${ticket.attendee_first_name} ${ticket.attendee_last_name}? This cannot be undone.`)) return;
    setActionLoading('delete');
    // If online ticket on a webinar event, deregister from Zoom first
    if (ticket.attendance_mode === 'online' && occurrence && (occurrence.zoom_meeting_id || (occurrence.zoom_link && /\/register\/WN_|\/w\/\d+/.test(occurrence.zoom_link)))) {
      try {
        await base44.functions.invoke('deregisterZoomAttendee', {
          ticket_id: ticket.id,
          occurrence_id: occurrence.id
        });
      } catch (err) {
        console.error('Zoom deregistration failed (non-blocking):', err.message);
      }
    }
    await base44.entities.Ticket.delete(ticket.id);
    onUpdate(ticket.id, null); // null signals deletion
    setActionLoading(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attendee Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name & Email */}
          <div>
            <p className="text-lg font-semibold text-foreground">{ticket.attendee_first_name} {ticket.attendee_last_name}</p>
            <p className="text-sm text-muted-foreground">{ticket.attendee_email}</p>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={isActive ? 'default' : 'destructive'}>{ticket.ticket_status}</Badge>
            <Badge variant="secondary" className="gap-1">
              {isCheckedIn ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {isCheckedIn ? 'Checked In' : 'Not Checked In'}
            </Badge>

          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Ticket Type</p>
              <p className="font-medium">{ticketType?.name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Attendance</p>
              <p className="font-medium">{ticket.attendance_mode === 'online' ? 'Online' : 'In-Person'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Platinum Leader</p>
              <p className="font-medium">{leader?.name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ticket Price</p>
              <p className="font-medium">{ticketType?.requires_payment ? `$${(ticketType.price || 0).toFixed(2)} (Paid)` : 'Free'}</p>
            </div>
            {order && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Order</p>
                <p className="font-medium">{order.order_number} — {order.buyer_name}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            {isActive && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConvertDialogOpen(true)}
                disabled={!!actionLoading}
              >
                {ticket.attendance_mode === 'online' ? (
                  <><MapPin className="h-4 w-4 mr-1.5" />Convert to In-Person</>
                ) : (
                  <><Monitor className="h-4 w-4 mr-1.5" />Convert to Online</>
                )}
              </Button>
            )}
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={!!actionLoading}
            >
              {actionLoading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>

      {ticket && (
        <ConvertModeDialog
          ticket={ticket}
          ticketTypes={ticketTypes || {}}
          occurrence={occurrence}
          open={convertDialogOpen}
          onClose={() => setConvertDialogOpen(false)}
          onConverted={(result) => {
            onUpdate(ticket.id, {
              attendance_mode: result.new_mode,
              ticket_type_id: result.new_ticket_type_id,
              qr_code_hash: result.qr_code_hash,
            });
            setConvertDialogOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}