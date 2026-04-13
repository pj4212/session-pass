import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';

// The start_datetime/end_datetime on occurrences are LOCAL times in the event's timezone
// (e.g. "2026-04-22T20:00:00" means 8pm in the event timezone). They have NO offset suffix.

// Parse a local datetime string into its raw numeric parts (no timezone interpretation)
function parseLocalParts(datetimeStr) {
  // datetimeStr is like "2026-04-22T20:00:00"
  const [datePart, timePart] = datetimeStr.split('T');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = (timePart || '00:00:00').split(':');
  return { year, month, day, hour, minute, second: second || '00' };
}

// Format as YYYYMMDDTHHMMSS (for ICS TZID-based dates and Google Calendar)
function formatCompact(datetimeStr) {
  const p = parseLocalParts(datetimeStr);
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

// Convert a local datetime in a given IANA timezone to a true UTC ISO string
function localToUTC(datetimeStr, tz) {
  // Build a date that JS interprets in UTC, then use Intl to find the offset
  const p = parseLocalParts(datetimeStr);
  // Create a reference UTC date
  const utcRef = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
  // Find what that UTC instant looks like in the target timezone
  const inTz = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(utcRef);
  const tp = {};
  inTz.forEach(({ type, value }) => { tp[type] = value; });
  // Compute offset: what UTC instant maps to those tz parts?
  const tzAsUtc = Date.UTC(+tp.year, +tp.month - 1, +tp.day, +tp.hour === '24' ? 0 : +tp.hour, +tp.minute, +tp.second);
  const offsetMs = tzAsUtc - utcRef.getTime();
  // The actual UTC time = local time - offset
  const actualUtc = new Date(utcRef.getTime() - offsetMs);
  return actualUtc.toISOString();
}

function buildDescription(occurrence, ticket) {
  const isOnline = ticket?.attendance_mode === 'online' || occurrence.event_mode === 'online_stream';
  const lines = [];

  if (isOnline) {
    if (occurrence.zoom_link) {
      lines.push('🖥 Join Online');
      lines.push(`Register for webinar: ${occurrence.zoom_link}`);
    }
  } else {
    if (occurrence.venue_link) {
      lines.push(`📍 Venue directions: ${occurrence.venue_link}`);
    }
    if (occurrence.parking_link) {
      lines.push(`🅿️ Parking info: ${occurrence.parking_link}`);
    }
    if (occurrence.venue_details) {
      lines.push(`Venue: ${occurrence.venue_details}`);
    }
  }

  if (occurrence.description) {
    lines.push('');
    lines.push(occurrence.description);
  }

  return lines.join('\n');
}

function buildLocation(occurrence, ticket) {
  const isOnline = ticket?.attendance_mode === 'online' || occurrence.event_mode === 'online_stream';
  if (isOnline) {
    return occurrence.zoom_link || 'Online';
  }
  return occurrence.venue_details || occurrence.venue_name || '';
}

function generateGoogleUrl(occurrence, ticket) {
  const tz = occurrence.timezone || 'Australia/Brisbane';
  // Google Calendar accepts local times with ctz parameter to specify the timezone
  const start = formatCompact(occurrence.start_datetime);
  const end = formatCompact(occurrence.end_datetime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: occurrence.name,
    dates: `${start}/${end}`,
    details: buildDescription(occurrence, ticket),
    location: buildLocation(occurrence, ticket),
    ctz: tz,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateOutlookUrl(occurrence, ticket) {
  const tz = occurrence.timezone || 'Australia/Brisbane';
  // Outlook needs true UTC ISO strings
  const start = localToUTC(occurrence.start_datetime, tz);
  const end = localToUTC(occurrence.end_datetime, tz);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: occurrence.name,
    startdt: start,
    enddt: end,
    body: buildDescription(occurrence, ticket),
    location: buildLocation(occurrence, ticket),
  });

  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

function generateICSBlob(occurrence, ticket) {
  const tz = occurrence.timezone || 'Australia/Brisbane';
  // The stored datetimes are already local to the event timezone, so use them directly
  const start = formatCompact(occurrence.start_datetime);
  const end = formatCompact(occurrence.end_datetime);
  const desc = buildDescription(occurrence, ticket).replace(/\n/g, '\\n');
  const loc = buildLocation(occurrence, ticket);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Session Pass//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART;TZID=${tz}:${start}`,
    `DTEND;TZID=${tz}:${end}`,
    `SUMMARY:${occurrence.name}`,
    `DESCRIPTION:${desc}`,
    `LOCATION:${loc}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return ics;
}

export default function AddToCalendar({ occurrence, ticket }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleApple = () => {
    const ics = generateICSBlob(occurrence, ticket);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${occurrence.name.replace(/\s+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const options = [
    {
      label: 'Google Calendar',
      icon: '📅',
      onClick: () => {
        window.open(generateGoogleUrl(occurrence, ticket), '_blank');
        setOpen(false);
      }
    },
    {
      label: 'Outlook',
      icon: '📧',
      onClick: () => {
        window.open(generateOutlookUrl(occurrence, ticket), '_blank');
        setOpen(false);
      }
    },
    {
      label: 'Apple Calendar',
      icon: '🍎',
      onClick: handleApple
    }
  ];

  return (
    <div className="relative inline-block" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        <CalendarPlus className="h-4 w-4 mr-1.5" />
        Add to Calendar
      </Button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={opt.onClick}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}