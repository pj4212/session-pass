import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Calendar, Shield, ScanLine } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full px-6 text-center space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Session Pass</h1>
          <p className="text-muted-foreground">Event ticketing & management platform.</p>
        </div>

        <div className="space-y-3">
          <Link to="/admin" className="block">
            <Button variant="default" size="lg" className="w-full gap-2">
              <Shield className="h-5 w-5" />
              Admin Dashboard
            </Button>
          </Link>
          <Link to="/scanner" className="block">
            <Button variant="outline" size="lg" className="w-full gap-2">
              <ScanLine className="h-5 w-5" />
              Scanner
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">
          Event booking pages are accessed via direct event links at session-pass.com.
        </p>
      </div>
    </div>
  );
}