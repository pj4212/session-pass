import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Users, WifiOff, Loader2 } from 'lucide-react';
import ScanResultOverlay from '@/components/scanner/ScanResultOverlay';
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
  const [scanning, setScanning] = useState(false);
  const lastScanRef = useRef({});
  const mountedRef = useRef(true);
  const occurrenceIdRef = useRef(occurrenceId);
  const scannerRef = useRef(null);
  const trackRef = useRef(null);
  const containerRef = useRef(null);

  const handleSyncResult = useCallback((data) => {
    if (data.status === 'success') setCheckedIn(prev => prev + 1);
  }, []);

  const { online, pendingCount, syncing, queueScan } = useOfflineSync(occurrenceId, handleSyncResult);

  useEffect(() => { occurrenceIdRef.current = occurrenceId; }, [occurrenceId]);

  useEffect(() => {
    mountedRef.current = true;
    loadCounts();
    const interval = setInterval(pollCounts, 3000);
    return () => { mountedRef.current = false; clearInterval(interval); };
  }, [occurrenceId]);

  // Scanner
  useEffect(() => {
    let scanner = null;
    let stopped = false;

    async function startScanner() {
      try {
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: { exact: 'environment' } },
          {
            fps: 15,
            disableFlip: false,
            videoConstraints: {
              facingMode: { exact: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              focusMode: 'continuous',
            },
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          (decodedText) => handleScan(decodedText),
          () => {}
        );

        if (stopped) { scanner.stop().catch(() => {}); return; }
        if (mountedRef.current) setCameraReady(true);

        // Enhance camera — force continuous autofocus + high resolution for sharp QR decoding
        try {
          const videoElem = document.querySelector('#qr-reader video');
          if (videoElem?.srcObject) {
            const track = videoElem.srcObject.getVideoTracks()[0];
            trackRef.current = track;
            if (track) {
              const caps = track.getCapabilities?.() || {};
              // Apply focus + resolution constraints directly on the track
              const constraints = {};
              if (caps.focusMode?.includes('continuous')) {
                constraints.focusMode = 'continuous';
              } else if (caps.focusMode?.includes('auto')) {
                constraints.focusMode = 'auto';
              }
              if (caps.width) constraints.width = { ideal: 1920 };
              if (caps.height) constraints.height = { ideal: 1080 };
              if (caps.focusDistance) {
                // Set a near focus distance for close-range QR scanning
                constraints.focusDistance = caps.focusDistance.min || 0;
              }
              await track.applyConstraints(constraints);
            }
          }
        } catch (e) { console.warn('Camera enhance failed:', e); }

        // Hide the library's built-in shaded region border to use our own overlay
        try {
          const shadedRegion = document.getElementById('qr-shaded-region');
          if (shadedRegion) shadedRegion.style.display = 'none';
        } catch (e) {}

      } catch (err) {
        console.error('Scanner start error:', err);
        if (mountedRef.current) setCameraError('Could not start camera. Please allow camera permissions and refresh.');
      }
    }

    startScanner();

    return () => {
      stopped = true;
      const cleanup = async () => {
        try {
          if (scanner) {
            const state = scanner.getState?.();
            // Only stop if currently scanning (state 2 = SCANNING)
            if (state === 2) {
              await scanner.stop();
            }
          }
        } catch (e) {
          console.warn('Scanner stop error (safe to ignore):', e);
        }
        try {
          if (scanner) scanner.clear();
        } catch (e) {}
        // Clean up any leftover DOM content
        try {
          const el = document.getElementById('qr-reader');
          if (el) el.innerHTML = '';
        } catch (e) {}
      };
      cleanup();
      scannerRef.current = null;
      trackRef.current = null;
    };
  }, [occurrenceId]);

  // Reset scanning state after processing
  const resumeScanner = useCallback(() => {
    setScanning(false);
  }, []);

  // Tap-to-focus — trigger a single autofocus then return to continuous
  const handleTapFocus = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() || {};
      if (caps.focusMode) {
        // Force a single-shot autofocus
        await track.applyConstraints({ focusMode: 'manual' }).catch(() => {});
        await track.applyConstraints({ focusMode: 'auto' });
        // Return to continuous after the auto-focus locks
        setTimeout(async () => {
          try {
            if (caps.focusMode?.includes('continuous')) {
              await track.applyConstraints({ focusMode: 'continuous' });
            }
          } catch (e) {}
        }, 1500);
      }
    } catch (e) {}
  }, []);

  const loadCounts = async () => {
    try {
      const tickets = await base44.entities.Ticket.filter({ occurrence_id: occurrenceId, ticket_status: 'active' });
      if (!mountedRef.current) return;
      setTotal(tickets.length);
      setCheckedIn(tickets.filter(t => t.check_in_status === 'checked_in').length);
    } catch (e) {}
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
    } catch (e) {}
  };

  const handleScan = async (decodedText) => {
    const currentOccurrenceId = occurrenceIdRef.current;
    const now = Date.now();
    if (lastScanRef.current[decodedText] && now - lastScanRef.current[decodedText] < 3000) return;
    lastScanRef.current[decodedText] = now;

    // Brief green flash feedback — camera stays live
    setScanning(true);
    setTimeout(() => setScanning(false), 500);

    // Support both new format (plain hash string) and legacy JSON format
    let ticketId = null;
    let hash = null;
    try {
      const payload = JSON.parse(decodedText);
      ticketId = payload.t;
      hash = payload.h;
    } catch {
      // New simple format — the QR code IS the hash
      hash = decodedText.trim();
    }

    if (!hash) {
      setResult({ type: 'error', title: 'Invalid QR Code', subtitle: 'Not a valid ticket QR code' });
      resumeScanner();
      return;
    }
    if (hash === 'pending' || hash === 'temp') {
      setResult({ type: 'error', title: 'Ticket Not Ready', subtitle: "QR code hasn't been activated yet." });
      resumeScanner();
      return;
    }

    // Offline queue
    if (!navigator.onLine) {
      await queueScan({ ticket_id: ticketId || null, occurrence_id: currentOccurrenceId, qr_hash: hash });
      setResult({ type: 'success', title: 'Queued Offline', subtitle: 'Will sync when back online' });
      setCheckedIn(prev => prev + 1);
      resumeScanner();
      return;
    }

    try {
      const checkinPayload = {
        action: 'checkin',
        occurrence_id: currentOccurrenceId,
        qr_hash: hash
      };
      if (ticketId) checkinPayload.ticket_id = ticketId;
      const res = await base44.functions.invoke('checkin', checkinPayload);
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
      resumeScanner();
    } catch (err) {
      await queueScan({ ticket_id: ticketId || null, occurrence_id: currentOccurrenceId, qr_hash: hash });
      setResult({ type: 'success', title: 'Queued Offline', subtitle: 'Will sync when back online' });
      setCheckedIn(prev => prev + 1);
      resumeScanner();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
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
      </div>

      {/* Camera */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black overflow-hidden"
        onTouchStart={handleTapFocus}
        onClick={handleTapFocus}
      >
        <div id="qr-reader" className="qr-scanner-container" />

        {/* Custom square guide overlay */}
        {cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="relative" style={{ width: '65vw', height: '65vw', maxWidth: '280px', maxHeight: '280px' }}>
              {/* Background border */}
              <div className={`absolute inset-0 border-2 rounded-lg transition-colors duration-150 ${
                scanning ? 'border-green-400/60' : 'border-white/25'
              }`} />
              {/* Corner accents */}
              {[['top-0 left-0 border-t-4 border-l-4 rounded-tl-lg', '-top-0.5 -left-0.5'],
                ['top-0 right-0 border-t-4 border-r-4 rounded-tr-lg', '-top-0.5 -right-0.5'],
                ['bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg', '-bottom-0.5 -left-0.5'],
                ['bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg', '-bottom-0.5 -right-0.5']
              ].map(([cls, pos], i) => (
                <div key={i} className={`absolute ${pos} w-10 h-10 ${cls} transition-all duration-150 ${
                  scanning ? 'border-green-400 scale-110' : 'border-primary'
                }`} style={scanning ? { filter: 'drop-shadow(0 0 6px rgba(74,222,128,0.7))' } : {}} />
              ))}
              {/* Scan line */}
              <div className={`absolute left-3 right-3 top-1/2 h-0.5 transition-colors duration-150 ${
                scanning ? 'bg-green-400 animate-none' : 'bg-primary/50 animate-pulse'
              }`} />
              {/* Scanning flash */}
              {scanning && (
                <div className="absolute inset-0 rounded-lg bg-green-400/15 animate-scan-flash" />
              )}
            </div>
          </div>
        )}

        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground z-30">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Starting camera...</p>
            </div>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground p-6 text-center z-30">
            <p className="text-destructive">{cameraError}</p>
          </div>
        )}
      </div>

      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}