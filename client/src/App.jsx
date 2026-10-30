import React, { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Participants from './pages/Participants.jsx';
import Disruptions from './pages/Disruptions.jsx';
import Plans from './pages/Plans.jsx';
import DataQuality from './pages/DataQuality.jsx';
import Audit from './pages/Audit.jsx';

const PAGES = [
  ['dashboard', 'Control tower', Dashboard],
  ['participants', 'People', Participants],
  ['plans', 'Accommodation & schedule', Plans],
  ['disruptions', 'Disruptions', Disruptions],
  ['data', 'Data quality', DataQuality],
  ['audit', 'Audit', Audit],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [booting, setBooting] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api('/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  if (booting) return <main><p className="muted">Loading…</p></main>;
  if (!user) return <Login onLogin={setUser} />;

  const Page = PAGES.find(([k]) => k === page)[2];
  const logout = () => { setToken(null); setUser(null); };

  return (
    <>
      <header>
        <b>FestOS</b>
        <nav>
          {PAGES.map(([k, label]) => (
            <button key={k} className={page === k ? 'on' : ''} onClick={() => setPage(k)}>{label}</button>
          ))}
        </nav>
        <span className="muted" style={{ marginLeft: 'auto' }}>{user.name} · {user.roleLabel}</span>
        <button className="ghost" onClick={logout}>Sign out</button>
      </header>
      <main><Page user={user} /></main>
    </>
  );
}
