import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Ban, RefreshCw, CheckCircle2, Circle, Users, Briefcase } from 'lucide-react';

export default function AttendeeCard({ ticket, ticketType, leader, isSuperAdmin, actionLoading, onCancel, onRefund, onReschedule }) {
  const isBO = ticketType?.ticket_category === 'business_owner';
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
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
          {isBO ? <Briefcase className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {isBO ? 'Business Owner' : 'Candidate'}
        </Badge>
        {ticketType?.name && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {ticketType.name}
          </Badge>
        )}
        {leader?.name && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {leader.name}
          </Badge>
        )}
      </div>

      {isSuperAdmin && isActive && (
        <div className="flex gap-1 mt-2.5 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => onCancel(ticket)} disabled={actionLoading}>
            <X className="h-3 w-3 mr-1" />Cancel
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => onRefund(ticket)} disabled={actionLoading}>
            <Ban className="h-3 w-3 mr-1" />Refund
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => onReschedule(ticket)} disabled={actionLoading}>
            <RefreshCw className="h-3 w-3 mr-1" />Move
          </Button>
        </div>
      )}
    </div>
  );
}