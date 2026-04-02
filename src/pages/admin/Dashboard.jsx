import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Ticket, DollarSign, Calendar, AlertTriangle, Plus, List, BarChart3, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [allTickets, allOrders, allEvents] = await Promise.all([
        base44.entities.Ticket.filter({ ticket_status: 'active' }),
        base44.entities.Order.filter({}),
        base44.entities.EventOccurrence.filter({})
      ]);

      // This week's tickets
      const weekTickets = allTickets.filter(t => new Date(t.created_date) >= weekAgo);
      
      // This week's revenue
      const weekOrders = allOrders.filter(o => 
        new Date(o.created_date) >= weekAgo && 
        (o.payment_status === 'completed' || o.payment_status === 'free')
      );
      const weekRevenue = weekOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

      // Upcoming events
      const upcoming = allEvents.filter(e => 
        new Date(e.event_date) >= now && e.status !== 'cancelled'
      ).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

      // Alerts
      const alertList = [];
      for (const ev of upcoming) {
        if ((ev.event_mode === 'online_stream' || ev.event_mode === 'hybrid') && !ev.zoom_link) {
          alertList.push({ type: 'warning', message: `"${ev.name}" is missing a Zoom link` });
        }
      }
      // Low ticket sales for events in next 7 days
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
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tickets This Week</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.weekTickets}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue This Week</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">${stats.weekRevenue.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.upcomingCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Next Event</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.nextEvent ? (
              <div>
                <p className="font-semibold text-sm truncate">{stats.nextEvent.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(stats.nextEvent.event_date).toLocaleDateString('en-AU')}</p>
              </div>
            ) : <p className="text-sm text-muted-foreground">None scheduled</p>}
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <Alert key={i} variant={a.type === 'warning' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{a.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button asChild><Link to="/admin/events/new"><Plus className="h-4 w-4 mr-1.5" />Create Event</Link></Button>
        <Button variant="outline" asChild><Link to="/admin/events"><List className="h-4 w-4 mr-1.5" />View Events</Link></Button>
        <Button variant="outline" asChild><Link to="/admin/reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</Link></Button>
      </div>
    </div>
  );
}