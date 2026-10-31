import React, { useState } from 'react';
import { api, setToken, DEMO_MODE } from '../api.js';
import { ROLE_LABELS } from '../services/access.js';
import { DemoBanner } from '../components/Shared.jsx';
import ColorBendsBackground from '../components/ColorBendsBackground.jsx';

const DEMO = [
  ['director', 'Festival Director'], ['hospitality', 'Hospitality'], ['registration', 'Registration Desk'],
  ['events', 'Events Team'], ['logistics', 'Logistics Head'], ['merch', 'Merchandise Desk'],
  ['food', 'Food Coordinator'], ['volunteer', 'Volunteer'],
];

export default function Login({ onLogin, sessionError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    setErr('');
    setBusy(true);
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
    finally { setBusy(false); }
  }

  return (
    <><DemoBanner/><main className="login-screen">
     <ColorBendsBackground className="login-color-bends" />
     <div className="login-color-grade" aria-hidden="true"/>
     <svg className="login-ambient" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
       <linearGradient id="ambient-wave" x1="0" x2="1" y1="0" y2=".35"><stop stopColor="#363486" stopOpacity="0"/><stop offset=".28" stopColor="#8e3938" stopOpacity=".35"/><stop offset=".65" stopColor="#d5b878" stopOpacity=".5"/><stop offset="1" stopColor="#343486" stopOpacity="0"/></linearGradient>
       <radialGradient id="ambient-glow"><stop stopColor="#9a4a3d" stopOpacity=".15"/><stop offset=".55" stopColor="#403d8d" stopOpacity=".08"/><stop offset="1" stopColor="#f7f3e5" stopOpacity="0"/></radialGradient>
       <filter id="ambient-blur"><feGaussianBlur stdDeviation="1.4"/></filter>
      </defs>
      <ellipse className="ambient-glow" cx="750" cy="495" fill="url(#ambient-glow)" rx="660" ry="330"/>
      <g className="ambient-wave wave-back" fill="none" stroke="url(#ambient-wave)" strokeWidth=".8">
       <path d="M-90 660 C150 612 209 523 406 550 S718 713 913 652 1210 469 1540 515"/><path d="M-90 680 C144 630 235 553 422 571 S711 730 922 672 1220 490 1540 537"/><path d="M-90 700 C154 649 254 578 437 591 S724 744 940 692 1239 514 1540 560"/><path d="M-90 720 C168 669 270 602 457 614 S740 759 959 711 1260 535 1540 582"/>
      </g>
      <g className="ambient-wave wave-front" fill="none" stroke="url(#ambient-wave)" strokeWidth="1.1">
       <path d="M-80 590 C112 580 234 470 397 481 S685 622 878 602 1187 432 1530 452"/><path d="M-80 610 C110 598 247 494 413 501 S690 641 891 620 1197 450 1530 472"/><path d="M-80 630 C121 615 259 516 427 521 S700 658 905 638 1210 468 1530 492"/><path d="M-80 650 C131 631 278 537 445 540 S713 674 923 655 1220 487 1530 513"/>
      </g>
      <g className="ambient-particles" fill="#8e3938">
       <circle cx="105" cy="627" r="1.4"/><circle cx="175" cy="603" r="1"/><circle cx="243" cy="572" r="1.5"/><circle cx="323" cy="534" r="1"/><circle cx="411" cy="505" r="1.6"/><circle cx="507" cy="516" r="1.1"/><circle cx="595" cy="552" r="1.5"/><circle cx="685" cy="592" r="1"/><circle cx="776" cy="615" r="1.5"/><circle cx="874" cy="599" r="1.1"/><circle cx="970" cy="556" r="1.6"/><circle cx="1060" cy="512" r="1"/><circle cx="1150" cy="475" r="1.4"/><circle cx="1250" cy="457" r="1"/><circle cx="1345" cy="466" r="1.5"/>
      </g>
      <g className="ambient-particles particles-secondary" fill="#43418d">
       <circle cx="78" cy="681" r="1"/><circle cx="202" cy="646" r="1.4"/><circle cx="348" cy="587" r="1"/><circle cx="488" cy="564" r="1.2"/><circle cx="631" cy="600" r="1"/><circle cx="823" cy="658" r="1.4"/><circle cx="1012" cy="625" r="1"/><circle cx="1172" cy="554" r="1.3"/><circle cx="1327" cy="512" r="1"/>
      </g>
     </svg>
     <div className="login-frame">
      <header className="login-topbar"><a className="login-brand" href="/" aria-label="FestOS home"><span className="brand-mark" aria-hidden="true">F</span><span><b>FestOS</b><small>FESTIVAL OPERATIONS</small></span></a><span className="login-access"><i aria-hidden="true"/>Team workspace</span></header>
      <div className="login-layout">
       <section className="login-story" aria-labelledby="login-story-title">
        <svg className="login-orbit-art" viewBox="0 0 520 300" aria-hidden="true">
         <defs>
          <radialGradient id="orbit-core-fill" cx="35%" cy="30%" r="70%"><stop stopColor="#fff5c9" stopOpacity=".9"/><stop offset=".42" stopColor="#d6ae6e" stopOpacity=".52"/><stop offset="1" stopColor="#403d8d" stopOpacity=".04"/></radialGradient>
          <linearGradient id="orbit-copper" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f4e5bd" stopOpacity=".08"/><stop offset=".48" stopColor="#bd6554" stopOpacity=".8"/><stop offset="1" stopColor="#843535" stopOpacity=".14"/></linearGradient>
          <linearGradient id="orbit-sage" x1="1" x2="0" y1="0" y2="1"><stop stopColor="#cdd0ef" stopOpacity=".12"/><stop offset=".5" stopColor="#7776c7" stopOpacity=".78"/><stop offset="1" stopColor="#3e3d8d" stopOpacity=".1"/></linearGradient>
         </defs>
         <g transform="translate(365 130)"><g className="orbit-system">
          <circle className="orbit-core" r="53" fill="url(#orbit-core-fill)"/>
          <ellipse className="orbit-ring orbit-ring-copper" rx="130" ry="42" fill="none" stroke="url(#orbit-copper)" strokeWidth="1.2" transform="rotate(-24)"/>
          <ellipse className="orbit-ring orbit-ring-sage" rx="119" ry="53" fill="none" stroke="url(#orbit-sage)" strokeWidth="1" transform="rotate(35)"/>
          <ellipse className="orbit-ring orbit-ring-fine" rx="150" ry="31" fill="none" stroke="#fff2c3" strokeOpacity=".32" strokeWidth=".7" transform="rotate(62)"/>
          <circle className="orbit-spark orbit-spark-one" cx="-103" cy="-20" r="3" fill="#e2b879"/>
          <circle className="orbit-spark orbit-spark-two" cx="94" cy="-44" r="2.4" fill="#9897df"/>
         </g></g>
        </svg>
        <svg className="login-campus-art" viewBox="0 0 320 240" role="presentation" aria-hidden="true">
         <defs>
          <linearGradient id="campus-top" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#f6ddce"/><stop offset="1" stopColor="#dba38e"/></linearGradient>
          <linearGradient id="campus-side" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#bb7865"/><stop offset="1" stopColor="#985e52"/></linearGradient>
          <linearGradient id="campus-green" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#b8c5b4"/><stop offset="1" stopColor="#7b8e7d"/></linearGradient>
          <linearGradient id="campus-blue" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#c6d0dc"/><stop offset="1" stopColor="#8796aa"/></linearGradient>
          <filter id="campus-shadow" height="180%" width="180%" x="-40%" y="-30%"><feGaussianBlur stdDeviation="7"/></filter>
         </defs>
         <ellipse cx="173" cy="202" fill="#7b6d5f" filter="url(#campus-shadow)" opacity=".18" rx="106" ry="19"/>
         <g className="campus-platform"><path d="m54 161 104-55 111 59-105 57z" fill="#e3d8cb"/><path d="m54 161 110 61v13L54 174z" fill="#b4a797"/><path d="m164 222 105-57v13l-105 57z" fill="#988a7b"/></g>
         <g className="campus-building campus-building-one"><path d="m92 153 34-18 37 20-35 19z" fill="url(#campus-top)"/><path d="m92 153 36 21v29l-36-21z" fill="#b97763"/><path d="m128 174 35-19v29l-35 19z" fill="url(#campus-side)"/><path d="m103 157 10-5v7l-10 5zm17 10 10-5v7l-10 5z" fill="#f9eee5" opacity=".9"/></g>
         <g className="campus-building campus-building-two"><path d="m158 130 33-18 36 20-34 19z" fill="url(#campus-green)"/><path d="m158 130 35 21v31l-35-21z" fill="#839382"/><path d="m193 151 34-19v31l-34 19z" fill="#69796c"/><path d="m168 134 9-5v8l-9 5zm17 10 9-5v8l-9 5z" fill="#eef0e8" opacity=".9"/></g>
         <g className="campus-building campus-building-three"><path d="m203 158 26-14 29 16-27 15z" fill="url(#campus-blue)"/><path d="m203 158 28 17v24l-28-17z" fill="#8592a5"/><path d="m231 175 27-15v24l-27 15z" fill="#687588"/><path d="m212 161 7-4v6l-7 4zm13 8 7-4v6l-7 4z" fill="#edf0f4" opacity=".9"/></g>
         <g className="campus-tent"><path d="m91 119 20-26 21 26z" fill="#d98b72"/><path d="m111 93 21 26h-21z" fill="#f1c8ae"/><path d="m91 119 20 11v-11z" fill="#b86955"/><path d="m111 119 21 11v-11z" fill="#9e5b4b"/></g>
         <g className="campus-tree"><path d="m71 149v-20" stroke="#7b6b59" strokeWidth="3"/><circle cx="71" cy="124" r="9" fill="url(#campus-green)"/><path d="m268 145v-19" stroke="#7b6b59" strokeWidth="3"/><circle cx="268" cy="121" r="8" fill="url(#campus-green)"/></g>
         <path className="campus-route" d="m61 179 28 15 16-8m125 20 24-13" fill="none" stroke="#fff9f2" strokeDasharray="3 5" strokeLinecap="round" strokeWidth="2"/>
        </svg>
        <span className="login-story-kicker">AAROHAN 2026 · OPERATIONS PORTAL</span>
        <h1 id="login-story-title">One workspace for the people behind the festival.</h1>
        <p>Coordinate teams, schedules, accommodation, and the work that keeps festival days running.</p>
        <ul className="login-workstreams" aria-label="FestOS work areas">
         <li style={{'--i':0}}><span>01</span><div><b>People</b><small>Registration and participant records</small></div></li>
         <li style={{'--i':1}}><span>02</span><div><b>Operations</b><small>Events, schedules, and accommodation</small></div></li>
         <li style={{'--i':2}}><span>03</span><div><b>Resources</b><small>Logistics, merchandise, and vendors</small></div></li>
        </ul>
       </section>
       <section className="login-content" aria-labelledby="login-title">
        <div className="login-intro"><span className="context-label">TEAM SIGN IN</span><h2 id="login-title">Welcome back</h2><p>Use the account assigned to your festival role.</p></div>
        {sessionError && <p className="err" role="alert">{sessionError}</p>}
        <form className="card login-card" onSubmit={submit}>
          <label className="form-field">Email<input autoComplete="username" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@festos.test" /></label>
          <label className="form-field">Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>
          {err && <span className="err login-error" role="alert">{err}</span>}
          <button className="primary login-submit" type="submit" disabled={busy} aria-busy={busy}>{busy?<><span className="button-loader" aria-hidden="true"/>Signing in…</>:<><span>Sign in</span><i className="btn-sheen" aria-hidden="true"/></>}</button>
          <p className="login-help">Need access? Contact your festival administrator.</p>
        </form>
        {DEMO_MODE && <div className="login-demo"><div><strong>Demo access</strong><span className="muted">Choose a role to fill the demo sign-in.</span></div><div className="demo-roles">{DEMO.map(([k, label]) => <button key={k} type="button" className="ghost" onClick={() => { setEmail(`${k}@festos.test`); setPassword('FestOS@2026'); }}>{label}</button>)}</div></div>}
       </section>
      </div>
      <footer className="login-footer">Festival operations workspace <span>·</span> Role-based access</footer>
     </div></main></>
  );
}
