import { Link } from 'react-router-dom';
import { Calendar, Users, Briefcase, CheckCircle2, MapPin, Wifi } from 'lucide-react';

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function ModeIcon({ mode }) {
  if (mode === 'online_stream') return <Wifi className="h-3.5 w-3.5 text-blue-400" />;
  if (mode === 'in_person') return <MapPin className="h-3.5 w-3.5 text-emerald-400" />;
  return (
    <div className="flex gap-0.5">
      <MapPin className="h-3.5 w-3.5 text-emerald-400" />
      <Wifi className="h-3.5 w-3.5 text-blue-400" />
    </div>
  );
}

export default function WeeklyEvents({ events, tickets, ticketTypes }) {
  const { monday, sunday } = getWeekBounds();
  const ttMap = {};
  ticketTypes.forEach(tt => { ttMap[tt.id] = tt; });

  const weekEvents = events
    .filter(e => {
      const d = new Date(e.event_date + 'T00:00:00');
      return d >= monday && d <= sunday && e.status !== 'cancelled';
    })
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  if (weekEvents.length === 0) return null;

  const eventsWithStats = weekEvents.map(ev => {
    const evTickets = tickets.filter(t => t.occurrence_id === ev.id);
    const candidates = evTickets.filter(t => (ttMap[t.ticket_type_id]?.ticket_category || 'candidate') === 'candidate').length;
    const businessOwners = evTickets.filter(t => ttMap[t.ticket_type_id]?.ticket_category === 'business_owner').length;
    const checkedIn = evTickets.filter(t => t.check_in_status === 'checked_in').length;
    return { ...ev, candidates, businessOwners, checkedIn, total: evTickets.length };
  });

  const monStr = monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const sunStr = sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          This Week <span className="normal-case font-normal">({monStr} – {sunStr})</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {eventsWithStats.map(ev => (
          <Link
            key={ev.id}
            to={`/admin/events/${ev.id}/attendees`}
            className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{ev.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
              <ModeIcon mode={ev.event_mode} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={Users} label="Candidates" value={ev.candidates} color="text-blue-400" />
              <Stat icon={Briefcase} label="Business" value={ev.businessOwners} color="text-amber-400" />
              <Stat icon={CheckCircle2} label="Checked In" value={ev.checkedIn} color="text-emerald-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-lg font-bold text-foreground">{value}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}