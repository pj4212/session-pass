import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Trash2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import LoadTestResults from '@/components/admin/LoadTestResults';

export default function LoadTest() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [concurrency, setConcurrency] = useState(15);
  const [running, setRunning] = useState(null); // 'checkin' | 'checkout' | 'cleanup'
  const [results, setResults] = useState(null);

  useEffect(() => {
    base44.entities.EventOccurrence.filter({ status: 'published' }, '-event_date', 50).then(setEvents);
  }, []);

  const runTest = async (testType) => {
    const c = Math.min(Math.max(parseInt(concurrency) || 1, 1), 200);
    setConcurrency(c);
    setRunning(testType);
    setResults(null);
    try {
      const res = await base44.functions.invoke('loadTest', {
        test_type: testType,
        occurrence_id: selectedEvent,
        concurrency: c
      });
      setResults(res.data);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Unknown error';
      toast.error(`Load test failed: ${msg}`);
      setResults({ test_type: testType, error: msg });
    } finally {
      setRunning(null);
    }
  };

  const selectedEventData = events.find(e => e.id === selectedEvent);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Load Testing</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Simulate concurrent check-ins and ticket purchases to stress-test the system.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Event Occurrence</Label>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger><SelectValue placeholder="Select an event..." /></SelectTrigger>
              <SelectContent>
                {events.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} — {e.event_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Concurrent Requests (max 200)</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={concurrency}
              onChange={e => {
                const v = parseInt(e.target.value) || 1;
                setConcurrency(Math.min(Math.max(v, 1), 200));
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground mt-1">Capped at 200 to avoid timeouts.</p>
          </div>

          {selectedEventData && (
            <div className="text-sm text-muted-foreground">
              Selected: <strong className="text-foreground">{selectedEventData.name}</strong> on {selectedEventData.event_date} ({selectedEventData.event_mode})
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={() => runTest('checkin')}
              disabled={!selectedEvent || running}
              className="gap-2"
            >
              {running === 'checkin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Check-In Test
            </Button>
            <Button
              onClick={() => runTest('checkout')}
              disabled={!selectedEvent || running}
              variant="secondary"
              className="gap-2"
            >
              {running === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Checkout Test
            </Button>
            <Button
              onClick={() => runTest('cleanup')}
              disabled={!selectedEvent || running}
              variant="outline"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {running === 'cleanup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Cleanup Test Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {running && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Running {running} test with {concurrency} concurrent requests...
          </CardContent>
        </Card>
      )}

      {results && <LoadTestResults results={results} />}
    </div>
  );
}