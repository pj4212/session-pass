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

      pageCache[slug] = { series: s, locations: locMap, sessions: published, ticketTypes: tts };
      setLoading(false);
    }
    load();
  }, [slug]);



  // Build a week-by-week timeline showing only the next upcoming week
  const weeklyTimeline = useMemo(() => {
    if (!sessions.length) return [];

    // Local date helpers (avoid UTC conversion bugs)
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

    const fortnightlyA = sessions.filter(s => s.recurrence_pattern === 'fortnightly_A');
    const fortnightlyB = sessions.filter(s => s.recurrence_pattern === 'fortnightly_B');
    const weeklySessions = sessions.filter(s => s.recurrence_pattern === 'weekly' || !s.recurrence_pattern);

    let refAMonday = null;
    let refBMonday = null;
    if (fortnightlyA.length) refAMonday = localDate(getMonday(fortnightlyA[0].event_date));
    if (fortnightlyB.length) refBMonday = localDate(getMonday(fortnightlyB[0].event_date));

    function isWeekA(mondayDate) {
      if (refAMonday) return Math.round((mondayDate - refAMonday) / (7 * 86400000)) % 2 === 0;
      if (refBMonday) return Math.round((mondayDate - refBMonday) / (7 * 86400000)) % 2 !== 0;
      return true;
    }

    function buildTemplates(list) {
      const seen = new Set();
      return list.filter(s => {
        const key = `${localDate(s.event_date).getDay()}-${s.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map(s => ({
        dayOfWeek: localDate(s.event_date).getDay(),
        name: s.name, slug: s.slug, event_mode: s.event_mode,
        location_id: s.location_id, start_datetime: s.start_datetime,
        end_datetime: s.end_datetime, description: s.description,
        id: s.id, occurrence_id: s.id, recurrence_pattern: s.recurrence_pattern,
      }));
    }

    const weeklyT = buildTemplates(weeklySessions);
    const aT = buildTemplates(fortnightlyA);
    const bT = buildTemplates(fortnightlyB);

    const actualByWeek = {};
    for (const s of sessions) {
      const m = getMonday(s.event_date);
      if (!actualByWeek[m]) actualByWeek[m] = [];
      actualByWeek[m].push(s);
    }

    function projectTemplate(tmpl, mondayStr) {
      const targetDay = tmpl.dayOfWeek;
      const mondayDate = localDate(mondayStr);
      const dayOffset = targetDay === 0 ? 6 : targetDay - 1;
      const sessionDate = new Date(mondayDate);
      sessionDate.setDate(sessionDate.getDate() + dayOffset);
      const dateStr = toLocalDateStr(sessionDate);
      const origStart = new Date(tmpl.start_datetime);
      const origEnd = new Date(tmpl.end_datetime);
      const newStart = new Date(sessionDate);
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
      const newEnd = new Date(sessionDate);
      newEnd.setHours(origEnd.getHours(), origEnd.getMinutes(), 0, 0);
      return {
        ...tmpl,
        id: `projected-${tmpl.id}-${dateStr}`,
        event_date: dateStr,
        start_datetime: newStart.toISOString(),
        end_datetime: newEnd.toISOString(),
        _projected: true
      };
    }

    const todayStr = toLocalDateStr(new Date());
    const startMonday = localDate(getMonday(todayStr));
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 12);

    const current = new Date(startMonday);

    while (current < endDate) {
      const mondayStr = toLocalDateStr(current);
      const weekIsA = isWeekA(current);
      const actual = actualByWeek[mondayStr] || [];
      const fortnightlyTemplates = weekIsA ? aT : bT;
      const allTemplates = [...weeklyT, ...fortnightlyTemplates];
      const actualNames = new Set(actual.map(s => s.name));
      const missing = allTemplates.filter(t => !actualNames.has(t.name));
      const projected = missing.map(t => projectTemplate(t, mondayStr));

      // Filter out past sessions and sort: online first, then alphabetical
      const weekSessions = [...actual, ...projected]
        .filter(s => s.event_date >= todayStr)
        .sort((a, b) => {
          const aOnline = a.event_mode === 'online_stream' ? 0 : 1;
          const bOnline = b.event_mode === 'online_stream' ? 0 : 1;
          if (aOnline !== bOnline) return aOnline - bOnline;
          return a.name.localeCompare(b.name);
        });

      // Return only the first week that has future sessions
      if (weekSessions.length > 0) {
        return [{ weekStart: mondayStr, sessions: weekSessions }];
      }

      current.setDate(current.getDate() + 7);
    }

    return [];
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
            {weeklyTimeline.map(week => (
              <WeekGroup
                key={week.weekStart}
                weekStart={week.weekStart}
                sessions={week.sessions}
                locations={locations}
                ticketTypes={ticketTypes}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}