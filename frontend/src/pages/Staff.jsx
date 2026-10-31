import React, { useEffect, useMemo, useState } from 'react';
import { staffService } from '../services/index.js';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/Shared.jsx';

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

export default function Staff() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const load = async () => {
    setLoading(true);
    try { setData(await staffService.roster()); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const staff = useMemo(() => (data?.staff || []).filter((person) =>
    `${person.name} ${person.memberId} ${person.roleLabel} ${person.shift}`.toLowerCase().includes(query.toLowerCase())), [data, query]);

  return <>
    <section className="card">
      <h2>Shift coverage by role</h2>
      <p className="muted">Hourly coverage from the core team roster. Names and shifts are shown without personal contact details.</p>
      {loading && !data ? <LoadingState/> : error && !data ? <ErrorState error={error} retry={load}/> : data?.coverage?.length ? <div className="table-scroll">
        <table><thead><tr><th>Role</th><th>Team members</th><th>Hours covered</th><th>Uncovered hours</th></tr></thead>
          <tbody>{data.coverage.map((row) => <tr key={row.role}>
            <td>{row.roleLabel}</td><td>{row.staffCount}</td><td>{row.coveredHours}/24</td>
            <td>{row.uncoveredHours.length ? <StatusBadge tone="warning">{row.uncoveredHours.map(hourLabel).join(', ')}</StatusBadge> : <StatusBadge tone="success">Full day</StatusBadge>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <EmptyState>No shift coverage data is available.</EmptyState>}
      {error && data && <ErrorState error={`Could not refresh staff coverage: ${error}`} retry={load}/>}
    </section>
    <section className="card">
      <div className="row between"><div><h2>Core team roster</h2><p className="muted">Filter by name, team member ID, role, or shift.</p></div>
        <label className="staff-search"><span className="sr-only">Search staff roster</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search staff"/></label>
      </div>
      {loading && !data ? <LoadingState/> : error && !data ? <ErrorState error={error} retry={load}/> : <div className="table-scroll">
        <table><thead><tr><th>Member ID</th><th>Name</th><th>Role</th><th>Shift</th></tr></thead>
          <tbody>{staff.map((person) => <tr key={person.memberId}><td>{person.memberId}</td><td>{person.name}</td><td>{person.roleLabel || person.role}</td><td>{person.shift || 'Not provided'}</td></tr>)}</tbody>
        </table>
        {!staff.length && <EmptyState>No staff match this search.</EmptyState>}
      </div>}
    </section>
  </>;
}
