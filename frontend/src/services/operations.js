import { api } from '../api.js';

const get = (path) => api(path);
const send = (method, path, body) => api(path, { method, body });
const idPath = (base, id, suffix = '') => `${base}/${encodeURIComponent(id)}${suffix}`;

export const accommodationOps = {
  dashboard: () => get('/accommodation/dashboard'),
  properties: () => get('/accommodation/properties?limit=100'),
  rooms: (query = '') => get(`/accommodation/rooms?limit=100${query}`),
  allocations: () => get('/accommodation/allocations?limit=100'),
  arrivals: () => get('/accommodation/check-in/pending?limit=100'),
  departures: () => get('/accommodation/check-out/pending?limit=100'),
  createProperty: (body) => send('POST', '/accommodation/properties', body),
  createRoom: (body) => send('POST', '/accommodation/rooms', body),
  preview: (body) => send('POST', '/accommodation/allocate/preview', body),
  commit: (body) => send('POST', '/accommodation/allocate/commit', body),
  checkIn: (participantId) => send('POST', '/accommodation/check-in', { participantId }),
  checkOut: (participantId) => send('POST', '/accommodation/check-out', { participantId }),
};

export const inventoryOps = {
  dashboard: () => get('/logistics/dashboard'),
  items: () => get('/logistics/inventory?limit=100'),
  locations: () => get('/logistics/locations?limit=100'),
  requests: () => get('/logistics/requests?limit=100'),
  transfers: () => get('/logistics/transfers?limit=100'),
  purchaseOrders: () => get('/logistics/purchase-orders?limit=100'),
  receipts: () => get('/logistics/goods-receipts?limit=100'),
  movements: () => get('/logistics/movements?limit=100'),
  createItem: (body) => send('POST', '/logistics/inventory', body),
  createLocation: (body) => send('POST', '/logistics/locations', body),
  createRequest: (body) => send('POST', '/logistics/requests', body),
  submitRequest: (id) => send('PATCH', idPath('/logistics/requests', id, '/submit'), {}),
  approveRequest: (id, body) => send('PATCH', idPath('/logistics/requests', id, '/approve'), body),
  createTransfer: (body) => send('POST', '/logistics/transfers', body),
  approveTransfer: (id) => send('PATCH', idPath('/logistics/transfers', id, '/approve'), {}),
  receiveTransfer: (id, body) => send('PATCH', idPath('/logistics/transfers', id, '/receive'), body),
  createPurchaseOrder: (body) => send('POST', '/logistics/purchase-orders', body),
  approvePurchaseOrder: (id) => send('PATCH', idPath('/logistics/purchase-orders', id, '/approve'), {}),
  createAudit: (body) => send('POST', '/logistics/audits', body),
};
