import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Search, Loader2, CheckCircle2, Circle } from 'lucide-react';

export default function ManualCheckinList() {
  const { occurrenceId } = useParams();
  const { user, assignments } = useOutletContext();
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [processing, setProcessing] = useState(null);
  const mountedRef = useRef(true);

  // Check if this scanner can undo
  const canUndo = user.role === 'super_admin' || user.role === 'event_admin' ||
    assignments.some(a => 
      a.can_undo_checkin && (a.occurrence_id === occurrenceId || !a.occurrence_id)
    );

  useEffect(() => {
    mountedRef.current = true;
    loadTickets();
    const interval = setInterval(poll, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [occurrenceId]);

  const loadTickets = async () => {
    const [tix, tts] = await Promise.all([
      base44.entities.Ticket.filter({ occurrence_id: occurrenceId, ticket_status: 'active' }),
      base44.entities.TicketType.filter({ occurrence_id: occurrenceId })
    ]);
    if (!mountedRef.current) return;
    const ttMap = {};
    tts.forEach(tt => { ttMap[tt.id] = tt; });
    setTickets(tix);
    setTicketTypes(ttMap);
    setLoading(false);
  };

  const poll = async () => {
    const res = await base44.functions.invoke('checkin', { action: 'poll', occurrence_id: occurrenceId });
    if (!mountedRef.current) return;
    const data = res.data;
    if (data.status === 'success') {
      setTickets(prev => {
        const updates = {};
        data.tickets.forEach(t => { updates[t.id] = t; });
        return prev.map(t => {
          const upd = updates[t.id];
          if (upd && (upd.check_in_status !== t.check_in_status || upd.checked_in_at !== (t.checked_in_at || ''))) {
            return { ...t, check_in_status: upd.check_in_status, checked_in_at: upd.checked_in_at };
          }
          return t;
        });
      });
    }
  };

  const handleToggle = async (ticket) => {
    const isCheckedIn = ticket.check_in_status === 'checked_in';

    if (isCheckedIn && !canUndo) return;

    // Optimistic update
    setProcessing(ticket.id);
    setTickets(prev => prev.map(t => 
      t.id === ticket.id 
        ? { ...t, check_in_status: isCheckedIn ? 'not_checked_in' : 'checked_in', checked_in_at: isCheckedIn ? '' : new Date().toISOString() }
        : t
    ));

    const res = await base44.functions.invoke('checkin', {
      action: isCheckedIn ? 'undo_checkin' : 'checkin',
      ticket_id: ticket.id,
      occurrence_id: occurrenceId
    });

    if (res.data.status !== 'success') {
      // Revert
      setTickets(prev => prev.map(t =>
        t.id === ticket.id
          ? { ...t, check_in_status: isCheckedIn ? 'checked_in' : 'not_checked_in', checked_in_at: isCheckedIn ? ticket.checked_in_at : '' }
          : t
      ));
    }
    setProcessing(null);
  };

  const checkedInCount = tickets.filter(t => t.check_in_status === 'checked_in').length;

  const filtered = tickets.filter(t => {
    if (filter === 'checked_in' && t.check_in_status !== 'checked_in') return false;
    if (filter === 'not_checked_in' && t.check_in_status !== 'not_checked_in') return false;
    if (search) {
      const s = search.toLowerCase();
      const name = `${t.attendee_first_name} ${t.attendee_last_name}`.toLowerCase();
      if (!name.includes(s) && !t.attendee_email.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="shrink-0 border-b bg-card">
        <div className="flex items-center justify-center px-4 py-2">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5" />
            <span>{checkedInCount} / {tickets.length}</span>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search name or email..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {[
            { value: 'all', label: `All (${tickets.length})` },
            { value: 'not_checked_in', label: `Pending (${tickets.length - checkedInCount})` },
            { value: 'checked_in', label: `Done (${checkedInCount})` },
          ].map(tab => (
            <Button
              key={tab.value}
              variant={filter === tab.value ? 'default' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-auto">
        {filtered.map(t => {
          const isChecked = t.check_in_status === 'checked_in';
          const tt = ticketTypes[t.ticket_type_id];
          const isProcessing = processing === t.id;

          return (
            <button
              key={t.id}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b text-left transition-colors active:bg-muted ${
                isChecked ? 'bg-green-50 dark:bg-green-950/30' : ''
              }`}
              onClick={() => handleToggle(t)}
              disabled={isProcessing || (isChecked && !canUndo)}
            >
              <div className="shrink-0">
                {isProcessing ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : isChecked ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {t.attendee_first_name} {t.attendee_last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{t.attendee_email}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-xs">
                  {tt?.name || 'Ticket'}
                </Badge>
                <Badge variant={t.attendance_mode === 'online' ? 'secondary' : 'default'} className="text-xs">
                  {t.attendance_mode === 'online' ? 'Online' : 'In-Person'}
                </Badge>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No attendees found</p>
        )}
      </div>
    </div>
  );
}