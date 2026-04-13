import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, CheckCircle2, Circle } from 'lucide-react';

export default function AttendeeCard({ ticket, ticketType, leader, isSuperAdmin, actionLoading, onDelete, onReschedule }) {

  const isCheckedIn = ticket.check_in_status === 'checked_in';
  const isActive = ticket.ticket_status === 'active';

  return (
    <div className={`bg-card border rounded-xl p-3.5 ${!isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">
            {ticket.attendee_first_name} {ticket.attendee_last_name}
          </p>
          <p className="text-xs text-muted-foreground truncate">{ticket.attendee_email}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCheckedIn ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground/40" />
          )}
          <Badge variant={isActive ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
            {ticket.ticket_status}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {ticketType?.name || 'Unknown'}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {ticket.attendance_mode === 'online' ? 'Online' : 'In-Person'}
        </Badge>
        {leader?.name && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {leader.name}
          </Badge>
        )}
      </div>

      {isSuperAdmin && isActive && (
        <div className="flex gap-1 mt-2.5 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(ticket); }} disabled={actionLoading}>
            <Trash2 className="h-3 w-3 mr-1" />Delete
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={(e) => { e.stopPropagation(); onReschedule(ticket); }} disabled={actionLoading}>
            <RefreshCw className="h-3 w-3 mr-1" />Move
          </Button>
        </div>
      )}
    </div>
  );
}