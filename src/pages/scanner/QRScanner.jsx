import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
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
  const occurrenceIdRef = useRef(occurrenceId);

  // Keep ref in sync so the scan callback always has the latest value
  useEffect(() => {
    occurrenceIdRef.current = occurrenceId;
  }, [occurrenceId]);

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
        const containerEl = document.getElementById("qr-reader");
        if (!containerEl) return;

        // Calculate a square qrbox that fits the container
        const size = Math.min(containerEl.clientWidth, containerEl.clientHeight);
        const qrboxSize = Math.floor(size * 0.7);

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: qrboxSize, height: qrboxSize },
            aspectRatio: 1.0,
          },
          handleScanRef,
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

  // Use a ref-based handler so the closure captured by html5-qrcode always calls current logic
  const handleScanRef = useCallback(async (decodedText) => {
    const currentOccurrenceId = occurrenceIdRef.current;

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

    // Call backend check-in (backend validates occurrence match)
    const res = await base44.functions.invoke('checkin', {
      action: 'checkin',
      ticket_id: ticketId,
      occurrence_id: currentOccurrenceId,
      qr_hash: hash
    });

    const data = res.data;

    if (data.status === 'success') {
      const t = data.ticket;
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
      const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
      setResult({ type: 'warning', title: name || 'Warning', subtitle: data.reason });
    } else {
      const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
      setResult({ type: 'error', title: name || 'Error', subtitle: data.reason || 'Check-in failed' });
    }
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-center px-4 py-2.5 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Users className="h-5 w-5 text-primary" />
          <span>{checkedIn} / {total}</span>
        </div>
      </div>

      {/* Camera viewport — square aspect ratio */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-[100vmin] aspect-square relative qr-square-container">
          <div id="qr-reader" className="w-full h-full" />
        </div>
        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground">
            <p>Starting camera...</p>
          </div>
        )}
      </div>

      {/* Result overlay */}
      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}