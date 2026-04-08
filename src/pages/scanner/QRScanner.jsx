import { useState, useEffect, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Users } from 'lucide-react';
import ScanResultOverlay from '@/components/scanner/ScanResultOverlay';

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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    occurrenceIdRef.current = occurrenceId;
  }, [occurrenceId]);

  // Load initial counts and poll
  useEffect(() => {
    mountedRef.current = true;
    loadCounts();
    const interval = setInterval(pollCounts, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [occurrenceId]);

  // Camera + scanning loop
  useEffect(() => {
    let stopped = false;
    let animFrameId = null;

    async function start() {
      let detector = null;
      if ('BarcodeDetector' in window) {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
      } else {
        setCameraError('QR scanning not supported on this browser. Please use Chrome or Safari.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        // Apply autofocus + zoom for distance scanning
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const caps = track.getCapabilities?.() || {};
            const advanced = [];
            if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
            else if (caps.focusMode?.includes('auto')) advanced.push({ focusMode: 'auto' });
            // Auto-zoom to ~2.5x for better distance scanning
            if (caps.zoom) {
              const maxZoom = caps.zoom.max || 1;
              const targetZoom = Math.min(2.5, maxZoom);
              if (targetZoom > 1) advanced.push({ zoom: targetZoom });
            }
            if (advanced.length) {
              await track.applyConstraints({ advanced });
            }
          } catch (e) { /* some devices don't support */ }
        }

        if (mountedRef.current) setCameraReady(true);

        // Scan loop
        const scanLoop = async () => {
          if (stopped || !video || video.readyState < 2) {
            if (!stopped) animFrameId = requestAnimationFrame(scanLoop);
            return;
          }

          if (!scanningRef.current) {
            scanningRef.current = true;
            try {
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0) {
                handleScan(barcodes[0].rawValue);
              }
            } catch (e) {
              // detect() can fail on some frames
            }
            scanningRef.current = false;
          }

          if (!stopped) animFrameId = requestAnimationFrame(scanLoop);
        };

        animFrameId = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.error('Camera error:', err);
        if (mountedRef.current) setCameraError('Could not access camera. Please allow camera permissions and try again.');
      }
    }

    start();

    return () => {
      stopped = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
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

  const handleScan = async (decodedText) => {
    const currentOccurrenceId = occurrenceIdRef.current;
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
    if (hash === 'pending' || hash === 'temp') {
      setResult({ type: 'error', title: 'Ticket Not Ready', subtitle: "This ticket's QR code hasn't been activated yet. Please ask an admin to fix it." });
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
      {/* Top bar */}
      <div className="flex items-center justify-center px-4 py-2.5 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Users className="h-5 w-5 text-primary" />
          <span>{checkedIn} / {total}</span>
        </div>
      </div>

      {/* Camera viewport */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {/* Scan frame overlay */}
        {cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-2 border-white/60 rounded-2xl relative">
              <div className="absolute -top-0.5 -left-0.5 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
              <div className="absolute -top-0.5 -right-0.5 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
              <div className="absolute -bottom-0.5 -left-0.5 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
              <div className="absolute -bottom-0.5 -right-0.5 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl" />
            </div>
          </div>
        )}
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground">
            <p>Starting camera...</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background text-foreground p-6 text-center">
            <p className="text-destructive">{cameraError}</p>
          </div>
        )}
      </div>

      {/* Result overlay */}
      {result && <ScanResultOverlay result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}