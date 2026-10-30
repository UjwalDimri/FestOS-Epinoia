import React, { useEffect, useState } from 'react';
import { merchandiseService } from '../services/index.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Shared.jsx';

const sizesFrom = (text) => text.split(',').map((part) => {
  const [size, quantity] = part.split(':');
  return { size: size?.trim() || '-', quantity: Number(quantity?.trim()) };
}).filter((row) => row.size && Number.isInteger(row.quantity));

export default function Merchandise({ user }) {
  const [catalogue, setCatalogue] = useState([]), [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
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
  async function returnItem(issueRow) {
    const reason = window.prompt('Return reason (at least 5 characters):', 'Unused item returned to stock');
    if (!reason) return;
    setError(''); setMessage('');
    try { await merchandiseService.return({ issueId: issueRow._id, reason }); setMessage(`Return recorded for ${issueRow.participantName}.`); await load(); }
    catch (err) { setError(err.message); }
  }
  return <>
    <p className="muted">Manage merchandise catalogue and size stock, verify eligibility, and track each issue and return. T-shirts are for registered participants; configure other items as needed.</p>
    {message && <p className="toast" role="status">{message}</p>}{error && <ErrorState error={error} retry={load}/>}
    {canIssue && <section className="card"><h2>Issue merchandise</h2><form className="form-grid" onSubmit={issue}>
      <label className="form-field">Participant ID<input required value={issueForm.participantId} onChange={(e) => setIssueForm({ ...issueForm, participantId: e.target.value })}/></label>
      <label className="form-field">Item<select required value={issueForm.item} onChange={(e) => setIssueForm({ ...issueForm, item: e.target.value, size: '-' })}>{catalogue.map((entry) => <option key={entry.item} value={entry.item}>{entry.name}</option>)}</select></label>
      <label className="form-field">Size<select value={issueForm.size} onChange={(e) => setIssueForm({ ...issueForm, size: e.target.value })}>{(selected?.sizes?.length ? selected.sizes : ['-']).map((size) => <option key={size} value={size}>{size === '-' ? 'One size' : size}</option>)}</select></label>
      <div><button className="primary" disabled={loading || !catalogue.length}>Record issue</button></div>
    </form><p className="muted">Eligibility: {selected?.eligibility === 'everyone' ? 'any active contingent member' : 'registered participants only'}. Duplicate issues are blocked.</p></section>}
    {canManage && <section className="card"><h2>Catalogue and stock</h2><form onSubmit={save}>
      <div className="form-grid"><label className="form-field">Item key<input required value={catalogForm.item} onChange={(e) => setCatalogForm({ ...catalogForm, item: e.target.value })} placeholder="T-shirt"/></label>
        <label className="form-field">Display name<input required value={catalogForm.name} onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })} placeholder="FestOS T-shirt"/></label>
        <label className="form-field">Eligibility<select value={catalogForm.eligibility} onChange={(e) => setCatalogForm({ ...catalogForm, eligibility: e.target.value })}><option value="participants">Registered participants</option><option value="everyone">All active contingent members</option></select></label>
        <label className="form-field">Size stock<input required value={catalogForm.sizes} onChange={(e) => setCatalogForm({ ...catalogForm, sizes: e.target.value })} placeholder="S:10,M:20,L:20 or -:100"/><small>Comma separated size:quantity pairs. Updating a size replaces its total stock.</small></label>
        <label className="form-field">Description<input value={catalogForm.description} onChange={(e) => setCatalogForm({ ...catalogForm, description: e.target.value })}/></label></div>
      <button className="primary" disabled={loading}>Save catalogue and stock</button>
    </form></section>}
    <section className="card"><h2>Catalogue and available stock</h2>{loading ? <LoadingState/> : catalogue.length ? <div className="table-scroll"><table><thead><tr><th>Item</th><th>Eligibility</th><th>Size</th><th>Total</th><th>Reserved</th><th>Issued</th><th>Available</th></tr></thead><tbody>{catalogue.flatMap((entry) => (entry.stock?.length ? entry.stock : [{ size: '—' }]).map((stock) => <tr key={`${entry.item}-${stock.size}`}><td>{entry.name}<div className="muted">{entry.description}</div></td><td>{entry.eligibility}</td><td>{stock.size}</td><td>{stock.quantity ?? '—'}</td><td>{stock.reserved ?? '—'}</td><td>{stock.issued ?? '—'}</td><td>{stock.remaining ?? '—'}</td></tr>))}</tbody></table></div> : <EmptyState>No merchandise catalogue entries or stock lines.</EmptyState>}</section>
    <section className="card"><h2>Issue and return history</h2>{loading ? <LoadingState/> : issues.length ? <div className="table-scroll"><table><thead><tr><th>Participant</th><th>Item</th><th>Size</th><th>Kind</th><th>Issued</th><th>Status</th><th>Returned</th><th /></tr></thead><tbody>{issues.map((row) => <tr key={row._id}><td>{row.participantName}<div className="muted">{row.participantId}</div></td><td>{row.item}</td><td>{row.size}</td><td>{row.kind}</td><td>{row.issuedAt ? new Date(row.issuedAt).toLocaleString() : '—'}</td><td>{row.status}</td><td>{row.returnedAt ? new Date(row.returnedAt).toLocaleString() : '—'}</td><td>{!row.returnedAt && canManage && <button className="ghost" onClick={() => returnItem(row)}>Record return</button>}</td></tr>)}</tbody></table></div> : <EmptyState>No merchandise issues recorded.</EmptyState>}</section>
  </>;
}
