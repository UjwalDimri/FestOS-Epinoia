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
    <><DemoBanner/><main className="login-screen">
      <div className="login-brand"><span className="brand-mark" aria-hidden="true">F</span><span><b>FestOS</b><small>FESTIVAL OPERATIONS</small></span></div>
      <section className="login-content">
        <div className="login-intro"><span className="context-label">AAROHAN 2026 · OPERATIONS PORTAL</span><h1>Sign in to FestOS</h1><p>Access the festival workspace with your assigned team account.</p></div>
        {sessionError && <p className="err" role="alert">{sessionError}</p>}
        <form className="card login-card" onSubmit={submit}>
          <label className="form-field">Email<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@festos.test" /></label>
          <label className="form-field">Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>
          {err && <span className="err" role="alert">{err}</span>}
          <button className="primary" type="submit">Sign in</button>
        </form>
        {DEMO_MODE && <div className="login-demo"><div><strong>Demo access</strong><span className="muted">Choose a role to fill the demo sign-in.</span></div><div className="demo-roles">{DEMO.map(([k, label]) => <button key={k} className="ghost" onClick={() => { setEmail(`${k}@festos.test`); setPassword('FestOS@2026'); }}>{label}</button>)}</div></div>}
      </section>
      <footer className="login-footer">Festival operations workspace <span>·</span> Role-based access</footer>
    </main></>
  );
}
