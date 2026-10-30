import React, { useState } from 'react';
import { api, setToken, DEMO_MODE } from '../api.js';
import { ROLE_LABELS } from '../services/access.js';
import { DemoBanner } from '../components/Shared.jsx';

const DEMO = [
  ['director', 'Festival Director'], ['hospitality', 'Hospitality'], ['registration', 'Registration Desk'],
  ['events', 'Events Team'], ['logistics', 'Logistics Head'], ['merch', 'Merchandise Desk'],
  ['food', 'Food Coordinator'], ['volunteer', 'Volunteer'],
];

export default function Login({ onLogin, sessionError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault();
    setErr('');
    try {
      if (DEMO_MODE) {
        const role = email.split('@')[0] === 'director' ? 'festival_director' : ({ hospitality:'hospitality', registration:'registration_desk', events:'events_team', logistics:'logistics_head', merch:'merchandise_desk', food:'food_coordinator', volunteer:'volunteer' }[email.split('@')[0]] || 'festival_director');
        onLogin({ userId: `demo-${role}`, email, name: ROLE_LABELS[role], role, roleLabel: ROLE_LABELS[role] });
        return;
      }
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(d.token);
      onLogin(d.user);
    } catch (x) { setErr(x.message); }
  }

  return (
    <><DemoBanner/><main>
      <h2>Sign in to FestOS</h2>
      {sessionError && <p className="err" role="alert">{sessionError}</p>}
      <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
        <div className="row" style={{ flexDirection: 'column' }}>
          <label>Email<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" /></label>
          <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" /></label>
          <button className="primary" type="submit">Sign in</button>
          {err && <span className="err" role="alert">{err}</span>}
        </div>
      </form>
      {DEMO_MODE && <div className="card" style={{ maxWidth: 420 }}>
        <div className="muted" style={{ marginBottom: 6 }}>Test accounts (password FestOS@2026)</div>
        {DEMO.map(([k, label]) => (
          <button key={k} className="ghost" style={{ margin: 3 }} onClick={() => { setEmail(`${k}@festos.test`); setPassword('FestOS@2026'); }}>{label}</button>
        ))}
      </div>}
    </main></>
  );
}
