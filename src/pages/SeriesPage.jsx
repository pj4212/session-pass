import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import WeekGroup from '@/components/series/WeekGroup';

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



  // Build a week-by-week timeline for the next 12 months
  const weeklyTimeline = useMemo(() => {
    if (!sessions.length) return [];

    // Get Monday of a given date's week
    function getMonday(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().slice(0, 10);
    }

    // Determine the fortnightly pattern from existing sessions
    const fortnightlyA = sessions.filter(s => s.recurrence_pattern === 'fortnightly_A');
    const fortnightlyB = sessions.filter(s => s.recurrence_pattern === 'fortnightly_B');
    const weeklySessions = sessions.filter(s => s.recurrence_pattern === 'weekly' || !s.recurrence_pattern);

    // Figure out which weeks are A and which are B from existing data
    const weekAMondays = new Set(fortnightlyA.map(s => getMonday(s.event_date)));
    const weekBMondays = new Set(fortnightlyB.map(s => getMonday(s.event_date)));

    // Generate weeks for next 12 months
    const today = new Date();
    const startMonday = new Date(getMonday(today.toISOString().slice(0, 10)) + 'T00:00:00');
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 12);

    // Find a reference A and B monday to establish the fortnightly cadence
    let refAMonday = null;
    let refBMonday = null;
    if (fortnightlyA.length) {
      refAMonday = new Date(getMonday(fortnightlyA[0].event_date) + 'T00:00:00');
    }
    if (fortnightlyB.length) {
      refBMonday = new Date(getMonday(fortnightlyB[0].event_date) + 'T00:00:00');
    }

    function isWeekA(mondayDate) {
      if (refAMonday) {
        const diff = Math.round((mondayDate - refAMonday) / (7 * 24 * 60 * 60 * 1000));
        return diff % 2 === 0;
      }
      if (refBMonday) {
        const diff = Math.round((mondayDate - refBMonday) / (7 * 24 * 60 * 60 * 1000));
        return diff % 2 !== 0;
      }
      return true;
    }

    // Build session templates (day of week + time pattern) from actual sessions
    function buildTemplates(sessionList) {
      return sessionList.map(s => ({
        dayOfWeek: new Date(s.event_date + 'T00:00:00').getDay(),
        name: s.name,
        slug: s.slug,
        event_mode: s.event_mode,
        location_id: s.location_id,
        start_datetime: s.start_datetime,
        end_datetime: s.end_datetime,
        description: s.description,
        id: s.id,
        occurrence_id: s.id,
        recurrence_pattern: s.recurrence_pattern,
      }));
    }

    const weeklyTemplates = buildTemplates(weeklySessions);
    const fortnightlyATemplates = buildTemplates(fortnightlyA);
    const fortnightlyBTemplates = buildTemplates(fortnightlyB);

    // Group actual sessions by their week monday
    const actualSessionsByWeek = {};
    for (const s of sessions) {
      const monday = getMonday(s.event_date);
      if (!actualSessionsByWeek[monday]) actualSessionsByWeek[monday] = [];
      actualSessionsByWeek[monday].push(s);
    }

    const weeks = [];
    const current = new Date(startMonday);

    while (current < endDate) {
      const mondayStr = current.toISOString().slice(0, 10);
      const weekIsA = isWeekA(current);

      // Use actual sessions if they exist for this week
      if (actualSessionsByWeek[mondayStr]) {
        weeks.push({
          weekStart: mondayStr,
          sessions: actualSessionsByWeek[mondayStr].sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
        });
      } else {
        // Project future sessions based on templates
        const applicableTemplates = [
          ...weeklyTemplates,
          ...(weekIsA ? fortnightlyATemplates : fortnightlyBTemplates)
        ];

        if (applicableTemplates.length > 0) {
          const projectedSessions = applicableTemplates.map(tmpl => {
            // Calculate the actual date for this week
            const targetDay = tmpl.dayOfWeek;
            const mondayDate = new Date(mondayStr + 'T00:00:00');
            const dayOffset = targetDay === 0 ? 6 : targetDay - 1; // Mon=0 offset
            const sessionDate = new Date(mondayDate);
            sessionDate.setDate(sessionDate.getDate() + dayOffset);
            const dateStr = sessionDate.toISOString().slice(0, 10);

            // Rebuild start/end times with the new date
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
              _projected: true // Flag so we know it's not a real record
            };
          }).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

          if (projectedSessions.length > 0) {
            weeks.push({
              weekStart: mondayStr,
              sessions: projectedSessions
            });
          }
        }
      }

      current.setDate(current.getDate() + 7);
    }

    return weeks;
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