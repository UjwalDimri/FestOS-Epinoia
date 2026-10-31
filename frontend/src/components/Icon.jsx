import React from 'react';

const paths = {
 dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></>,
 users: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 11a3.5 3.5 0 1 0-1-6.86M21 20v-1.5a4 4 0 0 0-3-3.87"/></>,
 calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h7"/></>,
 home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></>,
 building: <><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/></>,
 events: <><path d="M4 20V5l15-2v17"/><circle cx="8" cy="20" r="2"/><circle cx="17" cy="20" r="2"/><path d="M4 9l15-2"/></>,
 schedule: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
 pulse: <><path d="M3 12h4l2.3-6.5L14 18l2.3-6H21"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/></>,
 alert: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
 boxes: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5M12 8v5"/></>,
 shirt: <><path d="m8 4 4 2 4-2 5 4-3 4-2-1v10H8V11l-2 1-3-4z"/><path d="M9 4c0 2 1 3 3 3s3-1 3-3"/></>,
 food: <><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c3 3 3 7 0 9"/></>,
 data: <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="19" r="2"/></>,
 audit: <><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h4M10 12h6M10 16h6"/></>,
 search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
 collapse: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-12-3 4 3 4"/></>,
 expand: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m-1-12 3 4-3 4"/></>,
 menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
 close: <><path d="m6 6 12 12M18 6 6 18"/></>,
 sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
 moon: <><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></>,
 chevron: <><path d="m9 18 6-6-6-6"/></>,
 clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};

export default function Icon({ name, size = 18, strokeWidth = 1.7, className = '' }) {
 return <svg aria-hidden="true" focusable="false" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{paths[name]||paths.dashboard}</svg>;
}
