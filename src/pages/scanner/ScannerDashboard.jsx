import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Users, MapPin, Monitor } from 'lucide-react';

export default function ScannerDashboard() {
  const { occurrenceId } = useParams();
  const { user } = useOutletContext();
  const [event, setEvent] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [locations, setLocations] = useState({});
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    const interval = setInterval(pollData, 5000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [occurrenceId]);

  const loadData = async () => {
    const [ev, tix, tts, locs] = await Promise.all([
      base44.entities.EventOccurrence.filter({ id: occurrenceId }),
      base44.entities.Ticket.filter({ occurrence_id: occurrenceId, ticket_status: 'active' }),
      base44.entities.TicketType.filter({ occurrence_id: occurrenceId }),
      base44.entities.Location.filter({})
    ]);
    if (!mountedRef.current) return;
    setEvent(ev[0] || null);
    setTickets(tix);
    setTicketTypes(tts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    const locMap = {};
    locs.forEach(l => { locMap[l.id] = l; });
    setLocations(locMap);
    setLoading(false);
  };

  const pollData = async () => {
    const res = await base44.functions.invoke('checkin', { action: 'poll', occurrence_id: occurrenceId });
    if (!mountedRef.current) return;
    if (res.data.status === 'success') {
      setTickets(prev => {
        const updates = {};
        res.data.tickets.forEach(t => { updates[t.id] = t; });
        return prev.map(t => {
          const upd = updates[t.id];
          if (upd && upd.check_in_status !== t.check_in_status) {
            return { ...t, check_in_status: upd.check_in_status, checked_in_at: upd.checked_in_at };
          }
          return t;
        });
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!event) {
    return <p className="text-center text-muted-foreground py-12">Event not found</p>;
  }

  const totalCheckedIn = tickets.filter(t => t.check_in_status === 'checked_in').length;
  const totalTickets = tickets.length;
  const pct = totalTickets > 0 ? Math.round((totalCheckedIn / totalTickets) * 100) : 0;

  const byType = ticketTypes.map(tt => {
    const typeTix = tickets.filter(t => t.ticket_type_id === tt.id);
    const checked = typeTix.filter(t => t.check_in_status === 'checked_in').length;
    return { ...tt, total: typeTix.length, checkedIn: checked };
  });

  const locationName = event.location_id ? (locations[event.location_id]?.name || '') : '';

  return (
    <div className="p-4 space-y-5 pb-24">
      {/* Event name */}
      <div>
        <h1 className="text-xl font-bold text-foreground">{event.name}</h1>
        {locationName && (
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3.5 w-3.5" />{locationName}
          </p>
        )}
      </div>

      {/* Total stats card */}
      <div className="bg-primary rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-primary-foreground/70">Total Checked In</p>
            <p className="text-3xl font-bold text-primary-foreground mt-1">
              {totalCheckedIn} <span className="text-lg font-normal text-primary-foreground/60">/ {totalTickets}</span>
            </p>
          </div>
          <div className="h-16 w-16 rounded-full bg-white/15 flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">{pct}%</span>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Breakdown by ticket type */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Ticket Type</h2>
        {byType.map(tt => {
          const ttPct = tt.total > 0 ? Math.round((tt.checkedIn / tt.total) * 100) : 0;
          const isOnline = tt.attendance_mode === 'online';
          return (
            <div key={tt.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isOnline ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    {isOnline ? <Monitor className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{tt.name}</p>
                    <p className="text-xs text-muted-foreground">{isOnline ? 'Online' : 'In-Person'}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-foreground">{tt.checkedIn}<span className="text-sm font-normal text-muted-foreground"> / {tt.total}</span></p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${isOnline ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${ttPct}%` }} />
              </div>
            </div>
          );
        })}
        {byType.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No ticket types configured</p>
        )}
      </div>
    </div>
  );
}