import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [verify, setVerify] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    api('/audit?limit=200').then((d) => setRows(d.rows)).catch((e) => setErr(e.message));
    api('/audit/verify').then(setVerify).catch(() => {});
  };
  useEffect(load, []);
  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Audit trail</h3>
        {verify && (
          <p className={verify.ok ? 'ok' : 'err'}>
            {verify.ok ? `Chain intact: ${verify.checked} entries verified.` : `Chain broken at entry ${verify.brokenAtSeq}.`}
          </p>
        )}
        {err && <p className="err">{err}</p>}
        <table>
          <thead><tr><th>#</th><th>When (IST)</th><th>Who</th><th>Action</th><th>Risk</th><th>Reason</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq}>
                <td>{r.seq}</td>
                <td>{new Date(new Date(r.at).getTime() + 19800000).toISOString().slice(0, 16).replace('T', ' ')}</td>
                <td>{r.actor?.email}<div className="muted">{r.actor?.role}</div></td>
                <td>{r.action}<div className="muted">{r.entity?.type} {r.entity?.id}</div></td>
                <td className={`sev-${r.risk === 'high' ? 'high' : r.risk === 'medium' ? 'medium' : 'low'}`}>{r.risk}</td>
                <td className="muted">{r.reason || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
