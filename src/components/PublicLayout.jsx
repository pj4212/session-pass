import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import BottomTabNav from './BottomTabNav';

export default function PublicLayout() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="pb-16 md:pb-0">
        <Outlet context={{ user }} />
      </div>
      <BottomTabNav user={user} />
    </div>
  );
}