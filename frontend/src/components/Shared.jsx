import React from 'react';
import { DEMO_MODE } from '../api.js';
import Icon from './Icon.jsx';
export function PageHeader({ title, description, breadcrumbs = [], actions, primaryAction, secondaryActions = [] }) {
  const actionNodes = actions ?? <>{secondaryActions}{primaryAction}</>;
  const hasActions=Boolean(actions||primaryAction||secondaryActions.length);
  return <header className="page-header">{breadcrumbs.length>0&&<nav aria-label={`${title} breadcrumb`} className="page-header-crumbs">{breadcrumbs.map((crumb,index)=><React.Fragment key={`${crumb.label}-${index}`}>{index>0&&<span aria-hidden="true">/</span>}<span>{crumb.label}</span></React.Fragment>)}</nav>}<div className="page-header-row"><div><h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{hasActions&&<div className="page-header-actions">{actionNodes}</div>}</div></header>;
}
const BADGE_TONES = new Set(['success','warning','danger','info','neutral','unknown']);
export function StatusBadge({ children, tone = 'info', label }) { const safeTone=BADGE_TONES.has(tone)?tone:'unknown';return <span className={`badge badge-${safeTone}`} data-tone={safeTone} aria-label={label||String(children)}>{children}</span>; }
export function MetricCard({ label, value }) { return <div className="card stat"><div className="n">{value ?? 'Unavailable'}</div><div className="l">{label}</div></div>; }
export function EmptyState({ children = 'No records to show.', description, action }) { return <div className="empty-state" role="status"><span className="empty-state-mark" aria-hidden="true">—</span><strong>{children}</strong>{description&&<p>{description}</p>}{action&&(React.isValidElement(action)?action:<button className="ghost" type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>)}</div>; }
export function LoadingState() { return <p className="loading-state" role="status" aria-live="polite"><span className="loading-dots" aria-hidden="true"><i/><i/><i/></span><span>Loading…</span></p>; }
export function LoadingSkeleton({ rows = 3, columns = 4, label = 'Loading records' }) { return <div className="loading-skeleton" role="status" aria-label={label}>{Array.from({length:rows},(_,row)=><div className="skeleton-row" key={row}>{Array.from({length:columns},(_,column)=><span key={column}/>)}</div>)}</div>; }
export function ErrorState({ error, retry, retryLabel = 'Retry' }) { return <div className="err error-state" role="alert"><span className="error-state-mark" aria-hidden="true">!</span><span className="error-message">{error}</span>{retry&&<button className="ghost" type="button" onClick={retry}>{retryLabel}</button>}</div>; }
export function WarningBanner({ children }) { return <div className="warning" role="status">{children}</div>; }
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="err" role="alert">This page could not be displayed. Reload the page to try again.</div> : this.props.children; }
}
export function DemoBanner() { return DEMO_MODE ? <div className="demo-banner" role="status">DEMO DATA, not persisted</div> : null; }
function valueAtPath(row,path){return String(path||'').split('.').reduce((value,key)=>value?.[key],row);}
function compareValues(a,b){if(a==null)return b==null?0:-1;if(b==null)return 1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});}
export function DataTable({ columns, headers, rows = [], empty = 'No records to show.', emptyDescription, loading = false, error, retry, onRowClick, rowKey, caption, sortable = true }) {
 const [sort,setSort]=React.useState({key:null,direction:'asc'});
 const normalizedColumns=(columns||headers||[]).map((column,index)=>Array.isArray(column)?{key:column[0],label:column[1]}:typeof column==='string'?{key:column,label:column}:{...column,key:column.key||column.accessor||String(index)});
 const sortedRows=React.useMemo(()=>{if(!sort.key)return rows;return [...rows].sort((a,b)=>compareValues(valueAtPath(a,sort.key),valueAtPath(b,sort.key))*(sort.direction==='asc'?1:-1));},[rows,sort]);
 const setSortFor=(column)=>setSort((current)=>current.key===column.key?{key:column.key,direction:current.direction==='asc'?'desc':'asc'}:{key:column.key,direction:'asc'});
 if(error)return <ErrorState error={error} retry={retry}/>;
 if(loading)return <LoadingSkeleton rows={4} columns={Math.max(1,normalizedColumns.length||4)}/>;
 if(!rows.length)return <EmptyState description={emptyDescription}>{empty}</EmptyState>;
 return <div className="table-scroll"><table aria-busy="false">{caption&&<caption>{caption}</caption>}<thead><tr>{normalizedColumns.map((column)=><th key={column.key} scope="col" aria-sort={sort.key===column.key?(sort.direction==='asc'?'ascending':'descending'):undefined}>{sortable&&column.sortable!==false&&column.key?<button className="table-sort" type="button" onClick={()=>setSortFor(column)}>{column.label||column.key}<span aria-hidden="true">{sort.key===column.key?(sort.direction==='asc'?'↑':'↓'):'↕'}</span></button>:column.label||column.key}</th>)}</tr></thead><tbody>{sortedRows.map((row,index)=>{const id=typeof rowKey==='function'?rowKey(row):valueAtPath(row,rowKey||'id')??row._id??row.eventId??row.participantId??index;return <tr key={id} className={onRowClick?'table-row-clickable':undefined} tabIndex={onRowClick?0:undefined} onClick={onRowClick?()=>onRowClick(row):undefined} onKeyDown={onRowClick?(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onRowClick(row);}}:undefined}>{normalizedColumns.map((column)=>{const value=column.render?column.render(row):valueAtPath(row,column.key);return <td key={column.key}>{value==null||value===''?'—':typeof value==='boolean'?String(value):value}</td>;})}</tr>;})}</tbody></table></div>;
}
export function FilterBar({ children, onSubmit, className = '' }) { return <form className={`filter-bar filter-bar-shared ${className}`} onSubmit={onSubmit||((event)=>event.preventDefault())}>{children}</form>; }
export function FormField({ label, children, hint, description, required = false, error, id }) {
 const generatedId=React.useId();const controlId=id||generatedId;const helpId=`${controlId}-help`,errorId=`${controlId}-error`;
 const control=React.isValidElement(children)?React.cloneElement(children,{id:children.props.id||controlId,required:required||children.props.required,'aria-invalid':error?true:children.props['aria-invalid'],...(hint||description||error?{'aria-describedby':[children.props['aria-describedby'],hint||description?helpId:null,error?errorId:null].filter(Boolean).join(' ')}:{})}):children;
 return <div className="form-field"><label className="form-label" htmlFor={controlId}>{label}{required&&<span className="required-mark" aria-label="required"> *</span>}</label>{control}{(hint||description)&&<small className="muted" id={helpId}>{hint||description}</small>}{error&&<small className="field-error" id={errorId}>{error}</small>}</div>;
}
export function PermissionGate({ allowed, children, fallback = 'Your role cannot access this page.' }) { return allowed?children:<section className="permission-denied"><ErrorState error={fallback}/></section>; }
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
  return <div className="dialog-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="card dialog"><h2 id="dialog-title">{title}</h2><div>{children}</div><div className="row"><button className="ghost" onClick={onCancel} disabled={busy}>Cancel</button><button className="primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>{busy ? <><span className="button-loader" aria-hidden="true"/>Working…</> : confirmLabel}</button></div></section></div>;
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
export function DetailPanel({ title, children, onClose, labelledBy = 'detail-panel-title', side = 'right' }) {
 const ref=React.useRef(null),closeRef=React.useRef(onClose);closeRef.current=onClose;
 React.useEffect(()=>{const previous=document.activeElement;const focusables=()=>[...(ref.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[])];const onKey=(event)=>{if(event.key==='Escape'){closeRef.current?.();return;}if(event.key==='Tab'){const items=focusables();if(!items.length)return;const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.addEventListener('keydown',onKey);requestAnimationFrame(()=>ref.current?.querySelector('button:not([disabled])')?.focus());return()=>{document.removeEventListener('keydown',onKey);previous?.focus?.();};},[]);
 return <div className="detail-panel-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose?.();}}><aside ref={ref} className={`detail-panel detail-panel-${side}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}><header><h2 id={labelledBy}>{title}</h2><button className="ghost" type="button" aria-label="Close details" onClick={onClose}><Icon name="close" size={16}/></button></header><div className="detail-panel-content">{children}</div></aside></div>;
}
export function Toast({ message, tone = 'success' }) { return message ? <div className={`toast toast-${tone}`} role="status" aria-live="polite">{message}</div> : null; }
