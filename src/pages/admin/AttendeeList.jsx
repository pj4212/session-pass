import { useState, useEffect } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Download, X, Ban, RefreshCw, Loader2 } from 'lucide-react';

export default function AttendeeList() {
  const { id } = useParams();
  const { user } = useOutletContext();
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
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [orders, setOrders] = useState({});
  const [rescheduleTicket, setRescheduleTicket] = useState(null);
  const [targetOccurrenceId, setTargetOccurrenceId] = useState('');
  const [allOccurrences, setAllOccurrences] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

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
    if (categoryFilter !== 'all') {
      const cat = ticketTypes[t.ticket_type_id]?.ticket_category || 'candidate';
      if (cat !== categoryFilter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const name = `${t.attendee_first_name} ${t.attendee_last_name}`.toLowerCase();
      if (!name.includes(s) && !t.attendee_email.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const handleCancel = async (ticket) => {
    if (!confirm('Cancel this ticket? This cannot be undone.')) return;
    setActionLoading(true);
    await base44.entities.Ticket.update(ticket.id, { ticket_status: 'cancelled' });
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ticket_status: 'cancelled' } : t));
    setActionLoading(false);
  };

  const handleRefund = async (ticket) => {
    if (!confirm('Mark this ticket as refunded? Process the actual refund via Stripe dashboard.')) return;
    setActionLoading(true);
    await base44.entities.Ticket.update(ticket.id, { ticket_status: 'refunded' });
    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ticket_status: 'refunded' } : t));
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

    // Validate uniqueness on target occurrence
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

    // Cancel old ticket
    await base44.entities.Ticket.update(rescheduleTicket.id, { ticket_status: 'cancelled' });

    // Create new ticket on target occurrence
    const newTicket = await base44.entities.Ticket.create({
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

    // Send email
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
    const headers = ['Name', 'Email', 'Ticket Type', 'Category', 'Mode', 'Mentor', 'Platinum Leader', 'Check-In', 'Status', 'Order Number'];
    const rows = filtered.map(t => [
      `${t.attendee_first_name} ${t.attendee_last_name}`,
      t.attendee_email,
      ticketTypes[t.ticket_type_id]?.name || '',
      ticketTypes[t.ticket_type_id]?.ticket_category === 'business_owner' ? 'Business Owner' : 'Candidate',
      t.attendance_mode,
      mentors[t.upline_mentor_id]?.name || '',
      leaders[t.platinum_leader_id]?.name || '',
      t.check_in_status,
      t.ticket_status,
      orders[t.order_id]?.order_number || ''
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-2xl font-bold">Attendees</h1>
            {occurrence && <p className="text-muted-foreground">{occurrence.name} — {new Date(occurrence.event_date).toLocaleDateString('en-AU')}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => loadData(true)} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="in_person">In-Person</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="candidate">Candidates</SelectItem>
            <SelectItem value="business_owner">Business Owners</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
        <span>{filtered.length} attendees</span>
        <span>Candidates: {filtered.filter(t => (ticketTypes[t.ticket_type_id]?.ticket_category || 'candidate') === 'candidate').length}</span>
        <span>Business Owners: {filtered.filter(t => ticketTypes[t.ticket_type_id]?.ticket_category === 'business_owner').length}</span>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Check-In</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              {isSuperAdmin && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => (
              <TableRow key={t.id}>
                <TableCell>{t.attendee_first_name} {t.attendee_last_name}</TableCell>
                <TableCell className="text-sm">{t.attendee_email}</TableCell>
                <TableCell>{ticketTypes[t.ticket_type_id]?.name || '—'}</TableCell>
                <TableCell>
                  <Badge variant={ticketTypes[t.ticket_type_id]?.ticket_category === 'business_owner' ? 'default' : 'secondary'}>
                    {ticketTypes[t.ticket_type_id]?.ticket_category === 'business_owner' ? 'Business Owner' : 'Candidate'}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{t.attendance_mode?.replace('_', ' ')}</Badge></TableCell>
                <TableCell className="text-sm">{mentors[t.upline_mentor_id]?.name || '—'}</TableCell>
                <TableCell className="text-sm">{leaders[t.platinum_leader_id]?.name || '—'}</TableCell>
                <TableCell>
                  <Badge variant={t.check_in_status === 'checked_in' ? 'default' : 'secondary'}>
                    {t.check_in_status === 'checked_in' ? 'Checked In' : 'Not Checked In'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={t.ticket_status === 'active' ? 'default' : 'destructive'}>{t.ticket_status}</Badge>
                </TableCell>
                <TableCell className="text-xs">{orders[t.order_id]?.order_number || '—'}</TableCell>
                {isSuperAdmin && (
                  <TableCell>
                    {t.ticket_status === 'active' && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(t)} disabled={actionLoading}>
                          <X className="h-3 w-3 mr-1" />Cancel
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleRefund(t)} disabled={actionLoading}>
                          <Ban className="h-3 w-3 mr-1" />Refund
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openReschedule(t)} disabled={actionLoading}>
                          <RefreshCw className="h-3 w-3 mr-1" />Reschedule
                        </Button>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No attendees found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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