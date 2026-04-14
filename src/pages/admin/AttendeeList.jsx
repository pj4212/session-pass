import { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Download, Trash2, RefreshCw, Loader2, Search, CheckCircle2, Circle, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import AttendeeCard from '@/components/admin/AttendeeCard';
import AttendeeDetailDialog from '@/components/admin/AttendeeDetailDialog';

export default function AttendeeList() {
  const { id } = useParams();
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [occurrence, setOccurrence] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState({});
  const [mentors, setMentors] = useState({});
  const [leaders, setLeaders] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');

  const [orders, setOrders] = useState({});
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [targetOccurrenceId, setTargetOccurrenceId] = useState('');
  const [allOccurrences, setAllOccurrences] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [sortName, setSortName] = useState('none'); // 'none' | 'asc' | 'desc'

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    const [occs, tix, tts, mList, lList, ords] = await Promise.all([
      base44.entities.EventOccurrence.filter({ id }),
      base44.entities.Ticket.filter({ occurrence_id: id }),
      base44.entities.TicketType.filter({ occurrence_id: id }),
      base44.entities.UplineMentor.filter({}),
      base44.entities.PlatinumLeader.filter({}),
      base44.entities.Order.filter({})
    ]);
    if (occs.length) setOccurrence(occs[0]);
    setTickets(tix);
    const ttMap = {};
    tts.forEach(tt => { ttMap[tt.id] = tt; });
    setTicketTypes(ttMap);
    const mMap = {};
    mList.forEach(m => { mMap[m.id] = m; });
    setMentors(mMap);
    const lMap = {};
    lList.forEach(l => { lMap[l.id] = l; });
    setLeaders(lMap);
    const oMap = {};
    ords.forEach(o => { oMap[o.id] = o; });
    setOrders(oMap);
    setLoading(false);
    setRefreshing(false);
  }

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.ticket_status !== statusFilter) return false;
    if (modeFilter !== 'all' && t.attendance_mode !== modeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = `${t.attendee_first_name} ${t.attendee_last_name}`.toLowerCase();
      if (!name.includes(s) && !t.attendee_email.toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortName === 'none') return 0;
    const nameA = `${a.attendee_first_name} ${a.attendee_last_name}`.toLowerCase();
    const nameB = `${b.attendee_first_name} ${b.attendee_last_name}`.toLowerCase();
    return sortName === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
  });

  const handleDetailUpdate = (ticketId, updates) => {
    if (updates === null) {
      setTickets(prev => prev.filter(t => t.id !== ticketId));
    } else {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updates } : t));
    }
    setSelectedTicket(null);
  };

  const handleDelete = async (ticket) => {
    if (!confirm(`Permanently delete ticket for ${ticket.attendee_first_name} ${ticket.attendee_last_name}? This cannot be undone.`)) return;
    setActionLoading(true);
    if (ticket.attendance_mode === 'online' && occurrence && (occurrence.zoom_meeting_id || (occurrence.zoom_link && /\/register\/WN_|\/w\/\d+/.test(occurrence.zoom_link)))) {
      try {
        await base44.functions.invoke('deregisterZoomAttendee', {
          ticket_id: ticket.id,
          occurrence_id: occurrence.id
        });
      } catch (err) {
        console.error('Zoom deregistration failed (non-blocking):', err.message);
      }
    }
    await base44.entities.Ticket.delete(ticket.id);
    setTickets(prev => prev.filter(t => t.id !== ticket.id));
    setActionLoading(false);
  };

  const openReschedule = async (ticket) => {
    setRescheduleTicket(ticket);
    const occs = await base44.entities.EventOccurrence.filter({ status: 'published', is_published: true });
    setAllOccurrences(occs.filter(o => o.id !== id));
  };

  const handleReschedule = async () => {
    if (!targetOccurrenceId) return;
    setActionLoading(true);

    const validation = await base44.functions.invoke('validateTickets', {
      occurrence_id: targetOccurrenceId,
      attendees: [{
        email: rescheduleTicket.attendee_email,
        attendance_mode: rescheduleTicket.attendance_mode
      }]
    });
    if (!validation.data.valid) {
      alert(validation.data.errors[0]?.message || 'Cannot reschedule: duplicate ticket on target event');
      setActionLoading(false);
      return;
    }

    await base44.entities.Ticket.update(rescheduleTicket.id, { ticket_status: 'cancelled' });

    await base44.entities.Ticket.create({
      order_id: rescheduleTicket.order_id,
      occurrence_id: targetOccurrenceId,
      ticket_type_id: rescheduleTicket.ticket_type_id,
      attendance_mode: rescheduleTicket.attendance_mode,
      attendee_first_name: rescheduleTicket.attendee_first_name,
      attendee_last_name: rescheduleTicket.attendee_last_name,
      attendee_email: rescheduleTicket.attendee_email,
      upline_mentor_id: rescheduleTicket.upline_mentor_id || '',
      platinum_leader_id: rescheduleTicket.platinum_leader_id || '',
      qr_code_hash: 'rescheduled-' + Date.now().toString(36),
      ticket_status: 'active'
    });

    const targetOcc = allOccurrences.find(o => o.id === targetOccurrenceId);
    if (targetOcc) {
      await base44.integrations.Core.SendEmail({
        to: rescheduleTicket.attendee_email,
        subject: `Your ticket has been rescheduled to ${targetOcc.name}`,
        body: `Hi ${rescheduleTicket.attendee_first_name},\n\nYour ticket has been rescheduled.\n\nNew Event: ${targetOcc.name}\nDate: ${targetOcc.event_date}\n\nThank you!`
      });
    }

    setRescheduleTicket(null);
    setTargetOccurrenceId('');
    setActionLoading(false);
    loadData();
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Ticket Type', 'Leader', 'Check-In', 'Status'];
    const rows = filtered.map(t => [
      `${t.attendee_first_name} ${t.attendee_last_name}`,
      t.attendee_email,
      ticketTypes[t.ticket_type_id]?.name || '',
      leaders[t.platinum_leader_id]?.name || '',
      t.check_in_status,
      t.ticket_status
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendees-${occurrence?.slug || id}.csv`;
    a.click();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const isSuperAdmin = user?.role === 'super_admin';

  const checkedInCount = filtered.filter(t => t.check_in_status === 'checked_in').length;
  const onlineCount = filtered.filter(t => t.attendance_mode === 'online').length;
  const inPersonCount = filtered.filter(t => t.attendance_mode === 'in_person').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Attendees</h1>
            {occurrence && <p className="text-sm text-muted-foreground truncate">{occurrence.name} — {new Date(occurrence.event_date).toLocaleDateString('en-AU')}</p>}
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => loadData(true)} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
      </div>

      {/* Stats pills */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
          <p className="text-lg sm:text-xl font-bold text-foreground">{filtered.length}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
          <p className="text-lg sm:text-xl font-bold text-blue-400">{onlineCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Online</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
          <p className="text-lg sm:text-xl font-bold text-amber-400">{inPersonCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">In-Person</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-3 py-2 text-center">
          <p className="text-lg sm:text-xl font-bold text-emerald-400">{checkedInCount}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Checked In</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-32 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="sm:w-32 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="in_person">In-Person</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: Card list */}
      <div className="sm:hidden space-y-2">
        {filtered.map(t => (
          <div key={t.id} onClick={() => setSelectedTicket(t)} className="cursor-pointer">
            <AttendeeCard
              ticket={t}
              ticketType={ticketTypes[t.ticket_type_id]}
              leader={leaders[t.platinum_leader_id]}
              isSuperAdmin={isSuperAdmin}
              actionLoading={actionLoading}
              onDelete={handleDelete}
              onReschedule={openReschedule}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-muted-foreground text-sm">No attendees found</p>
        )}
      </div>

      {/* Desktop: Table */}
      <div className="hidden sm:block border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSortName(s => s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none')}>
                <span className="inline-flex items-center gap-1">
                  Name
                  {sortName === 'none' && <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}
                  {sortName === 'asc' && <ArrowUp className="h-3 w-3" />}
                  {sortName === 'desc' && <ArrowDown className="h-3 w-3" />}
                </span>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Check-In</TableHead>
              <TableHead>Status</TableHead>
              {isSuperAdmin && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => (
              <TableRow key={t.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedTicket(t)}>
                <TableCell className="text-sm font-medium whitespace-nowrap">{t.attendee_first_name} {t.attendee_last_name}</TableCell>
                <TableCell className="text-sm truncate max-w-[180px]">{t.attendee_email}</TableCell>
                <TableCell className="text-sm">{ticketTypes[t.ticket_type_id]?.name || '—'}</TableCell>
                <TableCell className="text-sm">{leaders[t.platinum_leader_id]?.name || '—'}</TableCell>
                <TableCell>
                  <Badge variant={t.check_in_status === 'checked_in' ? 'default' : 'secondary'} className="text-xs">
                    {t.check_in_status === 'checked_in' ? 'In' : 'No'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={t.ticket_status === 'active' ? 'default' : 'destructive'} className="text-xs">{t.ticket_status}</Badge>
                </TableCell>
                {isSuperAdmin && (
                  <TableCell>
                    {t.ticket_status === 'active' && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(t); }} disabled={actionLoading}>
                          <Trash2 className="h-3 w-3 mr-1" />Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openReschedule(t); }} disabled={actionLoading}>
                          <RefreshCw className="h-3 w-3 mr-1" />Reschedule
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">No attendees found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Attendee Detail Dialog */}
      <AttendeeDetailDialog
        ticket={selectedTicket}
        ticketType={selectedTicket ? ticketTypes[selectedTicket.ticket_type_id] : null}
        leader={selectedTicket ? leaders[selectedTicket.platinum_leader_id] : null}
        order={selectedTicket ? orders[selectedTicket.order_id] : null}
        occurrence={occurrence}
        ticketTypes={ticketTypes}
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        onUpdate={handleDetailUpdate}
      />

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleTicket} onOpenChange={() => setRescheduleTicket(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule Ticket</DialogTitle></DialogHeader>
          {rescheduleTicket && (
            <div className="space-y-4">
              <p className="text-sm">Rescheduling ticket for <strong>{rescheduleTicket.attendee_first_name} {rescheduleTicket.attendee_last_name}</strong></p>
              <div>
                <Label>Target Event</Label>
                <Select value={targetOccurrenceId} onValueChange={setTargetOccurrenceId}>
                  <SelectTrigger><SelectValue placeholder="Select event..." /></SelectTrigger>
                  <SelectContent>
                    {allOccurrences.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} — {new Date(o.event_date).toLocaleDateString('en-AU')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleTicket(null)}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={!targetOccurrenceId || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}