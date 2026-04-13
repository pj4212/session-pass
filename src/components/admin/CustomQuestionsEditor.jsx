import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export default function CustomQuestionsEditor({ questions = [], onChange, ticketTypeNames = [] }) {
  const addQuestion = () => {
    onChange([...questions, { label: '', type: 'text', required: false, applies_to: 'all', options: [] }]);
  };

  const appliesOptions = [
    { value: 'all', label: 'All Tickets' },
    ...ticketTypeNames.map(n => ({ value: n, label: n }))
  ];

  const updateQuestion = (idx, field, value) => {
    const updated = questions.map((q, i) => i === idx ? { ...q, [field]: value } : q);
    onChange(updated);
  };

  const removeQuestion = (idx) => {
    onChange(questions.filter((_, i) => i !== idx));
  };

  const updateOption = (qIdx, oIdx, value) => {
    const updated = questions.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...(q.options || [])];
      opts[oIdx] = value;
      return { ...q, options: opts };
    });
    onChange(updated);
  };

  const addOption = (qIdx) => {
    const updated = questions.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: [...(q.options || []), ''] };
    });
    onChange(updated);
  };

  const removeOption = (qIdx, oIdx) => {
    const updated = questions.map((q, i) => {
      if (i !== qIdx) return q;
      return { ...q, options: (q.options || []).filter((_, j) => j !== oIdx) };
    });
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Custom Questions</Label>
        <Button type="button" variant="outline" size="sm" onClick={addQuestion} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />Add Question
        </Button>
      </div>

      {questions.length === 0 && (
        <p className="text-xs text-muted-foreground">No custom questions yet. Add one to ask attendees during booking.</p>
      )}

      {questions.map((q, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-3 bg-secondary/30">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Input
                value={q.label}
                onChange={e => updateQuestion(idx, 'label', e.target.value)}
                placeholder="Question label (e.g. Company Name)"
                className="text-sm"
              />
              <div className="flex items-center gap-4 flex-wrap">
                <Select value={q.type} onValueChange={v => updateQuestion(idx, 'type', v)}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="select">Dropdown</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={q.applies_to || 'all'} onValueChange={v => updateQuestion(idx, 'applies_to', v)}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {appliesOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={q.required}
                    onCheckedChange={v => updateQuestion(idx, 'required', v)}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">Required</span>
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(idx)} className="shrink-0 h-8 w-8">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>

          {q.type === 'select' && (
            <div className="pl-2 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Options</Label>
              {(q.options || []).map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={e => updateOption(idx, oIdx, e.target.value)}
                    placeholder={`Option ${oIdx + 1}`}
                    className="text-xs h-7"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(idx, oIdx)} className="h-7 w-7 shrink-0">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => addOption(idx)} className="text-xs h-7 gap-1">
                <Plus className="h-3 w-3" />Add Option
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}