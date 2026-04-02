import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Copy, Edit, Users, Loader2, FolderOpen } from 'lucide-react';

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

  useEffect(() => {
    async function load() {
      const [evs, locs, tix, series] = await Promise.all([
        base44.entities.EventOccurrence.filter({}),
        base44.entities.Location.filter({}),
        base44.entities.Ticket.filter({ ticket_status: 'active' }),
        base44.entities.EventSeries.filter({})
      ]);
      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setEvents(evs.sort((a, b) => new Date(b.event_date) - new Date(a.event_date)));
      setLocations(locMap);
      setTickets(tix);
      setSeriesList(series);
      setLoading(false);
    }
    load();
  }, []);

  const togglePublish = async (ev) => {
    const updated = { is_published: !ev.is_published, status: ev.is_published ? 'draft' : 'published' };
    await base44.entities.EventOccurrence.update(ev.id, updated);
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, ...updated } : e));
  };

  const ticketCount = (evId) => tickets.filter(t => t.occurrence_id === evId).length;

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
        <h1 className="text-2xl font-bold">Events</h1>
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
                <TableCell className="font-medium">{ev.name}</TableCell>
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
                    <Button variant="ghost" size="icon" asChild title="View Public">
                      <Link to={`/event/${ev.slug}`} target="_blank"><Eye className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => togglePublish(ev)}>
                      {ev.is_published ? 'Unpublish' : 'Publish'}
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
    </div>
  );
}