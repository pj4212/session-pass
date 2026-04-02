import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';
import ScanResultOverlay from '@/components/scanner/ScanResultOverlay';
import { Html5Qrcode } from 'html5-qrcode';

export default function QRScanner() {
  const { occurrenceId } = useParams();
  const { user } = useOutletContext();
  const [checkedIn, setCheckedIn] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const lastScanRef = useRef({});
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);

  // Load initial counts and start polling
  useEffect(() => {
    mountedRef.current = true;
    loadCounts();
    const interval = setInterval(pollCounts, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [occurrenceId]);

  // Initialize camera scanner
  useEffect(() => {
    let html5QrCode = null;

    async function startScanner() {
      html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          handleScan,
          () => {} // ignore scan failures
        );
        if (mountedRef.current) setCameraReady(true);
      } catch (err) {
        console.error("Camera error:", err);
      }
    }

    startScanner();

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [occurrenceId]);

  const loadCounts = async () => {
    const tickets = await base44.entities.Ticket.filter({ occurrence_id: occurrenceId, ticket_status: 'active' });
    if (!mountedRef.current) return;
    setTotal(tickets.length);
    setCheckedIn(tickets.filter(t => t.check_in_status === 'checked_in').length);
  };

  const pollCounts = async () => {
    const res = await base44.functions.invoke('checkin', { action: 'poll', occurrence_id: occurrenceId });
    if (!mountedRef.current) return;
    const data = res.data;
    if (data.status === 'success') {
      setTotal(data.tickets.length);
      setCheckedIn(data.tickets.filter(t => t.check_in_status === 'checked_in').length);
    }
  };

  const handleScan = useCallback(async (decodedText) => {
    // Debounce: ignore same QR within 5 seconds
    const now = Date.now();
    if (lastScanRef.current[decodedText] && now - lastScanRef.current[decodedText] < 5000) return;
    lastScanRef.current[decodedText] = now;

    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setResult({ type: 'error', title: 'Invalid QR Code', subtitle: 'This is not a valid ticket QR code' });
      return;
    }

    const { t: ticketId, e: eventId, h: hash } = payload;

    if (!ticketId || !hash) {
      setResult({ type: 'error', title: 'Invalid QR Code', subtitle: 'Missing ticket data' });
      return;
    }

    // Check occurrence match
    if (eventId && eventId !== occurrenceId) {
      setResult({ type: 'error', title: 'Wrong Event', subtitle: 'This ticket is for a different event' });
      return;
    }

    // Call backend check-in
    const res = await base44.functions.invoke('checkin', {
      action: 'checkin',
      ticket_id: ticketId,
      occurrence_id: occurrenceId,
      qr_hash: hash
    });

    const data = res.data;

    if (data.status === 'success') {
      const t = data.ticket;
      // Check if online ticket — show warning
      if (t.attendance_mode === 'online') {
        setResult({ type: 'warning', title: 'Online Ticket Only', subtitle: `${t.attendee_first_name} ${t.attendee_last_name} — Not valid for in-person entry` });
      } else {
        setResult({ 
          type: 'success', 
          title: `${t.attendee_first_name} ${t.attendee_last_name}`,
          subtitle: 'Checked In ✓'
        });
      }
      setCheckedIn(prev => prev + 1);
    } else if (data.status === 'warning') {
      setResult({ type: 'warning', title: 'Warning', subtitle: data.reason });
    } else {
      setResult({ type: 'error', title: 'Error', subtitle: data.reason || 'Check-in failed' });
    }
  }, [occurrenceId]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-center px-4 py-2 bg-card border-b shrink-0">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-5 w-5" />
          <span>{checkedIn} / {total}</span>
        </div>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        <div id="qr-reader" className="w-full h-full" />
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
            <p>Starting camera...</p>
          </div>
        )}
      </div>

      {/* Result overlay */}
      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}