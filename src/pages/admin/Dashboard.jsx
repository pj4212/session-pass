import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useWorkspaceFilter from '@/hooks/useWorkspaceFilter';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Ticket, DollarSign, Calendar, AlertTriangle, Plus, List, BarChart3, Loader2, TrendingUp, ChevronRight, RefreshCw, Download, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import LiveSessionBanner from '@/components/admin/LiveSessionBanner';
import WeeklyEvents from '@/components/admin/WeeklyEvents';

export default function Dashboard() {
  const { wsFilter, workspaceId } = useWorkspaceFilter();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [syncingFees, setSyncingFees] = useState(false);

  async function handleExport() {
    setExporting(true);
    const res = await base44.functions.invoke('exportAllData', {});
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_pass_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  async function handleSyncStripeFees() {
    setSyncingFees(true);
    const res = await base44.functions.invoke('syncStripeFees', {});
    const d = res.data;
    toast.success(`Synced ${d.synced} orders · Actual fees: $${d.total_actual_fees.toFixed(2)}`);
    setSyncingFees(false);
    await load();
  }

  async function load() {
    setLoading(true);
    const now = new Date();

    // Calculate current week boundaries (Monday 00:00 to Sunday 23:59)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const [allTickets, allOrders, allEvents, allTicketTypes] = await Promise.all([
      base44.entities.Ticket.filter({ ...wsFilter, ticket_status: 'active' }, '-created_date', 500),
      base44.entities.Order.filter({ ...wsFilter }, '-created_date', 500),
      base44.entities.EventOccurrence.filter({ ...wsFilter }, '-created_date', 500),
      base44.entities.TicketType.filter({ ...wsFilter }, '-created_date', 500)
    ]);

    // Events happening this week (by event_date falling within Mon-Sun)
    const weekEventIds = new Set(
      allEvents
        .filter(e => {
          const d = new Date(e.event_date + 'T00:00:00');
          return d >= weekStart && d <= weekEnd;
        })
        .map(e => e.id)
    );

    // Tickets sold for this week's events (regardless of when purchased)
    const weekTickets = allTickets.filter(t => weekEventIds.has(t.occurrence_id));

    const ttMap = Object.fromEntries(allTicketTypes.map(tt => [tt.id, tt]));

    // Calculate revenue directly from tickets × ticket type price (more accurate than summing orders)
    const weekPaidTickets = weekTickets.filter(t => {
      const tt = ttMap[t.ticket_type_id];
      return tt && tt.price > 0;
    });
    const weekPaidTicketCount = weekPaidTickets.length;
    const weekRevenue = weekPaidTickets.reduce((sum, t) => sum + (ttMap[t.ticket_type_id]?.price || 0), 0);

    // Avg fee: total recorded stripe fees / total paid tickets across all orders with fees
    const ordersWithFees = allOrders.filter(o => o.payment_status === 'completed' && o.stripe_fee > 0);
    const allFeesTotal = ordersWithFees.reduce((sum, o) => sum + o.stripe_fee, 0);
    const feeOrderIds = new Set(ordersWithFees.map(o => o.id));
    const allPaidTicketsWithFees = allTickets.filter(t => {
      const tt = ttMap[t.ticket_type_id];
      return feeOrderIds.has(t.order_id) && tt && tt.price > 0;
    }).length;
    const avgFeePerTicket = allPaidTicketsWithFees > 0 ? allFeesTotal / allPaidTicketsWithFees : 0;

    const estimatedWeekFees = weekPaidTicketCount * avgFeePerTicket;
    const weekProfit = weekRevenue - estimatedWeekFees;

    const upcoming = allEvents.filter(e => 
      new Date(e.event_date) >= now && e.status === 'published'
    ).sort((a, b) => new Date(a.start_datetime || a.event_date) - new Date(b.start_datetime || b.event_date));

    // Gather next events: all published events within 2 hours of the earliest
    let nextEvents = [];
    if (upcoming.length > 0) {
      const firstStart = new Date(upcoming[0].start_datetime || upcoming[0].event_date).getTime();
      const twoHoursMs = 2 * 60 * 60 * 1000;
      nextEvents = upcoming.filter(e => {
        const eStart = new Date(e.start_datetime || e.event_date).getTime();
        return eStart - firstStart <= twoHoursMs;
      });
    }

    const alertList = [];
    for (const ev of upcoming) {
      if ((ev.event_mode === 'online_stream' || ev.event_mode === 'hybrid') && !ev.zoom_link) {
        alertList.push({ type: 'warning', message: `"${ev.name}" is missing a Zoom link`, link: `/admin/events/${ev.id}/edit` });
      }
      if ((ev.event_mode === 'in_person' || ev.event_mode === 'hybrid') && ev.is_published && !ev.venue_confirmed) {
        alertList.push({ type: 'warning', message: `"${ev.name}" is published but venue is not confirmed`, link: `/admin/events/${ev.id}/edit` });
      }
    }
    const soonEvents = upcoming.filter(e => new Date(e.event_date) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
    for (const ev of soonEvents) {
      const evTickets = allTickets.filter(t => t.occurrence_id === ev.id);
      if (evTickets.length < 5) {
        alertList.push({ type: 'info', message: `"${ev.name}" has only ${evTickets.length} tickets sold`, link: `/admin/events/${ev.id}/attendees` });
      }
    }

    setStats({
      weekTickets: weekTickets.length,
      weekPaidTickets: weekPaidTicketCount,
      weekRevenue,
      avgFeePerTicket,
      estimatedWeekFees,
      weekProfit,
      upcomingCount: upcoming.length,
      nextEvents
    });
    setAlerts(alertList);
    setAllEvents(allEvents);
    setAllTickets(allTickets);
    setTicketTypes(allTicketTypes);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [workspaceId]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const statCards = [
    { label: 'Tickets This Week', value: stats.weekTickets, icon: Ticket, accent: 'text-blue-400 bg-blue-500/15' },
    { label: 'Revenue This Week', value: `$${stats.weekRevenue.toFixed(2)}`, icon: DollarSign, accent: 'text-emerald-400 bg-emerald-500/15' },
    { label: 'Avg Stripe Fee / Ticket', value: `$${stats.avgFeePerTicket.toFixed(2)}`, icon: CreditCard, accent: 'text-red-400 bg-red-500/15', action: handleSyncStripeFees, actionLoading: syncingFees },
    { label: 'Est. Profit After Fees', value: `$${stats.weekProfit.toFixed(2)}`, subtitle: `${stats.weekPaidTickets} paid tickets · ~$${stats.estimatedWeekFees.toFixed(2)} fees`, icon: DollarSign, accent: 'text-purple-400 bg-purple-500/15' },
    { label: 'Upcoming Events', value: stats.upcomingCount, icon: Calendar, accent: 'text-amber-400 bg-amber-500/15' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button asChild>
          <Link to="/admin/events/new"><Plus className="h-4 w-4 mr-1.5" />Create Event</Link>
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${card.accent}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              {card.action && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={card.action} disabled={card.actionLoading} title="Sync Stripe Fees">
                  {card.actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
            {card.subtitle && <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>}
          </div>
        ))}
      </div>

      <LiveSessionBanner events={allEvents} tickets={allTickets} />

      {/* Next events */}
      {stats.nextEvents.length > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {stats.nextEvents.length === 1 ? 'Next Event' : 'Next Events'}
            </span>
          </div>
          <div className={`grid gap-3 ${stats.nextEvents.length > 1 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
            {stats.nextEvents.map(ev => {
              const startTime = ev.start_datetime ? new Date(ev.start_datetime).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
              return (
                <div key={ev.id} className={`${stats.nextEvents.length > 1 ? 'bg-background/40 rounded-lg p-3 border border-primary/10' : ''}`}>
                  <p className="font-semibold text-foreground">{ev.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(ev.event_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {startTime ? ` · ${startTime}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Alerts</h2>
          {alerts.map((a, i) => (
            <Link key={i} to={a.link} className={`flex items-center gap-3 rounded-xl p-4 border transition-colors cursor-pointer group ${
              a.type === 'warning' ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20' : 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
            }`}>
              <AlertTriangle className={`h-4 w-4 shrink-0 ${a.type === 'warning' ? 'text-red-400' : 'text-amber-400'}`} />
              <p className="text-sm text-foreground flex-1">{a.message}</p>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          ))}
        </div>
      )}

      <WeeklyEvents events={allEvents} tickets={allTickets} ticketTypes={ticketTypes} />

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" asChild><Link to="/admin/events"><List className="h-4 w-4 mr-1.5" />View Events</Link></Button>
        <Button variant="secondary" asChild><Link to="/admin/reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</Link></Button>
        <Button variant="secondary" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          Export All Data
        </Button>
      </div>
    </div>
  );
}