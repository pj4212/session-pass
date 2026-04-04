import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AttendeeForm({ 
  index, 
  total, 
  ticketTypeName, 
  attendanceMode, 
  attendee, 
  onChange, 
  leaders,
  isBuyerSlot = false
}) {
  const update = (field, value) => {
    onChange({ ...attendee, [field]: value });
  };

  const isFirstTicket = isBuyerSlot;
  const modeLabel = attendanceMode === 'online' ? 'Online' : 'In-Person';

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">
          Ticket {index + 1} of {total} — {ticketTypeName} ({modeLabel})
        </h4>
      </div>

      {isFirstTicket && (
        <p className="text-sm text-muted-foreground">Auto-filled from buyer details above</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>First Name *</Label>
          <Input
            value={attendee.first_name}
            onChange={e => update('first_name', e.target.value)}
            placeholder="First name"
            disabled={isFirstTicket}
          />
        </div>
        <div>
          <Label>Last Name *</Label>
          <Input
            value={attendee.last_name}
            onChange={e => update('last_name', e.target.value)}
            placeholder="Last name"
            disabled={isFirstTicket}
          />
        </div>
      </div>

      <div>
        <Label>Email *</Label>
        <Input
          type="email"
          value={attendee.email}
          onChange={e => update('email', e.target.value)}
          placeholder="attendee@example.com"
          disabled={isFirstTicket}
        />
      </div>

      <div>
        <div>
          <Label>Platinum Leader</Label>
          <Select value={attendee.platinum_leader_id || ''} onValueChange={v => update('platinum_leader_id', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select leader..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>None</SelectItem>
              {leaders.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}