import { useState, useEffect, useRef } from 'react';
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
  const [cameraError, setCameraError] = useState(null);
  const lastScanRef = useRef({});
  const mountedRef = useRef(true);
  const occurrenceIdRef = useRef(occurrenceId);
  const scannerRef = useRef(null);

  useEffect(() => {
    occurrenceIdRef.current = occurrenceId;
  }, [occurrenceId]);

  useEffect(() => {
    mountedRef.current = true;
    loadCounts();
    const interval = setInterval(pollCounts, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [occurrenceId]);

  // Start html5-qrcode scanner
  useEffect(() => {
    let scanner = null;

    async function startScanner() {
      try {
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (decodedText) => handleScan(decodedText),
          () => {} // ignore errors on each frame
        );

        if (mountedRef.current) setCameraReady(true);

        // After starting, try to enhance camera (zoom + focus)
        try {
          const videoElem = document.querySelector('#qr-reader video');
          if (videoElem && videoElem.srcObject) {
            const track = videoElem.srcObject.getVideoTracks()[0];
            if (track) {
              const caps = track.getCapabilities?.() || {};
              const advanced = [];
              if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
              if (caps.zoom) {
                const targetZoom = Math.min(2.5, caps.zoom.max || 1);
                if (targetZoom > 1) advanced.push({ zoom: targetZoom });
              }
              if (advanced.length) await track.applyConstraints({ advanced });
            }
          }
        } catch (e) { /* enhancement optional */ }

      } catch (err) {
        console.error('Scanner start error:', err);
        if (mountedRef.current) setCameraError('Could not start camera. Please allow camera permissions and refresh.');
      }
    }

    startScanner();

    return () => {
      if (scanner) {
        scanner.stop().catch(() => {});
        scanner.clear().catch(() => {});
      }
      scannerRef.current = null;
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

  const handleScan = async (decodedText) => {
    const currentOccurrenceId = occurrenceIdRef.current;
    const now = Date.now();
    if (lastScanRef.current[decodedText] && now - lastScanRef.current[decodedText] < 5000) return;
    lastScanRef.current[decodedText] = now;

    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setResult({ type: 'error', title: 'Invalid QR Code', subtitle: 'Not a valid ticket QR code' });
      return;
    }

    const { t: ticketId, h: hash } = payload;
    if (!ticketId || !hash) {
      setResult({ type: 'error', title: 'Invalid QR Code', subtitle: 'Missing ticket data' });
      return;
    }
    if (hash === 'pending' || hash === 'temp') {
      setResult({ type: 'error', title: 'Ticket Not Ready', subtitle: "QR code hasn't been activated yet." });
      return;
    }

    const res = await base44.functions.invoke('checkin', {
      action: 'checkin',
      ticket_id: ticketId,
      occurrence_id: currentOccurrenceId,
      qr_hash: hash
    });
    const data = res.data;

    if (data.status === 'success') {
      const t = data.ticket;
      setResult({ type: 'success', title: `${t.attendee_first_name} ${t.attendee_last_name}`, subtitle: 'Checked In \u2713' });
      setCheckedIn(prev => prev + 1);
    } else if (data.status === 'warning_checked_in') {
      const t = data.ticket;
      const name = t ? `${t.attendee_first_name} ${t.attendee_last_name}` : 'Attendee';
      setResult({ type: 'warning', title: `${name} \u2014 Checked In`, subtitle: data.reason });
      setCheckedIn(prev => prev + 1);
    } else if (data.status === 'warning') {
      const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
      setResult({ type: 'warning', title: name || 'Warning', subtitle: data.reason });
    } else {
      const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
      setResult({ type: 'error', title: name || 'Error', subtitle: data.reason || 'Check-in failed' });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-center px-4 py-2.5 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Users className="h-5 w-5 text-primary" />
          <span>{checkedIn} / {total}</span>
        </div>
      </div>

      <div className="flex-1 relative bg-black overflow-hidden">
        <div id="qr-reader" style={{ width: '100%', height: '100%' }} />
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground z-10">
            <p>Starting camera...</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground p-6 text-center">
            <p className="text-destructive">{cameraError}</p>
          </div>
        )}
      </div>

      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}