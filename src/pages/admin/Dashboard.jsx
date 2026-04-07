import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Ticket, DollarSign, Calendar, AlertTriangle, Plus, List, BarChart3, Loader2, TrendingUp, ChevronRight, RefreshCw } from 'lucide-react';
import LiveSessionBanner from '@/components/admin/LiveSessionBanner';
import WeeklyEvents from '@/components/admin/WeeklyEvents';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [allTickets, allOrders, allEvents, allTicketTypes] = await Promise.all([
      base44.entities.Ticket.filter({ ticket_status: 'active' }, '-created_date', 500),
      base44.entities.Order.filter({}, '-created_date', 500),
      base44.entities.EventOccurrence.filter({}, '-created_date', 500),
      base44.entities.TicketType.filter({}, '-created_date', 500)
    ]);

    const weekTickets = allTickets.filter(t => new Date(t.created_date) >= weekAgo);
    
    const weekOrders = allOrders.filter(o => 
      new Date(o.created_date) >= weekAgo && 
      (o.payment_status === 'completed' || o.payment_status === 'free')
    );
    const weekRevenue = weekOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const paidWeekOrders = weekOrders.filter(o => o.payment_status === 'completed' && o.total_amount > 0);
    const ttMap = Object.fromEntries(allTicketTypes.map(tt => [tt.id, tt]));
    const allPaidOrders = allOrders.filter(o => o.payment_status === 'completed' && o.total_amount > 0 && o.stripe_fee > 0);
    const allFeesTotal = allPaidOrders.reduce((sum, o) => sum + (o.stripe_fee || 0), 0);
    const paidOrderIds = new Set(allPaidOrders.map(o => o.id));
    const paidTicketCount = allTickets.filter(t => 
      paidOrderIds.has(t.order_id) && ttMap[t.ticket_type_id]?.ticket_category === 'business_owner'
    ).length;
    const avgFeePerTicket = paidTicketCount > 0 ? allFeesTotal / paidTicketCount : 0;
    const weekFeesTotal = paidWeekOrders.reduce((sum, o) => sum + (o.stripe_fee || 0), 0);
    const weekProfit = weekRevenue - weekFeesTotal;

    const upcoming = allEvents.filter(e => 
      new Date(e.event_date) >= now && e.status !== 'cancelled'
    ).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

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
      weekRevenue,
      avgFeePerTicket,
      weekProfit,
      upcomingCount: upcoming.length,
      nextEvent: upcoming[0] || null
    });
    setAlerts(alertList);
    setAllEvents(allEvents);
    setAllTickets(allTickets);
    setTicketTypes(allTicketTypes);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const statCards = [
    { label: 'Tickets This Week', value: stats.weekTickets, icon: Ticket, accent: 'text-blue-400 bg-blue-500/15' },
    { label: 'Revenue This Week', value: `$${stats.weekRevenue.toFixed(2)}`, icon: DollarSign, accent: 'text-emerald-400 bg-emerald-500/15' },
    { label: 'Avg Stripe Fee / Ticket', value: `$${stats.avgFeePerTicket.toFixed(2)}`, icon: TrendingUp, accent: 'text-red-400 bg-red-500/15' },
    { label: 'Profit After Fees', value: `$${stats.weekProfit.toFixed(2)}`, icon: DollarSign, accent: 'text-purple-400 bg-purple-500/15' },
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
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <LiveSessionBanner events={allEvents} tickets={allTickets} />

      {/* Next event */}
      {stats.nextEvent && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Next Event</span>
          </div>
          <p className="font-semibold text-foreground">{stats.nextEvent.name}</p>
          <p className="text-sm text-muted-foreground">{new Date(stats.nextEvent.event_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
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
      </div>
    </div>
  );
}