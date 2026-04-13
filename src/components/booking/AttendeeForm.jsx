import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";

export default function AttendeeForm({ 
  index, 
  total, 
  ticketTypeName, 
  attendanceMode, 
  attendee, 
  onChange, 
  leaders,
  isBuyerSlot = false,
  emailOptional = false,
  askPlatinumLeader = true,
  customQuestions = []
}) {
  const update = (field, value) => {
    onChange({ ...attendee, [field]: value });
  };

  const updateCustomAnswer = (qLabel, value) => {
    const answers = { ...(attendee.custom_answers || {}) };
    answers[qLabel] = value;
    onChange({ ...attendee, custom_answers: answers });
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

      {!emailOptional && (
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
      )}

      {askPlatinumLeader && (
        <div>
          <Label>Platinum Leader *</Label>
          <div className="relative">
            <select
              value={attendee.platinum_leader_id || ''}
              onChange={e => update('platinum_leader_id', e.target.value)}
              className="flex h-9 w-full appearance-none items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>Select leader...</option>
              {leaders.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
          </div>
        </div>
      )}

      {customQuestions.map((q, qIdx) => (
        <div key={qIdx}>
          <Label>{q.label}{q.required ? ' *' : ''}</Label>
          {q.type === 'select' ? (
            <div className="relative">
              <select
                value={(attendee.custom_answers || {})[q.label] || ''}
                onChange={e => updateCustomAnswer(q.label, e.target.value)}
                className="flex h-9 w-full appearance-none items-center rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>Select...</option>
                {(q.options || []).map((opt, oIdx) => (
                  <option key={oIdx} value={opt}>{opt}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            </div>
          ) : (
            <Input
              value={(attendee.custom_answers || {})[q.label] || ''}
              onChange={e => updateCustomAnswer(q.label, e.target.value)}
              placeholder={q.label}
            />
          )}
        </div>
      ))}
    </div>
  );
}