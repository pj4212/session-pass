import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Ticket, Shield, ScanLine, LogIn, UserCog } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
        if (['super_admin', 'event_admin', 'admin'].includes(me.role)) {
          navigate('/admin', { replace: true });
          return;
        }
        if (me.role === 'scanner') {
          navigate('/scanner', { replace: true });
          return;
        }
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-indigo-400" />
          <span className="text-xl font-bold tracking-tight">Session Pass</span>
        </div>
        <div className="flex items-center gap-3">
          {checking ? null : user ? (
            <>
              {['super_admin', 'event_admin', 'admin'].includes(user.role) && (
                <Button asChild variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
                  <Link to="/admin">Admin Dashboard</Link>
                </Button>
              )}
              {['super_admin', 'event_admin', 'admin', 'scanner'].includes(user.role) && (
                <Button asChild variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
                  <Link to="/scanner">Scanner</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="icon" className="text-slate-300 hover:text-white hover:bg-white/10 touch-target">
                <Link to="/account"><UserCog className="h-4 w-4" /></Link>
              </Button>
              <span className="text-sm text-slate-400 hidden sm:inline">{user.full_name || user.email}</span>
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-white/10" onClick={() => base44.auth.logout()}>Logout</Button>
            </>
          ) : (
            <Button className="bg-indigo-600 hover:bg-indigo-500" onClick={() => base44.auth.redirectToLogin()}>
              <LogIn className="h-4 w-4 mr-1.5" />Staff Login
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-8">
            <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-sm text-indigo-300">Event Ticketing Platform</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Seamless Event
            <span className="block text-indigo-400">Ticketing & Check-In</span>
          </h1>
          <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-xl mx-auto">
            Session Pass powers your events from booking to check-in. Manage sessions, sell tickets, and verify attendees — all in one place.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/[0.07] transition-colors">
            <div className="h-10 w-10 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-4">
              <Ticket className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Online & In-Person</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Support for hybrid events with separate ticket types for online streaming and in-person attendance.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/[0.07] transition-colors">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-4">
              <ScanLine className="h-5 w-5 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-lg mb-2">QR Check-In</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Fast mobile-friendly QR scanning for door check-in with real-time attendee tracking.</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/[0.07] transition-colors">
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-4">
              <Shield className="h-5 w-5 text-amber-400" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Secure Payments</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Stripe-powered checkout with automated confirmation emails and digital tickets.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center">
        <p className="text-sm text-slate-500">© {new Date().getFullYear()} Session Pass. All rights reserved.</p>
      </footer>
    </div>
  );
}