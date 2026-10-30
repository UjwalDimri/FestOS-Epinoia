import React, { useState } from 'react';
import { api, setToken, DEMO_MODE } from '../api.js';

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
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(d.token);
      onLogin(d.user);
    } catch (x) { setErr(x.message); }
  }

  return (
    <main>
      <h2>Sign in to FestOS</h2>
      {sessionError && <p className="err" role="alert">{sessionError}</p>}
      <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
        <div className="row" style={{ flexDirection: 'column' }}>
          <label>Email<input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" /></label>
          <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" /></label>
          <button className="primary" type="submit">Sign in</button>
          {err && <span className="err">{err}</span>}
        </div>
      </form>
      {DEMO_MODE && <div className="card" style={{ maxWidth: 420 }}>
        <div className="muted" style={{ marginBottom: 6 }}>Test accounts (password FestOS@2026)</div>
        {DEMO.map(([k, label]) => (
          <button key={k} className="ghost" style={{ margin: 3 }} onClick={() => { setEmail(`${k}@festos.test`); }}>{label}</button>
        ))}
      </div>}
    </main>
  );
}
