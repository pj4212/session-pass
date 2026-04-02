import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScanLine, List, Calendar, MapPin, Clock, Loader2 } from 'lucide-react';

export default function ScannerHome() {
  const { user, assignments } = useOutletContext();
  const [events, setEvents] = useState([]);
  const [ticketCounts, setTicketCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todayStr = today.toISOString().slice(0, 10);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      let allEvents = await base44.entities.EventOccurrence.filter({ status: 'published' });

      // Filter to today/tomorrow
      allEvents = allEvents.filter(e => e.event_date >= todayStr && e.event_date <= tomorrowStr);

      // Filter by scanner assignments
      if (user.role === 'scanner') {
        const occIds = new Set(assignments.filter(a => a.occurrence_id).map(a => a.occurrence_id));
        const locIds = new Set(assignments.filter(a => a.location_id).map(a => a.location_id));
        allEvents = allEvents.filter(e => occIds.has(e.id) || locIds.has(e.location_id));
      }

      allEvents.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
      setEvents(allEvents);

      // Get ticket counts
      const counts = {};
      for (const ev of allEvents) {
        const tickets = await base44.entities.Ticket.filter({ occurrence_id: ev.id, ticket_status: 'active' });
        const checkedIn = tickets.filter(t => t.check_in_status === 'checked_in').length;
        counts[ev.id] = { total: tickets.length, checkedIn };
      }
      setTicketCounts(counts);
      setLoading(false);
    }
    load();
  }, [user, assignments]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <ScanLine className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No events assigned</h2>
        <p className="text-muted-foreground">Contact your admin to get assigned to events.</p>
      </div>
    );
  }

  const formatTime = (dt) => {
    if (!dt) return '';
    return new Date(dt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Your Events</h1>
      {events.map(ev => {
        const counts = ticketCounts[ev.id] || { total: 0, checkedIn: 0 };
        return (
          <Card key={ev.id}>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-bold text-lg">{ev.name}</h2>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{ev.event_date}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(ev.start_datetime)}</span>
              </div>
              <div className="text-sm font-medium">
                {counts.checkedIn} / {counts.total} checked in
              </div>
              <div className="flex gap-2">
                <Button asChild className="flex-1 h-12 text-base">
                  <Link to={`/scanner/${ev.id}/scan`}>
                    <ScanLine className="h-5 w-5 mr-2" />Scan QR
                  </Link>
                </Button>
                <Button variant="outline" asChild className="flex-1 h-12 text-base">
                  <Link to={`/scanner/${ev.id}/list`}>
                    <List className="h-5 w-5 mr-2" />Manual
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}