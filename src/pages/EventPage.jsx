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

const LEADER_STORAGE_KEY = 'uv_platinum_leader';

function loadSavedBuyer() {
  const saved = localStorage.getItem(BUYER_STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    delete parsed.phone;
    return parsed;
  }
  return { first_name: '', last_name: '', email: '' };
}

function loadSavedLeader() {
  return localStorage.getItem(LEADER_STORAGE_KEY) || '';
}

export default function EventPage() {
  const { slug } = useParams();
  const [occurrence, setOccurrence] = useState(null);
  const [location, setLocation] = useState(null);
  const [seriesSlug, setSeriesSlug] = useState(null);
  const [seriesConfig, setSeriesConfig] = useState(null);
  const [eventConfig, setEventConfig] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selections, setSelections] = useState({});
  const [buyer, setBuyer] = useState(loadSavedBuyer());
  const [attendees, setAttendees] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [sendAllToBuyer, setSendAllToBuyer] = useState(false);

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
      setEventConfig(occ);

      if (occ.series_id) {
        base44.entities.EventSeries.filter({ id: occ.series_id }).then(s => {
          if (s.length) {
            setSeriesSlug(s[0].slug);
            setSeriesConfig(s[0]);
          }
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
                email: user.email || ''
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
        slots.push({
          ticket_type_id: ttId,
          ticketTypeName: tt.name,
          attendance_mode: tt.attendance_mode,
          ticket_category: tt.ticket_category || 'candidate',
          sort_order: tt.sort_order || 0
        });
      }
    }
    // Sort so business_owner (sort_order 0) comes first — buyer details auto-fill into first slot
    slots.sort((a, b) => a.sort_order - b.sort_order);
    return slots;
  }, [selections, ticketTypes]);

  // Find which attendee index should receive the buyer's details:
  // prefer the first business_owner slot, otherwise fall back to index 0
  const buyerSlotIndex = useMemo(() => {
    const boIdx = attendeeSlots.findIndex(s => s.ticket_category === 'business_owner');
    return boIdx >= 0 ? boIdx : 0;
  }, [attendeeSlots]);

  useEffect(() => {
    setAttendees(prev => {
      const savedLeader = loadSavedLeader();
      const next = attendeeSlots.map((slot, i) => ({
        ...slot,
        first_name: i === buyerSlotIndex ? buyer.first_name : (prev[i]?.first_name || ''),
        last_name: i === buyerSlotIndex ? buyer.last_name : (prev[i]?.last_name || ''),
        email: i === buyerSlotIndex ? buyer.email : (prev[i]?.email || ''),
        platinum_leader_id: prev[i]?.platinum_leader_id || savedLeader
      }));
      return next;
    });
  }, [attendeeSlots.length]);

  // Always sync buyer details into the buyer's attendee slot
  useEffect(() => {
    if (attendees.length > 0 && buyerSlotIndex < attendees.length) {
      const updated = [...attendees];
      updated[buyerSlotIndex] = { ...updated[buyerSlotIndex], first_name: buyer.first_name, last_name: buyer.last_name, email: buyer.email };
      setAttendees(updated);
    }
  }, [buyer.first_name, buyer.last_name, buyer.email, buyerSlotIndex]);

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
      const isBuyer = i === buyerSlotIndex;
      const needsEmail = isBuyer || !sendAllToBuyer;
      if (!a.first_name || !a.last_name) return `Please fill in the name for Ticket ${i + 1}.`;
      if (needsEmail && !a.email) return `Please fill in the email for Ticket ${i + 1}.`;
      if (needsEmail && !/\S+@\S+\.\S+/.test(a.email)) return `Please enter a valid email for Ticket ${i + 1}.`;
      if (askPlatinumLeader && !a.platinum_leader_id) return `Please select a Platinum Leader for Ticket ${i + 1}.`;
      // Validate required custom questions (filtered by ticket category)
      const ticketCat = a.ticket_category || 'candidate';
      for (const q of customQuestions) {
        const appliesTo = q.applies_to || 'all';
        if (appliesTo !== 'all' && appliesTo !== ticketCat) continue;
        if (q.required && !(a.custom_answers || {})[q.label]) {
          return `Please answer "${q.label}" for Ticket ${i + 1}.`;
        }
      }
    }

    return null;
  };

  const askPlatinumLeader = seriesConfig ? seriesConfig.ask_platinum_leader !== false : true;
  // Event-level questions override series-level; fall back to series if event has none
  const customQuestions = (() => {
    const eventQs = eventConfig?.custom_questions;
    const seriesQs = seriesConfig?.custom_questions;
    const raw = eventQs || seriesQs || '[]';
    try { return JSON.parse(raw); }
    catch { return []; }
  })();

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
        email: a.email || buyer.email,
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
        email: a.email || buyer.email,
        ticket_type_id: a.ticket_type_id,
        platinum_leader_id: askPlatinumLeader ? a.platinum_leader_id : '',
        custom_answers: a.custom_answers ? JSON.stringify(a.custom_answers) : ''
      })),
      occurrence_id: occurrence.id,
      origin_url: window.location.origin,
      send_all_to_buyer: sendAllToBuyer
    });

    if (result.data.error) {
      setSubmitError(result.data.error);
      setSubmitting(false);
      return;
    }

    // Save buyer and leader to localStorage
    localStorage.setItem(BUYER_STORAGE_KEY, JSON.stringify(buyer));
    const lastLeader = attendees.find(a => a.platinum_leader_id)?.platinum_leader_id || '';
    if (lastLeader) localStorage.setItem(LEADER_STORAGE_KEY, lastLeader);

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
    if (!dateStr) return '';
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    const local = new Date(y, m - 1, d, 12, 0, 0);
    return local.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    // If the stored datetime has no timezone suffix (e.g. "2026-04-15T20:00:00"),
    // it's already in the event's local timezone — extract the time directly.
    if (!/Z|[+-]\d{2}:\d{2}$/.test(dateStr) && dateStr.includes('T')) {
      const timePart = dateStr.split('T')[1];
      const [hStr, mStr] = timePart.split(':');
      let h = Number(hStr);
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      return `${h}:${mStr} ${ampm}`;
    }
    // Otherwise it has a timezone offset — parse and format with the event's timezone
    const d = new Date(dateStr);
    const tz = occurrence?.timezone;
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, ...(tz ? { timeZone: tz } : {}) });
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
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{formatDate(occurrence.event_date)}</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{formatTime(occurrence.start_datetime)} – {formatTime(occurrence.end_datetime)}</span>
            </div>
            {location && (
              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                {location.name === 'Online' ? (
                  <><Monitor className="h-4 w-4 text-muted-foreground shrink-0" /><span className="truncate">Online via Zoom</span></>
                ) : (
                  <><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span className="break-words">{location.name}{location.address ? `, ${location.address}` : ''}</span></>
                )}
              </div>
            )}
            {occurrence.venue_name && occurrence.event_mode !== 'online_stream' && (
              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="break-words">{occurrence.venue_name}</span>
              </div>
            )}
          </div>
          {occurrence.venue_details && occurrence.event_mode !== 'online_stream' && (
            <p className="text-sm text-muted-foreground mt-2 break-words">{occurrence.venue_details}</p>
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

                {/* Send all tickets to one email option */}
                {attendees.length > 1 && (
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-card">
                    <input
                      type="checkbox"
                      id="sendAllToBuyer"
                      checked={sendAllToBuyer}
                      onChange={e => setSendAllToBuyer(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-input"
                    />
                    <label htmlFor="sendAllToBuyer" className="text-sm cursor-pointer">
                      <span className="font-medium">Send all tickets to my email</span>
                      <p className="text-muted-foreground mt-0.5">All tickets and QR codes will be sent in a single email to {buyer.email || 'the buyer\'s email'} instead of individual emails to each attendee.</p>
                    </label>
                  </div>
                )}

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
                      isBuyerSlot={i === buyerSlotIndex}
                      emailOptional={sendAllToBuyer && i !== buyerSlotIndex}
                      askPlatinumLeader={askPlatinumLeader}
                      customQuestions={customQuestions}
                      ticketCategory={att.ticket_category || 'candidate'}
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