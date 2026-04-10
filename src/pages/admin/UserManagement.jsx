import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Shield, Loader2, Search, Building2 } from 'lucide-react';

const ROLES = ['super_admin', 'event_admin', 'scanner', 'user'];

export default function UserManagement() {
  const { user: currentUser } = useOutletContext();
  const isAdmin = currentUser?.role === 'admin';
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ role: 'user', is_active: true, workspace_ids: [] });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteWorkspaceIds, setInviteWorkspaceIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Scanner location restrictions
  const [scannerDialogUser, setScannerDialogUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  async function loadUsers() {
    setLoading(true);
    const res = await base44.functions.invoke('manageUsers', { action: 'list' });
    setUsers(res.data.users);
    setWorkspaces(res.data.workspaces || []);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  const getWsName = (id) => workspaces.find(w => w.id === id)?.name || id;

  const openEdit = (u) => {
    setEditing(u.id);
    setForm({ role: u.role || 'user', is_active: u.is_active !== false, workspace_ids: u.workspace_ids || [] });
  };

  const toggleWsId = (wsId, list, setter) => {
    setter(list.includes(wsId) ? list.filter(id => id !== wsId) : [...list, wsId]);
  };

  const saveEdit = async () => {
    setSaving(true);
    const updateData = { role: form.role, is_active: form.is_active };
    if (isAdmin) updateData.workspace_ids = form.workspace_ids;
    await base44.functions.invoke('manageUsers', { action: 'update', user_id: editing, data: updateData });
    setUsers(prev => prev.map(u => u.id === editing ? { ...u, ...updateData } : u));
    setEditing(null);
    setSaving(false);
  };

  const inviteUser = async () => {
    setSaving(true);
    await base44.users.inviteUser(inviteEmail, ['super_admin', 'event_admin'].includes(inviteRole) ? 'admin' : 'user');
    await loadUsers();
    setInviteOpen(false);
    setInviteEmail('');
    setInviteWorkspaceIds([]);
    setSaving(false);
  };

  const openScannerAssignments = async (user) => {
    setScannerDialogUser(user);
    const [assigns, locs] = await Promise.all([
      base44.entities.ScannerAssignment.filter({ user_id: user.id }),
      base44.entities.Location.filter({})
    ]);
    setAssignments(assigns);
    setLocations(locs);
  };

  const addLocationRestriction = async () => {
    if (!selectedLocationId) return;
    setSaving(true);
    const created = await base44.entities.ScannerAssignment.create({
      user_id: scannerDialogUser.id,
      location_id: selectedLocationId,
      is_active: true
    });
    setAssignments(prev => [...prev, created]);
    setSelectedLocationId('');
    setSaving(false);
  };

  const deleteAssignment = async (aId) => {
    await base44.entities.ScannerAssignment.delete(aId);
    setAssignments(prev => prev.filter(a => a.id !== aId));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">User Management</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Invite</Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Workspaces</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.filter(u => {
              if ((u.email || '').toLowerCase().endsWith('@base44.com')) return false;
              if (!search) return true;
              const q = search.toLowerCase();
              return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
            }).map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{(u.role || 'user').replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(u.workspace_ids || []).length > 0 
                      ? (u.workspace_ids || []).map(wid => (
                          <Badge key={wid} variant="secondary" className="text-xs">{getWsName(wid)}</Badge>
                        ))
                      : <span className="text-muted-foreground text-xs">None</span>
                    }
                  </div>
                </TableCell>
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
                  {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div>
                <Label>Workspace Access</Label>
                <div className="mt-2 space-y-2 border rounded-lg p-3">
                  {workspaces.map(ws => (
                    <div key={ws.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={form.workspace_ids.includes(ws.id)}
                        onCheckedChange={() => {
                          const updated = form.workspace_ids.includes(ws.id)
                            ? form.workspace_ids.filter(id => id !== ws.id)
                            : [...form.workspace_ids, ws.id];
                          setForm({ ...form, workspace_ids: updated });
                        }}
                      />
                      <span className="text-sm">{ws.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          <DialogHeader><DialogTitle>Scanner Access — {scannerDialogUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-secondary/50 border border-border rounded-lg p-3">
              <p className="text-sm font-medium text-foreground">Access: All events & all locations by default</p>
              <p className="text-xs text-muted-foreground mt-1">Add location restrictions below to limit which locations this scanner can access.</p>
            </div>

            {assignments.filter(a => a.location_id).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Restricted to these locations only</Label>
                {assignments.filter(a => a.location_id).map(a => (
                  <div key={a.id} className="flex items-center justify-between border border-border rounded-lg p-2.5 text-sm">
                    <span className="text-foreground">{locations.find(l => l.id === a.location_id)?.name || 'Unknown location'}</span>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteAssignment(a.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-3 space-y-2">
              <Label>Add Location Restriction</Label>
              <div className="flex gap-2">
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select location..." /></SelectTrigger>
                  <SelectContent>
                    {locations.filter(l => !assignments.some(a => a.location_id === l.id)).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={addLocationRestriction} disabled={saving || !selectedLocationId}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}