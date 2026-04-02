import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

export default function VenueSelector({ locationId, venueData, onChange, locations }) {
  const [venues, setVenues] = useState([]);
  const [showNewVenue, setShowNewVenue] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: '', address: '', venue_link: '', parking_link: '' });

  useEffect(() => {
    base44.entities.Venue.filter({ is_active: true }).then(setVenues);
  }, []);

  const filteredVenues = locationId
    ? venues.filter(v => v.location_id === locationId || !v.location_id)
    : venues;

  const handleSelectVenue = (venueId) => {
    if (venueId === 'custom') {
      onChange({ venue_id: '', venue_name: '', venue_link: '', parking_link: '' });
      return;
    }
    const venue = venues.find(v => v.id === venueId);
    if (venue) {
      onChange({
        venue_id: venue.id,
        venue_name: venue.name,
        venue_link: venue.venue_link || '',
        parking_link: venue.parking_link || '',
        venue_details: [venue.name, venue.address].filter(Boolean).join(', ')
      });
    }
  };

  const handleSaveNewVenue = async () => {
    if (!newVenue.name.trim()) return;
    const created = await base44.entities.Venue.create({
      ...newVenue,
      location_id: locationId || '',
      is_active: true
    });
    setVenues(prev => [...prev, created]);
    onChange({
      venue_id: created.id,
      venue_name: created.name,
      venue_link: created.venue_link || '',
      parking_link: created.parking_link || '',
      venue_details: [created.name, created.address].filter(Boolean).join(', ')
    });
    setNewVenue({ name: '', address: '', venue_link: '', parking_link: '' });
    setShowNewVenue(false);
  };

  const locationName = locationId ? locations?.find(l => l.id === locationId)?.name : null;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Saved Venue {locationName && <span className="text-muted-foreground">({locationName})</span>}</Label>
          <Select value={venueData.venue_id || 'custom'} onValueChange={handleSelectVenue}>
            <SelectTrigger><SelectValue placeholder="Select a venue..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom / Manual Entry</SelectItem>
              {filteredVenues.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}{v.address ? ` — ${v.address}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="icon" onClick={() => setShowNewVenue(true)} title="Save new venue">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Venue Name</Label>
          <Input value={venueData.venue_name || ''} onChange={e => onChange({ ...venueData, venue_name: e.target.value })} placeholder="e.g. Deakin University, Room 301" />
        </div>
        <div>
          <Label>Venue Details (shown in emails)</Label>
          <Input value={venueData.venue_details || ''} onChange={e => onChange({ ...venueData, venue_details: e.target.value })} placeholder="Full address or directions" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Venue Link</Label>
          <Input value={venueData.venue_link || ''} onChange={e => onChange({ ...venueData, venue_link: e.target.value })} placeholder="https://maps.google.com/..." />
        </div>
        <div>
          <Label>Parking Link</Label>
          <Input value={venueData.parking_link || ''} onChange={e => onChange({ ...venueData, parking_link: e.target.value })} placeholder="https://..." />
        </div>
      </div>

      <Dialog open={showNewVenue} onOpenChange={setShowNewVenue}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save New Venue</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This venue will be saved and available in the dropdown for future events{locationName ? ` under ${locationName}` : ''}.</p>
          <div className="space-y-3 mt-2">
            <div>
              <Label>Venue Name *</Label>
              <Input value={newVenue.name} onChange={e => setNewVenue(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Deakin University, Room 301" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={newVenue.address} onChange={e => setNewVenue(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, Melbourne VIC" />
            </div>
            <div>
              <Label>Venue Link</Label>
              <Input value={newVenue.venue_link} onChange={e => setNewVenue(p => ({ ...p, venue_link: e.target.value }))} placeholder="Google Maps or website URL" />
            </div>
            <div>
              <Label>Parking Link</Label>
              <Input value={newVenue.parking_link} onChange={e => setNewVenue(p => ({ ...p, parking_link: e.target.value }))} placeholder="Parking info URL" />
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowNewVenue(false)}>Cancel</Button>
            <Button onClick={handleSaveNewVenue} disabled={!newVenue.name.trim()}>Save Venue</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}