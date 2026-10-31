import React, { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Participants from './pages/Participants.jsx';
import Disruptions from './pages/Disruptions.jsx';
import Plans from './pages/Plans.jsx';
import DataQuality from './pages/DataQuality.jsx';
import Audit from './pages/Audit.jsx';
import Events from './pages/Events.jsx';
import Venues from './pages/Venues.jsx';
import Scheduling from './pages/Scheduling.jsx';

const PAGES = [
  { path:'/dashboard',key:'dashboard',label:'Control tower',icon:'◈',group:'Workspace',Page:Dashboard,roles:null },
  { path:'/participants',key:'participants',label:'Participants',icon:'◉',group:'Operations',roles:null },
  { path:'/accommodation',key:'plans',label:'Accommodation',icon:'⌂',group:'Operations',roles:null },
  { path:'/events',key:'events',label:'Events',icon:'⚑',group:'Operations',Page:Events,roles:['festival_director','events_team','logistics_head','hospitality','registration_desk','merchandise_desk','food_coordinator'] },
  { path:'/venues',key:'venues',label:'Venues',icon:'▦',group:'Operations',Page:Venues,roles:['festival_director','events_team','logistics_head','hospitality','registration_desk','merchandise_desk','food_coordinator'] },
  { path:'/scheduling',key:'scheduling',label:'Scheduling',icon:'◷',group:'Operations',Page:Scheduling,roles:['festival_director','hospitality','registration_desk','events_team','logistics_head','merchandise_desk','food_coordinator'] },
  { path:'/disruptions',key:'disruptions',label:'Disruptions',icon:'⌁',group:'Operations',roles:null },
  { path:'/data-quality',key:'data',label:'Data quality',icon:'⌕',group:'Administration',roles:null },
  { path:'/audit',key:'audit',label:'Audit log',icon:'▤',group:'Administration',roles:null },
];
const PAGE_COMPONENTS={dashboard:Dashboard,participants:Participants,plans:Plans,disruptions:Disruptions,data:DataQuality,audit:Audit,events:Events,venues:Venues,scheduling:Scheduling};
const currentKey=()=>PAGES.find(x=>x.path===window.location.pathname)?.key||'dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(currentKey);
  const [booting, setBooting] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api('/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);

  useEffect(()=>{const onPop=()=>setPage(currentKey());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[]);

  if (booting) return <main><p className="muted">Loading…</p></main>;
  if (!user) return <Login onLogin={setUser} />;

  const Page = PAGE_COMPONENTS[page]||Dashboard;
  const logout = () => { setToken(null); setUser(null); };
  const navigate=(event,item)=>{event.preventDefault();window.history.pushState({},'',item.path);setPage(item.key);window.scrollTo(0,0);};
  const visible=PAGES.filter(item=>!item.roles||item.roles.includes(user.role));
  const groups=[...new Set(visible.map(x=>x.group))];

  return (
    <>
      <header className="app-header"><b>FestOS <span>OPERATIONS</span></b><span className="muted">{user.name} · {user.roleLabel}</span><button className="ghost" onClick={logout}>Sign out</button></header>
      <div className="app-shell"><aside className="sidebar"><div className="sidebar-brand">FESTIVAL WORKSPACE</div>{groups.map(group=><div className="nav-group" key={group}><p>{group}</p>{visible.filter(x=>x.group===group).map(item=><a key={item.key} href={item.path} className={`nav-link ${page===item.key?'active':''}`} aria-current={page===item.key?'page':undefined} onClick={e=>navigate(e,item)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</a>)}</div>)}</aside><main className="app-main"><Page user={user} /></main></div>
    </>
  );
}
