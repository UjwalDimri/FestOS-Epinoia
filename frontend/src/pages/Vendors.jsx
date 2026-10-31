import React, { useEffect, useState } from 'react';
import { disruptionsService, vendorsService } from '../services/index.js';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/Shared.jsx';

const blankForm = () => ({ vendorId: '', name: '', menu: '', menuItemsText: '', dietaryTags: '', certificateNumber: '', certExpiry: '', open: '07:00', close: '23:00', capacity: '0', paymentTermsRaw: '', ratePerMealINR: '', contractedMeals: '', minimumGuaranteeMeals: '', advancePaidINR: '0', contractAmountINR: '', amountPaidINR: '0', settlementStatus: 'pending', settlementNotes: '', active: true, reason: '' });
const dateOnly = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const parseMenuItems = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
  const [name, tags = '', allergens = '', notes = ''] = line.split('|');
  return { name: name.trim(), dietaryTags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), allergens: allergens.split(',').map((tag) => tag.trim()).filter(Boolean), notes: notes.trim() };
});
const displayMenuItems = (items = []) => items.map((item) => `${item.name} | ${(item.dietaryTags || []).join(',')} | ${(item.allergens || []).join(',')} | ${item.notes || ''}`).join('\n');
const timeLabel = (value) => value ? new Date(value).toLocaleString() : '—';

