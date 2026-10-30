import React, { useEffect, useMemo, useState } from 'react';
import { DEMO_MODE } from '../api.js';
import { disruptionsService } from '../services/index.js';
import { ConfirmDialog, EmptyState, ErrorState, FormField, LoadingState, Toast } from '../components/Shared.jsx';

const DEFAULTS = {
 hostel_closure:{roomId:'B1-0-01'}, late_contingent:{contingentId:'C05',newArrival:'2026-10-31 18:00'}, duplicate_record:{keepId:'P0119',dropId:'P_DUP02'},
 equipment_failure:{item:'projector',qty:1}, venue_change:{venueId:'V04',from:'2026-10-31 14:00',to:'2026-10-31 20:00'}, vendor_shutdown:{vendorId:'VND02'},
 duplicate_merch_claim:{participantId:'P0001',item:'T-shirt'}, constraint_change:{constraintId:'ACC_MAX_DISTANCE',enabled:true,params:{maxKm:1}},
};
const title = (s) => String(s).replace(/_/g,' ').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
const flatten = (value, prefix='') => Object.entries(value || {}).flatMap(([k,v]) => { const key=prefix?`${prefix} · ${title(k)}`:title(k); return v && typeof v==='object' && !Array.isArray(v) ? flatten(v,key) : [[key,Array.isArray(v)?v.join(', '):String(v??'Unavailable')]]; });

