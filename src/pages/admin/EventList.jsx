import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Copy, Edit, Users, Loader2, FolderOpen, Trash2, ExternalLink, CalendarDays, TableIcon, Video } from 'lucide-react';
import { toast } from 'sonner';
import EventTimeline from '@/components/admin/EventTimeline';
import VenueConfirmDialog from '@/components/admin/VenueConfirmDialog';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_COLORS = {
  draft: 'secondary', published: 'default', cancelled: 'destructive', completed: 'outline'
};

export default function EventList() {
  const [events, setEvents] = useState([]);
  const [locations, setLocations] = useState({});
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seriesList, setSeriesList] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [seriesFilter, setSeriesFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState('timeline');
  const [venueTarget, setVenueTarget] = useState(null);

  const [ticketTypesList, setTicketTypesList] = useState([]);

  useEffect(() => {
    async function load() {
      const [evs, locs, tix, series, tts] = await Promise.all([
        base44.entities.EventOccurrence.filter({}),
        base44.entities.Location.filter({}),
        base44.entities.Ticket.filter({ ticket_status: 'active' }),
        base44.entities.EventSeries.filter({}),
        base44.entities.TicketType.filter({})
      ]);
      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setEvents(evs.sort((a, b) => new Date(b.event_date) - new Date(a.event_date)));
      setLocations(locMap);
      setTickets(tix);
      setSeriesList(series);
      setTicketTypesList(tts);
      setLoading(false);
    }
    load();
  }, []);

  const togglePublish = async (ev) => {
    const updated = { is_published: !ev.is_published, status: ev.is_published ? 'draft' : 'published' };
    await base44.entities.EventOccurrence.update(ev.id, updated);
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, ...updated } : e));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Delete associated ticket types
    const tts = await base44.entities.TicketType.filter({ occurrence_id: deleteTarget.id });
    for (const tt of tts) { await base44.entities.TicketType.delete(tt.id); }
    await base44.entities.EventOccurrence.delete(deleteTarget.id);
    setEvents(prev => prev.filter(e => e.id !== deleteTarget.id));
    setDeleteTarget(null);
    setDeleting(false);
  };

  const ticketCount = (evId) => tickets.filter(t => t.occurrence_id === evId).length;

  const handleVenueConfirmed = (eventId, updates) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updates } : e));
  };

  // Check URL for series filter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sf = urlParams.get('series');
    if (sf) setSeriesFilter(sf);
  }, []);

  const seriesMap = {};
  seriesList.forEach(s => { seriesMap[s.id] = s; });

  const filtered = events.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (modeFilter !== 'all' && e.event_mode !== modeFilter) return false;
    if (seriesFilter !== 'all') {
      if (seriesFilter === 'standalone' && e.series_id) return false;
      if (seriesFilter !== 'standalone' && e.series_id !== seriesFilter) return false;
    }
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Sessions</h1>
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'timeline' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />Timeline
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <TableIcon className="h-3.5 w-3.5" />Table
            </button>
          </div>
        </div>
        <Button asChild><Link to="/admin/events/new"><Plus className="h-4 w-4 mr-1.5" />Create Event</Link></Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="online_stream">Online</SelectItem>
            <SelectItem value="in_person">In-Person</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={seriesFilter} onValueChange={setSeriesFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Series</SelectItem>
            <SelectItem value="standalone">Standalone Only</SelectItem>
            {seriesList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {viewMode === 'timeline' ? (
        <EventTimeline
          events={events}
          locations={locations}
          ticketCounts={(() => { const m = {}; tickets.forEach(t => { m[t.occurrence_id] = (m[t.occurrence_id] || 0) + 1; }); return m; })()}
          checkinCounts={(() => { const m = {}; tickets.filter(t => t.check_in_status === 'checked_in').forEach(t => { m[t.occurrence_id] = (m[t.occurrence_id] || 0) + 1; }); return m; })()}
          candidateCounts={(() => {
            const ttMap = {};
            ticketTypesList.forEach(tt => { ttMap[tt.id] = tt; });
            const m = {};
            tickets.forEach(t => {
              const cat = ttMap[t.ticket_type_id]?.ticket_category || 'candidate';
              if (cat === 'candidate') m[t.occurrence_id] = (m[t.occurrence_id] || 0) + 1;
            });
            return m;
          })()}
          businessOwnerCounts={(() => {
            const ttMap = {};
            ticketTypesList.forEach(tt => { ttMap[tt.id] = tt; });
            const m = {};
            tickets.forEach(t => {
              const cat = ttMap[t.ticket_type_id]?.ticket_category;
              if (cat === 'business_owner') m[t.occurrence_id] = (m[t.occurrence_id] || 0) + 1;
            });
            return m;
          })()}
          seriesMap={seriesMap}
          onVerifyVenue={(session) => setVenueTarget(session)}
        />
      ) : (
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Series</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Tickets</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(ev => (
              <TableRow key={ev.id}>
                <TableCell className="font-medium">
                  <div>{ev.name}</div>
                  {ev.recurrence_pattern && (
                    <span className="text-xs text-muted-foreground">
                      {ev.recurrence_pattern === 'weekly' ? 'Weekly' : ev.recurrence_pattern === 'fortnightly_A' ? 'Fortnight A' : ev.recurrence_pattern === 'fortnightly_B' ? 'Fortnight B' : ''}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{seriesMap[ev.series_id]?.name || '—'}</TableCell>
                <TableCell>{new Date(ev.event_date).toLocaleDateString('en-AU')}</TableCell>
                <TableCell>{locations[ev.location_id]?.name || '—'}</TableCell>
                <TableCell className="capitalize">{ev.event_mode?.replace('_', ' ')}</TableCell>
                <TableCell>{ticketCount(ev.id)}</TableCell>
                <TableCell><Badge variant={STATUS_COLORS[ev.status] || 'secondary'}>{ev.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" asChild title="Edit">
                      <Link to={`/admin/events/${ev.id}/edit`}><Edit className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Attendees">
                      <Link to={`/admin/events/${ev.id}/attendees`}><Users className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Duplicate">
                      <Link to={`/admin/events/new?duplicate=${ev.id}`}><Copy className="h-4 w-4" /></Link>
                    </Button>
                    {ev.zoom_link && (
                      <Button variant="ghost" size="icon" title="Copy Zoom Link" onClick={() => {
                        navigator.clipboard.writeText(ev.zoom_link);
                        toast.success('Zoom link copied!');
                      }}>
                        <Video className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild title="View Public">
                      <a href={`/event/${ev.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                    <Switch
                      checked={ev.is_published}
                      onCheckedChange={() => togglePublish(ev)}
                      title={ev.is_published ? 'Unpublish' : 'Publish'}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(ev)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No events found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      )}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will also delete all associated ticket types. Existing orders and tickets will not be deleted.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <VenueConfirmDialog
        open={!!venueTarget}
        onOpenChange={(open) => !open && setVenueTarget(null)}
        event={venueTarget}
        locations={locations}
        onConfirmed={handleVenueConfirmed}
      />
    </div>
  );
}