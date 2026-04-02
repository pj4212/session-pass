import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut, Ticket } from 'lucide-react';

export default function UserNotRegisteredError() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/15 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-amber-400" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Invitation Required</h1>
          <p className="text-muted-foreground">
            Your account hasn't been invited to this app yet. An administrator needs to send you an invitation before you can access the platform.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 text-left space-y-3">
          <p className="text-sm font-medium text-foreground">What you can do:</p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Contact your team administrator to request an invitation
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Make sure you're signed in with the correct email address
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              Try logging out and signing in with a different account
            </li>
          </ul>
        </div>

        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => base44.auth.logout()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out & Try Again
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4">
          <Ticket className="h-3.5 w-3.5" />
          <span>Session Pass</span>
        </div>
      </div>
    </div>
  );
}