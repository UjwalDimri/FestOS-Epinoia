// Stable fixtures used only when VITE_DEMO_MODE=true.
export const dashboard = () => ({ counts: { people: 2836, dataIssuesOpen: 0 }, accommodation: { metrics: { placed: 0, unplaced: 0, externalCostINR: 0, budgetINR: 0, perNight: [] } }, schedule: { metrics: { participantClashes: 0 } }, alerts: [] });
export const alerts = () => ({ alerts: [] });
export const participants = () => ({ rows: [], total: 0, page: 1, limit: 25 });
export const schedule = () => ({ plan: null, slots: [], venues: [] });
export const compare = () => ({ strategies: {}, note: 'Deterministic demo fixture.' });
export const accommodation = () => ({ plan: null, allocations: [] });
export const disruptions = () => ({ types: ['hostel_closure','late_contingent','duplicate_record','equipment_failure','venue_change','vendor_shutdown','duplicate_merch_claim','constraint_change'], recent: [] });
export const audit = () => ({ rows: [] });
export const headcount = () => ({ ladder: [] });
export const issues = () => ({ issues: [] });
export const duplicates = () => ({ candidates: [] });
