import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Terminal } from 'lucide-react';
import { format } from 'date-fns';

export default function RateLimitLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      const fetchLogs = async () => {
        try {
          setLoading(true);
          const response = await base44.entities.RateLimitLog.list('-created_date', 100);
          setLogs(response);
          setError(null);
        } catch (err) {
          setError('Failed to load rate limit logs.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      fetchLogs();
    }
  }, [user]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-4 md:p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to view this page. This is for admins only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rate Limit Event Log</h1>
          <p className="text-muted-foreground">
            Tracks retryable errors (like rate limits) that occur in critical backend functions.
          </p>
        </div>
      </div>

      {loading && <p>Loading logs...</p>}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Status Code</TableHead>
                <TableHead>Error Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan="5" className="h-24 text-center">
                    No rate limit events recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(log.created_date).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </TableCell>
                    <TableCell>{log.operation_label}</TableCell>
                    <TableCell>{log.attempt}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs rounded-full ${log.status_code === 429 ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>
                        {log.status_code || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.error_message}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}