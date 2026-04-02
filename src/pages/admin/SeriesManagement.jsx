import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Loader2, ExternalLink, Calendar, Trash2 } from 'lucide-react';

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const STATUS_COLORS = {
  draft: 'secondary', published: 'default', cancelled: 'destructive', completed: 'outline'
};

export default function SeriesManagement() {
  const [seriesList, setSeriesList] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', is_published: false, status: 'draft' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const [s, o] = await Promise.all([
        base44.entities.EventSeries.filter({}),
        base44.entities.EventOccurrence.filter({})
      ]);
      setSeriesList(s.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      setOccurrences(o);
      setLoading(false);
    }
    load();
  }, []);

  const sessionCount = (seriesId) => occurrences.filter(o => o.series_id === seriesId).length;

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', slug: '', description: '', is_published: false, status: 'draft' });
    setDialogOpen(true);
  };

  const openEdit = (series) => {
    setEditing(series);
    setForm({ name: series.name, slug: series.slug, description: series.description || '', is_published: series.is_published, status: series.status || 'draft' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    if (editing) {
      await base44.entities.EventSeries.update(editing.id, form);
      setSeriesList(prev => prev.map(s => s.id === editing.id ? { ...s, ...form } : s));
    } else {
      const created = await base44.entities.EventSeries.create(form);
      setSeriesList(prev => [created, ...prev]);
    }
    setSaving(false);
    setDialogOpen(false);
  };

  const handleDeleteSeries = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Unlink any occurrences that belong to this series
    const linked = occurrences.filter(o => o.series_id === deleteTarget.id);
    for (const o of linked) {
      await base44.entities.EventOccurrence.update(o.id, { series_id: '' });
    }
    await base44.entities.EventSeries.delete(deleteTarget.id);
    setSeriesList(prev => prev.filter(s => s.id !== deleteTarget.id));
    setOccurrences(prev => prev.map(o => o.series_id === deleteTarget.id ? { ...o, series_id: '' } : o));
    setDeleteTarget(null);
    setDeleting(false);
  };

  const updateForm = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && !editing) {
        next.slug = slugify(value);
      }
      return next;
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Event Series</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" />New Series</Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seriesList.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{sessionCount(s.id)}</TableCell>
                <TableCell><Badge variant={STATUS_COLORS[s.status] || 'secondary'}>{s.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Edit"><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" asChild title="Sessions">
                      <Link to={`/admin/events?series=${s.id}`}><Calendar className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="View Public">
                      <a href={`https://session-pass.com/series/${s.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(s)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {seriesList.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No event series yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Series' : 'New Event Series'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => updateForm('name', e.target.value)} />
            </div>
            <div>
              <Label>Slug *</Label>
              <Input value={form.slug} onChange={e => updateForm('slug', e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_published} onCheckedChange={v => {
                updateForm('is_published', v);
                if (v) updateForm('status', 'published');
                else updateForm('status', 'draft');
              }} />
              <Label>Published</Label>
            </div>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.slug} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editing ? 'Save Changes' : 'Create Series'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Series</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            {sessionCount(deleteTarget?.id) > 0
              ? ` The ${sessionCount(deleteTarget?.id)} session(s) in this series will be unlinked but not deleted.`
              : ''}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSeries} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}