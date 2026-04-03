import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Clock, Shield } from 'lucide-react';

function StatCard({ label, value, icon: Icon, variant }) {
  const colors = {
    success: 'text-green-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    info: 'text-primary',
  };
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
      <Icon className={`h-5 w-5 ${colors[variant] || 'text-muted-foreground'}`} />
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function LoadTestResults({ results }) {
  if (results.error) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base capitalize">{results.test_type || 'Load'} Test Failed</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="h-5 w-5" />
            <span>{results.error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (results.test_type === 'cleanup') {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Cleanup Complete</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{results.tickets_deleted} test tickets deleted</p>
          <p>{results.orders_deleted} test orders deleted</p>
          <p>{results.checkins_reset} check-ins reset</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, timing, details, total_elapsed_ms, total_requests } = results;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base capitalize">{results.test_type} Test Results</CardTitle>
            <Badge variant={results.integrity_ok !== false ? 'default' : 'destructive'} className="gap-1">
              {results.integrity_ok !== false ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {results.integrity_ok !== false ? 'Integrity OK' : 'Integrity Issue'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Successful" value={summary.successes} icon={CheckCircle2} variant="success" />
            {summary.warnings !== undefined && (
              <StatCard label="Warnings" value={summary.warnings} icon={AlertTriangle} variant="warning" />
            )}
            <StatCard label="Errors" value={summary.errors + (summary.failures || 0)} icon={XCircle} variant="error" />
            <StatCard label="Total Time" value={`${(total_elapsed_ms / 1000).toFixed(1)}s`} icon={Clock} variant="info" />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <div className="text-lg font-semibold">{timing.min_ms}ms</div>
              <div className="text-xs text-muted-foreground">Min Response</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <div className="text-lg font-semibold">{timing.avg_ms}ms</div>
              <div className="text-xs text-muted-foreground">Avg Response</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <div className="text-lg font-semibold">{timing.max_ms}ms</div>
              <div className="text-xs text-muted-foreground">Max Response</div>
            </div>
          </div>

          {results.test_type === 'checkin' && (
            <div className="text-sm text-muted-foreground mb-4">
              DB verified check-ins: <strong className="text-foreground">{results.db_verified_checkins}</strong> (expected: {results.expected_checkins})
              {results.integrity_ok === false && (
                <span className="text-red-400 ml-2">⚠ Mismatch detected — possible double check-in or race condition</span>
              )}
            </div>
          )}

          {results.test_type === 'checkout' && results.db_test_tickets !== undefined && (
            <div className="text-sm text-muted-foreground mb-4">
              Test tickets in DB: <strong className="text-foreground">{results.db_test_tickets}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Request Details</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Time</th>
                  <th className="py-2 px-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {details?.map((d, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 px-2 text-muted-foreground">{(d.index ?? i) + 1}</td>
                    <td className="py-1.5 px-2">
                      <Badge variant={d.status === 'success' ? 'default' : d.status === 'warning' || d.status === 'warning_checked_in' ? 'secondary' : 'destructive'} className="text-xs">
                        {d.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2">{d.elapsed_ms}ms</td>
                    <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[200px]">
                      {d.reason || d.error || d.order_number || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}