import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Video, RefreshCw } from 'lucide-react';

export default function ZoomPanelistsManager({ webinarId }) {
  const [panelists, setPanelists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  const loadPanelists = async () => {
    if (!webinarId) return;
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('manageZoomPanelists', {
        action: 'list',
        webinar_id: webinarId
      });
      setPanelists(res.data.panelists || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load panelists');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPanelists();
  }, [webinarId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setAdding(true);
    setError('');
    try {
      await base44.functions.invoke('manageZoomPanelists', {
        action: 'add',
        webinar_id: webinarId,
        panelists: [{ name: newName.trim(), email: newEmail.trim() }]
      });
      setNewName('');
      setNewEmail('');
      await loadPanelists();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to add panelist');
    }
    setAdding(false);
  };

  const handleRemove = async (panelistId) => {
    setError('');
    try {
      await base44.functions.invoke('manageZoomPanelists', {
        action: 'remove',
        webinar_id: webinarId,
        panelists: [{ id: panelistId }]
      });
      await loadPanelists();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to remove panelist');
    }
  };

  if (!webinarId) {
    return <p className="text-sm text-muted-foreground">Save the event with a Zoom webinar first to manage panelists.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Panelists</Label>
        <Button variant="ghost" size="icon" onClick={loadPanelists} disabled={loading} title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading panelists...
        </div>
      ) : (
        <>
          {panelists.length > 0 ? (
            <div className="space-y-1">
              {panelists.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/50 text-sm">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground ml-2">{p.email}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(p.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No panelists added yet.</p>
          )}
        </>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">Name</Label>
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Smith" className="h-8 text-sm" />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Email</Label>
          <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@example.com" className="h-8 text-sm" type="email" />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim() || !newEmail.trim()} className="gap-1">
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>
    </div>
  );
}