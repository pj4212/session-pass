import { Badge } from "@/components/ui/badge";
import { Monitor, MapPin } from "lucide-react";

export default function TicketCard({ ticket, occurrence, ticketType }) {
  const qrPayload = JSON.stringify({ t: ticket.id, e: ticket.occurrence_id, h: ticket.qr_code_hash });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrPayload)}`;

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold">{ticket.attendee_first_name} {ticket.attendee_last_name}</p>
          <p className="text-sm text-muted-foreground">{ticket.attendee_email}</p>
        </div>
        <Badge variant={ticket.attendance_mode === 'online' ? 'secondary' : 'default'}>
          {ticket.attendance_mode === 'online' ? (
            <><Monitor className="h-3 w-3 mr-1" /> Online</>
          ) : (
            <><MapPin className="h-3 w-3 mr-1" /> In-Person</>
          )}
        </Badge>
      </div>

      <p className="text-sm mb-1">
        <span className="text-muted-foreground">Ticket Type:</span> {ticketType?.name || 'General'}
      </p>

      {ticket.attendance_mode === 'online' && (ticket.zoom_join_url || occurrence.zoom_link) && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 mt-3">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Join Webinar</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">You're registered — click below to join directly.</p>
          <a href={ticket.zoom_join_url || occurrence.zoom_link} target="_blank" rel="noopener noreferrer" 
             className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700">
            Join Webinar →
          </a>
        </div>
      )}

      {ticket.attendance_mode === 'in_person' && occurrence.venue_details && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3 mt-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Venue Details</p>
          <p className="text-sm text-green-700 dark:text-green-300">{occurrence.venue_details}</p>
        </div>
      )}

      {ticket.qr_code_hash && ticket.qr_code_hash !== 'pending' && ticket.qr_code_hash !== 'temp' && (
        <div className="mt-4 flex justify-center">
          <img src={qrUrl} alt="QR Code" className="w-40 h-40" />
        </div>
      )}
    </div>
  );
}