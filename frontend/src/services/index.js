import { api, apiFile, DEMO_MODE } from '../api.js';
import * as mocks from '../mocks/index.js';

// Services are the page-facing boundary. Demo data is selected only by explicit configuration.
const call = (key, path, options) => DEMO_MODE ? Promise.resolve(mocks[key]()) : api(path, options);
const write = (path, options, fixture) => DEMO_MODE ? Promise.resolve(typeof fixture === 'function' ? fixture() : fixture) : api(path, options);
export const dashboardService = { dashboard: () => call('dashboard', '/dashboard'), alerts: () => call('alerts', '/alerts'), acknowledge: (key) => write(`/alerts/${encodeURIComponent(key)}/ack`, { method: 'POST' }, () => mocks.acknowledge(key)) };
export const participantsService = { list: (query = '', signal) => call('participants', `/participants${query}`, { signal }), detail: (id, signal) => call('participantDetail', `/participants/${encodeURIComponent(id)}`, { signal }), reveal: (id, field, reason) => write(`/participants/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: { field, reason } }, () => mocks.reveal(id, field)) };
export const scheduleService = { active: () => call('schedule', '/schedule/active'), build: () => write('/plans/schedule', { method: 'POST' }, mocks.scheduleDraft) };
export const accommodationService = { compare: () => call('compare', '/accommodation/compare'), active: () => call('accommodation', '/accommodation/active'), rooms: () => call('rooms', '/rooms'), unplaced: () => call('unplaced', '/accommodation/unplaced'), build: (strategy) => write('/plans/accommodation', { method: 'POST', body: { strategy } }, () => mocks.accommodationDraft(strategy)), activate: (planId, reason) => write(`/plans/${encodeURIComponent(planId)}/activate`, { method: 'POST', body: { reason } }, () => mocks.accommodationActivation(planId)) };
export const disruptionsService = { list: () => call('disruptions', '/disruptions'), preview: (type, params) => write('/disruptions/preview', { method: 'POST', body: { type, params } }, () => mocks.disruptionPreview(type, params)), commit: (id, reason) => write(`/disruptions/${encodeURIComponent(id)}/commit`, { method: 'POST', body: { reason } }, mocks.disruptionCommit) };
export const auditService = { list: (limit = 100) => call('audit', `/audit?limit=${limit}`), verify: () => call('verify', '/audit/verify') };
export const dataQualityService = { headcount: () => call('headcount', '/data/headcount'), issues: (query = '') => call('issues', `/data/issues${query}`), duplicates: () => call('duplicates', '/data/duplicates'), dismissDuplicate: (id, reason) => write(`/data/duplicates/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: { reason } }, () => mocks.duplicateDismissed(id)), resolveIssue: (id, accept, reason) => write(`/data/issues/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { accept, reason } }, () => mocks.issueResolved(id, accept)) };
export const logisticsService = { inventory: () => call('inventory', '/inventory'), merch: () => call('merch', '/merch'), vendors: () => call('vendors', '/vendors'), coverage: () => call('coverage', '/vendors/coverage') };
export const staffService = {
 list: () => call('staff', '/staff'), departments: () => call('staffDepartments', '/staff/departments'),
 shifts: () => call('staffShifts', '/staff/shifts'), assignments: () => call('staffAssignments', '/staff/assignments'),
 availability: () => call('staffAvailability', '/staff/availability'), attendance: () => call('staffAttendance', '/staff/attendance'),
 create: (body) => write('/staff', { method: 'POST', body }, () => mocks.savedStaff(body)),
 update: (memberId, body) => write(`/staff/${encodeURIComponent(memberId)}`, { method: 'PUT', body }, () => mocks.savedStaff({ ...body, memberId })),
 createShift: (body) => write('/staff/shifts', { method: 'POST', body }, () => mocks.savedStaffShift(body)),
 createAssignment: (body) => write('/staff/assignments', { method: 'POST', body }, () => mocks.savedStaffAssignment(body)),
 createAvailability: (body) => write('/staff/availability', { method: 'POST', body }, () => mocks.savedStaffAvailability(body)),
 checkIn: (shiftId) => write('/staff/attendance/check-in', { method: 'POST', body: { shiftId } }, () => mocks.staffAttendanceAction(shiftId, 'check-in')),
 checkOut: (shiftId) => write('/staff/attendance/check-out', { method: 'POST', body: { shiftId } }, () => mocks.staffAttendanceAction(shiftId, 'check-out')),
export const vendorsService = {
 list: () => call('vendors', '/vendors'),
 detail: (id) => call('vendorDetail', `/vendors/${encodeURIComponent(id)}`),
 compliance: (id) => call('vendorCompliance', `/vendors/${encodeURIComponent(id)}/compliance`),
 coverage: () => call('coverage', '/vendors/coverage'),
 create: (body) => write('/vendors', { method: 'POST', body }, () => mocks.savedVendor(body)),
 update: (id, body) => write(`/vendors/${encodeURIComponent(id)}`, { method: 'PUT', body }, () => mocks.savedVendor({ ...body, vendorId: id })),
 logMeal: (id, body) => write(`/vendors/${encodeURIComponent(id)}/log-meal`, { method: 'POST', body }, () => mocks.loggedMeal({ ...body, vendorId: id })),
};
export const merchandiseService = {
 catalogue: () => call('merchandiseCatalogue', '/merchandise'),
 issues: () => call('merchandiseIssues', '/merchandise/issues'),
 save: (body) => write('/merchandise', { method: 'POST', body }, () => mocks.savedMerchandise(body)),
 issue: (body) => write('/merchandise/issue', { method: 'POST', body }, () => mocks.issuedMerchandise(body)),
 return: (body) => write('/merchandise/return', { method: 'POST', body }, () => mocks.returnedMerchandise(body)),
};
export const exportService = { downloadCsv: (kind) => DEMO_MODE ? Promise.resolve(mocks.exportCsv(kind)) : apiFile(`/export/${encodeURIComponent(kind)}.csv`) };
