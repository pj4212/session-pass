import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Users, Loader2, Monitor, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

function formatDuration(seconds) {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

export default function ZoomAttendancePanel({ webinarId, tickets }) {
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onlineTickets = tickets.filter(t => t.ticket_status === 'active' && t.attendance_mode === 'online');
  const ticketEmailSet = new Set(onlineTickets.map(t => (t.attendee_email || '').toLowerCase().trim()));

  const loadAttendance = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getZoomAttendance', { webinar_id: webinarId });
      setAttendance(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load attendance data. The report may not be available yet (Zoom reports can take up to 30 minutes after a webinar ends).');
    }
    setLoading(false);
  };

  // Match attendance to tickets
  const getMatchedData = () => {
    if (!attendance) return { matched: [], unmatched: [], noShows: [] };

    const attendedEmails = new Set();
    const matched = [];
    const unmatched = [];

    for (const p of attendance.participants) {
      const email = (p.email || '').toLowerCase().trim();
      if (email && ticketEmailSet.has(email)) {
        const ticket = onlineTickets.find(t => (t.attendee_email || '').toLowerCase().trim() === email);
        matched.push({ ...p, ticket });
        attendedEmails.add(email);
      } else {
        unmatched.push(p);
      }
    }

    const noShows = onlineTickets.filter(t =>
      !attendedEmails.has((t.attendee_email || '').toLowerCase().trim())
    );

    return { matched, unmatched, noShows };
  };

  if (!attendance && !loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" /> Zoom Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Pull the Zoom participant report to see who actually joined the webinar and match them against ticket holders.
          </p>
          <Button onClick={loadAttendance} size="sm">
            <Users className="h-4 w-4 mr-1" /> Load Attendance Report
          </Button>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" /> Zoom Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading attendance report...
          </div>
        </CardContent>
      </Card>
    );
  }

  const { matched, unmatched, noShows } = getMatchedData();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" /> Zoom Attendance
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadAttendance}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-md bg-secondary/50 text-center">
            <p className="text-xl font-bold">{attendance.total_unique}</p>
            <p className="text-xs text-muted-foreground">Zoom Joiners</p>
          </div>
          <div className="p-3 rounded-md bg-green-600/10 text-center">
            <p className="text-xl font-bold text-green-400">{matched.length}</p>
            <p className="text-xs text-muted-foreground">Matched Tickets</p>
          </div>
          <div className="p-3 rounded-md bg-destructive/10 text-center">
            <p className="text-xl font-bold text-destructive">{noShows.length}</p>
            <p className="text-xs text-muted-foreground">No-Shows</p>
          </div>
          <div className="p-3 rounded-md bg-yellow-600/10 text-center">
            <p className="text-xl font-bold text-yellow-400">{unmatched.length}</p>
            <p className="text-xs text-muted-foreground">No Ticket</p>
          </div>
        </div>

        {/* Matched attendees */}
        {matched.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              Attended ({matched.length})
            </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matched.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {p.ticket ? `${p.ticket.attendee_first_name} ${p.ticket.attendee_last_name}` : p.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell>{formatDuration(p.total_duration_seconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* No-shows */}
        {noShows.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              No-Shows ({noShows.length})
            </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noShows.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.attendee_first_name} {t.attendee_last_name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.attendee_email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Unmatched Zoom joiners (no ticket) */}
        {unmatched.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-yellow-400" />
              Joined Without Ticket ({unmatched.length})
            </h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatched.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{p.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email || '—'}</TableCell>
                      <TableCell>{formatDuration(p.total_duration_seconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}