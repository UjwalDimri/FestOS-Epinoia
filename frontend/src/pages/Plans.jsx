import React, { useEffect, useState } from 'react';
import { api, apiFile } from '../api.js';

export default function Plans({ user }) {
  const [compare, setCompare] = useState(null);
  const [active, setActive] = useState(null);
  const [sched, setSched] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const canAccommodationWrite = ['festival_director', 'hospitality'].includes(user.role);
  const canScheduleWrite = ['festival_director', 'events_team'].includes(user.role);
  const canExport = ['festival_director', 'hospitality', 'events_team', 'logistics_head'].includes(user.role);
  const [slotPage, setSlotPage] = useState(1);

  const load = () => {
    api('/accommodation/compare').then(setCompare).catch((e) => setErr(e.message));
    api('/accommodation/active').then((d) => setActive(d.plan)).catch(() => {});
    api('/schedule/active').then(setSched).catch(() => {});
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
  async function buildSchedule() {
    try { const r = await api('/plans/schedule', { method: 'POST' }); setMsg(`Schedule draft ${r.planId} created.`); } catch (e) { setErr(e.message); }
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
        {canAccommodationWrite && (
          <div className="row" style={{ marginTop: 8 }}>
            {['cost_first', 'cohesion_first', 'balanced'].map((s) => <button key={s} className="ghost" onClick={() => build(s)}>Create draft: {s}</button>)}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Active accommodation plan</h3>
        {active ? <div>{active.planId} · {active.strategy} · {active.metrics.placed} placed, {active.metrics.unplaced} unplaced</div> : <div className="muted">None active.</div>}
        {canExport && <div className="row" style={{ marginTop: 8 }}>
          <a href="/api/export/accommodation.csv" className="ghost" style={{ padding: '4px 8px', border: '1px solid #353a44', borderRadius: 4, color: '#e8e8ea' }} onClick={(e) => { e.preventDefault(); downloadCsv('accommodation'); }}>Export accommodation CSV</a>
          <a href="/api/export/schedule.csv" className="ghost" onClick={(e) => { e.preventDefault(); downloadCsv('schedule'); }} style={{ padding: '4px 8px', border: '1px solid #353a44', borderRadius: 4, color: '#e8e8ea' }}>Export schedule CSV</a>
          <a href="/api/export/inventory.csv" className="ghost" onClick={(e) => { e.preventDefault(); downloadCsv('inventory'); }} style={{ padding: '4px 8px', border: '1px solid #353a44', borderRadius: 4, color: '#e8e8ea' }}>Export inventory CSV</a>
        </div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Schedule</h3>
        {sched?.plan ? (
          <>
            <div>{sched.plan.planId} · {sched.plan.metrics.slots} heats scheduled · {sched.plan.metrics.unscheduledRounds} later rounds waiting for results</div>
            <div className="muted">Clashes {sched.plan.metrics.participantClashes} · not present {sched.plan.metrics.notPresent} · equipment short {sched.plan.metrics.equipmentShortfall}</div>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Slot</th><th>Venue</th><th>Start (IST)</th><th>Size</th><th>Flags</th></tr></thead>
              <tbody>
                {sched.slots.slice((slotPage - 1) * 40, slotPage * 40).map((s) => (
                  <tr key={s.slotId}>
                    <td>{s.slotId}</td>
                    <td>{sched.venues.find((v) => v.venueId === s.venueId)?.name || s.venueId}</td>
                    <td>{new Date(new Date(s.start).getTime() + 19800000).toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td>{s.expectedSize}</td>
                    <td className="muted">{(s.reasonCodes || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row"><span className="muted">Showing {Math.min(40, Math.max(0, sched.slots.length - (slotPage - 1) * 40))} of {sched.slots.length} slots</span><button className="ghost" disabled={slotPage<=1} onClick={()=>setSlotPage(slotPage-1)}>Previous</button><button className="ghost" disabled={slotPage*40>=sched.slots.length} onClick={()=>setSlotPage(slotPage+1)}>Next</button></div>
          </>
        ) : <div className="muted">No active schedule.</div>}
        {sched?.plan && <p className="muted">Active schedule · {sched.plan.planId}. Slot flags and reason codes above are backend-reported.</p>}
        {canScheduleWrite && <button className="ghost" style={{ marginTop: 8 }} onClick={buildSchedule}>Create schedule draft</button>}
      </div>
    </>
  );

  async function downloadCsv(kind) {
    try { const b = await apiFile(`/export/${kind}.csv`); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `festos-${kind}.csv`; a.click(); URL.revokeObjectURL(u); }
    catch (e) { setErr(e.message); }
  }
}
