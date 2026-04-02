import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Monitor, Users, Edit, CheckCircle2, Star, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function dateOnly(d) {
  return typeof d === 'string' ? d.slice(0, 10) : d;
}

// Format a local Date object as YYYY-MM-DD without UTC conversion
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Create a local-noon Date from a YYYY-MM-DD string
function localDate(dateStr) {
  const [y, m, d] = dateOnly(dateStr).split('-').map(Number);
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

function formatWeekLabel(mondayDate) {
  const d = new Date(mondayDate);
  const day = d.getDate();
  const month = d.toLocaleDateString('en-AU', { month: 'long' });
  const year = d.getFullYear();
  return `Week of ${day} ${month} ${year}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function buildProjectedTimeline(sessions, months) {
  if (!sessions.length) return [];

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
      name: s.name,
      slug: s.slug,
      event_mode: s.event_mode,
      location_id: s.location_id,
      start_datetime: s.start_datetime,
      end_datetime: s.end_datetime,
      id: s.id,
      recurrence_pattern: s.recurrence_pattern,
    }));
  }

  const weeklyT = buildTemplates(weeklySessions);
  const aT = buildTemplates(fortnightlyA);
  const bT = buildTemplates(fortnightlyB);

  const actualByWeek = {};
  for (const s of sessions) {
    const m = getMonday(dateOnly(s.event_date));
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
      _sourceId: tmpl.id,
      event_date: dateStr,
      start_datetime: newStart.toISOString(),
      end_datetime: newEnd.toISOString(),
      _projected: true
    };
  }

  const today = new Date();
  const startMonday = localDate(getMonday(toLocalDateStr(today)));
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);

  const weeks = [];
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
    const all = [...actual, ...projected].sort((a, b) => {
      const aOnline = a.event_mode === 'online_stream' ? 0 : 1;
      const bOnline = b.event_mode === 'online_stream' ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return a.name.localeCompare(b.name);
    }
    );
    if (all.length > 0) weeks.push({ weekStart: mondayStr, sessions: all });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

export default function EventTimeline({ events, locations, ticketCounts, checkinCounts, candidateCounts, businessOwnerCounts, seriesMap, onVerifyVenue }) {
  // Group events by series for projection
  const timeline = useMemo(() => {
    const bySeries = {};
    const standalone = [];
    for (const ev of events) {
      if (ev.series_id) {
        if (!bySeries[ev.series_id]) bySeries[ev.series_id] = [];
        bySeries[ev.series_id].push(ev);
      } else {
        standalone.push(ev);
      }
    }

    // Project each series
    const allWeeks = [];
    for (const [seriesId, seriesEvents] of Object.entries(bySeries)) {
      const published = seriesEvents.filter(e => e.is_published && e.status === 'published');
      if (!published.length) continue;
      const projected = buildProjectedTimeline(published, 3);
      projected.forEach(w => {
        w.sessions = w.sessions.map(s => ({ ...s, _seriesId: seriesId }));
      });
      allWeeks.push(...projected);
    }

    // Merge weeks that share the same monday
    const weekMap = {};
    for (const w of allWeeks) {
      if (!weekMap[w.weekStart]) weekMap[w.weekStart] = [];
      weekMap[w.weekStart].push(...w.sessions);
    }
    // Add standalone events
    for (const ev of standalone) {
      const m = getMonday(dateOnly(ev.event_date));
      if (!weekMap[m]) weekMap[m] = [];
      weekMap[m].push(ev);
    }

    return Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, sessions]) => ({
        weekStart,
        sessions: sessions.sort((a, b) => {
          const aOnline = a.event_mode === 'online_stream' ? 0 : 1;
          const bOnline = b.event_mode === 'online_stream' ? 0 : 1;
          if (aOnline !== bOnline) return aOnline - bOnline;
          return a.name.localeCompare(b.name);
        }
        )
      }));
  }, [events]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeekMonday = getMonday(todayStr);

  if (!timeline.length) {
    return <p className="text-center text-muted-foreground py-12">No upcoming sessions found. Create recurring events and publish them to see the projected timeline.</p>;
  }

  return (
    <div className="space-y-6">
      {timeline.map(week => {
        const isCurrentWeek = week.weekStart === currentWeekMonday;
        const weekEndDate = localDate(week.weekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const isPastWeek = toLocalDateStr(weekEndDate) < todayStr;

        return (
        <div key={week.weekStart} className={isCurrentWeek ? 'ring-2 ring-primary/50 rounded-xl p-4 -mx-1 bg-primary/5' : ''}>
          <div className="flex items-center gap-2 mb-3">
            {isCurrentWeek && <Star className="h-4 w-4 text-primary fill-primary" />}
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${
              isCurrentWeek ? 'text-primary' : isPastWeek ? 'text-muted-foreground/50' : 'text-muted-foreground'
            }`}>
              {formatWeekLabel(week.weekStart)}
              {isCurrentWeek && <span className="ml-2 normal-case tracking-normal text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">This Week</span>}
              {isPastWeek && <span className="ml-2 normal-case tracking-normal text-xs font-medium text-muted-foreground/50">Past</span>}
            </h3>
          </div>
          <div className="space-y-2">
            {week.sessions.map((session, idx) => {
              const loc = locations[session.location_id];
              const isProjected = session._projected;
              const sourceId = session._sourceId || session.id;
              const seriesName = seriesMap[session._seriesId || session.series_id]?.name;
              const count = ticketCounts[session.id] || 0;
              const checkins = checkinCounts[session.id] || 0;
              const candidates = candidateCounts?.[session.id] || 0;
              const bos = businessOwnerCounts?.[session.id] || 0;
              const sessionPast = dateOnly(session.event_date) < todayStr;

              return (
                <div key={session.id + '-' + idx} className={`flex items-center gap-4 p-4 border rounded-lg transition-colors ${
                  sessionPast
                    ? 'bg-muted/30 border-border/30 opacity-60'
                    : isProjected
                      ? 'bg-card/50 border-border/50'
                      : isCurrentWeek
                        ? 'bg-card border-primary/30'
                        : 'bg-card border-border'
                }`}>
                  {/* Date pill */}
                  <div className={`hidden sm:flex flex-col items-center justify-center rounded-lg px-3 py-2 min-w-[70px] ${
                    sessionPast ? 'bg-muted/50' : isCurrentWeek && !isProjected ? 'bg-primary/20' : 'bg-secondary'
                  }`}>
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {localDate(session.event_date).toLocaleDateString('en-AU', { weekday: 'short' })}
                    </span>
                    <span className={`text-xl font-bold leading-tight ${sessionPast ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {localDate(session.event_date).getDate()}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`font-semibold truncate ${sessionPast ? 'text-muted-foreground' : 'text-foreground'}`}>{session.name}</span>
                      {sessionPast && <Badge variant="secondary" className="text-xs py-0 gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>}
                      {isProjected && !sessionPast && <Badge variant="outline" className="text-xs py-0 text-muted-foreground">Projected</Badge>}
                      {seriesName && <span className="text-xs text-muted-foreground">· {seriesName}</span>}
                      {!isProjected && !sessionPast && session.event_mode !== 'online_stream' && (
                        session.venue_confirmed ? (
                          <Badge variant="outline" className="text-xs py-0 gap-1 text-green-400 border-green-500/30">
                            <CheckCircle2 className="h-3 w-3" />Venue Confirmed
                          </Badge>
                        ) : (
                          <button
                            onClick={() => onVerifyVenue?.(session)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                          >
                            <AlertTriangle className="h-3 w-3" />Venue Not Confirmed
                          </button>
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1 sm:hidden">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(session.event_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(session.start_datetime)} – {formatTime(session.end_datetime)}
                      </span>
                      {loc && (
                        <span className="flex items-center gap-1">
                          {session.event_mode === 'online_stream' ? <Monitor className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                          {session.event_mode === 'online_stream' ? 'Online' : loc.name}
                        </span>
                      )}
                      {!isProjected && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {count} sold
                          {(candidates > 0 || bos > 0) && (
                            <span className="text-xs">({candidates}C · {bos}BO)</span>
                          )}
                          {session.event_mode !== 'online_stream' && checkins > 0 ? ` · ${checkins} checked in` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isProjected ? (
                      <>
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link to={`/admin/events/${session.id}/edit`}><Edit className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Attendees">
                          <Link to={`/admin/events/${session.id}/attendees`}><Users className="h-4 w-4" /></Link>
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="icon" asChild title="Edit source event">
                        <Link to={`/admin/events/${sourceId}/edit`}><Edit className="h-4 w-4" /></Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}