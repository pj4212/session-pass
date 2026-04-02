import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Monitor, MapPin } from "lucide-react";

export default function TicketSelector({ ticketTypes, selections, onSelectionsChange }) {
  const onlineTypes = ticketTypes.filter(tt => tt.attendance_mode === 'online' && tt.is_active);
  const inPersonTypes = ticketTypes.filter(tt => tt.attendance_mode === 'in_person' && tt.is_active);

  const updateQuantity = (ttId, delta) => {
    const current = selections[ttId] || 0;
    const next = Math.max(0, current + delta);
    onSelectionsChange({ ...selections, [ttId]: next });
  };

  const isSoldOut = (tt) => {
    if (tt.attendance_mode !== 'in_person') return false;
    if (tt.capacity_limit == null) return false;
    return (tt.quantity_sold || 0) >= tt.capacity_limit;
  };

  const remaining = (tt) => {
    if (tt.capacity_limit == null) return null;
    return tt.capacity_limit - (tt.quantity_sold || 0);
  };

  const renderTicketType = (tt) => {
    const soldOut = isSoldOut(tt);
    const rem = remaining(tt);
    const qty = selections[tt.id] || 0;

    return (
      <div key={tt.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tt.name}</span>
            {soldOut && <Badge variant="destructive">Sold Out</Badge>}
            {!soldOut && rem !== null && rem <= 10 && (
              <Badge variant="secondary">{rem} left</Badge>
            )}
          </div>
          {tt.description && <p className="text-sm text-muted-foreground mt-1">{tt.description}</p>}
          <p className="text-sm font-semibold mt-1">
            {tt.price > 0 ? `$${tt.price.toFixed(2)} AUD` : 'Free'}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => updateQuantity(tt.id, -1)}
            disabled={qty === 0}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center font-medium">{qty}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => updateQuantity(tt.id, 1)}
            disabled={soldOut || (rem !== null && qty >= rem)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {onlineTypes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold">Online Tickets</h3>
          </div>
          <div className="space-y-3">
            {onlineTypes.map(renderTicketType)}
          </div>
        </div>
      )}
      {inPersonTypes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold">In-Person Tickets</h3>
          </div>
          <div className="space-y-3">
            {inPersonTypes.map(renderTicketType)}
          </div>
        </div>
      )}
    </div>
  );
}