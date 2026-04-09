import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import TicketCard from '@/components/booking/TicketCard';
import AddToCalendar from '@/components/booking/AddToCalendar';

export default function OrderConfirmation() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [occurrence, setOccurrence] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketTypes, setTicketTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const loadOrder = async () => {
    const orders = await base44.entities.Order.filter({ order_number: orderNumber });
    if (!orders.length) {
      setLoading(false);
      return;
    }
    const ord = orders[0];
    setOrder(ord);

    const [occs, tix] = await Promise.all([
      base44.entities.EventOccurrence.filter({ id: ord.occurrence_id }),
      base44.entities.Ticket.filter({ order_id: ord.id })
    ]);

    if (occs.length) {
      setOccurrence(occs[0]);
      const tts = await base44.entities.TicketType.filter({ occurrence_id: occs[0].id });
      const map = {};
      tts.forEach(tt => { map[tt.id] = tt; });
      setTicketTypes(map);
    }

    setTickets(tix);
    setLoading(false);

    return ord;
  };

  useEffect(() => {
    loadOrder();
  }, [orderNumber]);

  // Poll if payment pending
  useEffect(() => {
    if (!order || order.payment_status !== 'pending') return;

    setPolling(true);
    const interval = setInterval(async () => {
      const orders = await base44.entities.Order.filter({ order_number: orderNumber });
      if (orders.length && orders[0].payment_status !== 'pending') {
        setOrder(orders[0]);
        // Reload tickets
        const tix = await base44.entities.Ticket.filter({ order_id: orders[0].id });
        setTickets(tix);
        setPolling(false);
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [order?.payment_status]);



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Order Not Found</h1>
          <p className="text-muted-foreground">We couldn't find this order.</p>
        </div>
      </div>
    );
  }

  const isPending = order.payment_status === 'pending';
  const isFailed = order.payment_status === 'failed';
  const isConfirmed = order.payment_status === 'completed' || order.payment_status === 'free';

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const local = new Date(y, m - 1, d, 12, 0, 0);
    return local.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    let normalized = dateStr;
    if (!/Z|[+-]\d{2}:\d{2}$/.test(dateStr)) {
      normalized = dateStr + 'Z';
    }
    const d = new Date(normalized);
    const tz = occurrence?.timezone;
    if (tz) {
      return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    }
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {isPending && (
          <Alert className="mb-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              We're confirming your payment. This page will update automatically.
            </AlertDescription>
          </Alert>
        )}

        {isFailed && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              Payment failed. Your order was not completed. Please try booking again.
            </AlertDescription>
          </Alert>
        )}

        {isConfirmed && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">Booking Confirmed!</p>
              <p className="text-sm text-green-700 dark:text-green-300">Your tickets are ready below.</p>
            </div>
          </div>
        )}

        {/* Order Details */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Order {order.order_number}</h1>
          <p className="text-muted-foreground">{order.buyer_name} · {order.buyer_email}</p>
        </div>

        {occurrence && (
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-xl font-semibold mb-2">{occurrence.name}</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(occurrence.event_date)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatTime(occurrence.start_datetime)} – {formatTime(occurrence.end_datetime)}</span>
              </div>
            </div>
            <div className="mt-3">
              <AddToCalendar occurrence={occurrence} />
            </div>
          </div>
        )}

        {/* Tickets */}
        {isConfirmed && tickets.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Your Tickets ({tickets.length})</h3>
            {tickets.map(ticket => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                occurrence={occurrence}
                ticketType={ticketTypes[ticket.ticket_type_id]}
              />
            ))}
          </div>
        )}

        {order.total_amount > 0 && (
          <div className="mt-6 p-4 border rounded-lg">
            <div className="flex justify-between font-semibold">
              <span>Total Paid</span>
              <span>${order.total_amount.toFixed(2)} AUD</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}