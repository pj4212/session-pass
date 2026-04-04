import React, { useState, useEffect } from 'react';
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
import { Plus, Edit, Loader2, ExternalLink, Calendar, Trash2, Copy, Check, ChevronDown, ChevronRight, Monitor, MapPin } from 'lucide-react';
import { toast } from 'sonner';

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
  const [expandedSeries, setExpandedSeries] = useState({});

  const toggleExpand = (id) => {
    setExpandedSeries(prev => ({ ...prev, [id]: !prev[id] }));
  };

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

  // Get unique source templates per series (deduplicated by name)
  const getSourceTemplates = (seriesId) => {
    const seriesOccs = occurrences.filter(o => o.series_id === seriesId);
    const seen = new Set();
    return seriesOccs.filter(o => {
      if (seen.has(o.name)) return false;
      seen.add(o.name);
      return true;
    });
  };

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

      {/* Desktop table */}
      <div className="border rounded-lg overflow-auto hidden md:block">
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
            {seriesList.map(s => {
               const sourceTemplates = getSourceTemplates(s.id);
                const isExpanded = expandedSeries[s.id];
                return (
                 <React.Fragment key={s.id}>
                    <TableRow>
                     <TableCell className="font-medium">
                       <button className="flex items-center gap-2 hover:text-primary transition-colors" onClick={() => toggleExpand(s.id)}>
                         {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                         {s.name}
                       </button>
                     </TableCell>
                     <TableCell>{sourceTemplates.length} source{sourceTemplates.length !== 1 ? 's' : ''}</TableCell>
                     <TableCell><Badge variant={STATUS_COLORS[s.status] || 'secondary'}>{s.status}</Badge></TableCell>
                     <TableCell>
                       <div className="flex items-center gap-1">
                         <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Edit Series"><Edit className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" asChild title="Sessions">
                           <Link to={`/admin/events?series=${s.id}`}><Calendar className="h-4 w-4" /></Link>
                         </Button>
                         <Button variant="ghost" size="icon" asChild title="View Public">
                           <a href={`https://session-pass.com/series/${s.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                         </Button>
                         <Button variant="ghost" size="icon" title="Copy Link" onClick={() => {
                           navigator.clipboard.writeText(`https://session-pass.com/series/${s.slug}`);
                           toast.success('Link copied to clipboard');
                         }}>
                           <Copy className="h-4 w-4" />
                         </Button>
                         <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(s)} title="Delete">
                           <Trash2 className="h-4 w-4 text-destructive" />
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                   {isExpanded && sourceTemplates.map(occ => (
                     <TableRow key={occ.id} className="bg-secondary/20">
                       <TableCell className="pl-10">
                         <div className="flex items-center gap-2">
                           {occ.event_mode === 'online_stream' ? <Monitor className="h-3.5 w-3.5 text-blue-400" /> : <MapPin className="h-3.5 w-3.5 text-green-400" />}
                           <span className="text-sm">{occ.name}</span>
                           {occ.recurrence_pattern && (
                             <Badge variant="outline" className="text-xs py-0">
                               {occ.recurrence_pattern === 'weekly' ? 'Weekly' : occ.recurrence_pattern === 'fortnightly_A' ? 'Fortnight A' : 'Fortnight B'}
                             </Badge>
                           )}
                           <Badge variant="outline" className="text-xs py-0">
                             {occ.event_mode === 'online_stream' ? 'Online' : occ.event_mode === 'in_person' ? 'In-Person' : 'Hybrid'}
                           </Badge>
                         </div>
                       </TableCell>
                       <TableCell></TableCell>
                       <TableCell></TableCell>
                       <TableCell>
                         <div className="flex items-center gap-1">
                           <Button variant="ghost" size="icon" asChild title="Edit Source">
                             <Link to={`/admin/events/${occ.id}/edit`}><Edit className="h-4 w-4" /></Link>
                           </Button>
                         </div>
                       </TableCell>
                     </TableRow>
                   ))}
                 </React.Fragment>
               );
             })}
            {seriesList.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No event series yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {seriesList.map(s => {
          const sourceTemplates = getSourceTemplates(s.id);
           const isExpanded = expandedSeries[s.id];
           return (
             <div key={s.id} className="border rounded-lg bg-card">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <button className="flex items-center gap-2 font-medium text-left hover:text-primary transition-colors" onClick={() => toggleExpand(s.id)}>
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span>{s.name}</span>
                  </button>
                  <Badge variant={STATUS_COLORS[s.status] || 'secondary'}>{s.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3 pl-6">{sourceTemplates.length} source{sourceTemplates.length !== 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="gap-1.5 text-xs h-8">
                    <Edit className="h-3.5 w-3.5" />Edit
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs h-8">
                    <Link to={`/admin/events?series=${s.id}`}><Calendar className="h-3.5 w-3.5" />Sessions</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs h-8">
                    <a href={`https://session-pass.com/series/${s.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />View</a>
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" onClick={() => {
                    navigator.clipboard.writeText(`https://session-pass.com/series/${s.slug}`);
                    toast.success('Link copied to clipboard');
                  }}>
                    <Copy className="h-3.5 w-3.5" />Copy
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 text-destructive" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              </div>
              {isExpanded && sourceTemplates.length > 0 && (
                <div className="border-t border-border">
                  {sourceTemplates.map(occ => (
                    <div key={occ.id} className="flex items-center justify-between gap-2 px-4 py-2.5 bg-secondary/20 border-b border-border last:border-b-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {occ.event_mode === 'online_stream' ? <Monitor className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <MapPin className="h-3.5 w-3.5 text-green-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm truncate">{occ.name}</p>
                          <div className="flex items-center gap-2">
                            {occ.recurrence_pattern && (
                              <Badge variant="outline" className="text-xs py-0">
                                {occ.recurrence_pattern === 'weekly' ? 'Weekly' : occ.recurrence_pattern === 'fortnightly_A' ? 'Fortnight A' : 'Fortnight B'}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs py-0">
                              {occ.event_mode === 'online_stream' ? 'Online' : occ.event_mode === 'in_person' ? 'In-Person' : 'Hybrid'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" asChild className="shrink-0">
                        <Link to={`/admin/events/${occ.id}/edit`}><Edit className="h-4 w-4" /></Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {seriesList.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">No event series yet</p>
        )}
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
            {occurrences.filter(o => o.series_id === deleteTarget?.id).length > 0
              ? ` The ${occurrences.filter(o => o.series_id === deleteTarget?.id).length} session(s) in this series will be unlinked but not deleted.`
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