export default function Disruptions({ user }) {
 const [types,setTypes]=useState([]),[history,setHistory]=useState([]),[type,setType]=useState(''),[form,setForm]=useState({}),[advanced,setAdvanced]=useState(false),[json,setJson]=useState('{}');
 const [preview,setPreview]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(''),[confirm,setConfirm]=useState(false),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 const defaults=DEFAULTS[type]||{};
 const load=async()=>{setErr('');try{const data=await disruptionsService.list();setTypes(data.types||[]);setHistory(data.recent||[]);if(!type&&data.types?.length){setType(data.types[0]);setForm(DEFAULTS[data.types[0]]||{});setJson(JSON.stringify(DEFAULTS[data.types[0]]||{},null,2));}}catch(e){setErr(e.message);}};
 useEffect(()=>{load();},[]);
 const commitAllowed=Boolean(preview&&(user.role==='festival_director'||preview.committers?.includes(user.role)));
 const payload=useMemo(()=>{if(advanced){try{return JSON.parse(json);}catch{return null;}}const out={...form};if(type==='constraint_change')out.params=defaults.params||{maxKm:1};return out;},[advanced,json,form,type,defaults.params]);
 function selectType(next){setType(next);const initial=DEFAULTS[next]||{};setForm(initial);setJson(JSON.stringify(initial,null,2));setPreview(null);setReason('');setErr('');setMsg('');}
 function updateField(key,value){setForm((old)=>({...old,[key]:value}));setPreview(null);setMsg('');setErr('');}
 function updateJson(value){setJson(value);setPreview(null);setMsg('');setErr('');}
 function validate(){if(!payload||typeof payload!=='object'||Array.isArray(payload))return 'Parameters must be a JSON object.';const missing=Object.keys(defaults).filter(k=>k!=='params'&&(payload[k]===undefined||payload[k]===''));if(missing.length)return `Required fields: ${missing.join(', ')}.`;if(type==='equipment_failure'&&!(Number(payload.qty)>0))return 'Quantity must be greater than zero.';if(type==='constraint_change'&&typeof payload.enabled!=='boolean')return 'Enabled must be true or false.';return '';}
 async function previewImpact(){const invalid=validate();if(invalid){setErr(invalid);return;}setBusy('preview');setErr('');setMsg('');try{setPreview(await disruptionsService.preview(type,payload));}catch(e){setErr(e.message);}finally{setBusy('');}}
 async function commit(){if(!reason.trim()||reason.trim().length<5){setErr('Enter a reason with at least 5 characters.');return;}setBusy('commit');setErr('');try{const result=await disruptionsService.commit(preview.disruptionId,reason.trim());const response=result.result||result;const merchDuplicate=preview.type==='duplicate_merch_claim'&&typeof response.blocked==='boolean';setMsg(response.blocked?`Commit blocked: existing claim retained${response.original?` (${JSON.stringify(response.original)})`:''}.`:merchDuplicate?'No prior claim exists, so there was nothing to block. No merch item was issued.':DEMO_MODE?'Demo commit recorded in this session; no data persisted.':`Committed successfully${result.replannedSchedule?`. Schedule re-planned as ${result.replannedSchedule}`:''}.`);setPreview(null);setConfirm(false);setReason('');await load();}catch(e){setErr(e.message);}finally{setBusy('');}}
 return <>
  {err&&<ErrorState error={err} retry={!types.length?load:undefined}/>}<Toast message={msg}/>
  <section className="card"><h2>Inject a disruption</h2><p className="muted">Preview the backend-reported impact. No change is committed until confirmed with a reason.</p>
   {!types.length&&!err?<LoadingState/>:<div className="row"><FormField label="Disruption type"><select value={type} disabled={!!busy} onChange={e=>selectType(e.target.value)}>{types.map(t=><option key={t} value={t}>{title(t)}</option>)}</select></FormField><button className="ghost" disabled={!!busy} onClick={()=>setAdvanced(v=>!v)}>{advanced?'Use form fields':'Advanced JSON'}</button></div>}
   {type&&<div className="form-grid">{advanced?<FormField label="Parameters (JSON)"><textarea aria-label="Parameters JSON" disabled={!!busy} value={json} onChange={e=>updateJson(e.target.value)}/></FormField>:Object.entries(form).filter(([k])=>k!=='params').map(([key,value])=><FormField key={key} label={title(key)}><input disabled={!!busy} type={typeof value==='number'?'number':typeof value==='boolean'?'checkbox':'text'} checked={typeof value==='boolean'?value:undefined} value={typeof value==='boolean'?undefined:value??''} onChange={e=>updateField(key,typeof value==='boolean'?e.target.checked:typeof value==='number'?Number(e.target.value):e.target.value)}/></FormField>)}</div>}
   {type==='constraint_change'&&!advanced&&<p className="muted">Constraint parameters: {JSON.stringify(defaults.params||{})}. Edit these in Advanced JSON.</p>}
   <button className="primary" disabled={!type||!!busy} onClick={previewImpact}>{busy==='preview'?'Previewing…':'Preview impact'}</button>
  </section>
  {preview&&<section className="card"><h2>Impact preview · {title(preview.type)} · risk {preview.risk||'unavailable'}</h2><div className="impact-grid">{flatten(preview.summary).map(([k,v])=><div className="impact-item" key={k}><b>{k}</b><span>{v}</span></div>)}</div>{preview.explanation&&<p>{preview.explanation}</p>}
   {!commitAllowed&&<p className="warning">Your role ({user.role}) is not listed in the backend preview committers. Only the Festival Director can commit for this preview.</p>}
   <FormField label="Reason for committing (at least 5 characters)"><input disabled={!!busy} value={reason} onChange={e=>setReason(e.target.value)} minLength={5}/></FormField>
   <button className="primary" disabled={!commitAllowed||!!busy||reason.trim().length<5} onClick={()=>setConfirm(true)}>Review and commit</button>
   <p className="muted">Allowed roles: {[...(preview.committers||[]),'festival_director'].filter((x,i,a)=>a.indexOf(x)===i).join(', ')||'festival_director'}.</p>
  </section>}
  <section className="card"><h2>Recent disruptions</h2>{history.length?<div className="table-scroll"><table><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Reason</th></tr></thead><tbody>{history.map(h=><tr key={h.disruptionId}><td>{h.disruptionId}</td><td>{title(h.type)}</td><td>{h.status}</td><td>{h.reason||'—'}</td></tr>)}</tbody></table></div>:<EmptyState>No disruption history.</EmptyState>}</section>
  <ConfirmDialog open={confirm} title="Confirm disruption commit" busy={busy==='commit'} onCancel={()=>setConfirm(false)} onConfirm={commit} confirmLabel="Commit change"><p>Type: <b>{title(preview?.type)}</b></p><p>Risk: <b>{preview?.risk||'unavailable'}</b></p><p>Reason: {reason}</p><p className="muted">This submits the preview id to the backend. The backend decides whether the change can be applied.</p></ConfirmDialog>
 </>;
}
