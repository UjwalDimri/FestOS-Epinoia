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
   <div><span className="eyebrow">FESTIVAL OPERATIONS · LIVE</span><h2>Operations overview</h2><p>Current readiness, capacity, and priorities for {firstName}’s team.</p></div>
   <div className="dashboard-tools"><span className="dashboard-date">{today}</span><button className="dashboard-refresh" onClick={load} disabled={metricBusy||alertBusy} aria-label="Refresh dashboard"><span className={metricBusy||alertBusy?'refresh-spin':''}>↻</span> Refresh</button></div>
  </div>
 {metricError&&<ErrorState error={`Metrics unavailable: ${metricError}`} retry={loadMetrics}/>}
  <section className="dashboard-feature">
   <div className="feature-copy"><span className="feature-kicker">LIVE OPERATIONS SNAPSHOT</span><h3>Accommodation readiness</h3><p>Placement progress across the active accommodation plan.</p><div className="feature-foot"><span className="live-dot"/>Updated {updated?.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})||'when connected'}</div></div>
   <div className="readiness-visual" aria-hidden="true"><div className="readiness-orbit orbit-back"/><div className="readiness-orbit orbit-front"/><div className="readiness-ground"/><div className="readiness-stack"><div className="readiness-prism prism-one"><i className="prism-top"/><i className="prism-front"/><i className="prism-side"/></div><div className="readiness-prism prism-two"><i className="prism-top"/><i className="prism-front"/><i className="prism-side"/></div><div className="readiness-prism prism-three"><i className="prism-top"/><i className="prism-front"/><i className="prism-side"/></div></div><span className="readiness-spark spark-one"/><span className="readiness-spark spark-two"/></div>
   <div className="feature-progress"><div className="progress-label"><span>Beds placed</span><b>{bedTotal!=null?`${readiness}%`:'Unavailable'}</b></div><div className="progress-track" role="progressbar" aria-label="Accommodation placement" aria-valuemin="0" aria-valuemax="100" aria-valuenow={bedTotal!=null?readiness:0}><i style={{width:`${readiness}%`}}/></div><div className="progress-caption"><span>{placed==null?'Beds placed unavailable':`${displayNumber(placed)} placed`}</span><span>{unplaced==null?'Unplaced count unavailable':`${displayNumber(unplaced)} awaiting placement`}</span></div></div>
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
    {metricError&&!data?<div className="chart-empty"><span className="empty-ring">⌂</span><b>Accommodation data unavailable</b><span>Reconnect to the API, then refresh to load capacity data.</span></div>:!data&&metricBusy?<LoadingState/>:capacity.length?<CapacityChart nights={capacity.slice(0,12)} maxValue={maxDemand}/>:<div className="chart-empty"><span className="empty-ring">⌂</span><b>Accommodation data will appear here</b><span>Build a plan to see bed demand against available capacity.</span></div>}
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

function OverviewCard({label,value,note,tone,icon}){return <article className={`overview-card ${tone}`}><div className="overview-card-top"><span>{label}</span><i aria-hidden="true">{icon}</i></div><strong>{value==null?'—':Number(value).toLocaleString('en-IN')}</strong><small>{note}</small><span className="card-glint" aria-hidden="true"/></article>}

function CapacityChart({nights,maxValue}){
 const width=720,height=224,left=50,right=12,top=14,bottom=35,plotWidth=width-left-right,plotHeight=height-top-bottom;
 const scale=10**Math.floor(Math.log10(Math.max(1,maxValue))),step=Math.max(1,Math.ceil(maxValue/(4*scale))*scale),axisMax=step*4;
 const columnWidth=plotWidth/nights.length,barWidth=Math.min(15,columnWidth*.25),gap=Math.max(3,barWidth*.25);
 const summary=nights.map((night,index)=>`${formatNight(night.night,index)}: ${number(night.demand).toLocaleString()} beds needed, ${number(night.capacity).toLocaleString()} available`).join('; ');
 return <div className="capacity-chart-wrap"><svg className="capacity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Bed demand and available capacity by night. ${summary}`}>
  <title>Accommodation demand and available beds</title>
  <desc>Daily beds needed compared with available capacity. Values are from the current accommodation plan.</desc>
  {[0,1,2,3,4].map((tick)=>{const y=top+plotHeight-(tick/4)*plotHeight;return <g key={tick}><line className="chart-gridline" x1={left} x2={width-right} y1={y} y2={y}/><text className="chart-axis-label" x={left-9} y={y+3} textAnchor="end">{(step*tick).toLocaleString('en-IN')}</text></g>;})}
  {nights.map((night,index)=>{
   const center=left+columnWidth*(index+.5),demand=number(night.demand),available=number(night.capacity);
   const demandHeight=Math.max(demand?2:0,demand/axisMax*plotHeight),availableHeight=Math.max(available?2:0,available/axisMax*plotHeight);
   const x1=center-gap/2-barWidth,x2=center+gap/2,yDemand=top+plotHeight-demandHeight,yAvailable=top+plotHeight-availableHeight;
   return <g key={night.night||index}>
    <rect className="chart-demand-bar" x={x1} y={yDemand} width={barWidth} height={demandHeight} rx="3" style={{'--bar-delay':`${index*45}ms`}}><title>{formatNight(night.night,index)}: {demand.toLocaleString()} beds needed</title></rect>
    <rect className="chart-capacity-bar" x={x2} y={yAvailable} width={barWidth} height={availableHeight} rx="3" style={{'--bar-delay':`${index*45+45}ms`}}><title>{formatNight(night.night,index)}: {available.toLocaleString()} beds available</title></rect>
    <text className="chart-date-label" x={center} y={height-8} textAnchor="middle">{formatNight(night.night,index)}</text>
   </g>;
  })}
 </svg></div>;
}
function formatNight(value,index){const match=String(value||'').match(/^(\d{4})-(\d\d)-(\d\d)/);if(!match)return `Night ${index+1}`;return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))));}
