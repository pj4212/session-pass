import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Loader2, ScanLine, LogOut, ChevronRight, Ticket } from 'lucide-react';

export default function ScannerHome() {
  const { user } = useOutletContext();
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [locations, setLocations] = useState({});
  const [ticketCounts, setTicketCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('upcoming');

  useEffect(() => {
    async function load() {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [allEvents, locs] = await Promise.all([
        base44.entities.EventOccurrence.filter({ status: 'published' }),
        base44.entities.Location.filter({})
      ]);

      const filtered = allEvents;

      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setLocations(locMap);

      const up = filtered.filter(e => e.event_date >= todayStr).sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
      const pa = filtered.filter(e => e.event_date < todayStr).sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
      setUpcoming(up);
      setPast(pa);

      const counts = {};
      for (const ev of up.slice(0, 10)) {
        const tickets = await base44.entities.Ticket.filter({ occurrence_id: ev.id, ticket_status: 'active' });
        const checkedIn = tickets.filter(t => t.check_in_status === 'checked_in').length;
        counts[ev.id] = { total: tickets.length, checkedIn };
      }
      setTicketCounts(counts);
      setLoading(false);
    }
    load();
  }, [user]);

  const formatTime = (dt) => {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const events = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="p-4 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Session Pass</h1>
            <p className="text-xs text-muted-foreground">{user.full_name || user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => base44.auth.logout()}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button 
          size="sm" 
          className={tab === 'upcoming' 
            ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}
          onClick={() => setTab('upcoming')}
        >
          Upcoming ({upcoming.length})
        </Button>
        <Button 
          size="sm" 
          className={tab === 'past' 
            ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}
          onClick={() => setTab('past')}
        >
          Past ({past.length})
        </Button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <ScanLine className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">No {tab} events</h2>
          <p className="text-sm text-muted-foreground">
            {tab === 'upcoming' ? 'Check back later for assigned events.' : 'No past events to show.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => {
            const counts = ticketCounts[ev.id];
            const locName = ev.location_id ? locations[ev.location_id]?.name : null;
            return (
              <Link key={ev.id} to={`/scanner/${ev.id}/dashboard`}>
                <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{ev.name}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ev.event_date)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(ev.start_datetime)}</span>
                        {locName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{locName}</span>}
                      </div>
                      {counts && (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Check-in</span>
                            <span className="font-medium text-foreground">{counts.checkedIn} / {counts.total}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all duration-500" 
                              style={{ width: `${counts.total > 0 ? (counts.checkedIn / counts.total * 100) : 0}%` }} 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}