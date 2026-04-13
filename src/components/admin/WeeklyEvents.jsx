import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Ticket, CheckCircle2, MapPin, Wifi, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getWeekBounds(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + weekOffset * 7);
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
  const [weekOffset, setWeekOffset] = useState(0);
  const { monday, sunday } = getWeekBounds(weekOffset);
  const ttMap = {};
  ticketTypes.forEach(tt => { ttMap[tt.id] = tt; });

  const weekEvents = events
    .filter(e => {
      const d = new Date(e.event_date + 'T00:00:00');
      return d >= monday && d <= sunday && e.status !== 'cancelled';
    })
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const weekLabel = weekOffset === 0 ? 'This Week' : weekOffset === 1 ? 'Next Week' : `Week of ${monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
  const monStr = monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const sunStr = sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

  if (weekEvents.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {weekLabel} <span className="normal-case font-normal">({monStr} – {sunStr})</span>
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {weekOffset > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} className="h-7 px-2 text-xs">
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />{weekOffset === 1 ? 'This Week' : 'Prev'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} className="h-7 px-2 text-xs">
              {weekOffset === 0 ? 'Next Week' : 'Next'}<ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">No events scheduled for this week.</p>
      </div>
    );
  }

  const eventsWithStats = weekEvents.map(ev => {
    const evTickets = tickets.filter(t => t.occurrence_id === ev.id);
    const checkedIn = evTickets.filter(t => t.check_in_status === 'checked_in').length;
    const typeCounts = {};
    evTickets.forEach(t => {
      const typeName = ttMap[t.ticket_type_id]?.name || 'Unknown';
      typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
    });
    return { ...ev, typeCounts, checkedIn, total: evTickets.length };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {weekLabel} <span className="normal-case font-normal">({monStr} – {sunStr})</span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {weekOffset > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset - 1)} className="h-7 px-2 text-xs">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />{weekOffset === 1 ? 'This Week' : 'Prev'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} className="h-7 px-2 text-xs">
            {weekOffset === 0 ? 'Next Week' : 'Next'}<ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {Object.entries(ev.typeCounts).map(([name, count]) => (
                <div key={name} className="flex items-center gap-1">
                  <Ticket className="h-3 w-3 text-blue-400" />
                  <span className="text-sm font-semibold text-foreground">{count}</span>
                  <span className="text-xs text-muted-foreground">{name}</span>
                </div>
              ))}
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="text-sm font-semibold text-foreground">{ev.checkedIn}</span>
                <span className="text-xs text-muted-foreground">Checked In</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}