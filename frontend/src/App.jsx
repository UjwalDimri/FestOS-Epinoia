import React, { useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { DemoBanner, ErrorBoundary, ErrorState, LoadingState, PageHeader, PermissionGate } from './components/Shared.jsx';
import AppShell from './components/AppShell.jsx';
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
import Vendors from './pages/Vendors.jsx';
import Staff from './pages/Staff.jsx';
import AccommodationOps from './pages/AccommodationOps.jsx';
import Events from './pages/Events.jsx';
import Venues from './pages/Venues.jsx';
import Scheduling from './pages/Scheduling.jsx';

const PAGES = [
 ['dashboard','Control tower',Dashboard,'/dashboard','dashboard','Overview'],
 ['participants','Participants',Participants,'/participants','users','People'],
 ['events','Events',Events,'/events','events','Operations'],
 ['scheduling','Schedule',Scheduling,'/scheduling','schedule','Operations'],
 ['plans','Accommodation plans',Plans,'/accommodation','home','Operations'],
 ['accommodation','Accommodation desk',AccommodationOps,'/accommodation-desk','building','Operations'],
 ['logistics','Logistics',Logistics,'/logistics','boxes','Operations'],
 ['merchandise','Merchandise',Merchandise,'/merchandise','shirt','Resources'],
 ['vendors','Food & vendors',Vendors,'/vendors','food','Resources'],
 ['data','Data quality',DataQuality,'/data-quality','data','Administration'],
 ['audit','Audit',Audit,'/audit','audit','Administration'],
 ['venues','Venues',Venues,'/venues','building','Operations'],
 ['disruptions','Disruptions',Disruptions,'/disruptions','alert','Operations'],
 ['staff','Staff & volunteers',Staff,'/staff','users','Administration'],
];
const PATH_BY_KEY=Object.fromEntries(PAGES.map(([key,,,path])=>[key,path]));
function pageFromLocation(){return PAGES.find(([, , ,path])=>path===window.location.pathname)?.[0]||PAGES.find(([key])=>key===window.location.hash.slice(1))?.[0]||'dashboard';}
const DESCRIPTIONS={
 dashboard:'A live view of festival readiness, open alerts and operational pressure.',
 participants:'Search and review participant records with role-aware field visibility.',
 events:'Create proposals, coordinate owners, and track event readiness.',
 scheduling:'Generate and review schedules against current registrations and resources.',
 plans:'Review accommodation capacity and schedule plans returned by the operations engine.',
 accommodation:'Manage property capacity, room readiness, arrivals and departures.',
 logistics:'Manage inventory, locations, requests, transfers and purchasing.',
 merchandise:'Manage merchandise stock, participant issues and returns.',
 vendors:'Track vendor compliance, dietary coverage, meal service and settlement.',
 data:'Review reported data issues and duplicate candidates.',
 audit:'Verify the audit chain and inspect recorded operational actions.',
 venues:'Manage campus spaces, facilities, availability and bookings.',
 disruptions:'Preview operational impact before an authorized change is committed.',
 staff:'Manage festival staff, volunteers, assignments, and operational availability.',
};

export default function App(){
 const [user,setUser]=useState(null);
 const [page,setPage]=useState(pageFromLocation);
 const [theme,setTheme]=useState(()=>localStorage.getItem('festos_theme')||'light');
 const [booting,setBooting]=useState(Boolean(getToken()));
 const [sessionError,setSessionError]=useState('');
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('festos_theme',theme);},[theme]);
 useEffect(()=>{setUnauthorizedHandler(()=>{setToken(null);setUser(null);setSessionError('Your session expired. Sign in again.');});},[]);
 useEffect(()=>{const update=()=>setPage(pageFromLocation());addEventListener('popstate',update);addEventListener('hashchange',update);return()=>{removeEventListener('popstate',update);removeEventListener('hashchange',update);};},[]);
 useEffect(()=>{if(!getToken()){setBooting(false);return;}api('/me').then((result)=>setUser(result.user)).catch((error)=>{if(error.status===401){setToken(null);setSessionError('Your session expired. Sign in again.');}else setSessionError(`Could not validate your session: ${error.message}`);}).finally(()=>setBooting(false));},[]);

 if(booting)return <main><LoadingState/></main>;
 if(!user)return <><DemoBanner/><Login onLogin={setUser} sessionError={sessionError}/></>;
 const selected=PAGES.find(([key])=>key===page);
 const [,label,Page,,,group]=selected||[];
 const navigate=(key)=>{const path=PATH_BY_KEY[key];if(!path)return;window.history.pushState({},'',path);setPage(key);window.scrollTo({top:0,behavior:'auto'});};
 const signOut=()=>{setToken(null);setUser(null);setSessionError('');window.history.replaceState({},'','/');setPage('dashboard');};
 const visiblePages=PAGES.filter(([key])=>roleCanSee(user.role,key));

 return <AppShell user={user} page={page} pages={visiblePages} theme={theme} onToggleTheme={()=>setTheme(theme==='dark'?'light':'dark')} onNavigate={navigate} onSignOut={signOut}>
  <PermissionGate allowed={Boolean(selected)&&roleCanSee(user.role,page)}>
   {selected?<ErrorBoundary key={page}>{['events','venues','scheduling'].includes(page)?<Page user={user}/>:<><PageHeader title={label} description={DESCRIPTIONS[page]} breadcrumbs={[{label:group},{label}]}/><Page user={user}/></>}</ErrorBoundary>:<ErrorState error="Page not found." retry={()=>navigate('dashboard')}/ >}
  </PermissionGate>
 </AppShell>;
}
