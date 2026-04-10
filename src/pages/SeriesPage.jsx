import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

// Module-level cache survives navigation
const pageCache = {};
import WeekGroup from '@/components/series/WeekGroup';

export default function SeriesPage() {
  const { slug } = useParams();
  const cached = pageCache[slug];
  const [series, setSeries] = useState(cached?.series || null);
  const [sessions, setSessions] = useState(cached?.sessions || []);
  const [locations, setLocations] = useState(cached?.locations || {});
  const [ticketTypes, setTicketTypes] = useState(cached?.ticketTypes || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  // Set page title
  useEffect(() => {
    if (series) {
      document.title = `Series / ${series.name} – Session Pass`;
    }
    return () => { document.title = 'Session Pass'; };
  }, [series]);

  useEffect(() => {
    async function load() {
      // Show cached data immediately if available, but always refresh
      if (pageCache[slug]) {
        const c = pageCache[slug];
        setSeries(c.series);
        setLocations(c.locations);
        setSessions(c.sessions);
        setTicketTypes(c.ticketTypes);
        setLoading(false);
      }

      const allSeries = await base44.entities.EventSeries.filter({ slug });
      if (!allSeries.length) { setError('Event not found'); setLoading(false); return; }
      const s = allSeries[0];
      setSeries(s);

      const [occs, locs] = await Promise.all([
        base44.entities.EventOccurrence.filter({ series_id: s.id }),
        base44.entities.Location.filter({})
      ]);

      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setLocations(locMap);

      const published = occs.filter(o => o.is_published && o.status === 'published')
        .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
      setSessions(published);

      // Fetch ticket types only for published sessions (parallel, scoped queries)
      const ttResults = await Promise.all(
        published.map(o => base44.entities.TicketType.filter({ occurrence_id: o.id }))
      );
      const tts = ttResults.flat();
      setTicketTypes(tts);

      pageCache[slug] = { series: s, locations: locMap, sessions: published, ticketTypes: tts };
      setLoading(false);
    }
    load();
  }, [slug]);



  // Build a week-by-week timeline showing the next 3 weeks of published sessions
  const weeklyTimeline = useMemo(() => {
    if (!sessions.length) return [];

    function toLocalDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    function localDate(dateStr) {
      const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    function getMonday(dateStr) {
      const d = localDate(dateStr);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return toLocalDateStr(monday);
    }

    const todayStr = toLocalDateStr(new Date());

    // Group published sessions by week
    const weekMap = {};
    for (const s of sessions) {
      if (s.event_date < todayStr) continue; // skip past
      const m = getMonday(s.event_date);
      if (!weekMap[m]) weekMap[m] = [];
      weekMap[m].push(s);
    }

    // Sort weeks and take the first 3
    const sortedWeeks = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 3)
      .map(([weekStart, weekSessions]) => ({
        weekStart,
        sessions: weekSessions.sort((a, b) => {
          const aOnline = a.event_mode === 'online_stream' ? 0 : 1;
          const bOnline = b.event_mode === 'online_stream' ? 0 : 1;
          if (aOnline !== bOnline) return aOnline - bOnline;
          return a.name.localeCompare(b.name);
        })
      }));

    return sortedWeeks;
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

        {weeklyTimeline.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No sessions available at this time.</p>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-6">Upcoming Sessions</h2>
            {weeklyTimeline.map((week, idx) => (
              <WeekGroup
                key={week.weekStart}
                weekStart={week.weekStart}
                sessions={week.sessions}
                locations={locations}
                ticketTypes={ticketTypes}
                isNext={idx === 0}
              />
            ))}

          </div>
        )}
      </div>
    </div>
  );
}