import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Loader2, Building2, Trash2, Eye, EyeOff, Database } from 'lucide-react';
import { toast } from 'sonner';

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function WorkspaceManagement() {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editWs, setEditWs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(null);

  async function load() {
    setLoading(true);
    const ws = await base44.entities.Workspace.filter({});
    setWorkspaces(ws);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editWs?.name) return;
    setSaving(true);
    const data = {
      name: editWs.name,
      slug: editWs.slug || slugify(editWs.name),
      description: editWs.description || '',
      default_timezone: editWs.default_timezone || 'Australia/Brisbane',
      support_email: editWs.support_email || '',
      stripe_secret_key: editWs.stripe_secret_key || '',
      stripe_publishable_key: editWs.stripe_publishable_key || '',
      stripe_webhook_secret: editWs.stripe_webhook_secret || '',
      zoom_client_id: editWs.zoom_client_id || '',
      zoom_client_secret: editWs.zoom_client_secret || '',
      zoom_account_id: editWs.zoom_account_id || '',
      is_active: editWs.is_active !== false,
    };

    if (editWs.id) {
      await base44.entities.Workspace.update(editWs.id, data);
      toast.success('Workspace updated');
    } else {
      await base44.entities.Workspace.create(data);
      toast.success('Workspace created');
    }
    setEditWs(null);
    setSaving(false);
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Button onClick={() => setEditWs({ name: '', slug: '', is_active: true })}>
          <Plus className="h-4 w-4 mr-1.5" />Add Workspace
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Stripe</TableHead>
              <TableHead>Zoom</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspaces.map(ws => (
              <TableRow key={ws.id}>
                <TableCell className="font-medium">{ws.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{ws.slug}</TableCell>
                <TableCell className="text-sm">{ws.default_timezone || '—'}</TableCell>
                <TableCell>
                  {ws.stripe_secret_key ? <Badge variant="default" className="text-xs">Connected</Badge> : <Badge variant="secondary" className="text-xs">Not Set</Badge>}
                </TableCell>
                <TableCell>
                  {ws.zoom_client_id ? <Badge variant="default" className="text-xs">Connected</Badge> : <Badge variant="secondary" className="text-xs">Not Set</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={ws.is_active ? 'default' : 'secondary'}>{ws.is_active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setEditWs({ ...ws })}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    disabled={migrating === ws.id}
                    onClick={async () => {
                      setMigrating(ws.id);
                      const res = await base44.functions.invoke('migrateToWorkspace', { workspace_id: ws.id });
                      toast.success('Data migrated to ' + ws.name);
                      console.log('Migration results:', res.data);
                      setMigrating(null);
                    }}
                  >
                    {migrating === ws.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    Migrate Data
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {workspaces.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No workspaces yet. Create your first workspace to get started.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editWs} onOpenChange={(open) => !open && setEditWs(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editWs?.id ? 'Edit Workspace' : 'Create Workspace'}</DialogTitle>
          </DialogHeader>
          {editWs && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editWs.name} onChange={e => setEditWs(prev => ({ ...prev, name: e.target.value, slug: prev.id ? prev.slug : slugify(e.target.value) }))} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={editWs.slug} onChange={e => setEditWs(prev => ({ ...prev, slug: e.target.value }))} />
              </div>
              <div>
                <Label>Support Email</Label>
                <Input type="email" value={editWs.support_email || ''} onChange={e => setEditWs(prev => ({ ...prev, support_email: e.target.value }))} />
              </div>
              <div>
                <Label>Default Timezone</Label>
                <Select value={editWs.default_timezone || 'Australia/Brisbane'} onValueChange={v => setEditWs(prev => ({ ...prev, default_timezone: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                    <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST/AEDT)</SelectItem>
                    <SelectItem value="Australia/Adelaide">Australia/Adelaide (ACST/ACDT)</SelectItem>
                    <SelectItem value="Australia/Darwin">Australia/Darwin (ACST)</SelectItem>
                    <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                    <SelectItem value="Australia/Hobart">Australia/Hobart (AEST/AEDT)</SelectItem>
                    <SelectItem value="Pacific/Auckland">New Zealand (NZST/NZDT)</SelectItem>
                    <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                    <SelectItem value="America/New_York">New York (EST/EDT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Los Angeles (PST/PDT)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-3">Stripe Settings</h3>
                <div className="space-y-3">
                  <div>
                    <Label>Stripe Secret Key</Label>
                    <Input type="password" value={editWs.stripe_secret_key || ''} onChange={e => setEditWs(prev => ({ ...prev, stripe_secret_key: e.target.value }))} placeholder="sk_live_..." />
                  </div>
                  <div>
                    <Label>Stripe Publishable Key</Label>
                    <Input value={editWs.stripe_publishable_key || ''} onChange={e => setEditWs(prev => ({ ...prev, stripe_publishable_key: e.target.value }))} placeholder="pk_live_..." />
                  </div>
                  <div>
                    <Label>Stripe Webhook Secret</Label>
                    <Input type="password" value={editWs.stripe_webhook_secret || ''} onChange={e => setEditWs(prev => ({ ...prev, stripe_webhook_secret: e.target.value }))} placeholder="whsec_..." />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-sm mb-3">Zoom Settings</h3>
                <div className="space-y-3">
                  <div>
                    <Label>Zoom Client ID</Label>
                    <Input value={editWs.zoom_client_id || ''} onChange={e => setEditWs(prev => ({ ...prev, zoom_client_id: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Zoom Client Secret</Label>
                    <Input type="password" value={editWs.zoom_client_secret || ''} onChange={e => setEditWs(prev => ({ ...prev, zoom_client_secret: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Zoom Account ID</Label>
                    <Input value={editWs.zoom_account_id || ''} onChange={e => setEditWs(prev => ({ ...prev, zoom_account_id: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditWs(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !editWs.name}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  {editWs.id ? 'Save Changes' : 'Create Workspace'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}