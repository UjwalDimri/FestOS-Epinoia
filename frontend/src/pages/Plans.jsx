import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Plans({ user }) {
  const [compare, setCompare] = useState(null);
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const canWrite = ['festival_director', 'hospitality', 'events_team'].includes(user.role);

  const load = () => {
    api('/accommodation/compare').then(setCompare).catch((e) => setErr(e.message));
    api('/accommodation/active').then((d) => setActive(d.plan)).catch(() => {});
  };
  useEffect(load, []);

  async function build(strategy) {
    setErr(''); setMsg('');
    try { const r = await api('/plans/accommodation', { method: 'POST', body: { strategy } }); setMsg(`Draft ${r.planId} created. Activate it to make it live.`); load(); }
    catch (e) { setErr(e.message); }
  }
  async function activate(planId) {
    const reason = window.prompt('Reason for activating this plan (required):');
    if (!reason || reason.trim().length < 5) return setErr('A reason of at least 5 characters is required.');
    try { await api(`/plans/${planId}/activate`, { method: 'POST', body: { reason } }); setMsg(`${planId} is now active.`); load(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok">{msg}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Strategies compared (live, on current data)</h3>
        {compare && (
          <table>
            <thead><tr><th>Strategy</th><th>Placed</th><th>Unplaced</th><th>External ₹</th><th>Splits</th><th>Contingents split</th></tr></thead>
            <tbody>
              {Object.entries(compare.strategies).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}{v.overBudget ? <span className="err"> · over budget</span> : ''}</td>
                  <td>{v.placed}</td><td>{v.unplaced}</td><td>{Math.round(v.externalCostINR).toLocaleString('en-IN')}</td><td>{v.splits}</td><td>{v.contingentsSplit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canWrite && (
          <div className="row" style={{ marginTop: 8 }}>
            {['cost_first', 'cohesion_first', 'balanced'].map((s) => <button key={s} className="ghost" onClick={() => build(s)}>Create draft: {s}</button>)}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active accommodation plan</h3>
        {active ? <div>{active.planId} · {active.strategy} · {active.metrics.placed} placed, {active.metrics.unplaced} unplaced</div> : <div className="muted">None active.</div>}
        <div className="row" style={{ marginTop: 8 }}>
          <a href="/api/export/accommodation.csv" className="ghost" style={{ padding: '4px 8px', border: '1px solid #353a44', borderRadius: 4, color: '#e8e8ea' }} onClick={(e) => { e.preventDefault(); downloadCsv('accommodation'); }}>Export accommodation CSV</a>
          <a href="/api/export/inventory.csv" className="ghost" onClick={(e) => { e.preventDefault(); downloadCsv('inventory'); }} style={{ padding: '4px 8px', border: '1px solid #353a44', borderRadius: 4, color: '#e8e8ea' }}>Export inventory CSV</a>
        </div>
      </div>

    </>
  );

  function downloadCsv(kind) {
    const token = localStorage.getItem('festos_token');
    fetch(`/api/export/${kind}.csv`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob()).then((b) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `festos-${kind}.csv`; a.click(); });
  }
}
