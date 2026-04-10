import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import useWorkspaceFilter from '@/hooks/useWorkspaceFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Loader2 } from 'lucide-react';

export default function PlatinumLeaderManagement() {
  const { wsFilter, workspaceId } = useWorkspaceFilter();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const l = await base44.entities.PlatinumLeader.filter({ ...wsFilter });
      setLeaders(l.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setLoading(false);
    }
    load();
  }, [workspaceId]);

  const openNew = () => {
    setEditing('new');
    setForm({ name: '', sort_order: leaders.length, is_active: true });
  };

  const openEdit = (l) => {
    setEditing(l.id);
    setForm({ name: l.name, sort_order: l.sort_order || 0, is_active: l.is_active !== false });
  };

  const save = async () => {
    setSaving(true);
    if (editing === 'new') {
      const created = await base44.entities.PlatinumLeader.create({ ...form, ...wsFilter });
      setLeaders(prev => [...prev, created].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } else {
      await base44.entities.PlatinumLeader.update(editing, form);
      setLeaders(prev => prev.map(l => l.id === editing ? { ...l, ...form } : l));
    }
    setEditing(null);
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platinum Leaders</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />Add Leader</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaders.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell>{l.is_active !== false ? '✓' : '✗'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Edit className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add Leader' : 'Edit Leader'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}