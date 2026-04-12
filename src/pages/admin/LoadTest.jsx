import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Trash2, CheckCircle2, AlertTriangle, XCircle, Square } from 'lucide-react';
import LoadTestResults from '@/components/admin/LoadTestResults';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function LoadTest() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [concurrency, setConcurrency] = useState(15);
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState(null);
  const [liveProgress, setLiveProgress] = useState(null); // { completed, total, successes, errors }
  const cancelRef = useRef(false);

  useEffect(() => {
    base44.entities.EventOccurrence.filter({ status: 'published' }, '-event_date', 50).then(setEvents);
  }, []);

  const runBackendTest = async (testType) => {
    const c = Math.min(Math.max(parseInt(concurrency) || 1, 1), 1000);
    setConcurrency(c);
    setRunning(testType);
    setResults(null);
    setLiveProgress(null);
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
      setLiveProgress(null);
    }
  };

  const runCheckoutTest = useCallback(async () => {
    const count = Math.min(Math.max(parseInt(concurrency) || 1, 1), 1000);
    setConcurrency(count);
    setRunning('checkout');
    setResults(null);
    cancelRef.current = false;

    // First, find a free ticket type for this event
    let freeType;
    try {
      const ticketTypes = await base44.entities.TicketType.filter({ occurrence_id: selectedEvent });
      freeType = ticketTypes.find(tt => (tt.price || 0) === 0 && tt.is_active);
      if (!freeType) {
        toast.error('No free ticket type found for this event.');
        setRunning(null);
        return;
      }
    } catch (err) {
      toast.error('Failed to load ticket types');
      setRunning(null);
      return;
    }

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;

    setLiveProgress({ completed: 0, total: count, successes: 0, errors: 0 });

    // Fire ALL requests simultaneously — true concurrency
    const promises = Array.from({ length: count }, (_, idx) => {
      const t0 = Date.now();
      const MAX_ATTEMPTS = 5;

      const attempt = async (attemptNum) => {
        if (cancelRef.current) return { index: idx, status: 'cancelled', elapsed_ms: Date.now() - t0 };
        try {
          const res = await base44.functions.invoke('createCheckout', {
            buyer: { first_name: 'LoadTest', last_name: `User${idx}`, email: `loadtest${idx}@test.com` },
            attendees: [{ first_name: 'LoadTest', last_name: `User${idx}`, email: `loadtest${idx}@test.com`, ticket_type_id: freeType.id }],
            occurrence_id: selectedEvent,
            skip_emails: true
          });
          return {
            index: idx,
            status: res.data?.order_number ? 'success' : 'error',
            order_number: res.data?.order_number || null,
            error: res.data?.error || null,
            elapsed_ms: Date.now() - t0,
            attempts: attemptNum + 1
          };
        } catch (err) {
          const errMsg = err?.response?.data?.error || err?.message || '';
          const isRateLimit = err?.response?.status === 429 || errMsg.includes('Rate limit');
          if (isRateLimit && attemptNum < MAX_ATTEMPTS - 1) {
            await sleep(Math.min(3000 * Math.pow(2, attemptNum), 30000));
            return attempt(attemptNum + 1);
          }
          return { index: idx, status: 'error', error: errMsg || 'Unknown error', elapsed_ms: Date.now() - t0, attempts: attemptNum + 1 };
        }
      };

      return attempt(0).then(detail => {
        if (detail.status === 'success') successCount++;
        else if (detail.status === 'error') errorCount++;
        setLiveProgress(prev => ({
          completed: (prev?.completed || 0) + 1,
          total: count,
          successes: successCount,
          errors: errorCount
        }));
        return detail;
      });
    });

    const allResults = await Promise.allSettled(promises);
    const allDetails = allResults.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message });

    const totalElapsed = Date.now() - startTime;
    const timings = allDetails.filter(d => d.elapsed_ms).map(d => d.elapsed_ms);

    setResults({
      test_type: 'checkout',
      total_requests: allDetails.length,
      total_requested: count,
      total_elapsed_ms: totalElapsed,
      timed_out: cancelRef.current,
      summary: { successes: successCount, errors: errorCount },
      timing: {
        avg_ms: timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0,
        min_ms: timings.length ? Math.min(...timings) : 0,
        max_ms: timings.length ? Math.max(...timings) : 0,
      },
      details: allDetails
    });
    setRunning(null);
    setLiveProgress(null);
  }, [concurrency, selectedEvent]);

  const handleStop = () => { cancelRef.current = true; };

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
            <Label>Concurrent Requests (max 1000)</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={concurrency}
              onChange={e => {
                const v = parseInt(e.target.value) || 1;
                setConcurrency(Math.min(Math.max(v, 1), 1000));
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground mt-1">Capped at 1000. Higher values may take longer to complete.</p>
          </div>

          {selectedEventData && (
            <div className="text-sm text-muted-foreground">
              Selected: <strong className="text-foreground">{selectedEventData.name}</strong> on {selectedEventData.event_date} ({selectedEventData.event_mode})
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              onClick={() => runBackendTest('checkin')}
              disabled={!selectedEvent || running}
              className="gap-2"
            >
              {running === 'checkin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Check-In Test
            </Button>
            <Button
              onClick={runCheckoutTest}
              disabled={!selectedEvent || running}
              variant="secondary"
              className="gap-2"
            >
              {running === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Checkout Test
            </Button>
            <Button
              onClick={() => runBackendTest('cleanup')}
              disabled={!selectedEvent || running}
              variant="outline"
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {running === 'cleanup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Cleanup Test Data
            </Button>
            {running === 'checkout' && (
              <Button onClick={handleStop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" /> Stop Test
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {running && (
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-3 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Running {running} test{running !== 'checkout' ? ` with ${concurrency} concurrent requests...` : '...'}
            </div>
            {liveProgress && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{liveProgress.completed} / {liveProgress.total} requests</span>
                  <span className="text-green-400">{liveProgress.successes} ok</span>
                  {liveProgress.errors > 0 && <span className="text-red-400">{liveProgress.errors} errors</span>}
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(liveProgress.completed / liveProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {results && <LoadTestResults results={results} />}
    </div>
  );
}