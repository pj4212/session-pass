import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BuyerForm({ buyer, onChange }) {
  const update = (field, value) => {
    onChange({ ...buyer, [field]: value });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Buyer Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="buyer-first">First Name *</Label>
          <Input
            id="buyer-first"
            value={buyer.first_name}
            onChange={e => update('first_name', e.target.value)}
            placeholder="First name"
            required
          />
        </div>
        <div>
          <Label htmlFor="buyer-last">Last Name *</Label>
          <Input
            id="buyer-last"
            value={buyer.last_name}
            onChange={e => update('last_name', e.target.value)}
            placeholder="Last name"
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="buyer-email">Email *</Label>
        <Input
          id="buyer-email"
          type="email"
          value={buyer.email}
          onChange={e => update('email', e.target.value)}
          placeholder="email@example.com"
          required
        />
      </div>
    </div>
  );
}