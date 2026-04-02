export default function OrderSummary({ selections, ticketTypes }) {
  const items = [];
  let total = 0;

  for (const [ttId, qty] of Object.entries(selections)) {
    if (qty <= 0) continue;
    const tt = ticketTypes.find(t => t.id === ttId);
    if (!tt) continue;
    const subtotal = (tt.price || 0) * qty;
    total += subtotal;
    items.push({ name: tt.name, mode: tt.attendance_mode, qty, price: tt.price, subtotal });
  }

  if (items.length === 0) return null;

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <h3 className="font-semibold mb-3">Order Summary</h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>
              {item.qty}x {item.name} ({item.mode === 'online' ? 'Online' : 'In-Person'})
            </span>
            <span className="font-medium">
              {item.price > 0 ? `$${item.subtotal.toFixed(2)}` : 'Free'}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
        <span>Total</span>
        <span>{total > 0 ? `$${total.toFixed(2)} AUD` : 'Free'}</span>
      </div>
    </div>
  );
}