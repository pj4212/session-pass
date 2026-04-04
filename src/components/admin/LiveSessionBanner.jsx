import { Video, ExternalLink, Users, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function LiveSessionBanner({ events, tickets }) {
  const now = new Date();

  // Find online/hybrid sessions where now is between 2hr before start and 1hr after end
  const liveSessions = events.filter(ev => {
    if (ev.status === 'cancelled') return false;
    if (!ev.is_published || ev.status !== 'published') return false;
    if (ev.event_mode !== 'online_stream' && ev.event_mode !== 'hybrid') return false;
    if (!ev.start_datetime) return false;

    const start = new Date(ev.start_datetime);
    const end = ev.end_datetime ? new Date(ev.end_datetime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const windowStart = new Date(start.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(end.getTime() + 1 * 60 * 60 * 1000);

    return now >= windowStart && now <= windowEnd;
  });

  if (liveSessions.length === 0) return null;

  return (
    <div className="space-y-3">
      {liveSessions.map(session => {
        const start = new Date(session.start_datetime);
        const end = session.end_datetime ? new Date(session.end_datetime) : null;
        const isLive = now >= start && (!end || now <= end);
        const isPreShow = now < start;
        const ticketCount = tickets.filter(t => t.occurrence_id === session.id).length;

        return (
          <div key={session.id} className="relative overflow-hidden rounded-xl border border-green-500/30 bg-gradient-to-r from-green-500/10 via-green-500/5 to-card p-5">
            {/* Pulse indicator */}
            <div className="absolute top-4 right-4">
              {isLive ? (
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Live Now</span>
                </span>
              ) : isPreShow ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">
                  <Clock className="h-3 w-3 mr-1" />Starting Soon
                </Badge>
              ) : (
                <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground text-xs">
                  Just Ended
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Video className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Online Session</span>
            </div>

            <p className="font-semibold text-lg text-foreground pr-24">{session.name}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              <span>
                {start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}
                {end && ` – ${end.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />{ticketCount} registered
              </span>
            </div>

            {session.zoom_link && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5" asChild>
                  <a href={session.zoom_link} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />Join Webinar
                  </a>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
                  navigator.clipboard.writeText(session.zoom_link);
                  toast.success('Zoom link copied!');
                }}>
                  <Copy className="h-3.5 w-3.5" />Copy Link
                </Button>
                {session.zoom_meeting_id && (
                  <span className="text-xs text-muted-foreground ml-1">ID: {session.zoom_meeting_id}</span>
                )}
              </div>
            )}

            {!session.zoom_link && (
              <p className="text-sm text-amber-400 mt-3">⚠ No Zoom link configured for this session</p>
            )}
          </div>
        );
      })}
    </div>
  );
}