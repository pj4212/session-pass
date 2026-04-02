import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Shield, Loader2 } from 'lucide-react';

const ROLES = ['super_admin', 'event_admin', 'scanner', 'user'];

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ role: 'user', is_active: true });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [saving, setSaving] = useState(false);

  // Scanner assignments
  const [scannerDialogUser, setScannerDialogUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [locations, setLocations] = useState([]);
  const [newAssignment, setNewAssignment] = useState({ occurrence_id: '', location_id: '', can_undo_checkin: false });

  useEffect(() => {
    async function load() {
      const u = await base44.entities.User.list();
      setUsers(u);
      setLoading(false);
    }
    load();
  }, []);

  const openEdit = (u) => {
    setEditing(u.id);
    setForm({ role: u.role || 'user', is_active: u.is_active !== false });
  };

  const saveEdit = async () => {
    setSaving(true);
    await base44.entities.User.update(editing, form);
    setUsers(prev => prev.map(u => u.id === editing ? { ...u, ...form } : u));
    setEditing(null);
    setSaving(false);
  };

  const inviteUser = async () => {
    setSaving(true);
    await base44.users.inviteUser(inviteEmail, inviteRole === 'super_admin' ? 'admin' : 'user');
    // After invite, reload users
    const u = await base44.entities.User.list();
    setUsers(u);
    setInviteOpen(false);
    setInviteEmail('');
    setSaving(false);
  };

  const openScannerAssignments = async (user) => {
    setScannerDialogUser(user);
    const [assigns, occs, locs] = await Promise.all([
      base44.entities.ScannerAssignment.filter({ user_id: user.id }),
      base44.entities.EventOccurrence.filter({ status: 'published' }),
      base44.entities.Location.filter({})
    ]);
    setAssignments(assigns);
    setOccurrences(occs);
    setLocations(locs);
  };

  const addAssignment = async () => {
    setSaving(true);
    const created = await base44.entities.ScannerAssignment.create({
      user_id: scannerDialogUser.id,
      occurrence_id: newAssignment.occurrence_id || '',
      location_id: newAssignment.location_id || '',
      can_undo_checkin: newAssignment.can_undo_checkin,
      is_active: true
    });
    setAssignments(prev => [...prev, created]);
    setNewAssignment({ occurrence_id: '', location_id: '', can_undo_checkin: false });
    setSaving(false);
  };

  const deleteAssignment = async (aId) => {
    await base44.entities.ScannerAssignment.delete(aId);
    setAssignments(prev => prev.filter(a => a.id !== aId));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Invite User</Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{u.role || 'user'}</Badge></TableCell>
                <TableCell>{u.is_active !== false ? 'Active' : 'Inactive'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Edit className="h-4 w-4" /></Button>
                    {(u.role === 'scanner') && (
                      <Button variant="ghost" size="icon" onClick={() => openScannerAssignments(u)} title="Scanner Assignments">
                        <Shield className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Role Dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Email</Label><Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={inviteUser} disabled={saving || !inviteEmail}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scanner Assignments Dialog */}
      <Dialog open={!!scannerDialogUser} onOpenChange={() => setScannerDialogUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Scanner Assignments — {scannerDialogUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center justify-between border rounded p-2 text-sm">
                <span>
                  {a.occurrence_id ? occurrences.find(o => o.id === a.occurrence_id)?.name || 'Event' : ''}
                  {a.location_id ? locations.find(l => l.id === a.location_id)?.name || 'Location' : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={() => deleteAssignment(a.id)}>Remove</Button>
              </div>
            ))}
            <div className="border-t pt-3 space-y-2">
              <Label>Add Assignment</Label>
              <Select value={newAssignment.occurrence_id} onValueChange={v => setNewAssignment({ ...newAssignment, occurrence_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select event (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {occurrences.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newAssignment.location_id} onValueChange={v => setNewAssignment({ ...newAssignment, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select location (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>None</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch checked={newAssignment.can_undo_checkin} onCheckedChange={v => setNewAssignment({ ...newAssignment, can_undo_checkin: v })} />
                <Label className="text-sm">Can undo check-in</Label>
              </div>
              <Button size="sm" onClick={addAssignment} disabled={saving || (!newAssignment.occurrence_id && !newAssignment.location_id)}>
                Add Assignment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}