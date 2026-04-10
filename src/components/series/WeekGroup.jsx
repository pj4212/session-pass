import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Monitor } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function localDate(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function formatDate(dateStr) {
  return localDate(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(dateStr, timezone) {
  if (!dateStr) return '';
  // If no Z/offset suffix, it's stored as local time — extract literally
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
  const d = new Date(dateStr);
  if (timezone) {
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  }
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function formatWeekLabel(mondayDate) {
  const d = localDate(mondayDate);
  const day = d.getDate();
  const month = d.toLocaleDateString('en-AU', { month: 'long' });
  const year = d.getFullYear();
  return `Week starting ${day} ${month} ${year}`;
}

export default function WeekGroup({ weekStart, sessions, locations, ticketTypes, isNext }) {
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

  return (
    <div className={isNext ? 'ring-2 ring-primary/50 rounded-xl p-4 -mx-1 bg-primary/5 mb-8' : 'mb-8'}>
      <div className="flex items-center gap-2 mb-3 pl-1">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${isNext ? 'text-primary' : 'text-muted-foreground'}`}>
          {formatWeekLabel(weekStart)}
        </h3>
        {isNext && <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Next Up</span>}
      </div>
      <div className="space-y-2">
        {sessions.map(session => {
          const loc = locations[session.location_id];
          const price = getLowestPrice(session.id);
          const soldOut = isSoldOut(session.id);
          const closed = isSalesClosed(session);
          const isOnlineOnly = session.event_mode === 'online_stream';

          return (
            <div key={session.id} className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors">
              {/* Date pill */}
              <div className="hidden sm:flex flex-col items-center justify-center bg-secondary rounded-lg px-3 py-2 min-w-[70px]">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {localDate(session.event_date).toLocaleDateString('en-AU', { weekday: 'short' })}
                </span>
                <span className="text-xl font-bold text-foreground leading-tight">
                  {localDate(session.event_date).getDate()}
                </span>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-foreground truncate">{session.name}</span>
                  {isOnlineOnly && <Badge variant="outline" className="text-xs py-0">Online</Badge>}
                  {!isOnlineOnly && session.event_mode === 'hybrid' && <Badge variant="outline" className="text-xs py-0">Hybrid</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1 sm:hidden">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(session.event_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(session.start_datetime, session.timezone)} – {formatTime(session.end_datetime, session.timezone)}
                  </span>
                  {loc && (
                    <span className="flex items-center gap-1">
                      {isOnlineOnly ? <Monitor className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {isOnlineOnly ? 'Online' : loc.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center shrink-0">
                {soldOut ? (
                  <Badge variant="destructive">Sold Out</Badge>
                ) : closed ? (
                  <Badge variant="secondary">Closed</Badge>
                ) : (
                  <Button size="lg" className="text-base px-6" asChild>
                    <Link to={`/event/${session.slug}`}>Book</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}