import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Clock, MapPin, Monitor, Loader2, ArrowLeft } from 'lucide-react';
import TicketSelector from '@/components/booking/TicketSelector';
import BuyerForm from '@/components/booking/BuyerForm';
import AttendeeForm from '@/components/booking/AttendeeForm';
import OrderSummary from '@/components/booking/OrderSummary';

const BUYER_STORAGE_KEY = 'uv_buyer_details';

function loadSavedBuyer() {
  const saved = localStorage.getItem(BUYER_STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return { first_name: '', last_name: '', email: '', phone: '' };
}

export default function EventPage() {
  const { slug } = useParams();
  const [occurrence, setOccurrence] = useState(null);
  const [location, setLocation] = useState(null);
  const [seriesSlug, setSeriesSlug] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selections, setSelections] = useState({});
  const [buyer, setBuyer] = useState(loadSavedBuyer());
  const [attendees, setAttendees] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Load event data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const allOccurrences = await base44.entities.EventOccurrence.filter({ slug });
      if (!allOccurrences.length) {
        setError('Event not found');
        setLoading(false);
        return;
      }
      const occ = allOccurrences[0];
      setOccurrence(occ);

      if (occ.series_id) {
        base44.entities.EventSeries.filter({ id: occ.series_id }).then(s => {
          if (s.length) setSeriesSlug(s[0].slug);
        });
      }

      const [tts, locs, l] = await Promise.all([
        base44.entities.TicketType.filter({ occurrence_id: occ.id }),
        occ.location_id ? base44.entities.Location.filter({ id: occ.location_id }) : Promise.resolve([]),
        base44.entities.PlatinumLeader.filter({ is_active: true })
      ]);
      setTicketTypes(tts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      if (locs.length) setLocation(locs[0]);
      setLeaders(l.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const user = await base44.auth.me();
          if (user?.full_name || user?.email) {
            const parts = (user.full_name || '').split(' ');
            const saved = loadSavedBuyer();
            if (!saved.email) {
              setBuyer({
                first_name: parts[0] || '',
                last_name: parts.slice(1).join(' ') || '',
                email: user.email || '',
                phone: user.phone || ''
              });
            }
          }
        }
      } catch (_) { /* not logged in, that's fine */ }

      setLoading(false);
    }
    load();
  }, [slug]);

  // Build attendee list from selections
  const totalTickets = useMemo(() => {
    return Object.values(selections).reduce((sum, q) => sum + q, 0);
  }, [selections]);

  const attendeeSlots = useMemo(() => {
    const slots = [];
    for (const [ttId, qty] of Object.entries(selections)) {
      if (qty <= 0) continue;
      const tt = ticketTypes.find(t => t.id === ttId);
      if (!tt) continue;
      for (let i = 0; i < qty; i++) {
        slots.push({ ticket_type_id: ttId, ticketTypeName: tt.name, attendance_mode: tt.attendance_mode });
      }
    }
    return slots;
  }, [selections, ticketTypes]);

  useEffect(() => {
    setAttendees(prev => {
      const next = attendeeSlots.map((slot, i) => ({
        ...slot,
        first_name: i === 0 ? buyer.first_name : (prev[i]?.first_name || ''),
        last_name: i === 0 ? buyer.last_name : (prev[i]?.last_name || ''),
        email: i === 0 ? buyer.email : (prev[i]?.email || ''),
        platinum_leader_id: prev[i]?.platinum_leader_id || ''
      }));
      return next;
    });
  }, [attendeeSlots.length]);

  // Always sync ticket 1 with buyer details
  useEffect(() => {
    if (attendees.length > 0) {
      const updated = [...attendees];
      updated[0] = { ...updated[0], first_name: buyer.first_name, last_name: buyer.last_name, email: buyer.email };
      setAttendees(updated);
    }
  }, [buyer.first_name, buyer.last_name, buyer.email]);

  const updateAttendee = (index, data) => {
    const updated = [...attendees];
    updated[index] = { ...updated[index], ...data };
    setAttendees(updated);
  };

  const isEventAvailable = () => {
    if (!occurrence) return false;
    if (occurrence.status !== 'published' || !occurrence.is_published) return false;
    const now = new Date().toISOString();
    if (occurrence.sales_close_date && now > occurrence.sales_close_date) return false;
    return true;
  };

  const validateForm = () => {
    if (!buyer.first_name || !buyer.last_name || !buyer.email) return 'Please fill in all buyer details.';
    if (!/\S+@\S+\.\S+/.test(buyer.email)) return 'Please enter a valid buyer email.';

    for (let i = 0; i < attendees.length; i++) {
      const a = attendees[i];
      if (!a.first_name || !a.last_name || !a.email) return `Please fill in all details for Ticket ${i + 1}.`;
      if (!/\S+@\S+\.\S+/.test(a.email)) return `Please enter a valid email for Ticket ${i + 1}.`;
    }

    // Check within-order duplicates
    const seen = new Set();
    for (let i = 0; i < attendees.length; i++) {
      const key = `${attendees[i].email.toLowerCase()}_${attendees[i].attendance_mode}`;
      if (seen.has(key)) {
        return `Each attendee can only have one ${attendees[i].attendance_mode === 'online' ? 'online' : 'in-person'} ticket. Duplicate email: ${attendees[i].email}`;
      }
      seen.add(key);
    }

    return null;
  };

  const handleCheckout = async () => {
    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // Check if in iframe
    if (window.self !== window.top) {
      const hasPayment = attendees.some(a => {
        const tt = ticketTypes.find(t => t.id === a.ticket_type_id);
        return tt && tt.price > 0;
      });
      if (hasPayment) {
        setSubmitError('Payment checkout only works from the published app. Please open the app in a new tab.');
        setSubmitting(false);
        return;
      }
    }

    // Validate with backend
    const validation = await base44.functions.invoke('validateTickets', {
      occurrence_id: occurrence.id,
      attendees: attendees.map(a => ({
        email: a.email,
        attendance_mode: a.attendance_mode
      }))
    });

    if (!validation.data.valid) {
      setSubmitError(validation.data.errors[0]?.message || 'Validation failed');
      setSubmitting(false);
      return;
    }

    // Create checkout
    const result = await base44.functions.invoke('createCheckout', {
      buyer,
      attendees: attendees.map(a => ({
        first_name: a.first_name,
        last_name: a.last_name,
        email: a.email,
        ticket_type_id: a.ticket_type_id,
        platinum_leader_id: a.platinum_leader_id
      })),
      occurrence_id: occurrence.id,
      origin_url: window.location.origin
    });

    if (result.data.error) {
      setSubmitError(result.data.error);
      setSubmitting(false);
      return;
    }

    // Save buyer to localStorage
    localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(buyer));

    if (result.data.payment_required) {
      window.location.href = result.data.checkout_url;
    } else {
      window.location.href = `/order/${result.data.order_number}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="h-6 w-40 bg-muted rounded animate-pulse mb-4" />
          <div className="h-10 w-3/4 bg-muted rounded animate-pulse mb-3" />
          <div className="h-5 w-1/2 bg-muted rounded animate-pulse mb-8" />
          <div className="space-y-3">
            <div className="h-20 bg-card border border-border rounded-lg animate-pulse" />
            <div className="h-20 bg-card border border-border rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
          <p className="text-muted-foreground">This event does not exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const eventAvailable = isEventAvailable();

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back to Series */}
        {seriesSlug && (
          <Link to={`/series/${seriesSlug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to all sessions
          </Link>
        )}

        {/* Event Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{occurrence.name}</h1>
          {occurrence.description && (
            <p className="text-muted-foreground mb-4">{occurrence.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(occurrence.event_date)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatTime(occurrence.start_datetime)} – {formatTime(occurrence.end_datetime)}</span>
            </div>
            {location && (
              <div className="flex items-center gap-1.5">
                {location.name === 'Online' ? (
                  <><Monitor className="h-4 w-4 text-muted-foreground" /><span>Online via Zoom</span></>
                ) : (
                  <><MapPin className="h-4 w-4 text-muted-foreground" /><span>{location.name}{location.address ? `, ${location.address}` : ''}</span></>
                )}
              </div>
            )}
          </div>
          {occurrence.venue_details && occurrence.event_mode !== 'online_stream' && (
            <p className="text-sm text-muted-foreground mt-2">{occurrence.venue_details}</p>
          )}
        </div>

        {!eventAvailable ? (
          <Alert>
            <AlertDescription>
              {occurrence.status === 'cancelled' ? 'This event has been cancelled.' :
               occurrence.status === 'completed' ? 'This event has already taken place.' :
               !occurrence.is_published ? 'This event is not yet available for booking.' :
               'Ticket sales are currently closed for this event.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-8">
            {/* Ticket Selection */}
            <TicketSelector
              ticketTypes={ticketTypes}
              selections={selections}
              onSelectionsChange={setSelections}
            />

            <OrderSummary selections={selections} ticketTypes={ticketTypes} />

            {totalTickets > 0 && (
              <>
                {/* Buyer Form */}
                <BuyerForm buyer={buyer} onChange={setBuyer} />

                {/* Attendee Forms */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Attendee Details</h3>
                  {attendees.map((att, i) => (
                    <AttendeeForm
                      key={i}
                      index={i}
                      total={attendees.length}
                      ticketTypeName={att.ticketTypeName}
                      attendanceMode={att.attendance_mode}
                      attendee={att}
                      onChange={(data) => updateAttendee(i, data)}
                      leaders={leaders}
                    />
                  ))}
                </div>

                {submitError && (
                  <Alert variant="destructive">
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleCheckout}
                  disabled={submitting}
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                  ) : (
                    totalTickets > 0 && Object.entries(selections).some(([id, qty]) => {
                      const tt = ticketTypes.find(t => t.id === id);
                      return qty > 0 && tt && tt.price > 0;
                    }) ? 'Proceed to Payment' : 'Complete Booking'
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}