export default function Vendors({ user }) {
  const canManage = ['festival_director', 'food_coordinator'].includes(user?.role);
  const [vendors, setVendors] = useState([]), [incidents, setIncidents] = useState([]), [coverage, setCoverage] = useState(null);
  const [form, setForm] = useState(blankForm()), [editing, setEditing] = useState(false), [selectedId, setSelectedId] = useState('');
  const [compliance, setCompliance] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [interruptForm, setInterruptForm] = useState({ vendorId: '', from: '2026-10-31T07:00', to: '2026-10-31T09:00', reason: '' });
  const [preview, setPreview] = useState(null), [confirmInterrupt, setConfirmInterrupt] = useState(false);
  const [mealForm, setMealForm] = useState({ vendorId: '', date: '2026-10-31', meal: 'breakfast', served: '' });

  async function load() {
    setLoading(true); setError('');
    try {
      const [vendorData, coverageData] = await Promise.all([vendorsService.list(), vendorsService.coverage()]);
      setVendors(vendorData.vendors || []); setIncidents(vendorData.incidents || []); setCoverage(coverageData);
      const firstId = vendorData.vendors?.[0]?.vendorId || '';
      setInterruptForm((current) => ({ ...current, vendorId: current.vendorId || firstId }));
      setMealForm((current) => ({ ...current, vendorId: current.vendorId || firstId }));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function inspectVendor(vendorId) {
    setSelectedId(vendorId); setCompliance(null); setError('');
    try { const result = await vendorsService.compliance(vendorId); setCompliance(result.compliance); }
    catch (e) { setError(e.message); }
  }
  async function editVendor(vendorId) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await vendorsService.detail(vendorId), v = result.vendor;
      if (!v) throw new Error('Vendor detail was unavailable.');
      setForm({ ...blankForm(), vendorId: v.vendorId, name: v.name || '', menu: v.menu || '', menuItemsText: displayMenuItems(v.menuItems),
        dietaryTags: (v.dietaryTags || []).join(', '), certificateNumber: v.certificateNumber || '', certExpiry: dateOnly(v.certExpiry),
        open: v.hours?.open || '', close: v.hours?.close || '', capacity: String(v.capacity ?? 0), paymentTermsRaw: v.paymentTermsRaw || '',
        ratePerMealINR: v.ratePerMealINR ?? '', contractedMeals: v.contractedMeals ?? '', minimumGuaranteeMeals: v.minimumGuaranteeMeals ?? '',
        advancePaidINR: v.advancePaidINR ?? 0, contractAmountINR: v.contractAmountINR ?? '', amountPaidINR: v.amountPaidINR ?? 0,
        settlementStatus: v.settlementStatus || 'pending', settlementNotes: v.settlementNotes || '', active: v.active !== false, reason: '' });
      setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function resetForm() { setForm(blankForm()); setEditing(false); }
  function numberOrNull(value) { return value === '' ? null : Number(value); }
  async function saveVendor(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const body = { vendorId: form.vendorId.trim(), name: form.name.trim(), menu: form.menu.trim(), menuItems: parseMenuItems(form.menuItemsText),
      dietaryTags: form.dietaryTags.split(',').map((tag) => tag.trim()).filter(Boolean), certificateNumber: form.certificateNumber.trim(),
      certExpiry: form.certExpiry || null, hours: { open: form.open, close: form.close }, capacity: Number(form.capacity), paymentTermsRaw: form.paymentTermsRaw,
      ratePerMealINR: numberOrNull(form.ratePerMealINR), contractedMeals: numberOrNull(form.contractedMeals), minimumGuaranteeMeals: numberOrNull(form.minimumGuaranteeMeals),
      advancePaidINR: Number(form.advancePaidINR || 0), contractAmountINR: numberOrNull(form.contractAmountINR), amountPaidINR: Number(form.amountPaidINR || 0),
      settlementStatus: form.settlementStatus, settlementNotes: form.settlementNotes, active: form.active, reason: form.reason };
    try {
      if (editing) await vendorsService.update(form.vendorId, body); else await vendorsService.create(body);
      setMessage(`${body.name} ${editing ? 'updated' : 'added'} successfully.`); resetForm(); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function previewInterruption() {
    if (interruptForm.reason.trim().length < 5) { setError('Enter an interruption reason with at least 5 characters before previewing.'); return; }
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      const from = interruptForm.from.replace('T', ' '), to = interruptForm.to.replace('T', ' ');
      const result = await disruptionsService.preview('vendor_shutdown', { vendorId: interruptForm.vendorId, from, to, reason: interruptForm.reason.trim() });
      setPreview(result);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function commitInterruption() {
    if (interruptForm.reason.trim().length < 5) { setError('Enter an interruption reason with at least 5 characters.'); return; }
    setBusy(true); setError('');
    try {
      await disruptionsService.commit(preview.disruptionId, interruptForm.reason.trim());
      setMessage('Vendor interruption recorded. Food coverage has been recalculated.'); setPreview(null); setConfirmInterrupt(false); setInterruptForm((old) => ({ ...old, reason: '' })); await load();
      if (selectedId) await inspectVendor(selectedId);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function logMeal(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await vendorsService.logMeal(mealForm.vendorId, { date: mealForm.date, meal: mealForm.meal, served: Number(mealForm.served) }); setMessage('Meal service count saved.'); setMealForm((old) => ({ ...old, served: '' })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const field = (key, label, type = 'text', required = false) => <label className="form-field" key={key}>{label}<input type={type} required={required} disabled={busy || (editing && key === 'vendorId')} value={form[key]} onChange={(e) => setForm({ ...form, [key]: type === 'checkbox' ? e.target.checked : e.target.value })}/></label>;
  const coveredCount = coverage?.summary?.cells == null ? null : coverage.summary.cells - Number(coverage.summary.uncovered || 0);

  return <div className="vendor-page">
    {message && <p className="toast" role="status">{message}</p>}{error && <ErrorState error={error} retry={load}/>}

    {canManage && <section className="card vendor-form-card"><header className="section-heading vendor-section-heading"><div><span className="eyebrow">VENDOR PROFILE</span><h2>{editing ? `Edit vendor · ${form.vendorId}` : 'Add vendor'}</h2><p className="muted">Group service, food safety, and payment details so each can be reviewed independently.</p></div></header>
      <form onSubmit={saveVendor}>
        <fieldset className="vendor-field-group"><legend>Vendor and service</legend><div className="form-grid">{field('vendorId', 'Vendor ID', 'text', true)}{field('name', 'Vendor name', 'text', true)}{field('menu', 'Menu / cuisine', 'text', true)}{field('capacity', 'Capacity per meal service', 'number', true)}{field('open', 'Opens', 'time', true)}{field('close', 'Closes', 'time', true)}<label className="form-field">Vendor status<select disabled={busy} value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Paused</option></select></label></div></fieldset>
        <fieldset className="vendor-field-group"><legend>Food safety and dietary service</legend><div className="form-grid">{field('dietaryTags', 'Dietary tags (comma separated)')}{field('certificateNumber', 'Hygiene certificate number')}{field('certExpiry', 'Certificate valid through', 'date')}</div><label className="form-field">Menu items (one per line: item | dietary tags | allergens | notes)<textarea disabled={busy} value={form.menuItemsText} onChange={(e) => setForm({ ...form, menuItemsText: e.target.value })} placeholder="Paneer bowl | vegetarian, jain | nuts | no onion or garlic"/><small>Use one line per menu item. Keep allergens explicit.</small></label></fieldset>
        <fieldset className="vendor-field-group"><legend>Payment and settlement</legend><div className="form-grid">{field('paymentTermsRaw', 'Payment terms')}{field('ratePerMealINR', 'Rate per meal (INR)', 'number')}{field('contractedMeals', 'Contracted meals', 'number')}{field('minimumGuaranteeMeals', 'Minimum guarantee meals', 'number')}{field('advancePaidINR', 'Advance paid (INR)', 'number')}{field('contractAmountINR', 'Contract amount (INR)', 'number')}{field('amountPaidINR', 'Total paid (INR)', 'number')}<label className="form-field">Settlement status<select disabled={busy} value={form.settlementStatus} onChange={(e) => setForm({ ...form, settlementStatus: e.target.value })}>{['pending','advance_paid','partially_paid','settled','on_hold'].map((status) => <option key={status}>{status}</option>)}</select></label><label className="form-field">Settlement notes<input disabled={busy} value={form.settlementNotes} onChange={(e) => setForm({ ...form, settlementNotes: e.target.value })}/></label><label className="form-field">Change reason<input disabled={busy} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Required for payment changes"/></label></div></fieldset>
        <div className="row"><button className="primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save vendor' : 'Add vendor'}</button>{editing && <button type="button" className="ghost" disabled={busy} onClick={resetForm}>Cancel edit</button>}</div>
      </form>
    </section>}

    <section className="card"><header className="section-heading vendor-section-heading"><div><span className="eyebrow">SUPPLIER RECORDS</span><h2>Vendor directory</h2><p className="muted">Compliance and payment actions are available according to your role.</p></div><span className="participant-result-count">{vendors.length} vendors</span></header>
      {loading ? <LoadingState/> : vendors.length ? <div className="table-scroll"><table><thead><tr><th>Vendor</th><th>Menu and diet tags</th><th>Capacity / hours</th><th>Hygiene certificate</th><th>Settlement</th><th>Status</th><th>Actions</th></tr></thead><tbody>{vendors.map((v) => <tr key={v.vendorId}>
        <td><b>{v.name}</b><div className="muted">{v.vendorId}</div></td><td>{v.menu}<div className="muted">{(v.dietaryTags || []).join(', ') || 'No dietary tags'}</div></td>
        <td>{v.capacity ?? '—'} per meal<div className="muted">{v.hours?.open || '—'}–{v.hours?.close || '—'}</div></td>
        <td>{v.certExpiry ? dateOnly(v.certExpiry) : <StatusBadge tone="warning">Certificate missing</StatusBadge>}<div className="muted">{v.certificateNumber || 'Certificate number unavailable'}</div></td>
        <td>{v.settlementStatus || '—'}{v.amountDueINR != null && <div className="muted">Due ₹{v.amountDueINR.toLocaleString('en-IN')}</div>}</td>
        <td><StatusBadge tone={v.active === false ? 'neutral' : 'success'}>{v.active === false ? 'Paused' : 'Active'}</StatusBadge></td><td><button type="button" className="ghost" onClick={() => inspectVendor(v.vendorId)}>Compliance</button>{canManage && <> <button type="button" className="ghost" disabled={busy} onClick={() => editVendor(v.vendorId)}>Edit</button></>}</td>
      </tr>)}</tbody></table></div> : <EmptyState>No vendors are configured.</EmptyState>}
    </section>

    <section className="card"><header className="section-heading vendor-section-heading"><div><span className="eyebrow">MEAL SERVICE</span><h2>Dietary coverage by day and meal</h2><p className="muted">Compare expected servings with assigned vendor capacity.</p></div><StatusBadge tone={coverage?.summary?.cells==null?'neutral':coverage.summary.uncovered>0?'warning':'success'}>{coveredCount==null?'Coverage unavailable':`${coveredCount}/${coverage?.summary?.cells} covered`}</StatusBadge></header>
      {loading ? <LoadingState/> : coverage?.rows?.length ? <div className="table-scroll"><table><thead><tr><th>Day</th><th>Meal</th><th>Diet</th><th>People</th><th>Assigned capacity</th><th>Serving vendors</th><th>Coverage</th></tr></thead><tbody>{coverage.rows.map((row, i) => <tr key={`${row.day}-${row.meal}-${row.diet}-${i}`}><td>{row.day}</td><td>{row.meal}</td><td>{row.diet}</td><td>{row.headcount}</td><td>{row.capacity}</td><td>{row.servers?.join(', ') || 'None'}</td><td>{row.covered ? 'Covered' : row.gap === 'NO_VENDOR' ? 'No eligible vendor' : 'Capacity short'}</td></tr>)}</tbody></table></div> : <EmptyState>No coverage rows returned.</EmptyState>}
      {coverage?.summary?.uncovered > 0 && <p className="warning">{coverage.summary.uncovered} meal and diet cells have coverage gaps, affecting {coverage.summary.uncoveredHeadcount} expected servings.</p>}
    </section>

    {canManage && <section className="card"><h2>Record vendor interruption</h2><p className="muted">Preview the affected dietary coverage before committing an interruption.</p>
      <div className="form-grid"><label className="form-field">Vendor<select value={interruptForm.vendorId} onChange={(e) => { setInterruptForm({ ...interruptForm, vendorId: e.target.value }); setPreview(null); }}>{vendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorId} · {v.name}</option>)}</select></label>
        <label className="form-field">Starts (IST)<input type="datetime-local" value={interruptForm.from} onChange={(e) => { setInterruptForm({ ...interruptForm, from: e.target.value }); setPreview(null); }}/></label>
        <label className="form-field">Ends (IST)<input type="datetime-local" value={interruptForm.to} onChange={(e) => { setInterruptForm({ ...interruptForm, to: e.target.value }); setPreview(null); }}/></label>
        <label className="form-field">Interruption reason<input value={interruptForm.reason} onChange={(e) => { setInterruptForm({ ...interruptForm, reason: e.target.value }); setPreview(null); }} minLength={5}/></label>
      </div><button className="primary" disabled={busy || !interruptForm.vendorId || interruptForm.reason.trim().length < 5} onClick={previewInterruption}>Preview coverage impact</button>
      {preview && <div className="card"><h3>Impact preview</h3><p>{preview.summary?.vendor} · {preview.summary?.window?.from} to {preview.summary?.window?.to}</p><p>{preview.summary?.worsenedCells} coverage cells worsened · {preview.summary?.peopleLosingCoverage} people losing coverage</p>
        {(preview.summary?.worsened || []).length > 0 && <ul>{preview.summary.worsened.map((row, i) => <li key={`${row.day}-${row.meal}-${row.diet}-${i}`}>{row.day} {row.meal}: {row.diet} · {row.gap} ({row.headcount} people)</li>)}</ul>}
        <button className="primary" disabled={busy || interruptForm.reason.trim().length < 5 || !(user.role === 'festival_director' || preview.committers?.includes(user.role))} onClick={() => setConfirmInterrupt(true)}>Review interruption</button>
      </div>}
    </section>}

    {selectedId && <section className="card"><div className="row between"><h2>Compliance · {selectedId}</h2><button className="ghost" onClick={() => { setSelectedId(''); setCompliance(null); }}>Close</button></div>
      {!compliance ? <LoadingState/> : <><p>Certificate: <b>{compliance.certificateStatus}</b>{compliance.certExpiry ? ` · valid through ${dateOnly(compliance.certExpiry)}` : ''}</p><p>Vendor status: {compliance.active ? 'Active' : 'Paused'} · Active or upcoming interruptions: {compliance.interruptions?.length || 0}</p>
        {compliance.menuConflicts?.length > 0 && <div className="warning"><b>Menu data needs review</b><ul>{compliance.menuConflicts.map((conflict, i) => <li key={i}>{conflict}</li>)}</ul></div>}
        <h3>Coverage provided</h3>{compliance.coverage?.length ? <ul>{compliance.coverage.map((row, i) => <li key={`${row.day}-${row.meal}-${row.diet}-${i}`}>{row.day} · {row.meal} · {row.diet}: {row.assignedCapacity} assigned for {row.headcount} ({row.covered ? 'covered' : 'short'})</li>)}</ul> : <p className="muted">This vendor is not currently assigned in the coverage forecast.</p>}
      </>}
    </section>}

    {canManage && <section className="card"><h2>Meal service log</h2><form className="form-grid" onSubmit={logMeal}>
      <label className="form-field">Vendor<select required value={mealForm.vendorId} onChange={(e) => setMealForm({ ...mealForm, vendorId: e.target.value })}>{vendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorId} · {v.name}</option>)}</select></label>
      <label className="form-field">Date<input required type="date" value={mealForm.date} onChange={(e) => setMealForm({ ...mealForm, date: e.target.value })}/></label>
      <label className="form-field">Meal<select value={mealForm.meal} onChange={(e) => setMealForm({ ...mealForm, meal: e.target.value })}>{['breakfast','lunch','dinner'].map((meal) => <option key={meal}>{meal}</option>)}</select></label>
      <label className="form-field">Servings delivered<input required type="number" min="0" step="1" value={mealForm.served} onChange={(e) => setMealForm({ ...mealForm, served: e.target.value })}/></label>
      <div><button className="primary" disabled={busy || !vendors.length}>Save meal log</button></div>
    </form></section>}

    <section className="card"><h2>Vendor interruption history</h2>{incidents.length ? <div className="table-scroll"><table><thead><tr><th>Vendor</th><th>Start</th><th>End</th><th>Reason</th></tr></thead><tbody>{incidents.map((incident) => <tr key={incident._id}><td>{incident.vendorId}</td><td>{timeLabel(incident.start)}</td><td>{timeLabel(incident.end)}</td><td>{incident.reason}</td></tr>)}</tbody></table></div> : <EmptyState>No vendor interruptions recorded.</EmptyState>}</section>

    <ConfirmDialog open={confirmInterrupt} title="Commit vendor interruption" busy={busy} onCancel={() => setConfirmInterrupt(false)} onConfirm={commitInterruption} confirmLabel="Commit interruption">
      <p>Vendor: <b>{preview?.summary?.vendor}</b></p><p>Coverage impact: <b>{preview?.summary?.worsenedCells ?? 0} cells worsened</b>.</p><p>Reason: {interruptForm.reason}</p><p className="muted">This records an interruption for the selected window and affects vendor coverage calculations.</p>
    </ConfirmDialog>
  </div>;
}
