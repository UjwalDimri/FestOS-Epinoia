```jsx
import React, { useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import {
  DemoBanner,
  ErrorBoundary,
  ErrorState,
  LoadingState,
  PageHeader,
} from './components/Shared.jsx';
import { roleCanSee } from './services/access.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Participants from './pages/Participants.jsx';
import Disruptions from './pages/Disruptions.jsx';
import Plans from './pages/Plans.jsx';
import DataQuality from './pages/DataQuality.jsx';
import Audit from './pages/Audit.jsx';
import Logistics from './pages/Logistics.jsx';
import Staff from './pages/Staff.jsx';
import Merchandise from './pages/Merchandise.jsx';
import Vendors from './pages/Vendors.jsx';
import AccommodationOps from './pages/AccommodationOps.jsx';
import Events from './pages/Events.jsx';
import Venues from './pages/Venues.jsx';
import Scheduling from './pages/Scheduling.jsx';

const PAGES = [
  ['dashboard', 'Control tower', Dashboard, '/dashboard', '◈', 'Overview'],

  ['participants', 'People', Participants, '/participants', '◉', 'People'],

  ['plans', 'Accommodation', Plans, '/accommodation', '⌂', 'Operations'],
  [
    'accommodation',
    'Accommodation desk',
    AccommodationOps,
    '/accommodation-desk',
    '⌂',
    'Operations',
  ],
  ['events', 'Events', Events, '/events', '⚑', 'Operations'],
  ['venues', 'Venues', Venues, '/venues', '▦', 'Operations'],
  ['scheduling', 'Scheduling', Scheduling, '/scheduling', '◷', 'Operations'],
  [
    'disruptions',
    'Disruptions',
    Disruptions,
    '/disruptions',
    '⌁',
    'Operations',
  ],

  ['logistics', 'Logistics', Logistics, '/logistics', '⬡', 'Resources'],
  [
    'merchandise',
    'Merchandise',
    Merchandise,
    '/merchandise',
    '◇',
    'Resources',
  ],
  [
    'vendors',
    'Food & vendors',
    Vendors,
    '/vendors',
    '♧',
    'Resources',
  ],

  ['data', 'Data quality', DataQuality, '/data-quality', '⌕', 'Administration'],
  ['audit', 'Audit', Audit, '/audit', '▤', 'Administration'],
  [
    'staff',
    'Staff & volunteers',
    Staff,
    '/staff',
    '♙',
    'Administration',
  ],
];

const PATH_BY_KEY = Object.fromEntries(
  PAGES.map(([key, , , path]) => [key, path])
);

const pageFromLocation = () =>
  PAGES.find(([, , , path]) => path === window.location.pathname)?.[0] ||
  PAGES.find(([key]) => key === window.location.hash.slice(1))?.[0] ||
  'dashboard';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(pageFromLocation);
  const [menuOpen, setMenuOpen] = useState(false);

  const [theme, setTheme] = useState(
    () => localStorage.getItem('festos_theme') || 'light'
  );

  const [booting, setBooting] = useState(Boolean(getToken()));
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('festos_theme', theme);
  }, [theme]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setSessionError('Your session expired. Sign in again.');
    });
  }, []);

  useEffect(() => {
    const update = () => {
      setPage(pageFromLocation());
      setMenuOpen(false);
    };

    addEventListener('popstate', update);
    addEventListener('hashchange', update);

    return () => {
      removeEventListener('popstate', update);
      removeEventListener('hashchange', update);
    };
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }

    api('/me')
      .then((d) => setUser(d.user))
      .catch((e) => {
        if (e.status === 401) {
          setToken(null);
          setSessionError('Your session expired. Sign in again.');
        } else {
          setSessionError(
            `Could not validate your session: ${e.message}`
          );
        }
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <main>
        <LoadingState />
      </main>
    );
  }

  if (!user) {
    return (
      <Login
        onLogin={setUser}
        sessionError={sessionError}
      />
    );
  }

  const selected = PAGES.find(([key]) => key === page);
  const [key, label, Page] = selected || [];

  const navigate = (key) => {
    window.history.pushState(
      {},
      '',
      PATH_BY_KEY[key] || '/dashboard'
    );

    setPage(key);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setSessionError('');
    navigate('dashboard');
  };

  if (selected && !roleCanSee(user.role, key)) {
    return (
      <main>
        <ErrorState
          error="Your role cannot access this page."
          retry={() => navigate('dashboard')}
        />
      </main>
    );
  }

  const groups = [
    ...new Set(PAGES.map(([, , , , , group]) => group)),
  ];

  const descriptions = {
    dashboard:
      'A live view of festival readiness, open alerts and operational pressure.',

    participants:
      'Search and review participant records with role-aware field visibility.',

    plans:
      'Review accommodation plans, capacities and room allocation.',

    accommodation:
      'Manage property capacity, room readiness, arrivals and departures.',

    events:
      'Create proposals, coordinate owners, and track event readiness.',

    venues:
      'Manage campus spaces, facilities, availability, and bookings.',

    scheduling:
      'Generate, validate, publish, and roll back event schedules.',

    disruptions:
      'Preview operational impact before an authorized change is committed.',

    logistics:
      'Manage inventory, locations, requests, transfers and purchasing.',

    merchandise:
      'Manage merchandise stock, participant issues and returns.',

    vendors:
      'Track vendor compliance, dietary coverage, meal service, and settlement.',

    data:
      'Review reported data issues and duplicate candidates.',

    audit:
      'Verify the audit chain and inspect recorded operational actions.',

    staff:
      'Manage festival staff, volunteers, assignments, and operational availability.',
  };

  return (
    <div className="app-shell">

      <aside
        className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}
        aria-label="Application navigation"
      >
        <div className="brand">
          <span
            className="brand-mark"
            aria-hidden="true"
          >
            F
          </span>

          <span>
            <b>FestOS</b>
            <small>FESTIVAL OPERATIONS</small>
          </span>
        </div>

        <div className="festival-context">
          <span className="context-label">WORKSPACE</span>
          <strong>Aarohan 2026</strong>
          <span className="context-meta">
            Operations portal
          </span>
        </div>

        <nav
          className="side-nav"
          aria-label="Main navigation"
        >
          {groups.map((group) => {
            const visible = PAGES.filter(
              (p) =>
                p[5] === group &&
                roleCanSee(user.role, p[0])
            );

            if (!visible.length) return null;

            return (
              <section
                className="nav-group"
                key={group}
              >
                <h2>{group}</h2>

                {visible.map(([k, name, , , icon]) => (
                  <a
                    key={k}
                    href={PATH_BY_KEY[k]}
                    className={`nav-item${page === k ? ' on' : ''}`}
                    aria-current={
                      page === k ? 'page' : undefined
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(k);
                    }}
                  >
                    <span
                      className="nav-indicator"
                      aria-hidden="true"
                    />

                    <span
                      className="nav-icon"
                      aria-hidden="true"
                    >
                      {icon}
                    </span>

                    {name}
                  </a>
                ))}
              </section>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <span>Navigation is filtered by role.</span>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="workspace">

        <DemoBanner />

        <header className="topbar">

          <button
            className="menu-toggle"
            aria-label={
              menuOpen
                ? 'Close navigation'
                : 'Open navigation'
            }
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span />
            <span />
            <span />
          </button>

          <div className="breadcrumbs">
            <span>FestOS</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{label || 'Page not found'}</strong>
          </div>

          <div className="topbar-right">

            <button
              className="theme-toggle"
              type="button"
              onClick={() =>
                setTheme(
                  theme === 'dark'
                    ? 'light'
                    : 'dark'
                )
              }
              aria-label={`Switch to ${
                theme === 'dark'
                  ? 'light'
                  : 'dark'
              } theme`}
              title={`Switch to ${
                theme === 'dark'
                  ? 'light'
                  : 'dark'
              } theme`}
            >
              <span aria-hidden="true">
                {theme === 'dark' ? '☼' : '☾'}
              </span>

              <small>
                {theme === 'dark'
                  ? 'Light'
                  : 'Dark'}
              </small>
            </button>

            <div className="user-details">
              <span className="user-name">
                {user.name}
              </span>

              <span className="user-role">
                {user.roleLabel}
              </span>
            </div>

            <span
              className="avatar"
              aria-hidden="true"
            >
              {String(user.name || 'F')
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </span>

            <button
              className="signout"
              onClick={logout}
            >
              Sign out
            </button>

          </div>
        </header>

        <main className="content">
          <div
            className="page-transition"
            key={page}
          >
            <ErrorBoundary>
              {selected ? (
                ['events', 'venues', 'scheduling'].includes(key) ? (
                  <Page user={user} />
                ) : (
                  <>
                    <PageHeader
                      title={label}
                      description={descriptions[key]}
                    />

                    <Page user={user} />
                  </>
                )
              ) : (
                <ErrorState
                  error="Page not found."
                  retry={() => navigate('dashboard')}
                />
              )}
            </ErrorBoundary>
          </div>
        </main>

      </div>
    </div>
  );
}
```