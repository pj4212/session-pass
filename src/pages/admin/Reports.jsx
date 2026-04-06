import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Loader2 } from 'lucide-react';

function exportCsv(headers, rows, filename) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export default function Reports() {
  const [tickets, setTickets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [locations, setLocations] = useState({});
  const [mentors, setMentors] = useState({});
  const [leaders, setLeaders] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function load() {
      const [tix, ords, occs, tts, locs, mList, lList] = await Promise.all([
        base44.entities.Ticket.filter({}),
        base44.entities.Order.filter({}),
        base44.entities.EventOccurrence.filter({}),
        base44.entities.TicketType.filter({}),
        base44.entities.Location.filter({}),
        base44.entities.UplineMentor.filter({}),
        base44.entities.PlatinumLeader.filter({})
      ]);
      setTickets(tix);
      setOrders(ords);
      setOccurrences(occs);
      setTicketTypes(tts);
      const locMap = {};
      locs.forEach(l => { locMap[l.id] = l; });
      setLocations(locMap);
      const mMap = {};
      mList.forEach(m => { mMap[m.id] = m; });
      setMentors(mMap);
      const lMap = {};
      lList.forEach(l => { lMap[l.id] = l; });
      setLeaders(lMap);
      setLoading(false);
    }
    load();
  }, []);

  const filteredOccurrences = useMemo(() => {
    return occurrences.filter(o => {
      if (dateFrom && o.event_date < dateFrom) return false;
      if (dateTo && o.event_date > dateTo) return false;
      return true;
    });
  }, [occurrences, dateFrom, dateTo]);

  const occMap = useMemo(() => {
    const m = {};
    occurrences.forEach(o => { m[o.id] = o; });
    return m;
  }, [occurrences]);

  const ttMap = useMemo(() => {
    const m = {};
    ticketTypes.forEach(tt => { m[tt.id] = tt; });
    return m;
  }, [ticketTypes]);

  const activeTickets = useMemo(() => tickets.filter(t => t.ticket_status === 'active'), [tickets]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  // Report 1: Tickets by Occurrence
  const occurrenceReport = filteredOccurrences.map(o => {
    const oTickets = activeTickets.filter(t => t.occurrence_id === o.id);
    const checkedIn = oTickets.filter(t => t.check_in_status === 'checked_in').length;
    const candidates = oTickets.filter(t => (ttMap[t.ticket_type_id]?.ticket_category || 'candidate') === 'candidate').length;
    const businessOwners = oTickets.filter(t => ttMap[t.ticket_type_id]?.ticket_category === 'business_owner').length;
    const oOrders = orders.filter(ord => ord.occurrence_id === o.id && (ord.payment_status === 'completed' || ord.payment_status === 'free'));
    const revenue = oOrders.reduce((sum, ord) => sum + (ord.total_amount || 0), 0);
    return {
      name: o.name, date: o.event_date, location: locations[o.location_id]?.name || '—',
      sold: oTickets.length, candidates, businessOwners, checkedIn, rate: oTickets.length > 0 ? Math.round(checkedIn / oTickets.length * 100) : 0,
      revenue
    };
  });

  // Report 2: Tickets by Type
  const typeReport = filteredOccurrences.flatMap(o => {
    const oTTs = ticketTypes.filter(tt => tt.occurrence_id === o.id);
    return oTTs.map(tt => {
      const count = activeTickets.filter(t => t.ticket_type_id === tt.id).length;
      return { occurrence: o.name, date: o.event_date, type: tt.name, category: tt.ticket_category === 'business_owner' ? 'Business Owner' : 'Candidate', mode: tt.attendance_mode, count };
    });
  });

  // Report 3: Revenue by occurrence
  const revenueReport = filteredOccurrences.map(o => {
    const oOrders = orders.filter(ord => ord.occurrence_id === o.id && (ord.payment_status === 'completed' || ord.payment_status === 'free'));
    const revenue = oOrders.reduce((s, ord) => s + (ord.total_amount || 0), 0);
    const paidOrders = oOrders.filter(ord => ord.payment_status === 'completed' && ord.total_amount > 0);
    const fees = paidOrders.reduce((s, ord) => s + (ord.total_amount * 0.029 + 0.30), 0);
    return { name: o.name, date: o.event_date, location: locations[o.location_id]?.name || '—', revenue, fees, profit: revenue - fees };
  });

  // Report 5: Team Attribution
  const leaderReport = {};
  activeTickets.forEach(t => {
    if (!t.platinum_leader_id) return;
    const occ = occMap[t.occurrence_id];
    if (dateFrom && occ?.event_date < dateFrom) return;
    if (dateTo && occ?.event_date > dateTo) return;
    if (!leaderReport[t.platinum_leader_id]) leaderReport[t.platinum_leader_id] = 0;
    leaderReport[t.platinum_leader_id]++;
  });

  const mentorReport = {};
  activeTickets.forEach(t => {
    if (!t.upline_mentor_id) return;
    const occ = occMap[t.occurrence_id];
    if (dateFrom && occ?.event_date < dateFrom) return;
    if (dateTo && occ?.event_date > dateTo) return;
    if (!mentorReport[t.upline_mentor_id]) mentorReport[t.upline_mentor_id] = 0;
    mentorReport[t.upline_mentor_id]++;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="flex flex-wrap gap-3 items-end">
        <div><Label>From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <Button variant="outline" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>
      </div>

      <Tabs defaultValue="occurrence">
        <TabsList className="flex-wrap">
          <TabsTrigger value="occurrence">By Occurrence</TabsTrigger>
          <TabsTrigger value="type">By Type</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="checkin">Check-In</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="occurrence" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCsv(
              ['Name', 'Date', 'Location', 'Sold', 'Candidates', 'Business Owners', 'Checked In', 'Rate %', 'Revenue'],
              occurrenceReport.map(r => [r.name, r.date, r.location, r.sold, r.candidates, r.businessOwners, r.checkedIn, r.rate, r.revenue.toFixed(2)]),
              'tickets-by-occurrence.csv'
            )}><Download className="h-4 w-4 mr-1" />CSV</Button>
          </div>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead>Location</TableHead>
                <TableHead>Sold</TableHead><TableHead>Candidates</TableHead><TableHead>Business Owners</TableHead><TableHead>Checked In</TableHead><TableHead>Rate</TableHead><TableHead>Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {occurrenceReport.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.name}</TableCell><TableCell>{r.date}</TableCell><TableCell>{r.location}</TableCell>
                    <TableCell>{r.sold}</TableCell><TableCell>{r.candidates}</TableCell><TableCell>{r.businessOwners}</TableCell><TableCell>{r.checkedIn}</TableCell><TableCell>{r.rate}%</TableCell>
                    <TableCell>${r.revenue.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="type" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCsv(
              ['Occurrence', 'Date', 'Type', 'Category', 'Mode', 'Count'],
              typeReport.map(r => [r.occurrence, r.date, r.type, r.category, r.mode, r.count]),
              'tickets-by-type.csv'
            )}><Download className="h-4 w-4 mr-1" />CSV</Button>
          </div>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Occurrence</TableHead><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Mode</TableHead><TableHead>Count</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {typeReport.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.occurrence}</TableCell><TableCell>{r.date}</TableCell><TableCell>{r.type}</TableCell>
                    <TableCell>{r.category}</TableCell><TableCell className="capitalize">{r.mode?.replace('_', ' ')}</TableCell><TableCell>{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCsv(
              ['Event', 'Date', 'Location', 'Revenue', 'Stripe Fees', 'Profit'],
              revenueReport.map(r => [r.name, r.date, r.location, r.revenue.toFixed(2), r.fees.toFixed(2), r.profit.toFixed(2)]),
              'revenue-report.csv'
            )}><Download className="h-4 w-4 mr-1" />CSV</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${revenueReport.reduce((s, r) => s + r.revenue, 0).toFixed(2)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Stripe Fees (est.)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-400">${revenueReport.reduce((s, r) => s + r.fees, 0).toFixed(2)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Profit After Fees</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-emerald-400">${revenueReport.reduce((s, r) => s + r.profit, 0).toFixed(2)}</p></CardContent>
            </Card>
          </div>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead>Location</TableHead><TableHead>Revenue</TableHead><TableHead>Fees</TableHead><TableHead>Profit</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {revenueReport.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.name}</TableCell><TableCell>{r.date}</TableCell><TableCell>{r.location}</TableCell>
                    <TableCell>${r.revenue.toFixed(2)}</TableCell><TableCell className="text-red-400">${r.fees.toFixed(2)}</TableCell><TableCell className="text-emerald-400">${r.profit.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="checkin" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => exportCsv(
              ['Event', 'Date', 'Sold', 'Checked In', 'No Shows', 'Rate %'],
              occurrenceReport.map(r => [r.name, r.date, r.sold, r.checkedIn, r.sold - r.checkedIn, r.rate]),
              'checkin-report.csv'
            )}><Download className="h-4 w-4 mr-1" />CSV</Button>
          </div>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead>Sold</TableHead>
                <TableHead>Checked In</TableHead><TableHead>No Shows</TableHead><TableHead>Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {occurrenceReport.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.name}</TableCell><TableCell>{r.date}</TableCell><TableCell>{r.sold}</TableCell>
                    <TableCell>{r.checkedIn}</TableCell><TableCell>{r.sold - r.checkedIn}</TableCell><TableCell>{r.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">By Platinum Leader</h3>
              <Button variant="outline" size="sm" onClick={() => exportCsv(
                ['Leader', 'Tickets'],
                Object.entries(leaderReport).map(([id, c]) => [leaders[id]?.name || id, c]),
                'platinum-leader-report.csv'
              )}><Download className="h-4 w-4 mr-1" />CSV</Button>
            </div>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Leader</TableHead><TableHead>Tickets</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(leaderReport).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                    <TableRow key={id}><TableCell>{leaders[id]?.name || id}</TableCell><TableCell>{count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">By Upline Mentor</h3>
              <Button variant="outline" size="sm" onClick={() => exportCsv(
                ['Mentor', 'Tickets'],
                Object.entries(mentorReport).map(([id, c]) => [mentors[id]?.name || id, c]),
                'mentor-report.csv'
              )}><Download className="h-4 w-4 mr-1" />CSV</Button>
            </div>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Mentor</TableHead><TableHead>Tickets</TableHead></TableRow></TableHeader>
                <TableBody>
                  {Object.entries(mentorReport).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                    <TableRow key={id}><TableCell>{mentors[id]?.name || id}</TableCell><TableCell>{count}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}