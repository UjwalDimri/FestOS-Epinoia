// Stable in-memory fixtures used only when VITE_DEMO_MODE=true.
let demoAlertAcknowledged = false;
const demoAlerts = () => [{key:'demo-bed-shortfall',severity:'medium',title:'Demo bed shortfall',detail:'One participant is unplaced.',ownerRole:'hospitality',status:demoAlertAcknowledged?'acknowledged':'open',suggestedAction:'Review demo plans'}];
export const dashboard = () => ({ counts: { people: 3, dataIssuesOpen: 1 }, accommodation: { metrics: { placed: 2, unplaced: 1, externalCostINR: 1200, budgetINR: 5000, perNight: [{night:'2026-10-30',demand:3,capacity:2,shortfall:1}] } }, schedule: { metrics: { participantClashes: 1 } }, alerts: demoAlerts() });
export const alerts = () => ({ alerts: demoAlerts() });
export const participants = () => ({ rows: [{participantId:'DEMO-001',name:'Asha Demo',contingentId:'DEMO',housingCategory:'Unavailable',personType:'participant'}], total: 1, page: 1, limit: 25 });
export const staff = () => ({ staff: [
  {memberId:'DEMO-ST01',name:'Aarav Demo',role:'events_team',roleLabel:'Events Team',shift:'08:00-16:00'},
  {memberId:'DEMO-ST02',name:'Mira Demo',role:'events_team',roleLabel:'Events Team',shift:'16:00-00:00'},
  {memberId:'DEMO-ST03',name:'Riya Demo',role:'hospitality',roleLabel:'Hospitality',shift:'00:00-08:00'},
], departments: ['leadership','registration','hospitality','events','logistics','merchandise','food','volunteer'], roles: [], coverage: [
  {role:'events_team',roleLabel:'Events Team',staffCount:2,coveredHours:16,uncoveredHours:[0,1,2,3,4,5,6,7]},
  {role:'hospitality',roleLabel:'Hospitality',staffCount:1,coveredHours:8,uncoveredHours:[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]},
] });
export const schedule = () => ({ plan: {planId:'DEMO-SCHEDULE',metrics:{slots:1,participantClashes:1,unscheduledRounds:0,notPresent:0,equipmentShortfall:0}}, slots: [{slotId:'DEMO-SLOT-1',eventId:'DEMO-EVENT',venueId:'DEMO-VENUE',start:'2026-10-30T10:00:00Z',expectedSize:12,status:'conflict',reasonCodes:['participant_clash']}], venues: [{venueId:'DEMO-VENUE',name:'Demo Hall',capacity:30,indoorOutdoor:'indoor'}] });
export const compare = () => ({ strategies: { balanced:{placed:2,unplaced:1,externalCostINR:1200,splits:0,contingentsSplit:0,overBudget:false} }, note: 'Deterministic demo fixture.' });
export const accommodation = () => ({ plan: {planId:'DEMO-ACCOM',strategy:'balanced',status:'active',metrics:{placed:2,unplaced:1}}, allocations: [] });
export const disruptions = () => ({ types: ['hostel_closure','late_contingent','duplicate_record','equipment_failure','venue_change','vendor_shutdown','duplicate_merch_claim','constraint_change'], recent: [] });
export const audit = () => ({ rows: [] });
export const headcount = () => ({ ladder: [{step:'Demo declared',value:3}], contingents:[{contingentId:'DEMO',college:'Demo College',declared:3,records:3,delta:0}] });
export const issues = () => ({ issues: [{_id:'demo-issue-1',severity:'high',code:'DEMO_CHECK',message:'Demo issue for interface walkthrough.',entity:{type:'Participant',id:'DEMO-001'},status:'open'}] });
export const duplicates = () => ({ candidates: [] });
export const participantDetail = () => ({ person: { participantId: 'DEMO-001', name: 'Demo participant', contingentId: 'DEMO', contactMasked: '••••••' }, allocation: null, registrations: [], merch: [], duplicateCandidates: [] });
export const verify = () => ({ ok: true, checked: 0 });
export const rooms = () => ({ rooms: [] });
export const unplaced = () => ({ rows: [] });
export const inventory = () => ({ balances: [], lines: [], movements: [] });
export const merch = () => ({ forecast: [], issuesToday: 0 });
export const staffDepartments = () => ({ departments: ['leadership','registration','hospitality','events','logistics','merchandise','food','volunteer'], roles: [] });
export const staffShifts = () => ({ shifts: [] });
export const staffAssignments = () => ({ assignments: [] });
export const staffAvailability = () => ({ availability: [] });
export const staffAttendance = () => ({ attendance: [] });
export const savedStaff = (staff) => ({ staff });
export const savedStaffShift = (shift) => ({ shift });
export const savedStaffAssignment = (assignment) => ({ assignment });
export const savedStaffAvailability = (availability) => ({ availability });
export const staffAttendanceAction = (shiftId, action) => ({ shiftId, action, demo: true });
export const merchandiseCatalogue = () => ({ catalogue: [{ item: 'T-shirt', name: 'FestOS T-shirt', eligibility: 'participants', sizes: ['S','M','L'], stock: [] }, { item: 'Lanyard', name: 'Festival lanyard', eligibility: 'everyone', sizes: ['-'], stock: [] }], eligibilityRules: {} });
export const merchandiseIssues = () => ({ issues: [] });
export const savedMerchandise = (body) => ({ item: { ...body, active: true } });
export const issuedMerchandise = (body) => ({ result: { issued: true, ...body }, demo: true });
export const returnedMerchandise = (body) => ({ result: { returned: true, ...body }, demo: true });
export const vendors = () => ({ vendors: [], incidents: [] });
export const vendorDetail = () => ({ vendor: null, incidents: [], meals: [] });
export const vendorCompliance = () => ({ compliance: null });
export const savedVendor = (body) => ({ vendor: { ...body } });
export const loggedMeal = (body) => ({ logged: true, ...body });
export const coverage = () => ({ days: ['2026-10-30'], meals: ['breakfast','lunch','dinner'], rows: [], summary: { uncovered: 0 } });
export const acknowledge = (key) => { if(key==='demo-bed-shortfall')demoAlertAcknowledged=true; return { alert: { key, status: 'acknowledged' } }; };
export const reveal = (participantId, field) => ({ participantId, field, value: `DEMO ${field.toUpperCase()}` });
export const scheduleDraft = () => ({ planId: 'DEMO-SCHEDULE-DRAFT', metrics: {} });
export const accommodationDraft = (strategy) => ({ planId: `DEMO-${strategy}`, strategy, metrics: { placed: 2, unplaced: 1 } });
export const accommodationActivation = (planId) => ({ planId, status: 'active' });
export const disruptionPreview = (type, params) => ({ disruptionId: 'DEMO-D1', type, params, summary: { note: 'Demo preview only; no live changes.' }, risk: 'low', committers: ['festival_director'] });
export const disruptionCommit = () => ({ result: { committed: true }, demo: true });
export const duplicateDismissed = (id) => ({ result: { dismissed: id } });
export const issueResolved = (id, accept) => ({ result: { id, status: accept ? 'accepted' : 'resolved' } });
export const exportCsv = (kind) => new Blob([`FestOS demo ${kind} export; no persisted data\n`], { type: 'text/csv' });
