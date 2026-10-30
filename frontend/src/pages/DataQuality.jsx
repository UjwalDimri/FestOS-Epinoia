import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DataQuality() {
  const [ladder, setLadder] = useState(null);
  const [issues, setIssues] = useState([]);
  const [dupes, setDupes] = useState([]);
  const [err, setErr] = useState('');
  const load = () => {
    api('/data/headcount').then(setLadder).catch((e) => setErr(e.message));
    api('/data/issues?severity=high').then((d) => setIssues(d.issues)).catch(() => {});
    api('/data/duplicates').then((d) => setDupes(d.candidates)).catch(() => {});
  };
  useEffect(load, []);

  async function dismiss(id) {
    const reason = window.prompt('Why is this not a duplicate? (required)');
    if (!reason || reason.trim().length < 5) return;
    await api(`/data/duplicates/${id}/dismiss`, { method: 'POST', body: { reason } }).then(load).catch((e) => setErr(e.message));
  }

  if (err) return <p className="err">{err}</p>;
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Headcount ladder</h3>
        {ladder && <table><tbody>{ladder.ladder.map((r) => <tr key={r.step}><td>{r.step}</td><td style={{ textAlign: 'right' }}>{r.value.toLocaleString('en-IN')}</td></tr>)}</tbody></table>}
        <p className="muted">Numbers are shown side by side, never overwritten. Contingent detail is in the API at /api/data/headcount.</p>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>High-severity issues ({issues.length} shown)</h3>
        <table><tbody>{issues.slice(0, 30).map((i) => <tr key={i._id}><td className="sev-high">{i.code}</td><td>{i.message}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Possible duplicates ({dupes.length} open)</h3>
        <table>
          <thead><tr><th>Pair</th><th>Score</th><th>Matches on</th><th /></tr></thead>
          <tbody>
            {dupes.slice(0, 40).map((c) => (
              <tr key={c._id}>
                <td>{c.a} ↔ {c.b}</td><td>{c.score}</td><td className="muted">{c.matched.join(', ')}</td>
                <td><button className="ghost" onClick={() => dismiss(c._id)}>Not a duplicate</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">To merge a pair, use Disruptions → duplicate record. Merges keep history.</p>
      </div>
    </>
  );
}
