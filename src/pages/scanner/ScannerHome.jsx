import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, MapPin, Loader2, ScanLine, LogOut, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ScannerHome() {
  const { user, assignments } = useOutletContext();
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

      // Filter by scanner assignments
      let filtered = allEvents;
      if (user.role === 'scanner') {
        const occIds = new Set(assignments.filter(a => a.occurrence_id).map(a => a.occurrence_id));
        const locIds = new Set(assignments.filter(a => a.location_id).map(a => a.location_id));
        filtered = allEvents.filter(e => occIds.has(e.id) || locIds.has(e.location_id));
      }

      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setLocations(locMap);

      const up = filtered.filter(e => e.event_date >= todayStr).sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
      const pa = filtered.filter(e => e.event_date < todayStr).sort((a, b) => new Date(b.start_datetime) - new Date(a.start_datetime));
      setUpcoming(up);
      setPast(pa);

      // Load ticket counts for upcoming
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
  }, [user, assignments]);

  const formatTime = (dt) => {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const events = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Session Pass</h1>
          <p className="text-sm text-muted-foreground">{user.full_name || user.email}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => base44.auth.logout()}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === 'upcoming' ? 'default' : 'outline'} size="sm" onClick={() => setTab('upcoming')}>
          Upcoming ({upcoming.length})
        </Button>
        <Button variant={tab === 'past' ? 'default' : 'outline'} size="sm" onClick={() => setTab('past')}>
          Past ({past.length})
        </Button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ScanLine className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-1">No {tab} events</h2>
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
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{ev.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ev.event_date)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(ev.start_datetime)}</span>
                          {locName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{locName}</span>}
                        </div>
                        {counts && (
                          <p className="text-xs font-medium mt-1.5">{counts.checkedIn} / {counts.total} checked in</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}