import React, { useCallback, useEffect, useState } from 'react';
import { accommodationOps } from '../services/operations.js';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/Shared.jsx';

const TABS = ['Overview', 'Beds & stays', 'Arrivals & departures', 'Properties'];
const rowsOf = (result, key) => result?.[key] || result?.rows || [];
const label = (value) => String(value ?? '—').replaceAll('_', ' ');

function Table({ rows, columns, empty }) {
  if (!rows?.length) return <EmptyState>{empty}</EmptyState>;
  return <div className="table-scroll"><table><thead><tr>{columns.map(([key, title]) => <th key={key}>{title}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row._id || row.allocationId || row.roomId || row.propertyId || i}>
    {columns.map(([key]) => <td key={key}>{typeof key === 'function' ? key(row) : key.split('.').reduce((value, part) => value?.[part], row) == null ? '—' : String(key.split('.').reduce((value, part) => value?.[part], row))}</td>)}
  </tr>)}</tbody></table></div>;
}

export default function AccommodationOps({ user }) {
  const [tab, setTab] = useState('Overview');
  const [selectedBlock, setSelectedBlock] = useState('All blocks');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomView, setRoomView] = useState('rack');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [property, setProperty] = useState({ propertyId: '', propertyName: '', propertyType: 'college_hostel', ownership: 'college', beds: '', city: '', status: 'available' });
  const [room, setRoom] = useState({ roomId: '', block: '', floor: '0', gender: 'all_gender', capacity: '4', status: 'ready' });
  const canWrite = ['festival_director', 'hospitality'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [dashboard, properties, rooms, allocations, arrivals, departures] = await Promise.allSettled([
      accommodationOps.dashboard(), accommodationOps.properties(), accommodationOps.rooms(), accommodationOps.allocations(), accommodationOps.arrivals(), accommodationOps.departures(),
    ]);
    const results = { dashboard, properties, rooms, allocations, arrivals, departures };
    const failed = Object.values(results).find((result) => result.status === 'rejected');
    if (failed) setError(failed.reason?.message || 'Could not load accommodation data.');
    setData(Object.fromEntries(Object.entries(results).map(([key, result]) => [key, result.status === 'fulfilled' ? result.value : null])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(action, success) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); setPreview(null); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function createProperty(e) {
    e.preventDefault();
    await act(() => accommodationOps.createProperty({ ...property, beds: Number(property.beds), contractedBedCapacity: Number(property.beds) }), 'Property added to accommodation inventory.');
    setProperty({ propertyId: '', propertyName: '', propertyType: 'college_hostel', ownership: 'college', beds: '', city: '', status: 'available' });
  }
  async function createRoom(e) {
    e.preventDefault();
    await act(() => accommodationOps.createRoom({ ...room, capacity: Number(room.capacity), floor: Number(room.floor) }), 'Room added to the room inventory.');
    setRoom({ roomId: '', block: '', floor: '0', gender: 'all_gender', capacity: '4', status: 'ready' });
  }
  async function runPreview() {
    setBusy(true); setError(''); setMessage('');
    try { setPreview(await accommodationOps.preview({ strategy: 'balanced' })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const kpis = data.dashboard || {};
  const allocationRows = rowsOf(data.allocations, 'rows');
  const properties = rowsOf(data.properties, 'rows');
  const rooms = rowsOf(data.rooms, 'rows');
  const arrivals = rowsOf(data.arrivals, 'rows');
  const departures = rowsOf(data.departures, 'rows');
  const blocks = ['All blocks', ...new Set(rooms.map((item) => item.block).filter(Boolean).sort())];
  const visibleRooms = selectedBlock === 'All blocks' ? rooms : rooms.filter((item) => item.block === selectedBlock);
  const roomState = (item) => {
    const status = String(item.operationalStatus || item.status || '').toLowerCase();
    if (/maintenance|unavailable|out.of.order|blocked|closed/.test(status)) return 'unavailable';
    if (/clean|inspection|dirty/.test(status)) return 'attention';
    if (item.occupiedBeds != null && item.capacity != null) {
      if (Number(item.occupiedBeds) <= 0) return 'empty';
      if (Number(item.occupiedBeds) >= Number(item.capacity)) return 'full';
      return 'partial';
    }
    return 'unknown';
  };

  return <div className="module-page">
    <section className="module-hero accommodation-hero">
      <div><span className="eyebrow">STAYS · CHECK-IN · CAPACITY</span><h2>Accommodation desk</h2><p>Coordinate beds, arrivals, and room readiness from one operational view.</p></div>
      <div className="hero-actions"><StatusBadge tone={error?'warning':loading?'info':'success'}>{error?'Some data unavailable':loading?'Loading data…':'Data loaded'}</StatusBadge>{canWrite && <button className="button-light" onClick={runPreview} disabled={busy}>Preview allocation</button>}</div>
    </section>
    {message && <p className="toast motion-in" role="status">{message}</p>}{error && <ErrorState error={error} retry={load}/>}
    <nav className="module-tabs" aria-label="Accommodation sections">{TABS.map((item) => <button type="button" key={item} className={tab === item ? 'selected' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
    {loading && !data.dashboard ? <LoadingState/> : <div className="module-content" key={tab}>
      {tab === 'Overview' && <>
        <section className="metric-strip">{[['Demand', kpis.demand], ['Allocated', kpis.allocated], ['Awaiting arrival', kpis.pendingCheckIn], ['Checked in', kpis.checkedIn], ['Usable beds', kpis.usableBeds], ['Rooms to ready', kpis.roomsRequiringCleaning]].map(([name, value], i) => <article className="metric-tile" style={{ '--delay': `${i * 55}ms` }} key={name}><span>{name}</span><strong>{value ?? '—'}</strong><small>{name === 'Demand' ? 'accommodation requested' : name === 'Usable beds' ? `${kpis.physicalBeds ?? '—'} physical total` : 'current count'}</small></article>)}</section>
        <div className="module-columns"><section className="card"><div className="section-heading"><div><span className="eyebrow">LIVE QUEUE</span><h2>Next arrivals</h2></div><button className="text-action" onClick={() => setTab('Arrivals & departures')}>View all →</button></div><Table rows={arrivals.slice(0, 6)} columns={[[r => r.participantId, 'Participant'], ['contingentId', 'Contingent'], ['bed.roomId', 'Room'], ['checkIn', 'Arrival']]} empty="No one is awaiting check-in."/></section>
          <section className="card capacity-card"><div className="section-heading"><div><span className="eyebrow">CAPACITY</span><h2>Bed readiness</h2></div><span className="capacity-ring">{kpis.roomsReady ?? '—'}<small>ready</small></span></div><div className="capacity-bar"><span style={{ width: `${kpis.physicalBeds ? Math.min(100, (kpis.usableBeds / kpis.physicalBeds) * 100) : 0}%` }}/></div><div className="capacity-foot"><span>{kpis.usableBeds ?? 0} usable</span><span>{kpis.physicalBeds ?? 0} total beds</span></div><p className="muted">Estimated external accommodation: ₹{Number(kpis.estimatedExternalCost || 0).toLocaleString('en-IN')}</p></section></div>
        {canWrite && <section className="card allocation-card"><div className="section-heading"><div><span className="eyebrow">PLANNING</span><h2>Allocation preview</h2></div><button className="primary" disabled={busy} onClick={runPreview}>Run balanced preview</button></div><p className="muted">Preview is read-only. Commit re-runs the allocator against current availability before reserving beds.</p>
          {preview && <div className="preview-result motion-in"><div className="row between"><strong>{preview.demand ?? preview.allocations?.length ?? 0} participants considered</strong><StatusBadge tone="warning">No changes made</StatusBadge></div><p>Placed: {preview.metrics?.placed ?? '—'} · Unplaced: {preview.metrics?.unplaced ?? '—'} · Available rooms: {preview.capacities?.rooms ?? '—'}</p><button className="primary" disabled={busy || !preview.allocations?.length} onClick={() => act(() => accommodationOps.commit({ strategy: 'balanced' }), 'Allocation committed. Beds have been reserved.')}>Commit allocation</button></div>}
        </section>}
      </>}
      {tab === 'Beds & stays' && <><section className="card room-rack"><div className="section-heading"><div><span className="eyebrow">ROOM RACK · LIVE INVENTORY</span><h2>Room availability</h2><p className="muted">Choose a block to inspect room readiness and reported bed availability.</p></div><button className="ghost" onClick={load}>Refresh</button></div>
        <div className="room-rack-toolbar"><label className="form-field">Block<select value={selectedBlock} onChange={(e) => setSelectedBlock(e.target.value)}>{blocks.map((block) => <option key={block}>{block}</option>)}</select></label><div className="room-view-toggle"><button className={roomView==='rack'?'selected':''} onClick={()=>setRoomView('rack')}>Room rack</button><button className={roomView==='table'?'selected':''} onClick={()=>setRoomView('table')}>Table</button></div><div className="room-legend"><span><i className="room-dot empty"/>Empty</span><span><i className="room-dot partial"/>Part-filled</span><span><i className="room-dot full"/>Full</span><span><i className="room-dot attention"/>Needs attention</span><span><i className="room-dot unavailable"/>Unavailable</span></div></div>
        {roomView==='table' ? <Table rows={visibleRooms} columns={[[r=>r.roomId,'Room'],['block','Block'],['floor','Floor'],['capacity','Beds'],['occupiedBeds','Occupied'],['availableBeds','Available'],['operationalStatus','Readiness']]} empty="No rooms match this block."/> : visibleRooms.length ? <div className="room-floor-list">{[...new Set(visibleRooms.map((item) => item.floor ?? 'Floor not set'))].sort((a,b) => Number(b)-Number(a)).map((floor) => <section className="room-floor" key={floor}><h3>{typeof floor === 'number' || /^\d+$/.test(String(floor)) ? `Floor ${floor}` : floor}</h3><div className="room-grid">{visibleRooms.filter((item) => String(item.floor ?? 'Floor not set') === String(floor)).map((item) => { const state = roomState(item); const label={empty:'Empty',partial:'Part-filled',full:'Full',attention:'Needs attention',unavailable:'Unavailable',unknown:'Status unavailable'}[state]; return <button aria-pressed={selectedRoom?.roomId===item.roomId} onClick={()=>setSelectedRoom(item)} className={`room-tile ${state}`} key={item._id || item.roomId} title={`${item.roomId} · ${label}`}><strong>{item.roomId || 'Room'}</strong><span>{item.occupiedBeds ?? '—'} / {item.capacity ?? '—'} beds</span><small>{label}{item.status?` · ${item.status.replaceAll('_',' ')}`:''}</small></button>; })}</div></section>)}</div> : <EmptyState>{rooms.length ? 'No rooms in this block.' : 'No rooms have been added.'}</EmptyState>}
        {selectedRoom&&<aside className="room-detail-panel" aria-label={`Room ${selectedRoom.roomId} details`}><div className="section-heading"><div><span className="eyebrow">ROOM DETAILS</span><h3>{selectedRoom.roomId}</h3></div><button className="ghost" onClick={()=>setSelectedRoom(null)}>Close</button></div><div className="detail-grid"><div><small>Block / floor</small><strong>{selectedRoom.block||'—'} / {selectedRoom.floor??'—'}</strong></div><div><small>Capacity</small><strong>{selectedRoom.capacity??'—'} beds</strong></div><div><small>Occupied</small><strong>{selectedRoom.occupiedBeds??'—'}</strong></div><div><small>Available</small><strong>{selectedRoom.availableBeds??'—'}</strong></div><div><small>Readiness</small><strong>{selectedRoom.status||'Not provided'}</strong></div></div><h4>Allocations</h4><Table rows={allocationRows.filter(a=>a.bed?.roomId===selectedRoom.roomId)} columns={[[r=>r.participantId,'Participant'],['checkIn','Check-in'],['checkOut','Check-out'],['status','Status']]} empty="No allocation records for this room."/><p className="muted">Availability is based on current API fields; date-specific availability is not returned here.</p></aside>}
      </section><section className="card"><div className="section-heading"><div><span className="eyebrow">ACTIVE RECORDS</span><h2>Current allocations</h2></div></div><Table rows={allocationRows.slice(0, 30)} columns={[[r => r.participantId, 'Participant'], ['contingentId', 'Contingent'], ['bed.kind', 'Type'], ['bed.roomId', 'Room'], ['bed.propertyId', 'Property'], ['checkIn', 'Check-in'], ['status', 'Status']]} empty="No active allocation records."/></section></>}
      {tab === 'Arrivals & departures' && <div className="module-columns"><section className="card"><div className="section-heading"><div><span className="eyebrow">ARRIVALS</span><h2>Pending check-in</h2></div><StatusBadge>{arrivals.length} pending</StatusBadge></div>{arrivals.length ? <div className="action-list">{arrivals.map((row) => <article className="action-row" key={row.allocationId || row._id}><div><strong>{row.participantId}</strong><span>{row.contingentId || 'Contingent unavailable'} · {row.bed?.roomId || row.bed?.propertyId || 'Bed TBD'}</span></div>{canWrite && <button className="primary" disabled={busy} onClick={() => act(() => accommodationOps.checkIn(row.participantId), `Checked in ${row.participantId}.`)}>Check in</button>}</article>)}</div> : <EmptyState>No pending arrivals.</EmptyState>}</section>
        <section className="card"><div className="section-heading"><div><span className="eyebrow">DEPARTURES</span><h2>Pending check-out</h2></div><StatusBadge tone="warning">{departures.length} staying</StatusBadge></div>{departures.length ? <div className="action-list">{departures.map((row) => <article className="action-row" key={row.allocationId || row._id}><div><strong>{row.participantId}</strong><span>{row.bed?.roomId || row.bed?.propertyId || 'Bed unavailable'} · {row.checkOut ? new Date(row.checkOut).toLocaleDateString() : 'Date unavailable'}</span></div>{canWrite && <button className="ghost" disabled={busy} onClick={() => act(() => accommodationOps.checkOut(row.participantId), `Checked out ${row.participantId}.`)}>Check out</button>}</article>)}</div> : <EmptyState>No current check-outs.</EmptyState>}</section></div>}
      {tab === 'Properties' && <div className="module-columns"><section className="card"><div className="section-heading"><div><span className="eyebrow">PROPERTY DIRECTORY</span><h2>Accommodation properties</h2></div><StatusBadge>{properties.length} properties</StatusBadge></div><Table rows={properties} columns={[[r => r.propertyName, 'Property'], ['propertyType', 'Type'], ['city', 'City'], ['beds', 'Beds'], ['status', 'Status']]} empty="No accommodation properties have been added."/></section>
        {canWrite && <div className="stacked-cards"><section className="card"><span className="eyebrow">ADD A STAY OPTION</span><h2>New property</h2><form className="form-grid" onSubmit={createProperty}><label className="form-field">Property ID<input required value={property.propertyId} onChange={e => setProperty({ ...property, propertyId: e.target.value })}/></label><label className="form-field">Property name<input required value={property.propertyName} onChange={e => setProperty({ ...property, propertyName: e.target.value })}/></label><label className="form-field">Type<select value={property.propertyType} onChange={e => setProperty({ ...property, propertyType: e.target.value })}><option value="college_hostel">College hostel</option><option value="hotel">Hotel</option><option value="guest_house">Guest house</option><option value="private_hostel">Private hostel</option></select></label><label className="form-field">Beds<input type="number" min="0" required value={property.beds} onChange={e => setProperty({ ...property, beds: e.target.value })}/></label><label className="form-field">City<input value={property.city} onChange={e => setProperty({ ...property, city: e.target.value })}/></label><button className="primary" disabled={busy}>Add property</button></form></section>
          <section className="card"><span className="eyebrow">CREATE A ROOM</span><h2>New room</h2><form className="form-grid" onSubmit={createRoom}><label className="form-field">Room ID<input required value={room.roomId} onChange={e => setRoom({ ...room, roomId: e.target.value })}/></label><label className="form-field">Block<input value={room.block} onChange={e => setRoom({ ...room, block: e.target.value })}/></label><label className="form-field">Floor<input type="number" value={room.floor} onChange={e => setRoom({ ...room, floor: e.target.value })}/></label><label className="form-field">Beds<input type="number" min="1" max="100" required value={room.capacity} onChange={e => setRoom({ ...room, capacity: e.target.value })}/></label><label className="form-field">Room policy<select value={room.gender} onChange={e => setRoom({ ...room, gender: e.target.value })}><option value="all_gender">All gender</option><option value="girls">Girls</option><option value="boys">Boys</option></select></label><button className="primary" disabled={busy}>Add room</button></form></section></div>}
      </div>}
    </div>}
  </div>;
}
