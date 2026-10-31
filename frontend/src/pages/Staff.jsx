import React, { useEffect, useState } from 'react';
import { staffService } from '../services/index.js';
import { EmptyState, ErrorState, LoadingState } from '../components/Shared.jsx';

const emptyProfile = () => ({ memberId: '', name: '', email: '', department: 'volunteer', role: 'volunteer', roleLabel: '', phone: '', shift: '', status: 'active' });
const timeLabel = (value) => value ? new Date(value).toLocaleString() : '—';
const initialDate = () => '2026-10-31T06:00';

export default function Staff({ user }) {
  const canManage = ['festival_director','hospitality','registration_desk','events_team','logistics_head','merchandise_desk','food_coordinator'].includes(user?.role);
  const [data, setData] = useState({ staff: [], shifts: [], assignments: [], availability: [], attendance: [], departments: [], roles: [] });
  const [directoryQuery, setDirectoryQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [profile, setProfile] = useState(emptyProfile()), [editing, setEditing] = useState(false);
  const [shift, setShift] = useState({ memberId: '', startsAt: initialDate(), endsAt: '2026-10-31T14:00', location: '', notes: '' });
  const [assignment, setAssignment] = useState({ shiftId: '', duty: '', location: '', notes: '' });
  const [availability, setAvailability] = useState({ memberId: '', startsAt: initialDate(), endsAt: '2026-10-31T14:00', status: 'available', reason: '' });

  async function load() {
    setLoading(true); setError('');
    try {
      const [profiles, departments, shifts, assignments, availabilityData, attendanceData] = await Promise.all([
        staffService.list(), staffService.departments(), staffService.shifts(), staffService.assignments(), staffService.availability(), staffService.attendance(),
      ]);
      const next = { staff: profiles.staff || [], departments: departments.departments || profiles.departments || [], roles: departments.roles || profiles.roles || [],
        shifts: shifts.shifts || [], assignments: assignments.assignments || [], availability: availabilityData.availability || [], attendance: attendanceData.attendance || [] };
      setData(next);
      const first = next.staff[0]?.memberId || '';
      setShift((current) => ({ ...current, memberId: current.memberId || first }));
      setAvailability((current) => ({ ...current, memberId: current.memberId || first }));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const visibleStaff = data.staff.filter((member) => !directoryQuery.trim() || `${member.memberId} ${member.name} ${member.department} ${member.roleLabel || member.role}`.toLowerCase().includes(directoryQuery.trim().toLowerCase()));

  async function submit(operation, success) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(success); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function editStaff(member) {
    setProfile({ ...emptyProfile(), ...member, phone: member.phone || '' }); setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function saveProfile(event) {
    event.preventDefault();
    const body = { ...profile, email: profile.email || '', phone: profile.phone || '' };
    submit(() => editing ? staffService.update(profile.memberId, body) : staffService.create(body), `${profile.name} profile saved.`)
      .then(() => { setProfile(emptyProfile()); setEditing(false); });
  }
  function saveShift(event) {
    event.preventDefault();
    submit(() => staffService.createShift(shift), `Shift scheduled for ${shift.memberId}.`);
  }
  function saveAssignment(event) {
    event.preventDefault();
    submit(() => staffService.createAssignment(assignment), `Duty “${assignment.duty}” assigned.`)
      .then(() => setAssignment({ shiftId: '', duty: '', location: '', notes: '' }));
  }
  function saveAvailability(event) {
    event.preventDefault();
    submit(() => staffService.createAvailability(availability), `Availability recorded for ${availability.memberId}.`)
      .then(() => setAvailability((current) => ({ ...current, reason: '' })));
  }
  const staffName = (memberId) => data.staff.find((member) => member.memberId === memberId)?.name || memberId;
  const shiftsForAssignment = data.shifts.filter((item) => !['cancelled','completed'].includes(item.status));
  const ownMemberId = user?.staffMemberId;

  return <>
    <p className="muted">Manage staff profiles, departments, roles, scheduled shifts, duty assignments, availability, and attendance.</p>
    {message && <p className="toast" role="status">{message}</p>}{error && <ErrorState error={error} retry={load}/>}

    {canManage && <section className="card"><h2>{editing ? `Edit profile · ${profile.memberId}` : 'Add staff profile'}</h2>
      <form className="form-grid" onSubmit={saveProfile}>
        <label className="form-field">Member ID<input required disabled={busy || editing} value={profile.memberId} onChange={(e) => setProfile({ ...profile, memberId: e.target.value })}/></label>
        <label className="form-field">Name<input required disabled={busy} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })}/></label>
        <label className="form-field">Email<input type="email" disabled={busy} value={profile.email || ''} onChange={(e) => setProfile({ ...profile, email: e.target.value })}/></label>
        <label className="form-field">Department<select disabled={busy} value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })}>{data.departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
        <label className="form-field">Role<select disabled={busy} value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })}>{data.roles.map((role) => <option key={role.role} value={role.role}>{role.label}</option>)}</select></label>
        <label className="form-field">Role label<input disabled={busy} value={profile.roleLabel || ''} onChange={(e) => setProfile({ ...profile, roleLabel: e.target.value })} placeholder="Optional display title"/></label>
        <label className="form-field">Phone<input disabled={busy} value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })}/></label>
        <label className="form-field">Default shift<input disabled={busy} value={profile.shift || ''} onChange={(e) => setProfile({ ...profile, shift: e.target.value })} placeholder="06:00-14:00"/></label>
        <label className="form-field">Status<select disabled={busy} value={profile.status} onChange={(e) => setProfile({ ...profile, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <div className="row"><button className="primary" disabled={busy}>{editing ? 'Save profile' : 'Create profile'}</button>{editing && <button type="button" className="ghost" disabled={busy} onClick={() => { setProfile(emptyProfile()); setEditing(false); }}>Cancel</button>}</div>
      </form>
    </section>}

    <section className="card"><div className="row between"><h2>Staff directory</h2><div className="row"><input aria-label="Search staff directory" type="search" placeholder="Filter staff" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)}/><span className="badge">{visibleStaff.length} of {data.staff.length} profiles</span></div></div>
      {loading ? <LoadingState/> : visibleStaff.length ? <div className="table-scroll"><table><thead><tr><th>Member</th><th>Department</th><th>Role</th><th>Default shift</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead><tbody>{visibleStaff.map((member) => <tr key={member.memberId}><td><b>{member.name}</b><div className="muted">{member.memberId}{member.email ? ` · ${member.email}` : ''}{member.phone ? ` · ${member.phone}` : ''}</div></td><td>{member.department || '—'}</td><td>{member.roleLabel || member.role}</td><td>{member.shift || '—'}</td><td>{member.status || 'active'}</td>{canManage && <td><button className="ghost" disabled={busy} onClick={() => editStaff(member)}>Edit</button></td>}</tr>)}</tbody></table></div> : <EmptyState>No staff profiles match this search.</EmptyState>}
    </section>

    {canManage && <section className="card"><h2>Schedule a shift</h2><form className="form-grid" onSubmit={saveShift}>
      <label className="form-field">Staff member<select required value={shift.memberId} onChange={(e) => setShift({ ...shift, memberId: e.target.value })}>{data.staff.filter((member) => member.status !== 'inactive').map((member) => <option key={member.memberId} value={member.memberId}>{member.memberId} · {member.name}</option>)}</select></label>
      <label className="form-field">Starts (IST)<input required type="datetime-local" value={shift.startsAt} onChange={(e) => setShift({ ...shift, startsAt: e.target.value })}/></label>
      <label className="form-field">Ends (IST)<input required type="datetime-local" value={shift.endsAt} onChange={(e) => setShift({ ...shift, endsAt: e.target.value })}/></label>
      <label className="form-field">Location<input value={shift.location} onChange={(e) => setShift({ ...shift, location: e.target.value })}/></label>
      <label className="form-field">Notes<input value={shift.notes} onChange={(e) => setShift({ ...shift, notes: e.target.value })}/></label>
      <div><button className="primary" disabled={busy || !data.staff.length}>Schedule shift</button></div>
    </form></section>}

    <section className="card"><h2>Shift schedule</h2>{loading ? <LoadingState/> : data.shifts.length ? <div className="table-scroll"><table><thead><tr><th>Staff member</th><th>Department / role</th><th>Start</th><th>End</th><th>Location</th><th>Status</th><th>Attendance</th></tr></thead><tbody>{data.shifts.map((item) => {
        const attendance = data.attendance.find((row) => row.shiftId === item.shiftId);
        const mayClock = user?.role === 'volunteer' ? item.memberId === ownMemberId : true;
        return <tr key={item.shiftId}><td>{staffName(item.memberId)}<div className="muted">{item.memberId}</div></td><td>{item.department} · {item.role}</td><td>{timeLabel(item.startsAt)}</td><td>{timeLabel(item.endsAt)}</td><td>{item.location || '—'}</td><td>{item.status}</td>
          <td>{attendance?.checkInAt ? `In ${timeLabel(attendance.checkInAt)}${attendance.checkOutAt ? ` · Out ${timeLabel(attendance.checkOutAt)}` : ''}` : 'Not checked in'}{mayClock && !['cancelled','completed'].includes(item.status) && <div className="row">{!attendance?.checkInAt ? <button className="ghost" disabled={busy} onClick={() => submit(() => staffService.checkIn(item.shiftId), `Checked in to ${item.shiftId}.`)}>Check in</button> : !attendance?.checkOutAt && <button className="ghost" disabled={busy} onClick={() => submit(() => staffService.checkOut(item.shiftId), `Checked out of ${item.shiftId}.`)}>Check out</button>}</div>}</td>
        </tr>;
      })}</tbody></table></div> : <EmptyState>No shifts scheduled.</EmptyState>}</section>

    {canManage && <section className="card"><h2>Assign a duty</h2><form className="form-grid" onSubmit={saveAssignment}>
      <label className="form-field">Shift<select required value={assignment.shiftId} onChange={(e) => setAssignment({ ...assignment, shiftId: e.target.value })}>{shiftsForAssignment.map((item) => <option key={item.shiftId} value={item.shiftId}>{staffName(item.memberId)} · {timeLabel(item.startsAt)}</option>)}</select></label>
      <label className="form-field">Duty<input required value={assignment.duty} onChange={(e) => setAssignment({ ...assignment, duty: e.target.value })} placeholder="Registration desk"/></label>
      <label className="form-field">Location<input value={assignment.location} onChange={(e) => setAssignment({ ...assignment, location: e.target.value })}/></label>
      <label className="form-field">Notes<input value={assignment.notes} onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}/></label>
      <div><button className="primary" disabled={busy || !shiftsForAssignment.length}>Assign duty</button></div>
    </form></section>}

    <section className="card"><h2>Duty assignments</h2>{loading ? <LoadingState/> : data.assignments.length ? <div className="table-scroll"><table><thead><tr><th>Staff member</th><th>Duty</th><th>Department</th><th>Location</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>{data.assignments.map((item) => <tr key={item.assignmentId}><td>{staffName(item.memberId)}</td><td>{item.duty}</td><td>{item.department}</td><td>{item.location || '—'}</td><td>{timeLabel(item.startsAt)}</td><td>{timeLabel(item.endsAt)}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <EmptyState>No duty assignments recorded.</EmptyState>}</section>

    {canManage && <section className="card"><h2>Record availability</h2><form className="form-grid" onSubmit={saveAvailability}>
      <label className="form-field">Staff member<select required value={availability.memberId} onChange={(e) => setAvailability({ ...availability, memberId: e.target.value })}>{data.staff.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberId} · {member.name}</option>)}</select></label>
      <label className="form-field">Starts (IST)<input required type="datetime-local" value={availability.startsAt} onChange={(e) => setAvailability({ ...availability, startsAt: e.target.value })}/></label>
      <label className="form-field">Ends (IST)<input required type="datetime-local" value={availability.endsAt} onChange={(e) => setAvailability({ ...availability, endsAt: e.target.value })}/></label>
      <label className="form-field">Availability<select value={availability.status} onChange={(e) => setAvailability({ ...availability, status: e.target.value })}><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
      <label className="form-field">Reason<input value={availability.reason} onChange={(e) => setAvailability({ ...availability, reason: e.target.value })} placeholder="Required when unavailable"/></label>
      <div><button className="primary" disabled={busy || !data.staff.length}>Save availability</button></div>
    </form><p className="muted">Recorded unavailable windows block overlapping shifts. When availability windows exist, new shifts must fit inside one.</p></section>}

    <section className="card"><h2>Availability records</h2>{loading ? <LoadingState/> : data.availability.length ? <div className="table-scroll"><table><thead><tr><th>Staff member</th><th>Availability</th><th>Start</th><th>End</th><th>Reason</th></tr></thead><tbody>{data.availability.map((item) => <tr key={item._id}><td>{staffName(item.memberId)}</td><td>{item.status}</td><td>{timeLabel(item.startsAt)}</td><td>{timeLabel(item.endsAt)}</td><td>{item.reason || '—'}</td></tr>)}</tbody></table></div> : <EmptyState>No availability windows recorded.</EmptyState>}</section>
  </>;
}
