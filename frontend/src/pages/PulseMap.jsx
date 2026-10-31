import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const crowdLabels = { low: 'Calm', moderate: 'Moderate', busy: 'Busy', full: 'Full' };
const kindLabels = { crowd: 'Crowd update', queue: 'Queue update', issue: 'Operations alert' };
const roleLabels = { festival_director: 'Festival Director', hospitality: 'Hospitality', registration_desk: 'Registration', events_team: 'Events Team', logistics_head: 'Logistics', merchandise_desk: 'Merchandise', food_coordinator: 'Food team', volunteer: 'Volunteer' };
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [reportOpen, setReportOpen] = useState(false);
  const [placingVenue, setPlacingVenue] = useState('');
  const [form, setForm] = useState({ venueId: '', kind: 'crowd', level: 'moderate', waitMinutes: 10, message: '', durationMinutes: 60 });
  const mapRef = useRef(null);
  const canPlace = ['festival_director', 'events_team', 'logistics_head'].includes(user?.role);
  const canManage = ['festival_director', 'events_team', 'logistics_head', 'hospitality'].includes(user?.role);
  const canReport = true;

  async function load() {
    try {
      const next = await api('/pulse');
      setData({ venues: next.venues || [], reports: next.reports || [] });
      setError('');
    } catch (e) { setError(e.message); }
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
  const activeReports = data.reports.filter((report) => filter === 'all' || report.kind === filter);
  const busyVenues = data.venues.filter((venue) => {
    const latest = (reportsByVenue.get(venue.venueId) || []).find((report) => report.kind === 'crowd');
    return ['busy', 'full'].includes(latest?.level);
  }).length;
  const issueCount = data.reports.filter((report) => report.kind === 'issue').length;
  const queueCount = data.reports.filter((report) => report.kind === 'queue').length;

  async function submitReport(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/pulse/reports', { method: 'POST', body: {
        ...form,
        waitMinutes: form.kind === 'queue' ? Number(form.waitMinutes) : undefined,
        level: form.kind === 'crowd' ? form.level : undefined,
        message: form.message.trim(),
      } });
      setReportOpen(false);
      setForm((current) => ({ ...current, message: '' }));
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function placeVenue(event) {
    if (!placingVenue || !mapRef.current || !canPlace) return;
    const bounds = mapRef.current.getBoundingClientRect();
    const x = Math.max(3, Math.min(97, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(6, Math.min(94, ((event.clientY - bounds.top) / bounds.height) * 100));
    setBusy(true); setError('');
    try {
      await api(`/pulse/venues/${encodeURIComponent(placingVenue)}/location`, { method: 'PATCH', body: { x, y } });
      setPlacingVenue('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function resolveReport(reportId) {
    setBusy(true); setError('');
    try { await api(`/pulse/reports/${encodeURIComponent(reportId)}/resolve`, { method: 'PATCH', body: {} }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const visibleVenues = data.venues.filter((venue) => filter === 'all' || (reportsByVenue.get(venue.venueId) || []).some((report) => report.kind === filter));

  return <section className="module-page pulse-page">
    <div className="module-heading pulse-heading">
      <div><p className="eyebrow">OPERATIONS / LIVE CONDITIONS</p><h1>Festival pulse</h1><p className="muted">A shared, live view of crowd levels, queues, and on-site issues.</p></div>
      <div className="pulse-heading-actions"><span className="pulse-live"><i/> LIVE · updates every 30 sec</span>{canReport && <button className="primary" onClick={() => setReportOpen((open) => !open)}>{reportOpen ? 'Close report' : '＋ Report conditions'}</button>}</div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}

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
        <div className="pulse-map-header"><div><p className="eyebrow">CAMPUS OVERVIEW</p><h2>Live venue map</h2><p>Schematic layout · place pins to match your campus</p></div><div className="pulse-map-tools"><span className="pulse-refresh"><i/> Updated {data.updatedAt ? relativeTime(data.updatedAt) : 'just now'}</span></div></div>
        {placingVenue && <div className="pulse-place-hint"><span>Placing <strong>{venueById.get(placingVenue)?.name}</strong> — click its spot on the layout.</span><button className="ghost" onClick={() => setPlacingVenue('')}>Cancel</button></div>}
        <div ref={mapRef} className={`pulse-campus-map${placingVenue ? ' is-placing' : ''}`} onClick={placeVenue} role={placingVenue ? 'button' : undefined} tabIndex={placingVenue ? 0 : undefined} onKeyDown={placingVenue ? (e) => { if (e.key === 'Enter' || e.key === ' ') placeVenue({ clientX: mapRef.current.getBoundingClientRect().left + mapRef.current.clientWidth / 2, clientY: mapRef.current.getBoundingClientRect().top + mapRef.current.clientHeight / 2 }); } : undefined} aria-label={placingVenue ? 'Choose a map location for this venue' : 'Schematic campus map'}>
          <div className="pulse-map-road pulse-road-one"/><div className="pulse-map-road pulse-road-two"/><div className="pulse-map-road pulse-road-three"/>
          <div className="pulse-map-path pulse-path-one"/><div className="pulse-map-path pulse-path-two"/>
          <span className="pulse-zone-label pulse-zone-north">NORTH CAMPUS</span><span className="pulse-zone-label pulse-zone-south">SOUTH CAMPUS</span>
          <span className="pulse-map-landmark pulse-landmark-green">▧ &nbsp;MAIN QUAD</span><span className="pulse-map-landmark pulse-landmark-blue">＋ &nbsp;FIRST AID</span>
          <span className="pulse-map-landmark pulse-landmark-gold">⌖ &nbsp;GATE</span>
          {visibleVenues.map((venue) => {
            if (!venue.mapPosition) return null;
            const reports = reportsByVenue.get(venue.venueId) || [];
            const crowd = reports.find((report) => report.kind === 'crowd');
            const queue = reports.find((report) => report.kind === 'queue');
            const issue = reports.some((report) => report.kind === 'issue');
            const state = issue ? 'issue' : crowd?.level || 'calm';
            return <button type="button" key={venue.venueId} className={`pulse-map-marker pulse-marker-${state}${venue.operationalStatus !== 'available' ? ' is-closed' : ''}`} style={{ left: `${venue.mapPosition.x}%`, top: `${venue.mapPosition.y}%` }} onClick={(e) => e.stopPropagation()} title={`${venue.name}${crowd ? ` · ${crowdLabels[crowd.level]}` : ''}${queue ? ` · ${queue.waitMinutes} min queue` : ''}`}>
              <span className="pulse-marker-dot">{issue ? '!' : crowd?.level === 'full' ? '×' : '·'}</span><span className="pulse-marker-label">{venue.name}</span>
              {(queue || issue) && <span className="pulse-marker-badge">{issue ? '!' : `${queue.waitMinutes}m`}</span>}
            </button>;
          })}
          {visibleVenues.length === 0 && <div className="pulse-map-empty">No venues match this filter.</div>}
        </div>
        <div className="pulse-map-footer"><div className="pulse-legend"><span><i className="legend-dot calm"/> Calm</span><span><i className="legend-dot moderate"/> Moderate</span><span><i className="legend-dot busy"/> Busy / full</span><span><i className="legend-dot issue"/> Issue reported</span></div><small>Pin locations are saved for the whole team. No GPS or external map service required.</small></div>
        {canPlace && data.venues.some((venue) => !venue.mapPosition) && <div className="pulse-unplaced"><div><strong>Finish your map layout</strong><p>{data.venues.filter((venue) => !venue.mapPosition).length} venue{data.venues.filter((venue) => !venue.mapPosition).length === 1 ? '' : 's'} still need a pin.</p></div><div className="pulse-unplaced-list">{data.venues.filter((venue) => !venue.mapPosition).map((venue) => <button className={placingVenue === venue.venueId ? 'selected' : ''} key={venue.venueId} onClick={() => setPlacingVenue(venue.venueId)} disabled={busy}>{venue.name}<span>＋ Place</span></button>)}</div></div>}
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
