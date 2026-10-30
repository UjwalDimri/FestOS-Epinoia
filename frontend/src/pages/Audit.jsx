import React, { useEffect, useState } from 'react';
import { auditService } from '../services/index.js';
import { EmptyState, ErrorState, LoadingState, Pagination } from '../components/Shared.jsx';

const PAGE_SIZE=25;
export default function Audit(){
 const [rows,setRows]=useState(null),[verify,setVerify]=useState(null),[errors,setErrors]=useState({}),[loading,setLoading]=useState(true),[page,setPage]=useState(1);
 async function load(){setLoading(true);setErrors({});const result=await Promise.allSettled([auditService.list(500),auditService.verify()]);if(result[0].status==='fulfilled')setRows(result[0].value.rows||[]);else setErrors(v=>({...v,rows:result[0].reason.message}));if(result[1].status==='fulfilled')setVerify(result[1].value);else setErrors(v=>({...v,verify:result[1].reason.message}));setLoading(false);}
 useEffect(()=>{load();},[]);
 const start=(page-1)*PAGE_SIZE;
 return <>
  <section className="card"><h2>Audit verification response</h2><p className="muted">Exact JSON returned by <code>GET /audit/verify</code>.</p>{errors.verify?<ErrorState error={errors.verify} retry={load}/>:loading&&!verify?<LoadingState/>:verify?<pre aria-label="Audit verification response">{JSON.stringify(verify,null,2)}</pre>:<EmptyState>Verification result unavailable.</EmptyState>}</section>
  <section className="card"><h2>Audit trail</h2><p className="muted">The API supports `limit`; it does not support actor, risk, entity or date filters. Showing the most recent {rows?.length??'…'} entries returned (maximum 500).</p>{errors.rows?<ErrorState error={errors.rows} retry={load}/>:loading&&!rows?<LoadingState/>:rows?.length?<><div className="table-scroll"><table><thead><tr><th>#</th><th>When (IST)</th><th>Who</th><th>Action / entity</th><th>Risk</th><th>Reason</th></tr></thead><tbody>{rows.slice(start,start+PAGE_SIZE).map(r=><tr key={r.seq}><td>{r.seq}</td><td>{r.at?new Date(new Date(r.at).getTime()+19800000).toISOString().slice(0,16).replace('T',' '):'Unavailable'}</td><td>{r.actor?.email||'Unavailable'}<div className="muted">{r.actor?.role||'Unavailable'}</div></td><td>{r.action||'Unavailable'}<div className="muted">{r.entity?.type||'Unavailable'} · {r.entity?.id||'Unavailable'}</div></td><td>{r.risk||'Unavailable'}</td><td>{r.reason||'—'}</td></tr>)}</tbody></table></div><Pagination page={page} total={rows.length} limit={PAGE_SIZE} onChange={setPage}/></>:<EmptyState>No audit records returned.</EmptyState>}</section>
 </>;
}
