import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { ArrowLeft, Users, Video, ExternalLink, Calendar, Clock, MapPin, Monitor, Loader2, Copy } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';

export default function PastSessionDetail({ event, locations, onBack }) {
  const [tickets, setTickets] = useState([]);
  const [recordings, setRecordings] = useState(null);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [recordingError, setRecordingError] = useState('');

  const loc = locations?.find(l => l.id === event.location_id);

  useEffect(() => {
    async function loadTickets() {
      const t = await base44.entities.Ticket.filter({ occurrence_id: event.id });
      setTickets(t);
      setLoadingTickets(false);
    }
    loadTickets();

    if (event.zoom_meeting_id) {
      loadRecordings();
    }
  }, [event.id]);

  const loadRecordings = async () => {
    setLoadingRecordings(true);
    setRecordingError('');
    try {
      const res = await base44.functions.invoke('getZoomRecordings', {
        webinar_id: event.zoom_meeting_id
      });
      setRecordings(res.data);
    } catch (err) {
      setRecordingError(err?.response?.data?.error || 'Failed to load recordings');
    }
    setLoadingRecordings(false);
  };

  const activeTickets = tickets.filter(t => t.ticket_status === 'active');
  const checkedIn = tickets.filter(t => t.check_in_status === 'checked_in');
  const onlineTickets = activeTickets.filter(t => t.attendance_mode === 'online');
  const inPersonTickets = activeTickets.filter(t => t.attendance_mode === 'in_person');

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const recordingTypeLabel = (type) => {
    const labels = {
      shared_screen_with_speaker_view: 'Screen + Speaker',
      shared_screen_with_gallery_view: 'Screen + Gallery',
      shared_screen: 'Screen Share',
      active_speaker: 'Speaker View',
      gallery_view: 'Gallery View',
      audio_only: 'Audio Only',
      audio_transcript: 'Transcript',
      chat_file: 'Chat',
      timeline: 'Timeline',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{event.name}</h1>
          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {moment(event.event_date).format('dddd, D MMMM YYYY')}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {moment(event.start_datetime).format('h:mm A')} – {moment(event.end_datetime).format('h:mm A')}
            </span>
            {loc && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {loc.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{activeTickets.length}</p>
            <p className="text-xs text-muted-foreground">Total Tickets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{checkedIn.length}</p>
            <p className="text-xs text-muted-foreground">Checked In</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{onlineTickets.length}</p>
            <p className="text-xs text-muted-foreground">Online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{inPersonTickets.length}</p>
            <p className="text-xs text-muted-foreground">In Person</p>
          </CardContent>
        </Card>
      </div>

      {/* Zoom Recordings */}
      {event.zoom_meeting_id && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="h-4 w-4" /> Zoom Recordings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecordings ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading recordings...
              </div>
            ) : recordingError ? (
              <p className="text-sm text-destructive">{recordingError}</p>
            ) : recordings && recordings.recordings?.length > 0 ? (
              <div className="space-y-3">
                {recordings.share_url && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-secondary/50">
                    <span className="text-sm flex-1">
                      Share link: <span className="text-primary font-medium">{recordings.share_url}</span>
                      {recordings.password && <span className="text-muted-foreground ml-2">Password: {recordings.password}</span>}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(recordings.share_url);
                      toast.success('Share link copied!');
                    }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <div className="space-y-1">
                  {recordings.recordings.filter(r => r.play_url).map((rec, i) => (
                    <div key={rec.id || i} className="flex items-center justify-between p-2 rounded-md bg-secondary/30 text-sm">
                      <div>
                        <span className="font-medium">{recordingTypeLabel(rec.type)}</span>
                        <span className="text-muted-foreground ml-2">{rec.file_type} · {formatFileSize(rec.file_size)}</span>
                      </div>
                      <div className="flex gap-1">
                        {rec.play_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={rec.play_url} target="_blank" rel="noopener noreferrer" className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" /> Play
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recordings found for this webinar.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendee List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Attendees ({activeTickets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTickets ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading attendees...
            </div>
          ) : activeTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets for this session.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Check-In</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTickets.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.attendee_first_name} {t.attendee_last_name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.attendee_email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {t.attendance_mode === 'online' ? <Monitor className="h-3 w-3 mr-1" /> : <MapPin className="h-3 w-3 mr-1" />}
                          {t.attendance_mode}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.check_in_status === 'checked_in' ? (
                          <Badge className="bg-green-600/20 text-green-400 text-xs">Checked In</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}