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
const PAGES = [
 ['dashboard','Control tower',Dashboard], ['participants','People',Participants], ['plans','Accommodation & schedule',Plans],
 ['disruptions','Disruptions',Disruptions], ['data','Data quality',DataQuality], ['audit','Audit',Audit], ['logistics','Logistics',Logistics],
];
export default function App() {
 const [user,setUser]=useState(null); const [page,setPage]=useState(location.hash.slice(1)||'dashboard');
 const [booting,setBooting]=useState(Boolean(getToken())); const [sessionError,setSessionError]=useState('');
 useEffect(()=>{ setUnauthorizedHandler(()=>{ setToken(null); setUser(null); setSessionError('Your session expired. Sign in again.'); }); },[]);
 useEffect(()=>{ const onHash=()=>setPage(location.hash.slice(1)||'dashboard'); addEventListener('hashchange',onHash); return()=>removeEventListener('hashchange',onHash); },[]);
 useEffect(()=>{ if(!getToken()){setBooting(false);return;} api('/me').then(d=>setUser(d.user)).catch(e=>{ if(e.status===401){setToken(null);setSessionError('Your session expired. Sign in again.');} else setSessionError(`Could not validate your session: ${e.message}`); }).finally(()=>setBooting(false)); },[]);
 if(booting)return <main><LoadingState/></main>;
 if(!user)return <Login onLogin={setUser} sessionError={sessionError}/>;
 const selected=PAGES.find(([key])=>key===page); const [key,label,Page]=selected||[];
 const logout=()=>{setToken(null);setUser(null);setSessionError('');location.hash='dashboard';};
 if (selected && !roleCanSee(user.role, key)) return <main><ErrorState error="Your role cannot access this page." retry={()=>{location.hash='dashboard';}}/></main>;
 return <><header><b>FestOS</b><nav aria-label="Main navigation">{PAGES.filter(([k])=>roleCanSee(user.role,k)).map(([k,name])=><button key={k} className={page===k?'on':''} aria-current={page===k?'page':undefined} onClick={()=>{location.hash=k;}}>{name}</button>)}</nav><span className="muted user-label">{user.name} · {user.roleLabel}</span><button className="ghost" onClick={logout}>Sign out</button></header><DemoBanner/><main><ErrorBoundary key={page}>{selected?<><PageHeader title={label}/><Page user={user}/></>:<ErrorState error="Page not found." retry={()=>{location.hash='dashboard';}}/>}</ErrorBoundary></main></>;
}
