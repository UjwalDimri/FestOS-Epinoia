import React, { useEffect, useState } from 'react';
import { dataQualityService } from '../services/index.js';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Pagination, StatusBadge, Toast } from '../components/Shared.jsx';

const PAGE_SIZE = 30;
const count = (value) => Number(value ?? 0).toLocaleString('en-IN');
export default function DataQuality({ user }) {
  const [headcount, setHeadcount] = useState(null), [issues, setIssues] = useState(null), [duplicates, setDuplicates] = useState(null);
  const [errors, setErrors] = useState({}), [loading, setLoading] = useState(true), [severity, setSeverity] = useState('high');
  const [issuePage, setIssuePage] = useState(1), [dupePage, setDupePage] = useState(1), [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [toast, setToast] = useState('');
  const canWrite = ['festival_director', 'registration_desk'].includes(user.role);

  async function load() {
    setLoading(true); setErrors({});
    const query = severity ? `?severity=${encodeURIComponent(severity)}` : '';
    const results = await Promise.allSettled([dataQualityService.headcount(), dataQualityService.issues(query), dataQualityService.duplicates()]);
    const next = {}, keys = ['headcount', 'issues', 'duplicates'];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (index === 0) setHeadcount(result.value);
        if (index === 1) setIssues(result.value.issues || []);
        if (index === 2) setDuplicates(result.value.candidates || []);
      } else next[keys[index]] = result.reason.message;
    });
    setErrors(next); setLoading(false);
  }
  useEffect(() => { load(); }, [severity]);
  function openAction(item, action) { setDialog({ item, action }); setReason(''); }
  async function submitAction() {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      if (dialog.action === 'dismiss') await dataQualityService.dismissDuplicate(dialog.item._id, reason.trim());
      else await dataQualityService.resolveIssue(dialog.item._id, dialog.action === 'accept', reason.trim());
      setToast(dialog.action === 'dismiss' ? 'Duplicate candidate dismissed.' : `Issue ${dialog.action === 'accept' ? 'accepted' : 'resolved'}.`);
      setDialog(null); await load();
    } catch (error) { setErrors((current) => ({ ...current, action: error.message })); }
    finally { setBusy(false); }
  }
  return <div className="data-quality-page">
    <Toast message={toast}/>{errors.action && <ErrorState error={errors.action}/>}
    <section className="card" aria-labelledby="headcount-title">
      <header className="section-heading data-section-heading"><div><span className="eyebrow">RECONCILIATION</span><h2 id="headcount-title">Headcount ladder</h2><p className="muted">Backend-reported figures, shown in their original sequence.</p></div></header>
      {errors.headcount ? <ErrorState error={errors.headcount} retry={load}/> : loading && !headcount ? <LoadingState/> : headcount ? <>
        <div className="headcount-ladder">{(headcount.ladder || []).map((row, index) => <div className="headcount-step" key={row.step}><span className="headcount-step-index">{String(index + 1).padStart(2, '0')}</span><span className="headcount-step-name">{row.step}</span><strong className={Number(row.value) < 0 ? 'headcount-deduction' : ''}>{Number(row.value).toLocaleString('en-IN')}</strong></div>)}</div>
        <p className="data-source-note">The ladder values are displayed side by side from the backend. FestOS does not recompute the totals in the browser.</p>
        <div className="data-subsection-heading"><div><span className="eyebrow">RECORD VARIANCE</span><h3>Contingent counts</h3></div><span className="participant-result-count">{count(headcount.contingents?.length)} contingents</span></div>
        {headcount.contingents?.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Contingent</th><th scope="col">College</th><th scope="col">Declared</th><th scope="col">Records</th><th scope="col">Difference</th></tr></thead><tbody>{headcount.contingents.map((item) => <tr key={item.contingentId}><td><strong>{item.contingentId}</strong></td><td>{item.college}</td><td>{count(item.declared)}</td><td>{count(item.records)}</td><td><StatusBadge tone={Number(item.delta) === 0 ? 'success' : 'warning'}>{Number(item.delta) > 0 ? '+' : ''}{count(item.delta)}</StatusBadge></td></tr>)}</tbody></table></div> : <EmptyState>No contingent counts returned.</EmptyState>}
      </> : <EmptyState>Headcount is unavailable.</EmptyState>}
    </section>

    <section className="card" aria-labelledby="issues-title">
      <header className="section-heading data-section-heading"><div><span className="eyebrow">REVIEW QUEUE</span><h2 id="issues-title">Data issues</h2><p className="muted">Review high-impact issues first. Resolve or accept actions require a reason.</p></div><label className="data-severity-filter">Severity<select aria-label="Filter issues by severity" value={severity} onChange={(event) => { setSeverity(event.target.value); setIssuePage(1); }}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="">All severities</option></select></label></header>
      {errors.issues ? <ErrorState error={errors.issues} retry={load}/> : loading && !issues ? <LoadingState/> : issues?.length ? <>
        <p className="data-source-note">Showing {count(issues.length)} issues returned by the backend (maximum 500).</p>
        <div className="table-scroll"><table><thead><tr><th scope="col">Severity</th><th scope="col">Issue</th><th scope="col">Entity</th><th scope="col">Status</th><th scope="col">Resolution</th></tr></thead><tbody>{issues.slice((issuePage - 1) * PAGE_SIZE, issuePage * PAGE_SIZE).map((item) => <tr key={item._id}><td><StatusBadge tone={item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'info'}>{item.severity}</StatusBadge></td><td><strong>{item.code}</strong><div className="data-issue-message">{item.message}</div></td><td>{item.entity?.type || '—'}<div className="muted">{item.entity?.id || ''}</div></td><td><StatusBadge tone={item.status === 'open' ? 'warning' : 'neutral'}>{item.status}</StatusBadge></td><td>{canWrite && item.status === 'open' ? <div className="data-row-actions"><button className="ghost" type="button" onClick={() => openAction(item, 'resolve')}>Resolve</button><button className="ghost" type="button" onClick={() => openAction(item, 'accept')}>Accept issue</button></div> : item.resolution?.reason || '—'}</td></tr>)}</tbody></table></div>
        <Pagination page={issuePage} total={issues.length} limit={PAGE_SIZE} onChange={setIssuePage}/>
      </> : issues ? <EmptyState>No issues returned for this severity.</EmptyState> : <LoadingState/>}
    </section>

    <section className="card" aria-labelledby="duplicates-title">
      <header className="section-heading data-section-heading"><div><span className="eyebrow">MATCH REVIEW</span><h2 id="duplicates-title">Possible duplicates</h2><p className="muted">Review candidate pairs. Dismissing a candidate does not merge records.</p></div>{duplicates && <span className="participant-result-count">{count(duplicates.length)} open candidates</span>}</header>
      {errors.duplicates ? <ErrorState error={errors.duplicates} retry={load}/> : loading && !duplicates ? <LoadingState/> : duplicates?.length ? <>
        <p className="data-source-note">Showing candidates returned by the backend (maximum 200).</p>
        <div className="table-scroll"><table><thead><tr><th scope="col">Record pair</th><th scope="col">Match score</th><th scope="col">Matched fields</th><th scope="col">Action</th></tr></thead><tbody>{duplicates.slice((dupePage - 1) * PAGE_SIZE, dupePage * PAGE_SIZE).map((candidate) => <tr key={candidate._id}><td className="duplicate-pair">{candidate.a}<span aria-hidden="true">↔</span>{candidate.b}</td><td>{candidate.score}</td><td>{(candidate.matched || []).join(', ') || 'Unavailable'}</td><td>{canWrite && <button className="ghost" type="button" onClick={() => openAction(candidate, 'dismiss')}>Dismiss candidate</button>}</td></tr>)}</tbody></table></div>
        <Pagination page={dupePage} total={duplicates.length} limit={PAGE_SIZE} onChange={setDupePage}/>
      </> : duplicates ? <EmptyState>No open duplicate candidates returned.</EmptyState> : <LoadingState/>}
    </section>

    <ConfirmDialog open={Boolean(dialog)} title={dialog?.action === 'dismiss' ? 'Dismiss duplicate candidate' : 'Resolve data issue'} busy={busy} onCancel={() => setDialog(null)} onConfirm={submitAction} confirmLabel={dialog?.action === 'dismiss' ? 'Dismiss candidate' : dialog?.action === 'accept' ? 'Accept issue' : 'Resolve issue'}>
      {dialog?.item && <p>{dialog.action === 'dismiss' ? `${dialog.item.a} ↔ ${dialog.item.b}` : `${dialog.item.code}: ${dialog.item.message}`}</p>}
      <label className="form-field">Reason (required, at least 5 characters)<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5}/></label>
    </ConfirmDialog>
  </div>;
}
