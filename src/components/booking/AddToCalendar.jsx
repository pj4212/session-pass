import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';

// Normalize a datetime string: ensure it's treated as UTC
function normalizeDate(datetimeStr) {
  let s = datetimeStr;
  if (!/Z|[+-]\d{2}:\d{2}$/.test(s)) s = s + 'Z';
  return new Date(s);
}

// Format a local time in the given IANA timezone as YYYYMMDDTHHMMSS (for TZID-based ICS)
function formatICSDate(datetimeStr, tz) {
  const d = normalizeDate(datetimeStr);
  // Use Intl to get parts in the target timezone
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(d);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
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
  const start = normalizeDate(occurrence.start_datetime);
  const end = normalizeDate(occurrence.end_datetime);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: occurrence.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: buildDescription(occurrence, ticket),
    location: buildLocation(occurrence, ticket),
    ctz: tz,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateOutlookUrl(occurrence, ticket) {
  const start = normalizeDate(occurrence.start_datetime).toISOString();
  const end = normalizeDate(occurrence.end_datetime).toISOString();

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
  const start = formatICSDate(occurrence.start_datetime, tz);
  const end = formatICSDate(occurrence.end_datetime, tz);
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