import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Loader2, Save, AlertTriangle, Video } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import VenueSelector from '../../components/admin/VenueSelector';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const TIMEZONES = [
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST, UTC+10)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT, UTC+10/+11)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT, UTC+10/+11)' },
  { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT, UTC+10/+11)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT, UTC+9:30/+10:30)' },
  { value: 'Australia/Darwin', label: 'Darwin (ACST, UTC+9:30)' },
  { value: 'Australia/Perth', label: 'Perth (AWST, UTC+8)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT, UTC+12/+13)' },
  { value: 'Pacific/Chatham', label: 'Chatham Islands (UTC+12:45/+13:45)' },
  { value: 'Europe/London', label: 'London (GMT/BST, UTC+0/+1)' },
];

export default function EventForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const urlParams = new URLSearchParams(window.location.search);
  const duplicateId = urlParams.get('duplicate');

  const [form, setForm] = useState({
    template_id: '', series_id: '', name: '', slug: '', description: '',
    event_date: '', start_datetime: '', end_datetime: '',
    timezone: 'Australia/Brisbane', event_mode: 'in_person',
    recurrence_pattern: '',
    location_id: '', zoom_link: '', zoom_meeting_id: '',
    venue_id: '', venue_name: '', venue_link: '', parking_link: '',
    venue_details: '', is_published: false,
    status: 'draft'
  });
  const [ticketTypes, setTicketTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [creatingWebinar, setCreatingWebinar] = useState(false);
  const [webinarResult, setWebinarResult] = useState(null);

  useEffect(() => {
    async function load() {
      const [locs, tmps, series] = await Promise.all([
        base44.entities.Location.filter({}),
        base44.entities.EventTemplate.filter({ is_active: true }),
        base44.entities.EventSeries.filter({})
      ]);
      setLocations(locs);
      setTemplates(tmps);
      setSeriesList(series);

      const sourceId = isEdit ? id : duplicateId;
      if (sourceId) {
        const evs = await base44.entities.EventOccurrence.filter({ id: sourceId });
        if (evs.length) {
          const ev = evs[0];
          const tts = await base44.entities.TicketType.filter({ occurrence_id: sourceId });
          
          if (isEdit) {
            setForm({
              template_id: ev.template_id || '', series_id: ev.series_id || '', name: ev.name, slug: ev.slug,
              description: ev.description || '',
              event_date: ev.event_date || '',
              start_datetime: ev.start_datetime ? ev.start_datetime.slice(0, 16) : '',
              end_datetime: ev.end_datetime ? ev.end_datetime.slice(0, 16) : '',
              timezone: ev.timezone || 'Australia/Brisbane', event_mode: ev.event_mode,
              recurrence_pattern: ev.recurrence_pattern || '',
              location_id: ev.location_id || '', zoom_link: ev.zoom_link || '',
              zoom_meeting_id: ev.zoom_meeting_id || '',
              venue_id: ev.venue_id || '', venue_name: ev.venue_name || '',
              venue_link: ev.venue_link || '', parking_link: ev.parking_link || '',
              venue_details: ev.venue_details || '',
              is_published: ev.is_published,
              status: ev.status || 'draft'
            });
            setTicketTypes(tts.map(tt => ({ ...tt, _existing: true })));
          } else {
            // Duplicate
            setForm({
              template_id: ev.template_id || '', series_id: ev.series_id || '', name: ev.name + ' (Copy)',
              slug: ev.slug + '-copy', description: ev.description || '',
              event_date: ev.event_date || '',
              start_datetime: ev.start_datetime ? ev.start_datetime.slice(0, 16) : '',
              end_datetime: ev.end_datetime ? ev.end_datetime.slice(0, 16) : '',
              timezone: ev.timezone || 'Australia/Brisbane', event_mode: ev.event_mode,
              recurrence_pattern: ev.recurrence_pattern || '',
              location_id: ev.location_id || '', zoom_link: '',
              zoom_meeting_id: '',
              venue_id: ev.venue_id || '', venue_name: ev.venue_name || '',
              venue_link: ev.venue_link || '', parking_link: ev.parking_link || '',
              venue_details: ev.venue_details || '',
              is_published: false, status: 'draft'
            });
            setTicketTypes(tts.map(tt => ({
              name: tt.name, attendance_mode: tt.attendance_mode, ticket_category: tt.ticket_category || 'candidate',
              price: tt.price, capacity_limit: tt.capacity_limit, is_active: tt.is_active,
              sort_order: tt.sort_order, description: tt.description || ''
            })));
          }
        }
      }
      setLoading(false);
    }
    load();
  }, [id, duplicateId]);

  const updateForm = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && !isEdit) {
        next.slug = slugify(value);
      }
      if (field === 'location_id') {
        const loc = locations.find(l => l.id === value);
        if (loc) next.timezone = loc.timezone;
      }
      return next;
    });
  };

  const applyTemplate = (templateId) => {
    const t = templates.find(tt => tt.id === templateId);
    if (!t) return;
    updateForm('template_id', templateId);
    setForm(prev => ({
      ...prev, template_id: templateId, name: t.name,
      slug: slugify(t.name), event_mode: t.event_mode,
      location_id: t.default_location_id || prev.location_id,
      timezone: locations.find(l => l.id === t.default_location_id)?.timezone || prev.timezone
    }));
    if (t.default_ticket_type_configs) {
      try {
        const configs = JSON.parse(t.default_ticket_type_configs);
        if (Array.isArray(configs)) setTicketTypes(configs);
      } catch (_) {}
    }
  };

  const addTicketType = () => {
    setTicketTypes(prev => [...prev, {
      name: '', attendance_mode: 'in_person', ticket_category: 'candidate', price: 0,
      capacity_limit: '', is_active: true, sort_order: prev.length, description: ''
    }]);
  };

  const updateTicketType = (index, field, value) => {
    setTicketTypes(prev => prev.map((tt, i) => i === index ? { ...tt, [field]: value } : tt));
  };

  const removeTicketType = (index) => {
    setTicketTypes(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    // Store datetime values as-entered (no timezone conversion)
    // Append :00 for seconds if needed, treat as literal time
    const toISO = (val) => val ? val + ':00' : '';
    // Auto-set sales_close_date to 1 hour after end time
    const endDt = form.end_datetime ? new Date(form.end_datetime + ':00') : null;
    const salesClose = endDt ? new Date(endDt.getTime() + 60 * 60 * 1000).toISOString() : '';
    const eventData = {
      ...form,
      series_id: form.series_id === 'none' ? '' : form.series_id,
      start_datetime: toISO(form.start_datetime),
      end_datetime: toISO(form.end_datetime),
      sales_close_date: salesClose
    };

    let eventId;
    if (isEdit) {
      await base44.entities.EventOccurrence.update(id, eventData);
      eventId = id;
    } else {
      const created = await base44.entities.EventOccurrence.create(eventData);
      eventId = created.id;
    }

    // Handle ticket types
    for (const tt of ticketTypes) {
      const ttData = {
        occurrence_id: eventId, name: tt.name, attendance_mode: tt.attendance_mode,
        ticket_category: tt.ticket_category || 'candidate',
        price: Number(tt.price) || 0, capacity_limit: tt.capacity_limit ? Number(tt.capacity_limit) : null,
        is_active: tt.is_active !== false, sort_order: Number(tt.sort_order) || 0,
        description: tt.description || '', requires_payment: (Number(tt.price) || 0) > 0,
        quantity_sold: tt.quantity_sold || 0
      };
      if (tt._existing && tt.id) {
        await base44.entities.TicketType.update(tt.id, ttData);
      } else if (!tt._existing || !tt.id) {
        await base44.entities.TicketType.create(ttData);
      }
    }

    setSaving(false);
    navigate('/admin/events');
  };

  const handleCreateZoomWebinar = async () => {
    setCreatingWebinar(true);
    setWebinarResult(null);
    try {
      const response = await base44.functions.invoke('createZoomWebinar', { occurrence_id: id });
      const data = response.data;
      setWebinarResult({ success: true, url: data.registration_url });
      setForm(prev => ({ ...prev, zoom_link: data.registration_url, zoom_meeting_id: String(data.webinar_id) }));
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Failed to create webinar';
      setWebinarResult({ success: false, error: msg });
    }
    setCreatingWebinar(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const showZoom = form.event_mode === 'online_stream' || form.event_mode === 'hybrid';
  const showVenue = form.event_mode === 'in_person' || form.event_mode === 'hybrid';

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{isEdit ? 'Edit Event' : duplicateId ? 'Duplicate Event' : 'Create Event'}</h1>

      {seriesList.length > 0 && (
        <div>
          <Label>Event Series (Parent)</Label>
          <Select value={form.series_id} onValueChange={v => updateForm('series_id', v)}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="No series (standalone)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No series (standalone)</SelectItem>
              {seriesList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {!isEdit && templates.length > 0 && (
        <div>
          <Label>Start from Template</Label>
          <Select value={form.template_id} onValueChange={applyTemplate}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select template..." /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Name *</Label>
          <Input value={form.name} onChange={e => updateForm('name', e.target.value)} />
        </div>
        <div>
          <Label>Slug *</Label>
          <Input value={form.slug} onChange={e => updateForm('slug', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={3} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Event Date *</Label>
          <Input type="date" value={form.event_date} onChange={e => updateForm('event_date', e.target.value)} />
        </div>
        <div>
          <Label>Start Time *</Label>
          <Input type="datetime-local" value={form.start_datetime} onChange={e => updateForm('start_datetime', e.target.value)} />
        </div>
        <div>
          <Label>End Time *</Label>
          <Input type="datetime-local" value={form.end_datetime} onChange={e => updateForm('end_datetime', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Event Mode *</Label>
          <Select value={form.event_mode} onValueChange={v => updateForm('event_mode', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="online_stream">Online Stream</SelectItem>
              <SelectItem value="in_person">In-Person</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Location</Label>
          <Select value={form.location_id} onValueChange={v => updateForm('location_id', v)}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={v => updateForm('timezone', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => {
            updateForm('status', v);
            updateForm('is_published', v === 'published');
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Recurrence Pattern</Label>
          <Select value={form.recurrence_pattern || 'none'} onValueChange={v => updateForm('recurrence_pattern', v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No recurrence</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly_A">Fortnightly (Week A)</SelectItem>
              <SelectItem value="fortnightly_B">Fortnightly (Week B)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showZoom && (
        <Card>
          <CardHeader><CardTitle className="text-base">Zoom / Online Access</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Zoom Registration Link</Label>
              <Input value={form.zoom_link} onChange={e => updateForm('zoom_link', e.target.value)} placeholder="https://zoom.us/webinar/register/..." />
              <p className="text-xs text-muted-foreground mt-1">This link is sent to online ticket holders in their confirmation email.</p>
            </div>
            {isEdit && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={handleCreateZoomWebinar}
                  disabled={creatingWebinar}
                  className="gap-2"
                >
                  {creatingWebinar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {form.zoom_link ? 'Re-create Zoom Webinar' : 'Create Zoom Webinar'}
                </Button>
                <p className="text-xs text-muted-foreground">Automatically creates a Zoom webinar and sets the registration link. Requires Zoom API credentials to be configured.</p>
                {webinarResult && webinarResult.success && (
                  <Alert>
                    <AlertDescription>
                      Webinar created! Registration URL: <a href={webinarResult.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{webinarResult.url}</a>
                    </AlertDescription>
                  </Alert>
                )}
                {webinarResult && !webinarResult.success && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{webinarResult.error}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            <div>
              <Label>Zoom Meeting ID</Label>
              <Input value={form.zoom_meeting_id} onChange={e => updateForm('zoom_meeting_id', e.target.value)} placeholder="Auto-filled when creating webinar" />
            </div>
          </CardContent>
        </Card>
      )}

      {showVenue && (
        <Card>
          <CardHeader><CardTitle className="text-base">Venue Information</CardTitle></CardHeader>
          <CardContent>
            <VenueSelector
              locationId={form.location_id}
              locations={locations}
              venueData={{
                venue_id: form.venue_id,
                venue_name: form.venue_name,
                venue_link: form.venue_link,
                parking_link: form.parking_link,
                venue_details: form.venue_details
              }}
              onChange={(data) => setForm(prev => ({ ...prev, ...data }))}
            />
          </CardContent>
        </Card>
      )}



      {/* Ticket Types */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ticket Types</CardTitle>
          <Button variant="outline" size="sm" onClick={addTicketType}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticketTypes.map((tt, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ticket Type {i + 1}</span>
                <Button variant="ghost" size="icon" onClick={() => removeTicketType(i)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div><Label>Name</Label><Input value={tt.name} onChange={e => updateTicketType(i, 'name', e.target.value)} /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={tt.ticket_category || 'candidate'} onValueChange={v => updateTicketType(i, 'ticket_category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidate">Candidate</SelectItem>
                      <SelectItem value="business_owner">Business Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mode</Label>
                  <Select value={tt.attendance_mode} onValueChange={v => updateTicketType(i, 'attendance_mode', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="in_person">In-Person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Price (AUD)</Label><Input type="number" min="0" step="0.01" value={tt.price} onChange={e => updateTicketType(i, 'price', e.target.value)} /></div>
                <div><Label>Capacity</Label><Input type="number" min="0" value={tt.capacity_limit || ''} onChange={e => updateTicketType(i, 'capacity_limit', e.target.value)} placeholder="Unlimited" /></div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={tt.is_active !== false} onCheckedChange={v => updateTicketType(i, 'is_active', v)} />
                  <Label className="text-sm">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Sort</Label>
                  <Input type="number" className="w-16" value={tt.sort_order || 0} onChange={e => updateTicketType(i, 'sort_order', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          {ticketTypes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No ticket types added yet</p>}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
          {isEdit ? 'Save Changes' : 'Create Event'}
        </Button>
        <Button variant="outline" onClick={() => navigate('/admin/events')}>Cancel</Button>
        {isEdit && (
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" />Delete Event
          </Button>
        )}
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{form.name}</strong>? This will also delete all associated ticket types. Existing orders and tickets will not be deleted.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deletingEvent} onClick={async () => {
              setDeletingEvent(true);
              const tts = await base44.entities.TicketType.filter({ occurrence_id: id });
              for (const tt of tts) { await base44.entities.TicketType.delete(tt.id); }
              await base44.entities.EventOccurrence.delete(id);
              setDeletingEvent(false);
              navigate('/admin/events');
            }}>
              {deletingEvent ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}