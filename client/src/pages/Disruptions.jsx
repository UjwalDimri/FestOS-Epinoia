import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const TEMPLATES = {
  hostel_closure: { roomId: 'B1-0-01' },
  late_contingent: { contingentId: 'C05', newArrival: '2026-10-31 18:00' },
  duplicate_record: { keepId: 'P0119', dropId: 'P_DUP02' },
  equipment_failure: { item: 'projector', qty: 1 },
  venue_change: { venueId: 'V04', from: '2026-10-31 14:00', to: '2026-10-31 20:00' },
  vendor_shutdown: { vendorId: 'VND02' },
  duplicate_merch_claim: { participantId: 'P0001', item: 'T-shirt' },
  constraint_change: { constraintId: 'ACC_MAX_DISTANCE', enabled: true, params: { maxKm: 1 } },
};

export default function Disruptions({ user }) {
  const [type, setType] = useState('hostel_closure');
  const [params, setParams] = useState(JSON.stringify(TEMPLATES.hostel_closure, null, 2));
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadHistory = () => api('/disruptions').then((d) => setHistory(d.recent)).catch(() => {});
  useEffect(() => { loadHistory(); }, []);

  function pick(t) { setType(t); setParams(JSON.stringify(TEMPLATES[t], null, 2)); setPreview(null); setErr(''); setMsg(''); }

  async function runPreview() {
    setErr(''); setMsg(''); setPreview(null);
    let p;
    try { p = JSON.parse(params); } catch { return setErr('Parameters must be valid JSON.'); }
    try { setPreview(await api('/disruptions/preview', { method: 'POST', body: { type, params: p } })); }
    catch (e) { setErr(e.message); }
  }

  async function commit() {
    if (!reason.trim() || reason.trim().length < 5) return setErr('Write a reason (at least 5 characters) before committing.');
    try {
      const r = await api(`/disruptions/${preview.disruptionId}/commit`, { method: 'POST', body: { reason } });
      setMsg(`Committed. ${r.replannedSchedule ? `Schedule re-planned as ${r.replannedSchedule}. ` : ''}The change is in the audit log.`);
      setPreview(null); setReason(''); loadHistory();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Inject a disruption</h3>
        <p className="muted">Pick a scenario, change the parameters, preview the impact. Nothing changes until you commit with a reason.</p>
        <div className="row">
          {Object.keys(TEMPLATES).map((t) => <button key={t} className={t === type ? 'primary' : 'ghost'} onClick={() => pick(t)}>{t.replace(/_/g, ' ')}</button>)}
        </div>
        <div style={{ marginTop: 10 }}>
          <textarea value={params} onChange={(e) => setParams(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={runPreview}>Preview impact</button>
        </div>
        {err && <p className="err">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </div>

      {preview && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Impact preview · {preview.type.replace(/_/g, ' ')} · risk {preview.risk}</h3>
          <pre>{JSON.stringify(preview.summary, null, 2)}</pre>
          <div className="row">
            <input style={{ flex: 1 }} placeholder="Reason for committing (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="primary" onClick={commit}>Commit change</button>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>Who can commit this: {(preview.committers || []).join(', ') || 'Festival Director'}, and always the Festival Director. Your role: {user.role}.</div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent</h3>
        <table>
          <tbody>
            {history.map((h) => (
              <tr key={h.disruptionId}>
                <td>{h.disruptionId}</td><td>{h.type.replace(/_/g, ' ')}</td><td>{h.status}</td><td className="muted">{h.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
