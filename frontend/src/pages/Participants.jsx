import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Participants() {
  const [q, setQ] = useState('');
  const [flag, setFlag] = useState('');
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const qs = new URLSearchParams({ page, limit: 25 });
    if (q) qs.set('q', q);
    if (flag) qs.set('flag', flag);
    api(`/participants?${qs}`).then(setData).catch((e) => setErr(e.message));
  }, [q, flag, page]);

  async function show(id) {
    try { setOpen(await api(`/participants/${id}`)); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="card row">
        <input placeholder="Search name" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        <select value={flag} onChange={(e) => { setPage(1); setFlag(e.target.value); }}>
          <option value="">All</option>
          <option value="minor">Minors</option>
          <option value="quarantined">Quarantined</option>
        </select>
        <span className="muted">{data.total} people · contact details are masked for your role</span>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Contingent</th><th>Housing</th><th>Arrives (IST)</th><th>Status</th></tr></thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.participantId} className="clickable" onClick={() => show(p.participantId)}>
                <td>{p.participantId}</td><td>{p.name}</td><td>{p.contingentId}</td><td>{p.housingCategory || '—'}</td>
                <td>{p.arrivalDateTime ? new Date(new Date(p.arrivalDateTime).getTime() + 19800000).toISOString().slice(0, 16).replace('T', ' ') : '—'}</td>
                <td className={p.quarantined ? 'err' : ''}>{p.quarantined ? 'quarantined' : p.personType}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page}</span>
          <button className="ghost" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
      {open && <Detail d={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Detail({ d, onClose }) {
  const p = d.person;
  const a = d.allocation;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{p.participantId} · {p.name}</h3>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>
      <p className="muted">Contingent {p.contingentId} · {p.college} · {p.personType}{p.isLeader ? ' · leader' : ''}</p>
      <div className="row">
        <div><b>Housing</b><div>{p.housingCategory || '—'} {p.gender ? `(gender: ${p.gender})` : '(blank)'}</div></div>
        <div><b>Accessibility</b><div>{p.accessibilityNeeds?.status}{p.accessibilityNeeds?.needs?.length ? `: ${p.accessibilityNeeds.needs.join(', ')}` : ''}</div></div>
        <div><b>Dietary</b><div>{p.dietaryNeeds?.status}{p.dietaryNeeds?.needs?.length ? `: ${p.dietaryNeeds.needs.join(', ')}` : ''}</div></div>
        <div><b>Contact</b><div>{p.contactMasked || 'hidden for your role'}</div></div>
        <div><b>T-shirt</b><div>{p.tshirtSize || '—'}</div></div>
      </div>
      <h4>Bed</h4>
      {a ? (
        <div>
          <div>{a.bed?.kind ? `${a.bed.roomId || a.bed.propertyId} · bed ${a.bed.bedNo} · ${a.nights} nights · ₹${(a.cost || 0).toLocaleString('en-IN')}` : 'Unplaced'}</div>
          <div className="muted">{a.explanation}</div>
          <div className="muted">Reason codes: {(a.reasonCodes || []).join(', ')}</div>
        </div>
      ) : <div className="muted">No active allocation.</div>}
      <h4>Events</h4>
      <div>{d.registrations.join(', ') || 'none'}</div>
      <h4>Merch</h4>
      <div>{d.merch.length ? d.merch.map((m) => `${m.item} ${m.size} (${m.kind})`).join(' · ') : 'none issued'}</div>
      {d.duplicateCandidates.length > 0 && <>
        <h4>Possible duplicates</h4>
        <div>{d.duplicateCandidates.map((c) => `${c.other} (score ${c.score}, ${c.status})`).join(' · ')}</div>
      </>}
      {p.issues?.length > 0 && <>
        <h4>Open data issues</h4>
        <ul>{p.issues.map((i) => <li key={i.code} className={`sev-${i.severity}`}>{i.message}</li>)}</ul>
      </>}
    </div>
  );
}
