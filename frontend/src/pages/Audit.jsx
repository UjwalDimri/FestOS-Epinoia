import React, { useEffect, useState } from 'react';
import { auditService } from '../services/index.js';
import { EmptyState, ErrorState, LoadingState, Pagination, StatusBadge } from '../components/Shared.jsx';

const PAGE_SIZE = 25;
const inIST = (value) => value ? new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 16).replace('T', ' ') : 'Unavailable';
export default function Audit() {
  const [rows, setRows] = useState(null), [verify, setVerify] = useState(null);
  const [errors, setErrors] = useState({}), [loading, setLoading] = useState(true), [page, setPage] = useState(1);
  async function load() {
    setLoading(true); setErrors({});
    const result = await Promise.allSettled([auditService.list(500), auditService.verify()]);
    if (result[0].status === 'fulfilled') setRows(result[0].value.rows || []); else setErrors((current) => ({ ...current, rows: result[0].reason.message }));
    if (result[1].status === 'fulfilled') setVerify(result[1].value); else setErrors((current) => ({ ...current, verify: result[1].reason.message }));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const start = (page - 1) * PAGE_SIZE;

  return <div className="audit-page">
    <section className="card audit-integrity" aria-labelledby="audit-integrity-title">
      <header className="section-heading audit-section-heading"><div><span className="eyebrow">CHAIN VERIFICATION</span><h2 id="audit-integrity-title">Audit integrity</h2><p className="muted">Checks whether recorded actions still match the audit chain.</p></div>{verify && <StatusBadge tone={verify.ok ? 'success' : 'danger'}>{verify.ok ? 'Integrity verified' : 'Chain issue found'}</StatusBadge>}</header>
      {errors.verify ? <ErrorState error={errors.verify} retry={load}/> : loading && !verify ? <LoadingState/> : verify ? <div className="audit-integrity-summary"><div><span>Entries checked</span><strong>{Number(verify.checked || 0).toLocaleString('en-IN')}</strong></div>{verify.ok ? <div><span>Chain status</span><strong>All checked entries match</strong></div> : <div><span>First broken entry</span><strong>Sequence {verify.brokenAtSeq ?? 'unavailable'}</strong></div>}</div> : <EmptyState>Verification response unavailable.</EmptyState>}
      {verify && <details className="audit-raw-response"><summary>View verification response</summary><pre>{JSON.stringify(verify, null, 2)}</pre></details>}
    </section>
    <section className="card" aria-labelledby="audit-trail-title">
      <header className="section-heading audit-section-heading"><div><span className="eyebrow">RECENT OPERATIONS</span><h2 id="audit-trail-title">Audit trail</h2><p className="muted">Most recent records first. The API supports a maximum of 500 entries.</p></div>{rows && <span className="participant-result-count">{Number(rows.length).toLocaleString('en-IN')} entries</span>}</header>
      {errors.rows ? <ErrorState error={errors.rows} retry={load}/> : loading && !rows ? <LoadingState/> : rows?.length ? <>
        <div className="table-scroll"><table><caption className="sr-only">Recent audit records, newest first</caption><thead><tr><th scope="col">Sequence</th><th scope="col">When (IST)</th><th scope="col">Actor</th><th scope="col">Action and entity</th><th scope="col">Risk</th><th scope="col">Reason</th></tr></thead><tbody>{rows.slice(start, start + PAGE_SIZE).map((row) => <tr key={row.seq}><td className="audit-sequence">{row.seq}</td><td className="audit-time">{inIST(row.at)}</td><td><strong>{row.actor?.email || 'Unavailable'}</strong><div className="muted">{row.actor?.role || 'Unavailable'}</div></td><td><strong>{row.action || 'Unavailable'}</strong><div className="muted">{row.entity?.type || 'Unavailable'} · {row.entity?.id || 'Unavailable'}</div></td><td><StatusBadge tone={row.risk === 'high' || row.risk === 'critical' ? 'danger' : row.risk === 'medium' ? 'warning' : 'neutral'}>{row.risk || 'Unavailable'}</StatusBadge></td><td>{row.reason || '—'}</td></tr>)}</tbody></table></div>
        <Pagination page={page} total={rows.length} limit={PAGE_SIZE} onChange={setPage}/>
      </> : rows ? <EmptyState>No audit records returned.</EmptyState> : <LoadingState/>}
    </section>
  </div>;
}
