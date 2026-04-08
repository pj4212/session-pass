import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Users, WifiOff, Loader2 } from 'lucide-react';
import ScanResultOverlay from '@/components/scanner/ScanResultOverlay';
import ScannerGuideOverlay from '@/components/scanner/ScannerGuideOverlay';
import useOfflineSync from '@/hooks/useOfflineSync';
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
  const trackRef = useRef(null);

  const handleSyncResult = useCallback((data) => {
    if (data.status === 'success') setCheckedIn(prev => prev + 1);
  }, []);

  const { online, pendingCount, syncing } = useOfflineSync(occurrenceId, handleSyncResult);

  useEffect(() => { occurrenceIdRef.current = occurrenceId; }, [occurrenceId]);

  useEffect(() => {
    mountedRef.current = true;
    loadCounts();
    const interval = setInterval(pollCounts, 3000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [occurrenceId]);

  // html5-qrcode scanner
  useEffect(() => {
    let scanner = null;
    let stopped = false;

    async function startScanner() {
      try {
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 30,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (decodedText) => handleScan(decodedText),
          () => {}
        );

        if (stopped) { scanner.stop().catch(() => {}); return; }
        if (mountedRef.current) setCameraReady(true);

        // Enhance camera: zoom + continuous autofocus
        try {
          const videoElem = document.querySelector('#qr-reader video');
          if (videoElem?.srcObject) {
            const track = videoElem.srcObject.getVideoTracks()[0];
            trackRef.current = track;
            if (track) {
              const caps = track.getCapabilities?.() || {};
              const advanced = [];
              if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
              else if (caps.focusMode?.includes('auto')) advanced.push({ focusMode: 'auto' });
              if (caps.zoom) {
                const targetZoom = Math.min(2.0, caps.zoom.max || 1);
                if (targetZoom > 1) advanced.push({ zoom: targetZoom });
              }
              if (advanced.length) await track.applyConstraints({ advanced });
            }
          }
        } catch (e) { /* optional */ }

      } catch (err) {
        console.error('Scanner start error:', err);
        if (mountedRef.current) setCameraError('Could not start camera. Please allow camera permissions and refresh.');
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (scanner) {
        scanner.stop().catch(() => {});
        scanner.clear().catch(() => {});
      }
      scannerRef.current = null;
      trackRef.current = null;
    };
  }, [occurrenceId]);

  // Tap-to-focus handler
  const handleTapFocus = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() || {};
      if (caps.focusMode?.includes('manual') || caps.focusMode?.includes('auto')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'auto' }] });
        // After a short delay, switch back to continuous
        setTimeout(async () => {
          try {
            if (caps.focusMode?.includes('continuous')) {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            }
          } catch (e) { /* ok */ }
        }, 2000);
      }
    } catch (e) { /* not supported */ }
  }, []);

  const loadCounts = async () => {
    try {
      const tickets = await base44.entities.Ticket.filter({ occurrence_id: occurrenceId, ticket_status: 'active' });
      if (!mountedRef.current) return;
      setTotal(tickets.length);
      setCheckedIn(tickets.filter(t => t.check_in_status === 'checked_in').length);
    } catch (e) { /* offline */ }
  };

  const pollCounts = async () => {
    if (!navigator.onLine) return;
    try {
      const res = await base44.functions.invoke('checkin', { action: 'poll', occurrence_id: occurrenceId });
      if (!mountedRef.current) return;
      const data = res.data;
      if (data.status === 'success') {
        setTotal(data.tickets.length);
        setCheckedIn(data.tickets.filter(t => t.check_in_status === 'checked_in').length);
      }
    } catch (e) { /* offline */ }
  };

  const handleScan = async (decodedText) => {
    const currentOccurrenceId = occurrenceIdRef.current;
    const now = Date.now();
    // Shorter cooldown for speed — 3s per unique QR
    if (lastScanRef.current[decodedText] && now - lastScanRef.current[decodedText] < 3000) return;
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

    // If offline, queue and show optimistic result
    if (!navigator.onLine) {
      const { queueScan } = await import('@/lib/offlineCheckinQueue');
      await queueScan({ ticket_id: ticketId, occurrence_id: currentOccurrenceId, qr_hash: hash });
      setResult({ type: 'success', title: 'Queued Offline', subtitle: 'Will sync when back online' });
      setCheckedIn(prev => prev + 1);
      return;
    }

    try {
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
        setResult({ type: 'warning', title: `${name} \u2014 Already In`, subtitle: data.reason });
      } else if (data.status === 'warning') {
        const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
        setResult({ type: 'warning', title: name || 'Warning', subtitle: data.reason });
      } else {
        const name = data.ticket ? `${data.ticket.attendee_first_name} ${data.ticket.attendee_last_name}` : null;
        setResult({ type: 'error', title: name || 'Error', subtitle: data.reason || 'Check-in failed' });
      }
    } catch (err) {
      // Network failed mid-request — queue it
      const { enqueue } = await import('@/lib/offlineCheckinQueue');
      await enqueue({ ticket_id: ticketId, occurrence_id: currentOccurrenceId, qr_hash: hash });
      setResult({ type: 'success', title: 'Queued Offline', subtitle: 'Will sync when back online' });
      setCheckedIn(prev => prev + 1);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header with counts + offline indicator */}
      <div className="flex items-center justify-center px-4 py-2.5 bg-card border-b border-border shrink-0 gap-3">
        <div className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Users className="h-5 w-5 text-primary" />
          <span>{checkedIn} / {total}</span>
        </div>
        {!online && (
          <div className="flex items-center gap-1 text-yellow-400 text-xs font-medium">
            <WifiOff className="h-3.5 w-3.5" />
            <span>Offline{pendingCount > 0 ? ` (${pendingCount} queued)` : ''}</span>
          </div>
        )}
        {online && syncing && (
          <div className="flex items-center gap-1 text-primary text-xs font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Syncing...</span>
          </div>
        )}
        {online && !syncing && pendingCount > 0 && (
          <div className="text-yellow-400 text-xs font-medium">{pendingCount} pending</div>
        )}
      </div>

      {/* Camera area */}
      <div
        className="flex-1 relative bg-black overflow-hidden"
        onTouchStart={handleTapFocus}
        onClick={handleTapFocus}
      >
        <div id="qr-reader" className="qr-square-container" style={{ width: '100%', height: '100%' }} />
        {cameraReady && <ScannerGuideOverlay />}
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground z-10">
            <p>Starting camera...</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground p-6 text-center z-10">
            <p className="text-destructive">{cameraError}</p>
          </div>
        )}
      </div>

      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}