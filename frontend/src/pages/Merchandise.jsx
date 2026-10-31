import React, { useEffect, useState } from 'react';
import { merchandiseService } from '../services/index.js';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/Shared.jsx';

const sizesFrom = (text) => text.split(',').map((part) => {
  const [size, quantity] = part.split(':');
  return { size: size?.trim() || '-', quantity: Number(quantity?.trim()) };
}).filter((row) => row.size && Number.isInteger(row.quantity));

export default function Merchandise({ user }) {
  const [catalogue, setCatalogue] = useState([]), [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState(''), [returnTarget, setReturnTarget] = useState(null), [returnReason, setReturnReason] = useState(''), [busy, setBusy] = useState(false);
  const [issueForm, setIssueForm] = useState({ participantId: '', item: '', size: '-' });
  const [catalogForm, setCatalogForm] = useState({ item: '', name: '', eligibility: 'participants', sizes: 'S:0,M:0,L:0', description: '' });
  const canManage = user?.role === 'festival_director' || user?.role === 'merchandise_desk';
  const canIssue = canManage;
  async function load() {
    setLoading(true); setError('');
    try {
      const [catalog, history] = await Promise.all([merchandiseService.catalogue(), merchandiseService.issues()]);
      setCatalogue(catalog.catalogue || []); setIssues(history.issues || []);
      if (!issueForm.item && catalog.catalogue?.length) setIssueForm((current) => ({ ...current, item: catalog.catalogue[0].item }));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const selected = catalogue.find((entry) => entry.item === issueForm.item);
  async function issue(e) {
    e.preventDefault(); setMessage(''); setError('');
    try { await merchandiseService.issue(issueForm); setMessage(`Issued ${selected?.name || issueForm.item} to ${issueForm.participantId}.`); setIssueForm((current) => ({ ...current, participantId: '' })); await load(); }
    catch (err) { setError(err.message); }
  }
  async function save(e) {
    e.preventDefault(); setMessage(''); setError('');
    const stocks = sizesFrom(catalogForm.sizes);
    if (!stocks.length) { setError('Enter stock as size:quantity, for example S:10,M:20 or -:100.'); return; }
    try { await merchandiseService.save({ ...catalogForm, stocks }); setMessage(`${catalogForm.name || catalogForm.item} catalogue and stock saved.`); setCatalogForm({ item: '', name: '', eligibility: 'participants', sizes: 'S:0,M:0,L:0', description: '' }); await load(); }
    catch (err) { setError(err.message); }
  }
  async function returnItem() {
    if (!returnTarget || returnReason.trim().length < 5) return;
    setBusy(true); setError(''); setMessage('');
    try { await merchandiseService.return({ issueId: returnTarget._id, reason: returnReason.trim() }); setMessage(`Return recorded for ${returnTarget.participantName}.`); setReturnTarget(null); setReturnReason(''); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="merchandise-page">
    {message && <p className="toast" role="status">{message}</p>}{error && <ErrorState error={error} retry={load}/>}
    {canIssue && <section className="card merchandise-action-card"><header className="section-heading merchandise-section-heading"><div><span className="eyebrow">PARTICIPANT SERVICE</span><h2>Issue merchandise</h2><p className="muted">Record an eligible participant issue. Duplicate issues are blocked by the service.</p></div></header><form className="form-grid" onSubmit={issue}>
      <label className="form-field">Participant ID<input required value={issueForm.participantId} onChange={(e) => setIssueForm({ ...issueForm, participantId: e.target.value })}/></label>
      <label className="form-field">Item<select required value={issueForm.item} onChange={(e) => setIssueForm({ ...issueForm, item: e.target.value, size: '-' })}>{catalogue.map((entry) => <option key={entry.item} value={entry.item}>{entry.name}</option>)}</select></label>
      <label className="form-field">Size<select value={issueForm.size} onChange={(e) => setIssueForm({ ...issueForm, size: e.target.value })}>{(selected?.sizes?.length ? selected.sizes : ['-']).map((size) => <option key={size} value={size}>{size === '-' ? 'One size' : size}</option>)}</select></label>
      <div><button className="primary" disabled={loading || !catalogue.length}>Record issue</button></div>
    </form><p className="muted">Eligibility: {selected?.eligibility === 'everyone' ? 'any active contingent member' : 'registered participants only'}. Duplicate issues are blocked.</p></section>}
    {canManage && <section className="card"><header className="section-heading merchandise-section-heading"><div><span className="eyebrow">CATALOGUE SETUP</span><h2>Catalogue and stock</h2><p className="muted">Stock updates replace the total for each specified size.</p></div></header><form onSubmit={save}>
      <div className="form-grid"><label className="form-field">Item key<input required value={catalogForm.item} onChange={(e) => setCatalogForm({ ...catalogForm, item: e.target.value })} placeholder="T-shirt"/></label>
        <label className="form-field">Display name<input required value={catalogForm.name} onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })} placeholder="FestOS T-shirt"/></label>
        <label className="form-field">Eligibility<select value={catalogForm.eligibility} onChange={(e) => setCatalogForm({ ...catalogForm, eligibility: e.target.value })}><option value="participants">Registered participants</option><option value="everyone">All active contingent members</option></select></label>
        <label className="form-field">Size stock<input required value={catalogForm.sizes} onChange={(e) => setCatalogForm({ ...catalogForm, sizes: e.target.value })} placeholder="S:10,M:20,L:20 or -:100"/><small>Comma separated size:quantity pairs. Updating a size replaces its total stock.</small></label>
        <label className="form-field">Description<input value={catalogForm.description} onChange={(e) => setCatalogForm({ ...catalogForm, description: e.target.value })}/></label></div>
      <button className="primary" disabled={loading}>Save catalogue and stock</button>
    </form></section>}
    <section className="card"><header className="section-heading merchandise-section-heading"><div><span className="eyebrow">STOCK POSITION</span><h2>Available stock</h2><p className="muted">Totals, reservations, and remaining items by size.</p></div></header>{loading ? <LoadingState/> : catalogue.length ? <div className="table-scroll"><table><thead><tr><th>Item</th><th>Eligibility</th><th>Size</th><th>Total</th><th>Reserved</th><th>Issued</th><th>Available</th></tr></thead><tbody>{catalogue.flatMap((entry) => (entry.stock?.length ? entry.stock : [{ size: '—' }]).map((stock) => <tr key={`${entry.item}-${stock.size}`}><td><strong>{entry.name}</strong><div className="muted">{entry.description}</div></td><td>{entry.eligibility}</td><td>{stock.size}</td><td>{stock.quantity ?? '—'}</td><td>{stock.reserved ?? '—'}</td><td>{stock.issued ?? '—'}</td><td>{stock.remaining == null ? '—' : <StatusBadge tone={Number(stock.remaining) > 0 ? 'success' : 'danger'}>{Number(stock.remaining).toLocaleString('en-IN')} available</StatusBadge>}</td></tr>))}</tbody></table></div> : <EmptyState>No merchandise catalogue entries or stock lines.</EmptyState>}</section>
    <section className="card"><header className="section-heading merchandise-section-heading"><div><span className="eyebrow">FULFILMENT</span><h2>Issue and return history</h2><p className="muted">Every issue and return remains associated with its participant record.</p></div></header>{loading ? <LoadingState/> : issues.length ? <div className="table-scroll"><table><thead><tr><th>Participant</th><th>Item</th><th>Size</th><th>Kind</th><th>Issued</th><th>Status</th><th>Returned</th><th>Action</th></tr></thead><tbody>{issues.map((row) => <tr key={row._id}><td><strong>{row.participantName}</strong><div className="muted">{row.participantId}</div></td><td>{row.item}</td><td>{row.size}</td><td>{row.kind}</td><td>{row.issuedAt ? new Date(row.issuedAt).toLocaleString() : '—'}</td><td><StatusBadge tone={row.returnedAt ? 'neutral' : 'info'}>{row.status}</StatusBadge></td><td>{row.returnedAt ? new Date(row.returnedAt).toLocaleString() : '—'}</td><td>{!row.returnedAt && canManage && <button type="button" className="ghost" onClick={() => { setReturnTarget(row); setReturnReason(''); }}>Record return</button>}</td></tr>)}</tbody></table></div> : <EmptyState>No merchandise issues recorded.</EmptyState>}</section>
    <ConfirmDialog open={Boolean(returnTarget)} title="Record merchandise return" busy={busy} confirmLabel="Record return" onCancel={() => setReturnTarget(null)} onConfirm={returnItem}><p><b>{returnTarget?.item}</b> · {returnTarget?.size} · {returnTarget?.participantName} ({returnTarget?.participantId})</p><p>This records the return against the original issue.</p><label className="form-field">Return reason (required, at least 5 characters)<textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} minLength={5}/></label></ConfirmDialog>
  </div>;
}
