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
  const mountedRef = useRef(true);

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
      setTickets(prev => prev.map(t =>
        t.id === ticket.id
          ? { ...t, check_in_status: isCheckedIn ? 'checked_in' : 'not_checked_in', checked_in_at: isCheckedIn ? ticket.checked_in_at : '' }
          : t
      ));
    }
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
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center justify-center px-4 py-2.5">
          <div className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Users className="h-5 w-5 text-primary" />
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
              size="sm"
              className={`text-xs ${filter === tab.value 
                ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
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

          return (
            <button
              key={t.id}
              className={`w-full flex items-center gap-4 px-4 py-4 min-h-[72px] border-b border-border text-left transition-colors active:bg-accent ${
                isChecked ? 'bg-emerald-500/10' : ''
              }`}
              onClick={() => handleToggle(t)}
            >
              <div className="shrink-0 flex items-center justify-center w-12 h-12">
                {isChecked ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                ) : (
                  <Circle className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base truncate text-foreground">
                  {t.attendee_first_name} {t.attendee_last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{t.attendee_email}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-xs">
                  {tt?.name || 'Ticket'}
                </Badge>
                <Badge className={`text-xs ${t.attendance_mode === 'online' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-primary/15 text-primary border-primary/30'}`}>
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