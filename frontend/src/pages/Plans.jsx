import React, { useEffect, useState } from 'react';
import { DEMO_MODE } from '../api.js';
import { accommodationService, exportService } from '../services/index.js';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Toast } from '../components/Shared.jsx';

const fmt = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString('en-IN');
const strategyLabel = (name) => ({ cost_first: 'Cost first', cohesion_first: 'Keep contingents together', balanced: 'Balanced' })[name] || String(name).replaceAll('_', ' ');

export default function Plans({ user }) {
  const [compare, setCompare] = useState(null), [active, setActive] = useState(undefined);
  const [rooms, setRooms] = useState(null), [unplaced, setUnplaced] = useState(null), [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({}), [loading, setLoading] = useState(true), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [activation, setActivation] = useState(null), [reason, setReason] = useState('');
  const canAccommodation = ['festival_director', 'hospitality'].includes(user.role);
  const canExport = ['festival_director', 'hospitality', 'events_team', 'logistics_head'].includes(user.role);

  async function load() {
    setLoading(true); setErrors({});
    const out = await Promise.allSettled([accommodationService.compare(), accommodationService.active(), accommodationService.rooms(), accommodationService.unplaced()]);
    ['compare', 'active', 'rooms', 'unplaced'].forEach((key, index) => {
      const result = out[index];
      if (result.status === 'fulfilled') {
        if (key === 'compare') setCompare(result.value);
        if (key === 'active') setActive(result.value.plan);
        if (key === 'rooms') setRooms(result.value.rooms || []);
        if (key === 'unplaced') setUnplaced(result.value.rows || []);
      } else setErrors((current) => ({ ...current, [key]: result.reason.message }));
    });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function build(strategy) {
    setBusy(true); setErrors({}); setMessage('');
    try {
      const result = await accommodationService.build(strategy);
      setDraft(result); setMessage(`Draft ${result.planId} created. It is not active.`);
    } catch (error) { setErrors((current) => ({ ...current, build: error.message })); }
    finally { setBusy(false); }
  }
  async function activate() {
    if (reason.trim().length < 5) { setErrors((current) => ({ ...current, activate: 'A reason with at least 5 characters is required.' })); return; }
    setBusy(true); setErrors({});
    try {
      const result = await accommodationService.activate(activation.planId, reason.trim());
      setMessage(DEMO_MODE ? 'Demo activation recorded; nothing was persisted.' : `Plan ${activation.planId} is now active.`);
      setActivation(null); setReason(''); setDraft(null);
      if (DEMO_MODE) setActive({ planId: result.planId, strategy: activation.strategy, status: 'active', metrics: activation.metrics });
      else await load();
    } catch (error) { setErrors((current) => ({ ...current, activate: error.message })); }
    finally { setBusy(false); }
  }
  async function download(kind) {
    try {
      const blob = await exportService.downloadCsv(kind), url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `festos-${kind}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setErrors((current) => ({ ...current, export: error.message })); }
  }

  return <div className="accommodation-plans-page">
    <Toast message={message}/>
    {['build', 'export'].filter((key) => errors[key]).map((key) => <ErrorState key={key} error={errors[key]}/>)}
    <section className="card plan-comparison" aria-labelledby="plan-comparison-title">
      <header className="section-heading plan-section-heading"><div><span className="eyebrow">DECISION WORKSPACE</span><h2 id="plan-comparison-title">Compare accommodation strategies</h2><p className="muted">Review placement, external cost, and contingent splits before creating a draft.</p></div></header>
      {errors.compare ? <ErrorState error={errors.compare} retry={load}/> : loading && !compare ? <LoadingState/> : compare ? <div className="plan-strategy-grid">
        {Object.entries(compare.strategies || {}).map(([name, metrics]) => <article className="plan-strategy" key={name}>
          <div className="plan-strategy-top"><div><span className="eyebrow">STRATEGY</span><h3>{strategyLabel(name)}</h3></div><span className={`plan-budget-state ${metrics.overBudget ? 'over-budget' : ''}`}>{metrics.overBudget == null ? 'Budget unknown' : metrics.overBudget ? 'Over budget' : 'Within budget'}</span></div>
          <div className="plan-strategy-metrics"><div><span>Placed</span><strong>{fmt(metrics.placed)}</strong></div><div><span>Awaiting placement</span><strong>{fmt(metrics.unplaced)}</strong></div></div>
          <dl className="plan-secondary-metrics"><div><dt>External cost</dt><dd>{metrics.externalCostINR == null ? 'Unavailable' : `₹${fmt(metrics.externalCostINR)}`}</dd></div><div><dt>Splits</dt><dd>{fmt(metrics.splits)}</dd></div><div><dt>Contingents split</dt><dd>{fmt(metrics.contingentsSplit)}</dd></div></dl>
          {canAccommodation && <button className="ghost plan-draft-button" type="button" disabled={busy} onClick={() => build(name)}>{busy ? 'Creating draft…' : 'Create draft with this strategy'}</button>}
        </article>)}
      </div> : <EmptyState>Strategy comparison unavailable.</EmptyState>}
      {compare?.note && <p className="plan-source-note">{compare.note}</p>}
      {draft && <div className="plan-draft-result" role="status"><div><span className="eyebrow">DRAFT CREATED · NOT ACTIVE</span><h3>{draft.planId}</h3><p>{strategyLabel(draft.strategy)} · {fmt(draft.metrics?.placed)} placed · {fmt(draft.metrics?.unplaced)} awaiting placement</p></div><div className="plan-draft-actions">{canAccommodation && <button className="primary" type="button" onClick={() => { setActivation(draft); setReason(''); }}>Review activation</button>}<button className="ghost" type="button" onClick={() => setDraft(null)}>Dismiss</button></div></div>}
    </section>

    <section className="card plan-active-section" aria-labelledby="active-plan-title">
      <header className="section-heading plan-section-heading"><div><span className="eyebrow">CURRENT ALLOCATION</span><h2 id="active-plan-title">Active accommodation plan</h2><p className="muted">The plan currently used for room and bed allocation.</p></div>{active?.status && <span className="badge badge-success">{active.status}</span>}</header>
      {errors.active ? <ErrorState error={errors.active} retry={load}/> : loading && active === undefined ? <LoadingState/> : active ? <div className="active-plan-summary"><div><span>Plan ID</span><strong>{active.planId}</strong></div><div><span>Strategy</span><strong>{strategyLabel(active.strategy)}</strong></div><div><span>Placed</span><strong>{fmt(active.metrics?.placed)}</strong></div><div><span>Awaiting placement</span><strong>{fmt(active.metrics?.unplaced)}</strong></div></div> : <EmptyState>No active accommodation plan.</EmptyState>}
      {canExport && <div className="plan-export-actions"><button className="ghost" type="button" onClick={() => download('accommodation')}>Export accommodation CSV</button><button className="ghost" type="button" onClick={() => download('inventory')}>Export inventory CSV</button></div>}
    </section>

    <div className="plan-detail-columns">
      <section className="card" aria-labelledby="room-detail-title"><header className="section-heading plan-section-heading"><div><span className="eyebrow">CAPACITY</span><h2 id="room-detail-title">Accommodation rooms</h2></div>{rooms && <span className="participant-result-count">{rooms.length} rooms</span>}</header>{errors.rooms ? <ErrorState error={errors.rooms} retry={load}/> : loading && !rooms ? <LoadingState/> : rooms?.length ? <DynamicTable rows={rooms}/> : <EmptyState>No rooms returned by the backend.</EmptyState>}</section>
      <section className="card" aria-labelledby="unplaced-title"><header className="section-heading plan-section-heading"><div><span className="eyebrow">FOLLOW-UP REQUIRED</span><h2 id="unplaced-title">People awaiting placement</h2></div>{unplaced && <span className="participant-result-count">{unplaced.length} people</span>}</header>{errors.unplaced ? <ErrorState error={errors.unplaced} retry={load}/> : loading && !unplaced ? <LoadingState/> : unplaced?.length ? <DynamicTable rows={unplaced}/> : <EmptyState>No unplaced people returned for the active plan.</EmptyState>}</section>
    </div>

    <ConfirmDialog open={Boolean(activation)} title="Activate accommodation plan" busy={busy} confirmLabel="Activate plan" onCancel={() => setActivation(null)} onConfirm={activate}><p>Plan <b>{activation?.planId}</b> will become the active plan for accommodation allocation. This can change placements.</p><label className="form-field">Reason (required, at least 5 characters)<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5}/></label>{errors.activate && <p className="err" role="alert">{errors.activate}</p>}</ConfirmDialog>
  </div>;
}

function DynamicTable({ rows }) {
  if (!rows?.length) return <p className="muted">No rows returned.</p>;
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row || {})))].filter((key) => !['_id', '__v'].includes(key)).slice(0, 10);
  return <div className="table-scroll"><table><thead><tr>{keys.map((key) => <th key={key}>{key.replace(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || row._id || row.slotId || index}>{keys.map((key) => <td key={key}>{row[key] && typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? 'Unavailable')}</td>)}</tr>)}</tbody></table></div>;
}
