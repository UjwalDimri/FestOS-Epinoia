import React, { useCallback, useEffect, useState } from 'react';
import { dashboardService } from '../services/index.js';
import { ErrorState, LoadingState } from '../components/Shared.jsx';

const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = (value) => hasNumber(value) ? Number(value) : 0;
const displayNumber = (value) => hasNumber(value) ? number(value).toLocaleString('en-IN') : 'Unavailable';
const money = (value) => hasNumber(value) ? `₹${Math.round(number(value)).toLocaleString('en-IN')}` : 'Unavailable';

export default function Dashboard({ user }) {
 const [data,setData]=useState(null),[alerts,setAlerts]=useState(null),[metricError,setMetricError]=useState(''),[alertError,setAlertError]=useState('');
 const [metricBusy,setMetricBusy]=useState(false),[alertBusy,setAlertBusy]=useState(false),[updated,setUpdated]=useState(null);
 const loadMetrics=useCallback(async()=>{setMetricBusy(true);try{const result=await dashboardService.dashboard();setData(result);setMetricError('');setUpdated(new Date());}catch(e){setMetricError(e.message);}finally{setMetricBusy(false);}},[]);
 const loadAlerts=useCallback(async()=>{setAlertBusy(true);try{const result=await dashboardService.alerts();setAlerts(result.alerts);setAlertError('');}catch(e){setAlertError(e.message);}finally{setAlertBusy(false);}},[]);
 const load=useCallback(()=>{loadMetrics();loadAlerts();},[loadMetrics,loadAlerts]);
 useEffect(()=>{load();const timer=setInterval(load,15000);return()=>clearInterval(timer);},[load]);
 async function ack(key){try{await dashboardService.acknowledge(key);await loadAlerts();}catch(e){setAlertError(e.message);}}
 const counts=data?.counts||{},metrics=data?.accommodation?.metrics||{},schedule=data?.schedule?.metrics||{};
 const placed=hasNumber(metrics.placed)?number(metrics.placed):null,unplaced=hasNumber(metrics.unplaced)?number(metrics.unplaced):null;
 const bedTotal=placed!=null&&unplaced!=null?placed+unplaced:null;
 const readiness=bedTotal?Math.round(placed/bedTotal*100):0;
 const capacity=Array.isArray(metrics.perNight)?metrics.perNight:[];
 const maxDemand=Math.max(1,...capacity.map(n=>number(n.demand)),...capacity.map(n=>number(n.capacity)));
 const firstName=String(user?.name||'team').split(/\s+/)[0];
 const today=new Intl.DateTimeFormat('en-IN',{weekday:'long',day:'numeric',month:'long'}).format(new Date());

 return <div className="financial-dashboard">
  <div className="dashboard-welcome">
   <div><span className="eyebrow">FESTIVAL OPERATIONS · LIVE</span><h2>Good day, {firstName}</h2><p>Here’s the current picture across your festival.</p></div>
   <div className="dashboard-tools"><span className="dashboard-date">{today}</span><button className="dashboard-refresh" onClick={load} disabled={metricBusy||alertBusy} aria-label="Refresh dashboard"><span className={metricBusy||alertBusy?'refresh-spin':''}>↻</span> Refresh</button></div>
  </div>
 {metricError&&<ErrorState error={`Metrics unavailable: ${metricError}`} retry={loadMetrics}/>}
  <section className="dashboard-feature">
   <div className="feature-copy"><span className="feature-kicker">YOUR FESTIVAL AT A GLANCE</span><h3>Keep every team<br/>moving together.</h3><p>Track people, beds, and operational priorities from one place.</p><div className="feature-foot"><span className="live-dot"/>Updated {updated?.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})||'when connected'}</div></div>
   <div className="feature-art" aria-hidden="true"><div className="feature-orbit orbit-one"/><div className="feature-orbit orbit-two"/><div className="feature-orbit orbit-three"/><div className="feature-center"><span>FEST</span><b>’26</b></div><i className="feature-dot dot-one"/><i className="feature-dot dot-two"/><i className="feature-dot dot-three"/></div>
   <div className="feature-progress"><div className="progress-label"><span>Accommodation readiness</span><b>{bedTotal!=null?`${readiness}%`:'Unavailable'}</b></div><div className="progress-track"><i style={{width:`${readiness}%`}}/></div><div className="progress-caption"><span>{placed==null?'Beds placed unavailable':`${displayNumber(placed)} beds placed`}</span><span>{unplaced==null?'Unplaced count unavailable':`${displayNumber(unplaced)} to place`}</span></div></div>
  </section>
  <section className="overview-grid" aria-label="Festival overview metrics">
   <OverviewCard label="People registered" value={counts.people} note="Participants and escorts" tone="coral" icon="↗"/>
   <OverviewCard label="Beds placed" value={metrics.placed} note={metrics.unplaced==null?(data?.accommodation?'Placement total unavailable':'No active accommodation plan'):`${displayNumber(metrics.unplaced)} people awaiting placement`} tone="peach" icon="⌂"/>
   <OverviewCard label="Open data issues" value={counts.dataIssuesOpen} note={`${displayNumber(counts.duplicatesOpen)} possible duplicates`} tone="plum" icon="≋"/>
   <OverviewCard label="Schedule clashes" value={schedule.participantClashes} note="Participant conflicts found" tone="sand" icon="◷"/>
  </section>
  <section className="dashboard-lower-grid">
   <div className="dashboard-panel attendance-panel">
    <div className="dashboard-panel-head"><div><span className="eyebrow">CAPACITY & DEMAND</span><h3>Accommodation overview</h3></div><span className="panel-chip">{capacity.length?`${capacity.length} nights`:'No active plan'}</span></div>
    {metricError&&!data?<div className="chart-empty"><span className="empty-ring">⌂</span><b>Accommodation data unavailable</b><span>Reconnect to the API, then refresh to load capacity data.</span></div>:!data&&metricBusy?<LoadingState/>:capacity.length?<div className="capacity-chart" role="img" aria-label="Bed demand and capacity by night">{capacity.slice(0,12).map((night,index)=>{const demand=number(night.demand),beds=number(night.capacity),demandHeight=Math.max(5,demand/maxDemand*100),bedHeight=Math.max(5,beds/maxDemand*100);return <div className="chart-column" key={night.night||index}><div className="chart-bars"><i className="bar-demand" style={{height:`${demandHeight}%`,animationDelay:`${index*35}ms`}}/><i className="bar-capacity" style={{height:`${bedHeight}%`,animationDelay:`${index*35+60}ms`}}/></div><span>{String(night.night||'').slice(5)||`N${index+1}`}</span></div>})}</div>:<div className="chart-empty"><span className="empty-ring">⌂</span><b>Accommodation data will appear here</b><span>Build a plan to see bed demand against available capacity.</span></div>}
    <div className="chart-legend"><span><i className="legend-demand"/>Beds needed</span><span><i className="legend-capacity"/>Beds available</span><span className="chart-summary">External spend <b>{money(metrics.externalCostINR)}</b></span></div>
   </div>
   <div className="dashboard-panel priorities-panel">
    <div className="dashboard-panel-head"><div><span className="eyebrow">NEEDS ATTENTION</span><h3>Open priorities</h3></div><span className="priority-count">{alerts?.filter(a=>a.status!=='acknowledged').length??'—'}</span></div>
    {alertBusy&&alerts===null?<LoadingState/>:alerts?.length?<div className="priority-list">{alerts.slice(0,5).map((alert,index)=><article className="priority-item" key={alert.key} style={{'--item-delay':`${index*55}ms`}}><span className={`priority-severity ${String(alert.severity||'').toLowerCase()}`}/><div className="priority-copy"><b>{alert.title}</b><span>{alert.detail||alert.suggestedAction||alert.ownerRole||'Review operational alert'}</span></div><div className="priority-actions">{alert.status==='acknowledged'?<span className="acknowledged">Done</span>:user?.role==='volunteer'?<span className="muted">Open</span>:<button className="priority-ack" disabled={alertBusy} onClick={()=>ack(alert.key)} aria-label={`Acknowledge ${alert.title}`}>↗</button>}</div></article>)}</div>:<div className="chart-empty compact"><span className="empty-ring">✓</span><b>All clear for now</b><span>No open priorities returned by the operations engine.</span></div>}
    {alertError&&<p className="dashboard-inline-error">Alerts unavailable: {alertError} <button className="ghost" onClick={loadAlerts} disabled={alertBusy}>Retry</button></p>}
   </div>
  </section>
  <section className="dashboard-foot-grid">
   <div className="dashboard-panel budget-panel"><div><span className="eyebrow">BUDGET WATCH</span><h3>External accommodation</h3><p>Spend against the approved budget</p></div><div className="budget-chart" style={{'--budget-fill':`${hasNumber(metrics.budgetINR)&&number(metrics.budgetINR)>0&&hasNumber(metrics.externalCostINR)?Math.min(100,number(metrics.externalCostINR)/number(metrics.budgetINR)*100):0}%`}}><div><b>{hasNumber(metrics.budgetINR)&&number(metrics.budgetINR)>0&&hasNumber(metrics.externalCostINR)?Math.round(number(metrics.externalCostINR)/number(metrics.budgetINR)*100):'Unavailable'}<small>%</small></b><span>used</span></div></div><div className="budget-values"><span>Spent<b>{money(metrics.externalCostINR)}</b></span><span>Budget<b>{money(metrics.budgetINR)}</b></span></div></div>
   <div className="dashboard-panel quick-summary"><div><span className="eyebrow">OPERATIONS SNAPSHOT</span><h3>Today’s overview</h3></div><div className="snapshot-line"><span>Festival participants</span><b>{displayNumber(counts.people)}</b></div><div className="snapshot-line"><span>Open data issues</span><b>{displayNumber(counts.dataIssuesOpen)}</b></div><div className="snapshot-line"><span>Possible duplicate records</span><b>{displayNumber(counts.duplicatesOpen)}</b></div><div className="snapshot-line"><span>Participant schedule clashes</span><b>{displayNumber(schedule.participantClashes)}</b></div></div>
  </section>
 </div>;
}

function OverviewCard({label,value,note,tone,icon}){return <article className={`overview-card ${tone}`}><div className="overview-card-top"><span>{label}</span><i aria-hidden="true">{icon}</i></div><strong>{displayNumber(value)}</strong><small>{note}</small><span className="card-glint" aria-hidden="true"/></article>}
