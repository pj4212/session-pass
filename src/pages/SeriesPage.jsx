import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, Clock, MapPin, Monitor, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SeriesPage() {
  const { slug } = useParams();
  const [series, setSeries] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [locations, setLocations] = useState({});
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      const allSeries = await base44.entities.EventSeries.filter({ slug });
      if (!allSeries.length) { setError('Event not found'); setLoading(false); return; }
      const s = allSeries[0];
      setSeries(s);

      const [occs, locs, tts] = await Promise.all([
        base44.entities.EventOccurrence.filter({ series_id: s.id }),
        base44.entities.Location.filter({}),
        base44.entities.TicketType.filter({})
      ]);

      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setLocations(locMap);

      const published = occs.filter(o => o.is_published && o.status === 'published')
        .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
      setSessions(published);
      setTicketTypes(tts);
      setLoading(false);
    }
    load();
  }, [slug]);

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  const getLowestPrice = (occId) => {
    const tts = ticketTypes.filter(t => t.occurrence_id === occId && t.is_active);
    if (!tts.length) return null;
    return Math.min(...tts.map(t => t.price));
  };

  const isSoldOut = (occId) => {
    const tts = ticketTypes.filter(t => t.occurrence_id === occId && t.is_active);
    return tts.length > 0 && tts.every(t => t.capacity_limit && t.quantity_sold >= t.capacity_limit);
  };

  const isSalesClosed = (occ) => {
    return occ.sales_close_date && new Date().toISOString() > occ.sales_close_date;
  };

  const groupedSessions = useMemo(() => {
    if (!sessions.length) return [];

    const hasFortnightly = sessions.some(s => s.recurrence_pattern?.startsWith('fortnightly'));

    if (hasFortnightly) {
      const weekA = sessions.filter(s => s.recurrence_pattern === 'fortnightly_A');
      const weekB = sessions.filter(s => s.recurrence_pattern === 'fortnightly_B');
      const weekly = sessions.filter(s => s.recurrence_pattern === 'weekly' || !s.recurrence_pattern);
      const groups = [];
      if (weekly.length) groups.push({ label: 'Every Week', sessions: weekly });
      if (weekA.length) groups.push({ label: 'Week A (Fortnightly)', sessions: weekA });
      if (weekB.length) groups.push({ label: 'Week B (Fortnightly)', sessions: weekB });
      return groups;
    }

    return [{ label: null, sessions }];
  }, [sessions]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (error) return <div className="flex items-center justify-center min-h-screen"><div className="text-center"><h1 className="text-2xl font-bold mb-2">Event Not Found</h1><p className="text-muted-foreground">This event does not exist or has been removed.</p></div></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-3">{series.name}</h1>
          {series.description && <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{series.description}</p>}
        </div>

        {sessions.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No sessions available at this time.</p>
        ) : (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Choose a Session</h2>
            {groupedSessions.map((group, gi) => (
              <div key={gi} className="space-y-3">
                {group.label && (
                  <h3 className="text-base font-semibold text-primary border-b border-border pb-2">{group.label}</h3>
                )}
                {group.sessions.map(session => {
                  const loc = locations[session.location_id];
                  const price = getLowestPrice(session.id);
                  const soldOut = isSoldOut(session.id);
                  const closed = isSalesClosed(session);
                  const isOnlineOnly = session.event_mode === 'online_stream';

                  return (
                    <Card key={session.id} className="overflow-hidden hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-lg font-semibold">{session.name}</h3>
                              {isOnlineOnly && <Badge variant="outline">Online Only</Badge>}
                              {!isOnlineOnly && session.event_mode === 'hybrid' && <Badge variant="outline">Hybrid</Badge>}
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(session.event_date)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatTime(session.start_datetime)} – {formatTime(session.end_datetime)}
                              </span>
                              {loc && (
                                <span className="flex items-center gap-1">
                                  {isOnlineOnly ? <Monitor className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                                  {isOnlineOnly ? 'Online via Zoom' : loc.name}
                                </span>
                              )}
                            </div>
                            {session.description && <p className="text-sm text-muted-foreground">{session.description}</p>}
                          </div>
                          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                            {price !== null && (
                              <span className="text-lg font-bold">
                                {price === 0 ? 'Free' : `From $${price.toFixed(2)}`}
                              </span>
                            )}
                            {soldOut ? (
                              <Badge variant="destructive">Sold Out</Badge>
                            ) : closed ? (
                              <Badge variant="secondary">Sales Closed</Badge>
                            ) : (
                              <Button asChild>
                                <Link to={`/event/${session.slug}`}>Book Now</Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}