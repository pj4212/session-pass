import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Monitor, Users, Edit, CheckCircle2, Star, AlertTriangle, Video, Loader2, Eye, EyeOff, PlusCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
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

function formatTime(dateStr, timezone) {
  if (!dateStr) return '';
  // If the datetime has no Z or offset suffix, it's stored as local time in the event's timezone.
  // Extract the literal HH:MM directly — no Date parsing needed.
  const hasOffset = /Z|[+-]\d{2}:\d{2}/.test(dateStr);
  if (!hasOffset) {
    const match = dateStr.match(/T(\d{2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = match[2];
      const period = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 || 12;
      return `${h12}:${m} ${period}`;
    }
  }
  // If it has a Z/offset, parse and convert to the event's timezone
  const d = new Date(dateStr);
  if (timezone) {
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  }
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function buildProjectedTimeline(sessions, months) {
  if (!sessions.length) return [];

  const fortnightlyA = sessions.filter(s => s.recurrence_pattern === 'fortnightly_A');
  const fortnightlyB = sessions.filter(s => s.recurrence_pattern === 'fortnightly_B');
  // Only explicitly weekly sessions become weekly templates (not "no recurrence" one-offs)
  const weeklySessions = sessions.filter(s => s.recurrence_pattern === 'weekly');

  let refAMonday = null;
  let refBMonday = null;
  if (fortnightlyA.length) refAMonday = localDate(getMonday(fortnightlyA[0].event_date));
  if (fortnightlyB.length) refBMonday = localDate(getMonday(fortnightlyB[0].event_date));

  function isWeekA(mondayDate) {
    if (refAMonday) return Math.round((mondayDate - refAMonday) / (7 * 86400000)) % 2 === 0;
    if (refBMonday) return Math.round((mondayDate - refBMonday) / (7 * 86400000)) % 2 !== 0;
    return true;
  }

  // Extract the literal HH:MM from a datetime string, ignoring timezone suffix
  // e.g. "2026-04-08T20:00:00" → "20:00", "2026-04-22T20:00:00.000Z" → "20:00"
  function extractTime(dtStr) {
    if (!dtStr) return { hours: 20, minutes: 0 };
    const match = dtStr.match(/T(\d{2}):(\d{2})/);
    if (match) return { hours: parseInt(match[1], 10), minutes: parseInt(match[2], 10) };
    return { hours: 20, minutes: 0 };
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
      _startTime: extractTime(s.start_datetime),
      _endTime: extractTime(s.end_datetime),
      timezone: s.timezone,
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
    // Use extracted literal time (not parsed Date which is affected by Z suffix)
    const st = tmpl._startTime;
    const et = tmpl._endTime;
    // Build datetime strings WITHOUT Z suffix so they display correctly via formatTime
    const pad = (n) => String(n).padStart(2, '0');
    const startDt = `${dateStr}T${pad(st.hours)}:${pad(st.minutes)}:00`;
    const endDt = `${dateStr}T${pad(et.hours)}:${pad(et.minutes)}:00`;
    return {
      ...tmpl,
      id: `projected-${tmpl.id}-${dateStr}`,
      _sourceId: tmpl.id,
      event_date: dateStr,
      start_datetime: startDt,
      end_datetime: endDt,
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

export default function EventTimeline({ events, locations, ticketCounts, checkinCounts, candidateCounts, businessOwnerCounts, seriesMap, onVerifyVenue, onCreateFromProjected, creatingProjected, onTogglePublish }) {
  const [publishingId, setPublishingId] = useState(null);

  const handleTogglePublish = async (session) => {
    setPublishingId(session.id);
    await onTogglePublish?.(session);
    setPublishingId(null);
  };
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

    // Project each series using all events as source templates
    const allWeeks = [];
    for (const [seriesId, seriesEvents] of Object.entries(bySeries)) {
      if (!seriesEvents.length) continue;
      const projected = buildProjectedTimeline(seriesEvents, 3);
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
                <div key={session.id + '-' + idx} className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 sm:p-4 border rounded-lg transition-colors overflow-hidden ${
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
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* Mobile: date + name row */}
                    <div className="flex items-center gap-2 sm:hidden mb-1 min-w-0">
                      <span className={`text-xs font-medium shrink-0 rounded px-1.5 py-0.5 ${sessionPast ? 'bg-muted/50 text-muted-foreground' : isCurrentWeek && !isProjected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                        {localDate(session.event_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })}
                      </span>
                      <span className={`font-semibold text-sm truncate min-w-0 ${sessionPast ? 'text-muted-foreground' : 'text-foreground'}`}>{session.name}</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 flex-wrap mb-1">
                      <span className={`font-semibold truncate ${sessionPast ? 'text-muted-foreground' : 'text-foreground'}`}>{session.name}</span>
                      {sessionPast && <Badge variant="secondary" className="text-xs py-0 gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>}
                      {isProjected && !sessionPast && <Badge variant="outline" className="text-xs py-0 text-muted-foreground">Projected</Badge>}
                      {seriesName && <span className="text-xs text-muted-foreground">· {seriesName}</span>}
                      {!sessionPast && session.event_mode !== 'online_stream' && (
                        isProjected ? (
                          <Badge variant="outline" className="text-xs py-0 gap-1 text-muted-foreground border-border">
                            <AlertTriangle className="h-3 w-3" />Venue Pending
                          </Badge>
                        ) : session.venue_confirmed ? (
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
                    {/* Mobile badges row */}
                    <div className="flex flex-wrap items-center gap-1 sm:hidden mb-1">
                      {sessionPast && <Badge variant="secondary" className="text-[10px] py-0 gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Done</Badge>}
                      {isProjected && !sessionPast && <Badge variant="outline" className="text-[10px] py-0">Projected</Badge>}
                      {!sessionPast && session.event_mode !== 'online_stream' && (
                        isProjected ? (
                          <Badge variant="outline" className="text-[10px] py-0 gap-0.5 text-muted-foreground border-border">
                            <AlertTriangle className="h-2.5 w-2.5" />Venue TBC
                          </Badge>
                        ) : session.venue_confirmed ? (
                          <Badge variant="outline" className="text-[10px] py-0 gap-0.5 text-green-400 border-green-500/30">
                            <CheckCircle2 className="h-2.5 w-2.5" />Venue ✓
                          </Badge>
                        ) : (
                          <button
                            onClick={() => onVerifyVenue?.(session)}
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md border border-amber-500/40 text-amber-400 bg-amber-500/10"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />Venue?
                          </button>
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs sm:text-sm text-muted-foreground min-w-0">

                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(session.start_datetime, session.timezone)} – {formatTime(session.end_datetime, session.timezone)}
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
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center flex-wrap">
                    {!isProjected ? (
                      <>
                        {!sessionPast && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={session.is_published ? 'Unpublish' : 'Publish'}
                            disabled={publishingId === session.id}
                            onClick={() => handleTogglePublish(session)}
                          >
                            {publishingId === session.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : session.is_published ? (
                              <Eye className="h-4 w-4 text-green-400" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link to={`/admin/events/${session.id}/edit`}><Edit className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Attendees">
                          <Link to={`/admin/events/${session.id}/attendees`}><Users className="h-4 w-4" /></Link>
                        </Button>
                        {session.zoom_link && (
                          <Button variant="ghost" size="icon" title="Copy Zoom Link" onClick={() => {
                            navigator.clipboard.writeText(session.zoom_link);
                            toast.success('Zoom link copied!');
                          }}>
                            <Video className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        title="Create this session so you can publish it, confirm venue, and manage attendees"
                        disabled={creatingProjected === session.id}
                        onClick={() => onCreateFromProjected?.(session)}
                      >
                        {creatingProjected === session.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlusCircle className="h-3.5 w-3.5" />
                        )}
                        Create Session
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