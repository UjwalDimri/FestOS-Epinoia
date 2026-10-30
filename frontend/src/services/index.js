import { api, DEMO_MODE } from '../api.js';
import * as mocks from '../mocks/index.js';

// Services are the page-facing boundary. Demo data is selected only by explicit configuration.
const call = (key, path, options) => DEMO_MODE ? Promise.resolve(mocks[key]()) : api(path, options);
export const dashboardService = { dashboard: () => call('dashboard', '/dashboard'), alerts: () => call('alerts', '/alerts'), acknowledge: (key) => api(`/alerts/${encodeURIComponent(key)}/ack`, { method: 'POST' }) };
export const participantsService = { list: (query = '') => call('participants', `/participants${query}`), detail: (id) => api(`/participants/${encodeURIComponent(id)}`), reveal: (id, field, reason) => api(`/participants/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: { field, reason } }) };
export const scheduleService = { active: () => call('schedule', '/schedule/active'), build: () => api('/plans/schedule', { method: 'POST' }) };
export const accommodationService = { compare: () => call('compare', '/accommodation/compare'), active: () => call('accommodation', '/accommodation/active'), rooms: () => api('/rooms'), unplaced: () => api('/accommodation/unplaced'), build: (strategy) => api('/plans/accommodation', { method: 'POST', body: { strategy } }) };
export const disruptionsService = { list: () => call('disruptions', '/disruptions'), preview: (type, params) => api('/disruptions/preview', { method: 'POST', body: { type, params } }), commit: (id, reason) => api(`/disruptions/${encodeURIComponent(id)}/commit`, { method: 'POST', body: { reason } }) };
export const auditService = { list: (limit = 100) => call('audit', `/audit?limit=${limit}`), verify: () => api('/audit/verify') };
export const dataQualityService = { headcount: () => call('headcount', '/data/headcount'), issues: () => call('issues', '/data/issues'), duplicates: () => call('duplicates', '/data/duplicates') };
export const logisticsService = { inventory: () => api('/inventory'), merch: () => api('/merch'), vendors: () => api('/vendors'), coverage: () => api('/vendors/coverage') };
