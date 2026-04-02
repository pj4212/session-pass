import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Loader2 } from 'lucide-react';

export default function MentorManagement() {
  const [mentors, setMentors] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', platinum_leader_id: '', sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [m, l] = await Promise.all([
        base44.entities.UplineMentor.filter({}),
        base44.entities.PlatinumLeader.filter({})
      ]);
      setMentors(m.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      setLeaders(l);
      setLoading(false);
    }
    load();
  }, []);

  const openNew = () => {
    setEditing('new');
    setForm({ name: '', platinum_leader_id: '', sort_order: mentors.length, is_active: true });
  };

  const openEdit = (m) => {
    setEditing(m.id);
    setForm({ name: m.name, platinum_leader_id: m.platinum_leader_id || '', sort_order: m.sort_order || 0, is_active: m.is_active !== false });
  };

  const save = async () => {
    setSaving(true);
    if (editing === 'new') {
      const created = await base44.entities.UplineMentor.create(form);
      setMentors(prev => [...prev, created].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    } else {
      await base44.entities.UplineMentor.update(editing, form);
      setMentors(prev => prev.map(m => m.id === editing ? { ...m, ...form } : m));
    }
    setEditing(null);
    setSaving(false);
  };

  const leaderName = (id) => leaders.find(l => l.id === id)?.name || '—';

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upline Mentors</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />Add Mentor</Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Platinum Leader</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mentors.map(m => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{leaderName(m.platinum_leader_id)}</TableCell>
                <TableCell>{m.sort_order || 0}</TableCell>
                <TableCell>{m.is_active !== false ? '✓' : '✗'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Edit className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Add Mentor' : 'Edit Mentor'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Platinum Leader</Label>
              <Select value={form.platinum_leader_id} onValueChange={v => setForm({ ...form, platinum_leader_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {leaders.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
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