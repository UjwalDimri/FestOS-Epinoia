import React, { useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { DemoBanner, ErrorBoundary, ErrorState, LoadingState, PageHeader } from './components/Shared.jsx';
import { roleCanSee } from './services/access.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Participants from './pages/Participants.jsx';
import Disruptions from './pages/Disruptions.jsx';
import Plans from './pages/Plans.jsx';
import DataQuality from './pages/DataQuality.jsx';
import Audit from './pages/Audit.jsx';
import Logistics from './pages/Logistics.jsx';
import Merchandise from './pages/Merchandise.jsx';
import AccommodationOps from './pages/AccommodationOps.jsx';
const PAGES = [
 ['dashboard','Control tower',Dashboard], ['participants','People',Participants], ['plans','Accommodation & schedule',Plans], ['accommodation','Accommodation desk',AccommodationOps],
 ['disruptions','Disruptions',Disruptions], ['data','Data quality',DataQuality], ['audit','Audit',Audit], ['logistics','Logistics',Logistics], ['merchandise','Merchandise',Merchandise],
];
export default function App() {
 const [user,setUser]=useState(null); const [page,setPage]=useState(location.hash.slice(1)||'dashboard'); const [menuOpen,setMenuOpen]=useState(false);
 const [booting,setBooting]=useState(Boolean(getToken())); const [sessionError,setSessionError]=useState('');
 useEffect(()=>{ setUnauthorizedHandler(()=>{ setToken(null); setUser(null); setSessionError('Your session expired. Sign in again.'); }); },[]);
 useEffect(()=>{ const onHash=()=>{setPage(location.hash.slice(1)||'dashboard');setMenuOpen(false);}; addEventListener('hashchange',onHash); return()=>removeEventListener('hashchange',onHash); },[]);
 useEffect(()=>{ if(!getToken()){setBooting(false);return;} api('/me').then(d=>setUser(d.user)).catch(e=>{ if(e.status===401){setToken(null);setSessionError('Your session expired. Sign in again.');} else setSessionError(`Could not validate your session: ${e.message}`); }).finally(()=>setBooting(false)); },[]);
 if(booting)return <main><LoadingState/></main>;
 if(!user)return <Login onLogin={setUser} sessionError={sessionError}/>;
 const selected=PAGES.find(([key])=>key===page); const [key,label,Page]=selected||[];
 const logout=()=>{setToken(null);setUser(null);setSessionError('');location.hash='dashboard';};
 if (selected && !roleCanSee(user.role, key)) return <main><ErrorState error="Your role cannot access this page." retry={()=>{location.hash='dashboard';}}/></main>;
 const groups=[
  ['Overview',[['dashboard','Control tower']]],
  ['People',[['participants','People']]],
  ['Operations',[['plans','Accommodation & schedule'],['accommodation','Accommodation desk'],['disruptions','Disruptions']]],
  ['Resources',[['logistics','Logistics'],['merchandise','Merchandise']]],
  ['Administration',[['data','Data quality'],['audit','Audit']]],
 ];
 const descriptions={dashboard:'A live view of festival readiness, open alerts and operational pressure.',participants:'Search and review participant records with role-aware field visibility.',plans:'Review accommodation capacity and schedule plans returned by the operations engine.',accommodation:'Manage property capacity, room readiness, allocation previews, arrivals and departures.',disruptions:'Preview operational impact before an authorized change is committed.',data:'Review reported data issues and duplicate candidates.',audit:'Verify the audit chain and inspect recorded operational actions.',logistics:'Manage inventory, locations, requests, transfers and purchasing.',merchandise:'Manage merchandise stock, participant issues and returns.'};
 return <div className="app-shell">
  <aside className={`sidebar${menuOpen?' sidebar-open':''}`} aria-label="Application navigation">
   <div className="brand"><span className="brand-mark" aria-hidden="true">F</span><span><b>FestOS</b><small>FESTIVAL OPERATIONS</small></span></div>
   <div className="festival-context"><span className="context-label">WORKSPACE</span><strong>Aarohan 2026</strong><span className="context-meta">Operations portal</span></div>
   <nav className="side-nav" aria-label="Main navigation">{groups.map(([group,items])=>{const visible=items.filter(([key])=>roleCanSee(user.role,key));return visible.length?<section className="nav-group" key={group}><h2>{group}</h2>{visible.map(([key,name])=><button key={key} className={`nav-item${page===key?' on':''}`} aria-current={page===key?'page':undefined} onClick={()=>{location.hash=key;setMenuOpen(false);}}><span className="nav-indicator" aria-hidden="true"/>{name}</button>)}</section>:null;})}</nav>
   <div className="sidebar-bottom"><span>Navigation is filtered by role.</span></div>
  </aside>
  {menuOpen&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
  <div className="workspace">
   <DemoBanner/>
   <header className="topbar"><button className="menu-toggle" aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><span/><span/><span/></button><div className="breadcrumbs"><span>FestOS</span><span className="breadcrumb-separator">/</span><strong>{label||'Page not found'}</strong></div><div className="topbar-right"><div className="user-details"><span className="user-name">{user.name}</span><span className="user-role">{user.roleLabel}</span></div><span className="avatar" aria-hidden="true">{String(user.name||'F').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><button className="signout" onClick={logout}>Sign out</button></div></header>
   <main className="content"><ErrorBoundary key={page}>{selected?<><PageHeader title={label} description={descriptions[key]}/><Page user={user}/></>:<ErrorState error="Page not found." retry={()=>{location.hash='dashboard';}}/>}</ErrorBoundary></main>
  </div>
 </div>;
}
