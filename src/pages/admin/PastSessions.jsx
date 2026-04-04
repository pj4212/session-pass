import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users, Video, Search, ChevronRight, MapPin, Monitor, ExternalLink } from 'lucide-react';
import moment from 'moment';
import PastSessionDetail from '../../components/admin/PastSessionDetail';

export default function PastSessions() {
  const [events, setEvents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    async function load() {
      const [evts, locs] = await Promise.all([
        base44.entities.EventOccurrence.list('-event_date'),
        base44.entities.Location.list()
      ]);
      // Only past events
      const now = moment().startOf('day');
      const pastEvents = evts.filter(e => moment(e.event_date).isBefore(now));
      setEvents(pastEvents);
      setLocations(locs);
      setLoading(false);
    }
    load();
  }, []);

  const getLocation = (id) => locations.find(l => l.id === id);

  const filtered = events.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name?.toLowerCase().includes(q) || e.event_date?.includes(q);
  });

  // Group by month
  const grouped = {};
  filtered.forEach(e => {
    const key = moment(e.event_date).format('MMMM YYYY');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  if (selectedEvent) {
    return <PastSessionDetail event={selectedEvent} locations={locations} onBack={() => setSelectedEvent(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Past Sessions</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search past sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">No past sessions found.</p>
      ) : (
        Object.entries(grouped).map(([month, sessions]) => (
          <div key={month} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{month}</h2>
            <div className="space-y-2">
              {sessions.map(ev => {
                const loc = getLocation(ev.location_id);
                const hasRecording = !!ev.zoom_meeting_id;
                return (
                  <Card
                    key={ev.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setSelectedEvent(ev)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex flex-col items-center justify-center w-14 shrink-0">
                        <span className="text-2xl font-bold">{moment(ev.event_date).format('DD')}</span>
                        <span className="text-xs text-muted-foreground">{moment(ev.event_date).format('ddd')}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{ev.name}</span>
                          {ev.event_mode === 'online_stream' && <Monitor className="h-3.5 w-3.5 text-blue-400" />}
                          {ev.event_mode === 'in_person' && <MapPin className="h-3.5 w-3.5 text-green-400" />}
                          {ev.event_mode === 'hybrid' && (
                            <>
                              <Monitor className="h-3.5 w-3.5 text-blue-400" />
                              <MapPin className="h-3.5 w-3.5 text-green-400" />
                            </>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                          <span>{moment(ev.start_datetime).format('h:mm A')} – {moment(ev.end_datetime).format('h:mm A')}</span>
                          {loc && <span>{loc.name}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {hasRecording && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Video className="h-3 w-3" /> Zoom
                          </Badge>
                        )}
                        {ev.status === 'cancelled' && (
                          <Badge variant="destructive" className="text-xs">Cancelled</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}