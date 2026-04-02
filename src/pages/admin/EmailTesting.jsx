import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function EmailTesting() {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailType, setEmailType] = useState('both');
  const [attendanceMode, setAttendanceMode] = useState('in_person');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadUser() {
      const user = await base44.auth.me();
      if (user?.email) setRecipientEmail(user.email);
    }
    loadUser();
  }, []);

  const handleSend = async () => {
    if (!recipientEmail) return;
    setSending(true);
    setResult(null);
    setError(null);

    const res = await base44.functions.invoke('sendTestEmail', {
      email_type: emailType,
      attendance_mode: attendanceMode,
      recipient_email: recipientEmail
    });

    if (res.data.error) {
      setError(res.data.error);
    } else {
      setResult(res.data);
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Testing</h1>
        <p className="text-muted-foreground">Send test emails to preview how booking confirmations and tickets look.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Test Email
          </CardTitle>
          <CardDescription>
            Sends a test email using mock event data via Resend from noreply@session-pass.com
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email Type</Label>
              <Select value={emailType} onValueChange={setEmailType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Order Receipt + Ticket</SelectItem>
                  <SelectItem value="order">Order Receipt Only</SelectItem>
                  <SelectItem value="ticket">Ticket Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Attendance Mode</Label>
              <Select value={attendanceMode} onValueChange={setAttendanceMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">In-Person</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
            <p><strong>What you'll receive:</strong></p>
            {(emailType === 'order' || emailType === 'both') && (
              <p>• Order receipt email with mock booking summary</p>
            )}
            {(emailType === 'ticket' || emailType === 'both') && (
              <p>• {attendanceMode === 'online' ? 'Online ticket with webinar registration link' : 'In-person ticket with QR code for check-in'}</p>
            )}
          </div>

          <Button onClick={handleSend} disabled={sending || !recipientEmail} className="w-full sm:w-auto gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : 'Send Test Email'}
          </Button>

          {result && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <span className="font-medium text-green-700">Sent successfully!</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.sent.map((s, i) => (
                    <Badge key={i} variant="secondary">{s.type}</Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Check {recipientEmail} — subjects are prefixed with [TEST].</p>
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}