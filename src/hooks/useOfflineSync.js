import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { enqueue, getAll, remove, count as queueCount } from '@/lib/offlineCheckinQueue';

export default function useOfflineSync(occurrenceId, onSyncResult) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Track online/offline
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Check initial queue
    queueCount().then(setPendingCount).catch(() => {});
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && pendingCount > 0) {
      syncQueue();
    }
  }, [online, pendingCount]);

  const syncQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    const items = await getAll();
    let synced = 0;

    for (const item of items) {
      try {
        const res = await base44.functions.invoke('checkin', {
          action: 'checkin',
          ticket_id: item.ticket_id,
          occurrence_id: item.occurrence_id,
          qr_hash: item.qr_hash
        });
        await remove(item.id);
        synced++;
        if (onSyncResult) onSyncResult(res.data, item);
      } catch (err) {
        // If network error, stop trying
        if (!navigator.onLine) break;
        // If server rejected (not network), remove from queue anyway
        await remove(item.id);
        synced++;
      }
    }

    const remaining = await queueCount();
    setPendingCount(remaining);
    syncingRef.current = false;
    setSyncing(false);
    return synced;
  }, [onSyncResult]);

  const queueScan = useCallback(async (scanData) => {
    await enqueue(scanData);
    const c = await queueCount();
    setPendingCount(c);
  }, []);

  return { online, pendingCount, syncing, queueScan, syncQueue };
}