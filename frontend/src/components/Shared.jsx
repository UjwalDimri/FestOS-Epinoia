import React from 'react';
import { DEMO_MODE } from '../api.js';
export function PageHeader({ title, description }) { return <div className="page-header"><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>; }
export function StatusBadge({ children, tone = 'info' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function MetricCard({ label, value }) { return <div className="card stat"><div className="n">{value ?? 'Unavailable'}</div><div className="l">{label}</div></div>; }
export function EmptyState({ children = 'No records to show.' }) { return <p className="muted" role="status">{children}</p>; }
export function LoadingState() { return <p className="muted" role="status" aria-live="polite">Loading…</p>; }
export function ErrorState({ error, retry }) { return <div className="err" role="alert">{error}{retry && <button className="ghost" onClick={retry}>Retry</button>}</div>; }
export function WarningBanner({ children }) { return <div className="warning" role="status">{children}</div>; }
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="err" role="alert">This page could not be displayed. Reload the page to try again.</div> : this.props.children; }
}
export function DemoBanner() { return DEMO_MODE ? <div className="demo-banner" role="status">DEMO DATA, not persisted</div> : null; }
export function DataTable({ headers, rows, empty = 'No records to show.' }) { return rows?.length ? <div className="table-scroll"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div> : <EmptyState>{empty}</EmptyState>; }
export function FormField({ label, children, hint }) { return <label className="form-field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>; }
export function Pagination({ page, total, limit, onChange }) { const pages = Math.max(1, Math.ceil((total || 0) / limit)); return <div className="row"><button className="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button><span className="muted">Page {page} of {pages}</span><button className="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div>; }
export function ConfirmDialog({ open, title, children, onCancel, onConfirm, busy = false, confirmLabel = 'Confirm' }) {
  const ref = React.useRef(null);
  const cancelRef = React.useRef(onCancel);
  const busyRef = React.useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const focusables = () => [...(ref.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])') || [])];
    const onKey = (event) => {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current();
      if (event.key === 'Tab') { const list = focusables(); if (!list.length) return; const first = list[0], last = list[list.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', onKey); requestAnimationFrame(() => focusables()[0]?.focus());
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return <div className="dialog-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="card dialog"><h2 id="dialog-title">{title}</h2><div>{children}</div><div className="row"><button className="ghost" onClick={onCancel} disabled={busy}>Cancel</button><button className="primary" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button></div></section></div>;
}
export function AccessibleDialog({ title, children, onClose, labelledBy = 'accessible-dialog-title' }) {
  const ref = React.useRef(null), closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const previous = document.activeElement;
    const focusables = () => [...(ref.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])') || [])];
    const onKey = (event) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') { const list=focusables(); if(!list.length)return; const first=list[0],last=list[list.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();} else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();} }
    };
    document.addEventListener('keydown',onKey);requestAnimationFrame(()=>focusables()[0]?.focus());
    return()=>{document.removeEventListener('keydown',onKey);previous?.focus?.();};
  },[]);
  return <div className="dialog-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="card dialog"><h2 id={labelledBy}>{title}</h2>{children}</section></div>;
}
export function Toast({ message, tone = 'success' }) { return message ? <div className={`toast toast-${tone}`} role="status" aria-live="polite">{message}</div> : null; }
