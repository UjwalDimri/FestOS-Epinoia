import React, { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/index.js';
import { LoadingState, ErrorState } from '../components/Shared.jsx';
export default function Dashboard() {
 const [d,setD]=useState(null),[err,setErr]=useState(''),[busy,setBusy]=useState(false),[updated,setUpdated]=useState(null);
 const load=useCallback(async()=>{setBusy(true);try{const result=await dashboardService.dashboard();setD(result);setErr('');setUpdated(new Date());}catch(e){setErr(e.message);}finally{setBusy(false);}},[]);
 useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer);},[load]);
 async function ack(key){try{await dashboardService.acknowledge(key);await load();}catch(e){setErr(e.message);}}
 if(!d&&busy)return <LoadingState/>;
 if(!d&&err)return <ErrorState error={err} retry={load}/>;
 if(!d)return <LoadingState/>;
 const metrics=d.accommodation?.metrics||{}; const value=(obj,key)=>obj?.[key]??'Unavailable';
 return <>
  {err&&<ErrorState error={`Refresh failed: ${err}`} retry={load}/>}<p className="muted">{busy?'Refreshing… ':''}Last updated: {updated?.toLocaleTimeString()||'Unavailable'}</p>
  <div className="card row">{[[value(d.counts,'people'),'People (incl. escorts)'],[value(metrics,'placed'),'Placed in a bed'],[value(metrics,'unplaced'),'Still unplaced'],[metrics.externalCostINR==null?'Unavailable':`₹${Math.round(metrics.externalCostINR).toLocaleString('en-IN')}`,`External spend (budget ${metrics.budgetINR==null?'unavailable':`₹${metrics.budgetINR.toLocaleString('en-IN')}`})`],[value(d.schedule?.metrics,'participantClashes'),'Participant clashes'],[value(d.counts,'dataIssuesOpen'),'Open data issues']].map(([n,l])=><Stat key={l} n={n} l={l}/>)}</div>
  <div className="card"><h3>Alerts ({Array.isArray(d.alerts)?d.alerts.length:'Unavailable'})</h3>{!d.alerts&&<p className="muted">Alerts unavailable.</p>}{d.alerts?.length===0&&<p>No open alerts.</p>}<table><tbody>{d.alerts?.map(a=><tr key={a.key}><td className={`sev-${a.severity}`}>{a.severity}{a.escalated?' ⇧':''}</td><td>{a.title}<div className="muted">{a.detail} {a.suggestedAction&&`→ ${a.suggestedAction}`}</div></td><td>{a.ownerRole}</td><td>{a.status==='acknowledged'?'Acknowledged':<button className="ghost" onClick={()=>ack(a.key)}>Acknowledge</button>}</td></tr>)}</tbody></table></div>
  {d.accommodation&&<div className="card"><h3>Bed shortfall by night</h3><table><thead><tr><th>Night (IST)</th><th>Need</th><th>Beds</th><th>Short</th></tr></thead><tbody>{(metrics.perNight||[]).map(n=><tr key={n.night}><td>{n.night}</td><td>{n.demand??'Unavailable'}</td><td>{n.capacity??'Unavailable'}</td><td>{n.shortfall??'Unavailable'}</td></tr>)}</tbody></table></div>}
 </>;
}
const Stat=({n,l})=><div className="stat"><div className="n">{n}</div><div className="l">{l}</div></div>;
