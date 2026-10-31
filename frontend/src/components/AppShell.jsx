import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { dashboardService } from '../services/index.js';
import { api, DEMO_MODE } from '../api.js';
import { ErrorState, LoadingState } from './Shared.jsx';
import ColorBendsBackground from './ColorBendsBackground.jsx';

function formatISTDate(value) {
 if (!value) return '';
 const text = String(value);
 const date = new Date(/^\d{4}-\d\d-\d\d(?:\s|$)/.test(text) ? `${text.replace(' ', 'T')}+05:30` : text);
 return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}).format(date);
}
function festivalWindowLabel(window) {
 const start = formatISTDate(window?.start), end = formatISTDate(window?.end);
 if (!start || !end) return '';
 const endYear = new Date(`${String(window.end).replace(' ','T')}+05:30`).getFullYear();
 return `${start} – ${end} ${endYear}`;
}

export default function AppShell({ user, page, pages, description, theme, onToggleTheme, onNavigate, onSignOut, children }) {
 const [collapsed,setCollapsed]=useState(()=>localStorage.getItem('festos_sidebar_collapsed')==='true');
 const [mobileOpen,setMobileOpen]=useState(false);
 const [notificationOpen,setNotificationOpen]=useState(false);
 const [alerts,setAlerts]=useState(null),[alertsError,setAlertsError]=useState('');
 const [searchOpen,setSearchOpen]=useState(false),[searchQuery,setSearchQuery]=useState(''),[searchResults,setSearchResults]=useState([]),[searchLoading,setSearchLoading]=useState(false),[searchError,setSearchError]=useState('');
 const [festivalWindow,setFestivalWindow]=useState('');
 const navRef=useRef(null),menuButtonRef=useRef(null),notificationRef=useRef(null),notificationButtonRef=useRef(null),searchRef=useRef(null),searchButtonRef=useRef(null),searchInputRef=useRef(null),searchResultsRef=useRef(null);
 const current=pages.find((entry)=>entry[0]===page);
 const label=current?.[1]||'Page not found';
 const group=current?.[5]||'Overview';
 const openAlerts=useMemo(()=>alerts?.filter((alert)=>alert.status==='open')||[],[alerts]);
 const syncAlerts=useCallback((next)=>{setAlerts(next);setAlertsError('');},[]);

 useEffect(()=>{
  let active=true;
  async function refresh(){
   const alertRequest=page==='dashboard'?Promise.resolve(null):dashboardService.alerts().then((result)=>{if(active)syncAlerts(result.alerts||[]);}).catch((error)=>{if(active)setAlertsError(error.message);});
   const assumptionsRequest=DEMO_MODE?Promise.resolve(null):api('/assumptions').then((result)=>{
    const window=result.assumptions?.find((item)=>item.key==='festWindow')?.value;
    if(active)setFestivalWindow(festivalWindowLabel(window));
   }).catch(()=>{if(active)setFestivalWindow('');});
   await Promise.all([alertRequest,assumptionsRequest]);
  }
  refresh();const timer=setInterval(refresh,60000);
  return()=>{active=false;clearInterval(timer);};
 },[user?.userId,page,syncAlerts]);

 useEffect(()=>{
  if(!mobileOpen)return undefined;
  const focusable=()=>[...(navRef.current?.querySelectorAll('a[href],button:not([disabled])')||[])];
  const close=()=>{setMobileOpen(false);requestAnimationFrame(()=>menuButtonRef.current?.focus());};
  const onKey=(event)=>{
   if(event.key==='Escape'){event.preventDefault();close();return;}
   if(event.key==='Tab'){
    const items=focusable();if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',onKey);
  requestAnimationFrame(()=>navRef.current?.querySelector('.nav-item.on')?.focus());
  return()=>document.removeEventListener('keydown',onKey);
 },[mobileOpen]);

 useEffect(()=>{
  if(!notificationOpen)return undefined;
  const onPointer=(event)=>{if(!notificationRef.current?.contains(event.target))setNotificationOpen(false);};
  const onKey=(event)=>{if(event.key==='Escape'){setNotificationOpen(false);notificationButtonRef.current?.focus();}};
  document.addEventListener('pointerdown',onPointer);document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',onPointer);document.removeEventListener('keydown',onKey);};
 },[notificationOpen]);

 useEffect(()=>{
  const onKey=(event)=>{
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();setSearchOpen(true);setNotificationOpen(false);return;
   }
   if(event.key==='Escape'&&searchOpen){event.preventDefault();setSearchOpen(false);searchButtonRef.current?.focus();}
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[searchOpen]);

 useEffect(()=>{
  if(!searchOpen)return undefined;
  const timer=requestAnimationFrame(()=>searchInputRef.current?.focus());
  const onPointer=(event)=>{if(!searchRef.current?.contains(event.target))setSearchOpen(false);};
  document.addEventListener('pointerdown',onPointer);
  return()=>{cancelAnimationFrame(timer);document.removeEventListener('pointerdown',onPointer);};
 },[searchOpen]);

 useEffect(()=>{
  if(!searchOpen){setSearchResults([]);setSearchLoading(false);setSearchError('');return undefined;}
  const query=searchQuery.trim();
  if(query.length<2){setSearchResults([]);setSearchLoading(false);setSearchError('');return undefined;}
  let active=true;
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   setSearchLoading(true);setSearchError('');
   api(`/search?q=${encodeURIComponent(query)}`,{signal:controller.signal})
    .then((result)=>{if(active)setSearchResults(result.results||[]);})
    .catch((error)=>{if(active&&error.kind!=='aborted')setSearchError(error.message);})
    .finally(()=>{if(active)setSearchLoading(false);});
  },220);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[searchOpen,searchQuery]);

 function toggleCollapse(){setCollapsed((value)=>{const next=!value;localStorage.setItem('festos_sidebar_collapsed',String(next));return next;});}
 function navigate(key){setMobileOpen(false);setNotificationOpen(false);setSearchOpen(false);if(mobileOpen)requestAnimationFrame(()=>menuButtonRef.current?.focus());onNavigate(key);}
 function openSearchResult(result){const query=searchQuery.trim();setSearchOpen(false);setNotificationOpen(false);onNavigate(result.page,query);}
 const initials=String(user?.name||'F').split(/\s+/).slice(0,2).map((part)=>part[0]).join('').toUpperCase();

 return <div className={`app-shell${collapsed?' shell-collapsed':''}`}>
  <ColorBendsBackground className="app-color-bends" />
  <aside id="primary-navigation" ref={navRef} className={`sidebar${collapsed?' sidebar-collapsed':''}${mobileOpen?' sidebar-open':''}`} aria-label="Application navigation">
   <div className="brand-row"><div className="brand"><span className="brand-mark" aria-hidden="true">F</span><span className="brand-copy"><b>FestOS</b><small>FESTIVAL OPERATIONS</small></span></div><button className="sidebar-collapse" type="button" onClick={toggleCollapse} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}><Icon name={collapsed?'expand':'collapse'}/></button></div>
   <nav className="side-nav" aria-label="Main navigation">
    {pages.filter((entry)=>entry[5]==='Overview').length>0&&<NavGroup title="Overview" entries={pages.filter((entry)=>entry[5]==='Overview')} page={page} navigate={navigate} collapsed={collapsed}/>}
    {pages.filter((entry)=>entry[5]==='People').length>0&&<NavGroup title="People" entries={pages.filter((entry)=>entry[5]==='People')} page={page} navigate={navigate} collapsed={collapsed}/>}
    {pages.filter((entry)=>entry[5]==='Operations').length>0&&<NavGroup title="Operations" entries={pages.filter((entry)=>entry[5]==='Operations')} page={page} navigate={navigate} collapsed={collapsed}/>}
    {pages.filter((entry)=>entry[5]==='Resources').length>0&&<NavGroup title="Resources" entries={pages.filter((entry)=>entry[5]==='Resources')} page={page} navigate={navigate} collapsed={collapsed}/>}
    {pages.filter((entry)=>entry[5]==='Administration').length>0&&<NavGroup title="Administration" entries={pages.filter((entry)=>entry[5]==='Administration')} page={page} navigate={navigate} collapsed={collapsed}/>}
   </nav>
   <div className="sidebar-bottom"><span className="permission-note">Navigation follows your assigned role.</span></div>
  </aside>
  {mobileOpen&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>{setMobileOpen(false);menuButtonRef.current?.focus();}}/>}
  <div className="workspace">
   <header className="topbar">
    <button ref={menuButtonRef} className="menu-toggle" aria-label={mobileOpen?'Close navigation':'Open navigation'} aria-expanded={mobileOpen} aria-controls="primary-navigation" onClick={()=>setMobileOpen((value)=>!value)}><Icon name="menu"/></button>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><span>FestOS</span><span className="breadcrumb-separator" aria-hidden="true">/</span><span>{group}</span><span className="breadcrumb-separator" aria-hidden="true">/</span><strong aria-current="page">{label}</strong></nav>
    <div className="topbar-actions">
     <div className="global-search-wrap" ref={searchRef}>
      <button ref={searchButtonRef} className="global-search" type="button" aria-haspopup="dialog" aria-expanded={searchOpen} aria-controls="global-search-panel" aria-label="Search FestOS" onClick={()=>{setSearchOpen((value)=>!value);setNotificationOpen(false);}}><Icon name="search"/><span>Search FestOS</span><kbd>Ctrl K</kbd></button>
      {searchOpen&&<section className="global-search-panel" id="global-search-panel" role="dialog" aria-label="Search FestOS">
       <label className="global-search-input"><Icon name="search"/><input ref={searchInputRef} type="search" value={searchQuery} onChange={(event)=>setSearchQuery(event.target.value)} placeholder="People, contingents, events, venues…" aria-label="Search people and festival records" aria-controls="global-search-results" onKeyDown={(event)=>{if(event.key==='ArrowDown'){event.preventDefault();searchResultsRef.current?.querySelector('button')?.focus();}if(event.key==='Escape'){event.preventDefault();setSearchOpen(false);searchButtonRef.current?.focus();}}}/><kbd>Esc</kbd></label>
       <div className="global-search-results" id="global-search-results" ref={searchResultsRef}>
        {searchQuery.trim().length<2?<p className="global-search-hint">Type at least 2 characters to search.</p>:searchLoading?<p className="global-search-hint" role="status">Searching…</p>:searchError?<p className="global-search-error" role="alert">{searchError}</p>:searchResults.length?<>
         {searchResults.map((result)=><button type="button" className="global-search-result" key={`${result.type}-${result.id}`} onClick={()=>openSearchResult(result)}><span className="global-search-result-copy"><strong>{result.title}</strong><small>{result.subtitle}</small></span><span className="global-search-result-type">{result.type}</span></button>)}
         <p className="global-search-hint">{searchResults.length} results · Select a result to open its section</p>
        </>:<p className="global-search-hint">No matching records found.</p>}
       </div>
      </section>}
     </div>
     <div className="notification-wrap" ref={notificationRef}>
      <button ref={notificationButtonRef} className="notification-trigger" type="button" aria-label={alerts===null?'Notifications':`Notifications, ${openAlerts.length} open`} aria-expanded={notificationOpen} aria-controls="notification-panel" onClick={()=>{setNotificationOpen((value)=>!value);setSearchOpen(false);}}><Icon name="alert"/>{openAlerts.length>0&&<span className="notification-count" aria-hidden="true">{openAlerts.length>99?'99+':openAlerts.length}</span>}</button>
      {notificationOpen&&<section className="notification-panel" id="notification-panel" aria-label="Open notifications"><div className="notification-heading"><div><strong>Notifications</strong><span>{alerts===null?'Connecting to alerts':`${openAlerts.length} open alerts`}</span></div><button className="notification-refresh" type="button" onClick={async()=>{try{const result=await dashboardService.alerts();setAlerts(result.alerts||[]);setAlertsError('');}catch(error){setAlertsError(error.message);}}}>Refresh</button></div>
       {alertsError?<ErrorState error={alertsError}/>:alerts===null?<LoadingState/>:openAlerts.length?<ul className="notification-list">{openAlerts.slice(0,6).map((alert)=><li key={alert.key}><span className={`notification-severity severity-${String(alert.severity||'info').toLowerCase()}`}>{alert.severity||'Info'}</span><div><strong>{alert.title}</strong><p>{alert.suggestedAction||alert.detail||'Review this operational alert.'}</p></div></li>)}</ul>:<p className="notification-empty">No open notifications.</p>}
       <button className="notification-view-all" type="button" onClick={()=>navigate('dashboard')}>View alerts on Control tower <Icon name="chevron" size={14}/></button>
      </section>}
     </div>
     <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} title={`Switch to ${theme==='dark'?'light':'dark'} theme`}><Icon name={theme==='dark'?'sun':'moon'} size={16}/><small>{theme==='dark'?'Light':'Dark'}</small></button>
     <div className="user-menu"><span className="avatar" aria-hidden="true">{initials}</span><span className="user-details"><span className="user-name">{user?.name}</span><span className="user-role">{user?.roleLabel}</span></span><button className="signout" onClick={onSignOut}>Sign out</button></div>
    </div>
   </header>
   {festivalWindow&&<div className="context-strip"><Icon name="calendar" size={14}/><span>Festival dates</span><strong>{festivalWindow}</strong></div>}
   <main className="content"><div className="page-transition" key={page}>{page==='dashboard'&&React.isValidElement(children)?React.cloneElement(children,{onAlertsChange:syncAlerts}):children}</div></main>
  </div>
 </div>;
}

function NavGroup({title,entries,page,navigate,collapsed}){
 return <section className={`nav-group${collapsed?' nav-group-collapsed':''}`} aria-label={title}><h2>{title}</h2>{entries.map(([key,name,,path,icon])=><a key={key} href={path} title={collapsed?name:undefined} aria-label={name} className={`nav-item${page===key?' on':''}`} aria-current={page===key?'page':undefined} onClick={(event)=>{event.preventDefault();navigate(key);}}><span className="nav-indicator" aria-hidden="true"/><Icon className="nav-icon" name={icon}/><span className="nav-label">{name}</span></a>)}</section>;
}
