import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { EmptyState, ErrorState, FormField, LoadingState, StatusBadge, Toast } from '../components/Shared.jsx';

const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const dateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const tone = (status) => status === 'approved' ? 'danger' : status === 'dismissed' ? 'neutral' : 'warning';

export default function FineCases({ user }) {
 const [rules, setRules] = useState([]), [cases, setCases] = useState([]), [loading, setLoading] = useState(true);
 const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState('');
 const [form, setForm] = useState({ targetType: 'participant', participantId: '', contingentId: '', ruleId: '', observedAt: localNow(), report: '', evidence: '', proposedFine: '0' });
 const [decisions, setDecisions] = useState({});
 const isDirector = user?.role === 'festival_director';
 async function load() {
  setError('');
  try {
   const [ruleData, caseData] = await Promise.all([api('/fine-rules'), api('/fine-cases')]);
   setRules(ruleData.rules || []); setCases(caseData.cases || []);
   setForm((old) => ({ ...old, ruleId: old.ruleId || ruleData.rules?.[0]?.id || '' }));
  } catch (e) { setError(e.message); }
  finally { setLoading(false); }
 }
 useEffect(() => { load(); }, []);
 const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
 async function submit(event) {
  event.preventDefault(); setError(''); setMessage(''); setBusy('report');
  try {
   await api('/fine-cases', { method: 'POST', body: { ...form, proposedFine: Number(form.proposedFine), observedAt: new Date(form.observedAt).toISOString(), participantId: form.targetType === 'participant' ? form.participantId.trim() : undefined, contingentId: form.contingentId.trim() || undefined } });
   setMessage('Report recorded. The Festival Director has been notified; no fine is imposed until they decide.');
   setForm((old) => ({ ...old, participantId: '', contingentId: '', report: '', evidence: '', proposedFine: '0', observedAt: localNow() }));
   await load();
  } catch (e) { setError(e.message); }
  finally { setBusy(''); }
 }
 async function decide(row, decision) {
  const state = decisions[row.caseId] || {};
  if (!state.reason?.trim() || state.reason.trim().length < 5) { setError('Enter an admin decision reason with at least 5 characters.'); return; }
  setError(''); setMessage(''); setBusy(row.caseId);
  try {
   await api(`/fine-cases/${encodeURIComponent(row.caseId)}/decision`, { method: 'POST', body: { decision, reason: state.reason.trim(), approvedFine: Number(state.approvedFine ?? row.proposedFine) } });
   setMessage(decision === 'approve' ? 'Fine approved and recorded.' : 'Report dismissed with an audit trail.'); await load();
  } catch (e) { setError(e.message); }
  finally { setBusy(''); }
 }
 const setDecision = (caseId, key, value) => setDecisions((old) => ({ ...old, [caseId]: { ...old[caseId], [key]: value } }));
 return <div className="fine-cases-page">
  {error && <ErrorState error={error} retry={loading ? load : undefined}/>}<Toast message={message}/>
  <section className="card"><header className="section-heading"><div><span className="eyebrow">ACCOMMODATION RULES · PDF PAGE 4</span><h2>Report a suspected rule breach</h2><p className="muted">Record what was observed and any proposed fine. Reports are allegations for review, not findings; only the Festival Director can approve a fine.</p></div></header>
   {loading ? <LoadingState/> : <form onSubmit={submit}>
    <div className="form-grid">
     <FormField label="Rule" required><select required value={form.ruleId} onChange={(e) => update('ruleId', e.target.value)}>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.id} · {rule.title}</option>)}</select></FormField>
     <FormField label="Reported against" required><select value={form.targetType} onChange={(e) => { update('targetType', e.target.value); update('participantId', ''); update('contingentId', ''); }}><option value="participant">Participant</option><option value="contingent">Contingent</option></select></FormField>
     {form.targetType === 'participant' && <FormField label="Participant ID" required hint="The active participant’s contingent is filled from their record."><input value={form.participantId} onChange={(e) => update('participantId', e.target.value)} required maxLength={80}/></FormField>}
     <FormField label="Contingent ID" required hint={form.targetType === 'participant' ? 'Optional when the participant has a contingent on record.' : undefined}><input value={form.contingentId} onChange={(e) => update('contingentId', e.target.value)} required={form.targetType === 'contingent'} maxLength={80}/></FormField>
     <FormField label="Observed at" required><input type="datetime-local" required value={form.observedAt} onChange={(e) => update('observedAt', e.target.value)}/></FormField>
     <FormField label="Proposed fine (₹)" hint="The PDF does not define a penalty schedule. This is a proposal only; the director may change it or dismiss the report."><input type="number" min="0" max="1000000" step="1" value={form.proposedFine} onChange={(e) => update('proposedFine', e.target.value)}/></FormField>
    </div>
    <FormField label="What happened?" required hint="Describe the observed facts, without assuming guilt (10–3000 characters)."><textarea required minLength={10} maxLength={3000} rows={4} value={form.report} onChange={(e) => update('report', e.target.value)}/></FormField>
    <FormField label="Evidence or witness notes" hint="Optional · up to 2000 characters"><textarea maxLength={2000} rows={2} value={form.evidence} onChange={(e) => update('evidence', e.target.value)}/></FormField>
    <button className="primary" disabled={!!busy || loading}>{busy === 'report' ? 'Submitting…' : 'Submit report for admin review'}</button>
   </form>}
  </section>
  <section className="card"><header className="section-heading"><div><span className="eyebrow">{isDirector ? 'ADMIN REVIEW QUEUE' : 'YOUR SUBMISSIONS'}</span><h2>{isDirector ? 'Rule reports and proposed fines' : 'Reports you submitted'}</h2><p className="muted">{isDirector ? 'Review the report and evidence, then approve a fine amount or dismiss the case with a reason.' : 'Pending reports are sent to the Festival Director for a decision.'}</p></div><span className="participant-result-count">{cases.length} cases</span></header>
   {loading ? <LoadingState/> : cases.length === 0 ? <EmptyState>No rule reports yet.</EmptyState> : <div className="fine-case-list">{cases.map((row) => {
    const pending = row.status === 'pending_review'; const state = decisions[row.caseId] || {};
    return <article className="fine-case-item" key={row.caseId}>
     <div className="fine-case-top"><div><span className="eyebrow">{row.caseId} · {row.ruleId}</span><h3>{row.ruleTitle}</h3></div><StatusBadge tone={tone(row.status)}>{row.status.replace('_', ' ')}</StatusBadge></div>
     <div className="fine-case-meta"><span><b>Target</b> {row.targetType}: {row.participantName ? `${row.participantName} (${row.participantId}) · ` : ''}{row.contingentName || row.contingentId}</span><span><b>Observed</b> {dateTime(row.observedAt)}</span><span><b>Proposed</b> {money(row.proposedFine)}</span><span><b>Reported by</b> {row.reportedBy?.email || row.reportedBy?.role || '—'}</span></div>
     <p className="fine-case-report">{row.report}</p>{row.evidence && <p className="muted"><b>Evidence:</b> {row.evidence}</p>}
     {row.decision && <p className="muted"><b>Admin decision:</b> {row.decision.reason}{row.status === 'approved' ? ` · approved ${money(row.decision.approvedFine)}` : ''} · {row.decision.by || row.decision.role}</p>}
     {isDirector && pending && <div className="fine-case-review"><FormField label="Approved fine (₹)"><input type="number" min="1" max="1000000" step="1" value={state.approvedFine ?? row.proposedFine} onChange={(e) => setDecision(row.caseId, 'approvedFine', e.target.value)}/></FormField><FormField label="Decision reason (required)"><input minLength="5" maxLength="1000" value={state.reason || ''} onChange={(e) => setDecision(row.caseId, 'reason', e.target.value)}/></FormField><div className="row"><button className="primary" type="button" disabled={!!busy} onClick={() => decide(row, 'approve')}>{busy === row.caseId ? 'Saving…' : 'Approve fine'}</button><button className="ghost" type="button" disabled={!!busy} onClick={() => decide(row, 'dismiss')}>Dismiss report</button></div></div>}
    </article>;
   })}</div>}
  </section>
 </div>;
}
