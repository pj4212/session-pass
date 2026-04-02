import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AttendeeForm({ 
  index, 
  total, 
  ticketTypeName, 
  attendanceMode, 
  attendee, 
  onChange, 
  buyer, 
  mentors, 
  leaders,
  sameAsBuyer,
  onSameAsBuyerChange
}) {
  const update = (field, value) => {
    onChange({ ...attendee, [field]: value });
  };

  const handleSameAsBuyer = (checked) => {
    onSameAsBuyerChange(checked);
    if (checked) {
      onChange({
        ...attendee,
        first_name: buyer.first_name,
        last_name: buyer.last_name,
        email: buyer.email
      });
    }
  };

  const modeLabel = attendanceMode === 'online' ? 'Online' : 'In-Person';

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">
          Ticket {index + 1} of {total} — {ticketTypeName} ({modeLabel})
        </h4>
      </div>

      {index === 0 && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`same-as-buyer-${index}`}
            checked={sameAsBuyer}
            onCheckedChange={handleSameAsBuyer}
          />
          <Label htmlFor={`same-as-buyer-${index}`} className="text-sm">
            Same as buyer details
          </Label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>First Name *</Label>
          <Input
            value={attendee.first_name}
            onChange={e => update('first_name', e.target.value)}
            placeholder="First name"
            disabled={index === 0 && sameAsBuyer}
          />
        </div>
        <div>
          <Label>Last Name *</Label>
          <Input
            value={attendee.last_name}
            onChange={e => update('last_name', e.target.value)}
            placeholder="Last name"
            disabled={index === 0 && sameAsBuyer}
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
          disabled={index === 0 && sameAsBuyer}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Upline Mentor</Label>
          <Select value={attendee.upline_mentor_id || ''} onValueChange={v => update('upline_mentor_id', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select mentor..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>None</SelectItem>
              {mentors.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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