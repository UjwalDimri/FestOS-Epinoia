import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api('/dashboard').then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  async function ack(key) {
    await api(`/alerts/${encodeURIComponent(key)}/ack`, { method: 'POST' });
    load();
  }

  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const m = d.accommodation?.metrics || {};
  return (
    <>
      <div className="card row">
        <Stat n={d.counts.people} l="People (incl. escorts)" />
        <Stat n={m.placed} l="Placed in a bed" />
        <Stat n={m.unplaced} l="Still unplaced" />
        <Stat n={`₹${Math.round(m.externalCostINR || 0).toLocaleString('en-IN')}`} l={`External spend (budget ₹${(m.budgetINR || 0).toLocaleString('en-IN')})`} />
        <Stat n={d.schedule?.metrics?.participantClashes ?? '—'} l="Participant clashes" />
        <Stat n={d.counts.dataIssuesOpen} l="Open data issues" />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Alerts ({d.alerts.length})</h3>
        {d.alerts.length === 0 && <p className="ok">No open alerts.</p>}
        <table>
          <tbody>
            {d.alerts.map((a) => (
              <tr key={a.key}>
                <td className={`sev-${a.severity}`} style={{ width: 80 }}>{a.severity}{a.escalated ? ' ⇧' : ''}</td>
                <td>
                  <div>{a.title}</div>
                  {a.detail && <div className="muted">{a.detail}</div>}
                  {a.suggestedAction && <div className="muted">→ {a.suggestedAction}</div>}
                </td>
                <td className="muted" style={{ width: 130 }}>{a.ownerRole}</td>
                <td style={{ width: 90 }}>
                  {a.status === 'acknowledged' ? <span className="muted">acked</span> : <button className="ghost" onClick={() => ack(a.key)}>Acknowledge</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.accommodation && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bed shortfall by night</h3>
          <table>
            <thead><tr><th>Night (IST)</th><th>Need</th><th>Beds</th><th>Short</th></tr></thead>
            <tbody>
              {(m.perNight || []).map((n) => (
                <tr key={n.night}><td>{n.night}</td><td>{n.demand}</td><td>{n.capacity}</td><td className={n.shortfall ? 'err' : 'ok'}>{n.shortfall}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const Stat = ({ n, l }) => (<div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>);
