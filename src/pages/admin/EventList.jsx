import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Copy, Edit, Users, Loader2, FolderOpen, Trash2, ExternalLink, CalendarDays, TableIcon, Video, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const [creatingProjected, setCreatingProjected] = useState(null);
  const navigate = useNavigate();

  const [ticketTypesList, setTicketTypesList] = useState([]);

  async function load() {
    setLoading(true);
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

  useEffect(() => {
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

  const handleCreateFromProjected = async (projectedSession) => {
    setCreatingProjected(projectedSession.id);
    const sourceId = projectedSession._sourceId;
    // Load source event to copy all fields
    const sourceEvents = await base44.entities.EventOccurrence.filter({ id: sourceId });
    const source = sourceEvents[0];
    if (!source) { setCreatingProjected(null); return; }

    // Build start/end datetimes using projected date + source times
    const newData = {
      template_id: source.template_id || '',
      series_id: source.series_id || '',
      name: source.name,
      slug: source.slug + '-' + projectedSession.event_date,
      description: source.description || '',
      event_date: projectedSession.event_date,
      start_datetime: projectedSession.start_datetime,
      end_datetime: projectedSession.end_datetime,
      timezone: source.timezone,
      event_mode: source.event_mode,
      recurrence_pattern: source.recurrence_pattern || '',
      location_id: source.location_id || '',
      venue_id: source.venue_id || '',
      venue_name: source.venue_name || '',
      venue_link: source.venue_link || '',
      parking_link: source.parking_link || '',
      venue_details: source.venue_details || '',
      zoom_webinar_mode: source.zoom_webinar_mode || 'auto',
      is_published: false,
      status: 'draft',
    };

    const created = await base44.entities.EventOccurrence.create(newData);

    // Copy ticket types from source
    const sourceTTs = ticketTypesList.filter(tt => tt.occurrence_id === sourceId);
    for (const tt of sourceTTs) {
      await base44.entities.TicketType.create({
        occurrence_id: created.id,
        name: tt.name,
        attendance_mode: tt.attendance_mode,
        ticket_category: tt.ticket_category || '',
        price: tt.price,
        requires_payment: tt.requires_payment,
        capacity_limit: tt.capacity_limit,
        is_active: tt.is_active,
        sort_order: tt.sort_order,
        description: tt.description || '',
      });
    }

    // Refresh events list so the timeline updates with the new real session
    const evs = await base44.entities.EventOccurrence.filter({});
    setEvents(evs.sort((a, b) => new Date(b.event_date) - new Date(a.event_date)));
    setCreatingProjected(null);
    toast.success(`Session created: ${created.name} on ${projectedSession.event_date}`);
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold shrink-0">Sessions</h1>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2.5 py-1.5 text-xs sm:text-sm flex items-center gap-1 transition-colors ${viewMode === 'timeline' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarDays className="h-3.5 w-3.5" /><span className="hidden sm:inline">Timeline</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 text-xs sm:text-sm flex items-center gap-1 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <TableIcon className="h-3.5 w-3.5" /><span className="hidden sm:inline">Table</span>
            </button>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/admin/events/new"><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Create Event</span></Link>
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Input placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:max-w-xs" />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-36 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="sm:w-36 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="online_stream">Online</SelectItem>
              <SelectItem value="in_person">In-Person</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={seriesFilter} onValueChange={setSeriesFilter}>
            <SelectTrigger className="sm:w-44 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Series</SelectItem>
              <SelectItem value="standalone">Standalone</SelectItem>
              {seriesList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
          onCreateFromProjected={handleCreateFromProjected}
          creatingProjected={creatingProjected}
          onTogglePublish={togglePublish}
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