import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import campusMap from '../assets/iim-indore-campus.jpg';

const crowdLabels = { low: 'Calm', moderate: 'Moderate', busy: 'Busy', full: 'Full' };
const kindLabels = { crowd: 'Crowd update', queue: 'Queue update', issue: 'Operations alert' };
const roleLabels = { festival_director: 'Festival Director', hospitality: 'Hospitality', registration_desk: 'Registration', events_team: 'Events Team', logistics_head: 'Logistics', merchandise_desk: 'Merchandise', food_coordinator: 'Food team', volunteer: 'Volunteer' };
const DEMO_STORAGE_KEY = 'festos_pulse_demo_v1';
const MAP_ZOOM = 1.22;
const DEFAULT_MAP_POSITIONS = [
  { x: 47, y: 31 }, { x: 31, y: 47 }, { x: 66, y: 45 }, { x: 51, y: 66 },
  { x: 84, y: 48 }, { x: 69, y: 76 }, { x: 16, y: 46 }, { x: 39, y: 83 }, { x: 54, y: 36 },
];
const SAMPLE_VENUES = [
  ['DEMO-G', 'G Block'], ['DEMO-A', 'A Block'], ['DEMO-SR46', 'SR 4–6'],
  ['DEMO-OLD-AUD', 'Old Auditorium'], ['DEMO-BASKETBALL', 'Basketball Court'],
  ['DEMO-ER3', 'ER3'], ['DEMO-ER2', 'ER2'], ['DEMO-CRICKET', 'Cricket Stadium'],
  ['DEMO-MAIN', 'Main Stage'],
].map(([venueId, name], index) => ({ venueId, name, capacity: [120, 80, 160, 220, 140, 75, 60, 300, 250][index], operationalStatus: 'available', facilities: [], mapPosition: DEFAULT_MAP_POSITIONS[index] }));
function readDemoSnapshot() {
  try { return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function saveDemoSnapshot(snapshot) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot)); }
  catch { /* The in-memory demo still works when browser storage is unavailable. */ }
}
function makeSampleReports(venues, now) {
  const levels = ['busy', 'moderate', 'full', 'busy', 'moderate', 'low', 'low', 'busy', 'full'];
  const reports = venues.map((venue, index) => ({
    reportId: `DEMO-CROWD-${venue.venueId}`, venueId: venue.venueId, kind: 'crowd', level: levels[index % levels.length],
    message: index === 0 ? 'Steady footfall around the academic block.' : '', status: 'active', reporterRole: 'events_team', demo: true,
    createdAt: new Date(now - (index + 2) * 60000).toISOString(), expiresAt: new Date(now + 90 * 60000).toISOString(),
  }));
  [
    { venueIndex: 0, waitMinutes: 8, message: 'Short queue at the refreshment counter.' },
    { venueIndex: 2, waitMinutes: 18, message: 'Queue moving steadily.' },
    { venueIndex: 3, waitMinutes: 12, message: 'Entry line at the auditorium.' },
  ].forEach(({ venueIndex, ...details }, index) => {
    if (venues[venueIndex]) reports.push({ reportId: `DEMO-QUEUE-${index}`, venueId: venues[venueIndex].venueId, kind: 'queue', ...details,
      status: 'active', reporterRole: 'hospitality', demo: true, createdAt: new Date(now - (index + 3) * 60000).toISOString(), expiresAt: new Date(now + 75 * 60000).toISOString() });
  });
  if (venues[4]) reports.push({ reportId: `DEMO-ISSUE-${venues[4].venueId}`, venueId: venues[4].venueId, kind: 'issue', message: 'Crowd building near the south entrance.',
    status: 'active', reporterRole: 'volunteer', demo: true, createdAt: new Date(now - 5 * 60000).toISOString(), expiresAt: new Date(now + 55 * 60000).toISOString() });
  return reports;
}
function makeDemoSnapshot(sourceVenues = [], liveReports = []) {
  const now = Date.now(), saved = readDemoSnapshot();
  const venuesSource = sourceVenues.length ? sourceVenues : saved?.venues?.length ? saved.venues : SAMPLE_VENUES;
  const savedById = new Map((saved?.venues || []).map((venue) => [venue.venueId, venue]));
  const venues = venuesSource.map((venue, index) => ({
    ...venue,
    mapPosition: venue.mapPosition || savedById.get(venue.venueId)?.mapPosition || DEFAULT_MAP_POSITIONS[index % DEFAULT_MAP_POSITIONS.length],
    events: venue.events?.length ? venue.events : index < 4 ? [{ slotId: `DEMO-SLOT-${index}`, eventName: ['Robotics showcase', 'Dance prelims', 'Campus quiz', 'Open mic'][index], start: new Date(now + (index + 1) * 45 * 60000).toISOString(), status: 'scheduled' }] : [],
  }));
  const activeSaved = (saved?.reports || []).filter((report) => report.status === 'active' && new Date(report.expiresAt).getTime() > now && venues.some((venue) => venue.venueId === report.venueId));
  const activeLive = liveReports.filter((report) => report.status === 'active' && new Date(report.expiresAt).getTime() > now);
  let reports = [...activeSaved, ...activeLive.filter((report) => !activeSaved.some((savedReport) => savedReport.reportId === report.reportId))];
  if (!reports.some((report) => report.kind === 'crowd')) reports = [...makeSampleReports(venues, now), ...reports];
  const snapshot = { venues, reports: reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), updatedAt: new Date(now).toISOString() };
  saveDemoSnapshot(snapshot);
  return snapshot;
}
const relativeTime = (value) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
};
const remainingTime = (value) => {
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60000));
  return minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h left`;
};

export default function PulseMap({ user }) {
  const [data, setData] = useState({ venues: [], reports: [] });
  const [demoMode, setDemoMode] = useState(false);
  const [demoReason, setDemoReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [arrangingMap, setArrangingMap] = useState(false);
  const [placingVenue, setPlacingVenue] = useState('');
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);
  const [form, setForm] = useState({ venueId: '', kind: 'crowd', level: 'moderate', waitMinutes: 10, message: '', durationMinutes: 60 });
  const mapRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const canPlace = ['festival_director', 'events_team', 'logistics_head'].includes(user?.role);
  const canManage = ['festival_director', 'events_team', 'logistics_head', 'hospitality'].includes(user?.role);
  const canReport = true;

  async function load() {
    try {
      const next = await api('/pulse');
      const venues = next.venues || [], reports = next.reports || [];
      if (!venues.length || !reports.some((report) => report.kind === 'crowd')) {
        const snapshot = makeDemoSnapshot(venues, reports);
        setData(snapshot); setDemoMode(true);
        setDemoReason(!venues.length ? 'The database has no venue records yet.' : 'No crowd reports are recorded yet.');
        setForm((current) => ({ ...current, venueId: current.venueId || snapshot.venues[0]?.venueId || '' }));
      } else {
        setData({ venues, reports, updatedAt: next.updatedAt }); setDemoMode(false); setDemoReason('');
        setForm((current) => ({ ...current, venueId: current.venueId || venues[0]?.venueId || '' }));
      }
      setError('');
    } catch (e) {
      const snapshot = makeDemoSnapshot();
      setData(snapshot); setDemoMode(true); setDemoReason(`FestOS API is unavailable (${e.message}).`);
      setForm((current) => ({ ...current, venueId: current.venueId || snapshot.venues[0]?.venueId || '' }));
      setError('');
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  const venueById = useMemo(() => new Map(data.venues.map((venue) => [venue.venueId, venue])), [data.venues]);
  const reportsByVenue = useMemo(() => {
    const grouped = new Map();
    for (const report of data.reports) {
      const list = grouped.get(report.venueId) || [];
      list.push(report);
      grouped.set(report.venueId, list);
    }
    return grouped;
  }, [data.reports]);
  const currentReports = data.reports.filter((report) => report.status === 'active' && new Date(report.expiresAt).getTime() > Date.now());
  const activeReports = currentReports.filter((report) => filter === 'all' || report.kind === filter);
  const busyVenues = data.venues.filter((venue) => {
    const latest = (reportsByVenue.get(venue.venueId) || []).find((report) => report.status === 'active' && new Date(report.expiresAt).getTime() > Date.now() && report.kind === 'crowd');
    return ['busy', 'full'].includes(latest?.level);
  }).length;
  const issueCount = currentReports.filter((report) => report.kind === 'issue').length;
  const queueCount = currentReports.filter((report) => report.kind === 'queue').length;

  async function submitReport(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (demoMode) {
        const now = Date.now();
        const report = { reportId: `DEMO-USER-${now}`, venueId: form.venueId, kind: form.kind,
          ...(form.kind === 'crowd' ? { level: form.level } : {}), ...(form.kind === 'queue' ? { waitMinutes: Number(form.waitMinutes) } : {}),
          message: form.message.trim(), status: 'active', reporterRole: user?.role || 'volunteer', demo: true,
          createdAt: new Date(now).toISOString(), expiresAt: new Date(now + Number(form.durationMinutes) * 60000).toISOString() };
        const snapshot = { ...data, reports: [report, ...data.reports], updatedAt: new Date(now).toISOString() };
        setData(snapshot); saveDemoSnapshot(snapshot);
      } else {
        await api('/pulse/reports', { method: 'POST', body: {
          ...form,
          waitMinutes: form.kind === 'queue' ? Number(form.waitMinutes) : undefined,
          level: form.kind === 'crowd' ? form.level : undefined,
          message: form.message.trim(),
        } });
        await load();
      }
      setReportOpen(false);
      setForm((current) => ({ ...current, message: '' }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function placeVenue(event) {
    if (!placingVenue || !mapCanvasRef.current || !canPlace) return;
    const bounds = mapCanvasRef.current.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(6, Math.min(94, ((event.clientY - bounds.top) / bounds.height) * 100));
    setBusy(true); setError('');
    try {
      if (demoMode) {
        const snapshot = { ...data, venues: data.venues.map((venue) => venue.venueId === placingVenue ? { ...venue, mapPosition: { x, y } } : venue) };
        setData(snapshot); saveDemoSnapshot(snapshot);
      } else await api(`/pulse/venues/${encodeURIComponent(placingVenue)}/location`, { method: 'PATCH', body: { x, y } });
      setPlacingVenue('');
      if (!demoMode) await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function startMapDrag(event) {
    if (placingVenue || event.button !== 0 || event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan: mapPan };
    setMapDragging(true);
  }
  function moveMap(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !mapRef.current) return;
    const bounds = mapRef.current.getBoundingClientRect();
    const maxX = bounds.width * (MAP_ZOOM - 1) / 2;
    const maxY = bounds.height * (MAP_ZOOM - 1) / 2;
    setMapPan({
      x: Math.max(-maxX, Math.min(maxX, drag.pan.x + event.clientX - drag.x)),
      y: Math.max(-maxY, Math.min(maxY, drag.pan.y + event.clientY - drag.y)),
    });
  }
  function finishMapDrag(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setMapDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function resolveReport(reportId) {
    setBusy(true); setError('');
    try {
      if (demoMode) {
        const snapshot = { ...data, reports: data.reports.map((report) => report.reportId === reportId ? { ...report, status: 'resolved' } : report) };
        setData(snapshot); saveDemoSnapshot(snapshot);
      } else { await api(`/pulse/reports/${encodeURIComponent(reportId)}/resolve`, { method: 'PATCH', body: {} }); await load(); }
    }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const visibleVenues = data.venues.filter((venue) => filter === 'all' || currentReports.some((report) => report.venueId === venue.venueId && report.kind === filter));

  return <section className="module-page pulse-page">
    <div className="module-heading pulse-heading">
      <div><p className="eyebrow">OPERATIONS / LIVE CONDITIONS</p><h1>Festival pulse</h1><p className="muted">A shared, live view of crowd levels, queues, and on-site issues.</p></div>
      <div className="pulse-heading-actions"><span className="pulse-live"><i/> LIVE · updates every 30 sec</span>{canReport && <button className="primary" onClick={() => setReportOpen((open) => !open)}>{reportOpen ? 'Close report' : '＋ Report conditions'}</button>}</div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {demoMode && <div className="pulse-demo-banner" role="status"><span>DEMO DATA</span><div><strong>{demoReason}</strong><small>Showing synthetic crowd, queue, issue, and event activity. Demo reports and pin edits are saved only in this browser; the sample pin positions are illustrative.</small></div></div>}

    {reportOpen && <div className="module-panel pulse-report-panel"><div className="panel-title"><div><p className="eyebrow">QUICK FIELD UPDATE</p><h2>Report conditions</h2></div><span className="pulse-expiry-note">Reports expire automatically</span></div>
      <form className="pulse-report-form" onSubmit={submitReport}>
        <label>Location<select required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}><option value="">Choose a venue</option>{data.venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}</option>)}</select></label>
        <label>Report type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="crowd">Crowd level</option><option value="queue">Queue wait</option><option value="issue">On-site issue</option></select></label>
        {form.kind === 'crowd' && <label>Crowd level<select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="low">Calm</option><option value="moderate">Moderate</option><option value="busy">Busy</option><option value="full">Full</option></select></label>}
        {form.kind === 'queue' && <label>Estimated wait (minutes)<input type="number" min="0" max="2400" step="1" value={form.waitMinutes} onChange={(e) => setForm({ ...form, waitMinutes: e.target.value })}/></label>}
        {form.kind === 'issue' && <label className="pulse-message-field">What is happening?<input required maxLength="280" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="e.g. East entrance temporarily blocked"/></label>}
        {form.kind !== 'issue' && <label className="pulse-message-field">Details (optional)<input maxLength="280" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Add a short note for the next team"/></label>}
        <label>Keep visible<select value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></label>
        <button className="primary" disabled={busy || !form.venueId}>{busy ? 'Saving…' : 'Post live update'}</button>
      </form>
    </div>}

    <div className="pulse-stats">
      <div className="pulse-stat-card"><span>VENUES TRACKED</span><strong>{data.venues.length}</strong><small>Festival locations</small></div>
      <div className="pulse-stat-card pulse-stat-amber"><span>BUSY OR FULL</span><strong>{busyVenues}</strong><small>Latest crowd reports</small></div>
      <div className="pulse-stat-card pulse-stat-blue"><span>QUEUE UPDATES</span><strong>{queueCount}</strong><small>Active wait estimates</small></div>
      <div className="pulse-stat-card pulse-stat-rose"><span>OPEN ISSUES</span><strong>{issueCount}</strong><small>Time-limited alerts</small></div>
    </div>

    <div className="pulse-layout">
      <section className="module-panel pulse-map-panel">
        <div className="pulse-map-header"><div><p className="eyebrow">IIM INDORE · CAMPUS OVERVIEW</p><h2>Festival pulse map</h2><p>Drag the map to explore. Venue pins stay attached to their locations.</p></div><div className="pulse-map-tools"><span className="pulse-refresh"><i/> Updated {data.updatedAt ? relativeTime(data.updatedAt) : 'just now'}</span><button className="ghost pulse-arrange-button" onClick={() => setMapPan({ x: 0, y: 0 })}>Recenter map</button>{canPlace && <button className="ghost pulse-arrange-button" onClick={() => { setArrangingMap((value) => !value); setPlacingVenue(''); }}>{arrangingMap ? 'Done arranging' : 'Arrange pins'}</button>}</div></div>
        {placingVenue && <div className="pulse-place-hint"><span>Placing <strong>{venueById.get(placingVenue)?.name}</strong> — click the matching venue on the IIM map.</span><button className="ghost" onClick={() => setPlacingVenue('')}>Cancel</button></div>}
        <div ref={mapRef} className={`pulse-campus-map${placingVenue ? ' is-placing' : ''}${mapDragging ? ' is-dragging' : ''}`} onClick={placeVenue} onPointerDown={startMapDrag} onPointerMove={moveMap} onPointerUp={finishMapDrag} onPointerCancel={finishMapDrag} role={placingVenue ? 'button' : undefined} tabIndex={placingVenue ? 0 : undefined} onKeyDown={placingVenue ? (e) => { if (e.key === 'Enter' || e.key === ' ') { const bounds = mapCanvasRef.current.getBoundingClientRect(); placeVenue({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }); } } : undefined} aria-label={placingVenue ? 'Choose a map location for this venue' : 'IIM Indore campus map. Drag to pan.'}>
          <div ref={mapCanvasRef} className="pulse-map-canvas" style={{ transform: `translate3d(${mapPan.x}px, ${mapPan.y}px, 0) scale(${MAP_ZOOM})` }}>
          <img className="pulse-campus-map-image" src={campusMap} alt="Map of the IIM Indore campus" draggable="false"/>
          {visibleVenues.map((venue) => {
            if (!venue.mapPosition) return null;
            const reports = (reportsByVenue.get(venue.venueId) || []).filter((report) => report.status === 'active' && new Date(report.expiresAt).getTime() > Date.now());
            const crowd = reports.find((report) => report.kind === 'crowd');
            const queue = reports.find((report) => report.kind === 'queue');
            const issue = reports.some((report) => report.kind === 'issue');
            const state = issue ? 'issue' : crowd?.level || 'calm';
            return <button type="button" key={venue.venueId} className={`pulse-map-marker pulse-marker-${state}${venue.operationalStatus !== 'available' ? ' is-closed' : ''}`} style={{ left: `${venue.mapPosition.x}%`, top: `${venue.mapPosition.y}%` }} onClick={(e) => e.stopPropagation()} title={`${venue.name}${crowd ? ` · ${crowdLabels[crowd.level]}` : ''}${queue ? ` · ${queue.waitMinutes} min queue` : ''}`}>
              <span className="pulse-marker-dot">{issue ? '!' : crowd?.level === 'full' ? '×' : '·'}</span><span className="pulse-marker-label">{venue.name}</span>
              {(queue || issue) && <span className="pulse-marker-badge">{issue ? '!' : `${queue.waitMinutes}m`}</span>}
            </button>;
          })}
          {visibleVenues.length === 0 && <div className="pulse-map-empty">{data.venues.length ? 'No venues match this filter.' : 'Venue locations will appear here when the venue list is available.'}</div>}
          </div>
        </div>
        <div className="pulse-map-footer"><div className="pulse-legend"><span><i className="legend-dot calm"/> Calm</span><span><i className="legend-dot moderate"/> Moderate</span><span><i className="legend-dot busy"/> Busy / full</span><span><i className="legend-dot issue"/> Issue reported</span></div><small>Team venue pins and live reports appear over the IIM map.</small></div>
        {canPlace && (arrangingMap || data.venues.some((venue) => !venue.mapPosition)) && <div className="pulse-unplaced"><div><strong>{arrangingMap ? 'Move a venue pin' : 'Finish your map layout'}</strong><p>{arrangingMap ? 'Choose a venue, then click its location on the map.' : `${data.venues.filter((venue) => !venue.mapPosition).length} venue${data.venues.filter((venue) => !venue.mapPosition).length === 1 ? '' : 's'} still need a pin.`}</p></div><div className="pulse-unplaced-list">{data.venues.filter((venue) => arrangingMap || !venue.mapPosition).map((venue) => <button className={placingVenue === venue.venueId ? 'selected' : ''} key={venue.venueId} onClick={() => setPlacingVenue(venue.venueId)} disabled={busy}>{venue.name}<span>{venue.mapPosition ? '↗ Move' : '＋ Place'}</span></button>)}</div></div>}
      </section>

      <aside className="module-panel pulse-feed-panel">
        <div className="pulse-feed-header"><div><p className="eyebrow">FIELD REPORTS</p><h2>Live updates <span>{activeReports.length}</span></h2></div><select aria-label="Filter reports" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All updates</option><option value="crowd">Crowd</option><option value="queue">Queues</option><option value="issue">Issues</option></select></div>
        <div className="pulse-feed-list">{activeReports.length ? activeReports.map((report) => <article className={`pulse-report-card pulse-report-${report.kind}`} key={report.reportId}>
          <div className="pulse-report-card-top"><span className={`pulse-report-icon pulse-icon-${report.kind}`}>{report.kind === 'crowd' ? '◉' : report.kind === 'queue' ? '↗' : '!'}</span><span className="pulse-report-kind">{kindLabels[report.kind]}</span><time>{relativeTime(report.createdAt)}</time></div>
          <h3>{venueById.get(report.venueId)?.name || report.venueId}</h3>
          <p className="pulse-report-value">{report.kind === 'crowd' ? crowdLabels[report.level] : report.kind === 'queue' ? `${report.waitMinutes} min estimated wait` : report.message}</p>
          {report.kind !== 'issue' && report.message && <p className="pulse-report-message">{report.message}</p>}
          <div className="pulse-report-meta"><span>{roleLabels[report.reporterRole] || 'Staff'}</span><span>·</span><span>{remainingTime(report.expiresAt)}</span>{canManage && report.kind === 'issue' && <button disabled={busy} onClick={() => resolveReport(report.reportId)}>Resolve</button>}</div>
        </article>) : <div className="pulse-feed-empty"><span>◌</span><strong>No active updates</strong><p>Post a crowd, queue, or issue report to keep the team in sync.</p></div>}</div>
        <div className="pulse-feed-footnote">Reports automatically disappear when their timer ends. Staff can resolve issues as soon as they are handled.</div>
      </aside>
    </div>

    <section className="module-panel pulse-venue-strip"><div className="panel-title"><div><p className="eyebrow">UP NEXT</p><h2>Events at tracked venues</h2></div><span className="muted">Next 24 hours</span></div>
      <div className="pulse-event-list">{data.venues.flatMap((venue) => (venue.events || []).map((event) => ({ ...event, venueName: venue.name }))).slice(0, 6).map((event) => <div className="pulse-event-row" key={event.slotId}><span className="pulse-event-time">{new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><div><strong>{event.eventName}</strong><small>{event.venueName}</small></div><span className="pill">{event.status === 'scheduled' ? 'On schedule' : event.status}</span></div>)}{!data.venues.some((venue) => venue.events?.length) && <p className="muted">No events scheduled in the next 24 hours.</p>}</div>
    </section>
  </section>;
}
