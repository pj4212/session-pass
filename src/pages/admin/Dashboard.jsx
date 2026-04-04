import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Ticket, DollarSign, Calendar, AlertTriangle, Plus, List, BarChart3, Loader2, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [allTickets, allOrders, allEvents] = await Promise.all([
        base44.entities.Ticket.filter({ ticket_status: 'active' }, '-created_date', 500),
        base44.entities.Order.filter({}, '-created_date', 500),
        base44.entities.EventOccurrence.filter({}, '-created_date', 500)
      ]);

      const weekTickets = allTickets.filter(t => new Date(t.created_date) >= weekAgo);
      
      const weekOrders = allOrders.filter(o => 
        new Date(o.created_date) >= weekAgo && 
        (o.payment_status === 'completed' || o.payment_status === 'free')
      );
      const weekRevenue = weekOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      const upcoming = allEvents.filter(e => 
        new Date(e.event_date) >= now && e.status !== 'cancelled'
      ).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

      const alertList = [];
      for (const ev of upcoming) {
        if ((ev.event_mode === 'online_stream' || ev.event_mode === 'hybrid') && !ev.zoom_link) {
          alertList.push({ type: 'warning', message: `"${ev.name}" is missing a Zoom link` });
        }
      }
      const soonEvents = upcoming.filter(e => new Date(e.event_date) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
      for (const ev of soonEvents) {
        const evTickets = allTickets.filter(t => t.occurrence_id === ev.id);
        if (evTickets.length < 5) {
          alertList.push({ type: 'info', message: `"${ev.name}" has only ${evTickets.length} tickets sold` });
        }
      }

      setStats({
        weekTickets: weekTickets.length,
        weekRevenue,
        upcomingCount: upcoming.length,
        nextEvent: upcoming[0] || null
      });
      setAlerts(alertList);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const statCards = [
    { label: 'Tickets This Week', value: stats.weekTickets, icon: Ticket, accent: 'text-blue-400 bg-blue-500/15' },
    { label: 'Revenue This Week', value: `$${stats.weekRevenue.toFixed(2)}`, icon: DollarSign, accent: 'text-emerald-400 bg-emerald-500/15' },
    { label: 'Upcoming Events', value: stats.upcomingCount, icon: Calendar, accent: 'text-amber-400 bg-amber-500/15' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
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
            <div key={i} className={`flex items-start gap-3 rounded-xl p-4 border ${
              a.type === 'warning' ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'
            }`}>
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.type === 'warning' ? 'text-red-400' : 'text-amber-400'}`} />
              <p className="text-sm text-foreground">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" asChild><Link to="/admin/events"><List className="h-4 w-4 mr-1.5" />View Events</Link></Button>
        <Button variant="secondary" asChild><Link to="/admin/reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</Link></Button>
      </div>
    </div>
  );
}