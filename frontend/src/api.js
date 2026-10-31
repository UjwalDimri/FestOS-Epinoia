const KEY = 'festos_token';
const TIMEOUT_MS = 15000;
const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export const DEMO_MODE = import.meta.env?.VITE_DEMO_MODE === 'true';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (token) => token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY);
let unauthorizedHandler = () => setToken(null);
export const setUnauthorizedHandler = (handler) => { unauthorizedHandler = handler || (() => setToken(null)); };

export class ApiError extends Error {
  constructor(message, { status = 0, details, kind = 'network' } = {}) {
    super(message); this.name = 'ApiError'; this.status = status; this.details = details; this.kind = kind;
  }
}
export class NetworkError extends ApiError {}
export class UnauthorizedError extends ApiError {}
export class ForbiddenError extends ApiError {}
export class NotFoundError extends ApiError {}
export class ConflictError extends ApiError {}
export class ValidationError extends ApiError {}
export class ServerError extends ApiError {}
const errorType = (status) => status === 401 ? UnauthorizedError : status === 403 ? ForbiddenError : status === 404 ? NotFoundError : status === 409 ? ConflictError : status === 400 || status === 422 ? ValidationError : status >= 500 ? ServerError : ApiError;

async function request(path, { method = 'GET', body, signal, headers = {}, timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const token = getToken();
  try {
    const response = await fetch(`${BASE_URL}${path}`, { method, signal: controller.signal,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined });
    if (response.status === 401) unauthorizedHandler();
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!response.ok) throw new (errorType(response.status))(`Request failed (${response.status})`, { status: response.status, kind: 'http' });
      throw new ApiError('The server returned a non-JSON response.', { status: response.status, kind: 'invalid-response' });
    }
    const data = await response.json();
    if (!response.ok) {
      const Type = errorType(response.status);
      throw new Type(data.error || `Request failed (${response.status})`, { status: response.status, details: data.details, kind: 'http' });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const canceled = signal?.aborted;
    throw new NetworkError(canceled ? 'Request canceled.' : error.name === 'AbortError' ? 'Request timed out.' : 'Could not reach the FestOS API.', { kind: canceled ? 'aborted' : error.name === 'AbortError' ? 'timeout' : 'network' });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
export const api = request;
export async function apiFile(path, { signal } = {}) {
  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (response.status === 401) unauthorizedHandler();
    if (!response.ok) {
      let payload = {}; try { payload = await response.json(); } catch {}
      const Type = errorType(response.status); throw new Type(payload.error || `Request failed (${response.status})`, { status: response.status, details: payload.details, kind: 'http' });
    }
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError(signal?.aborted ? 'Request canceled.' : controller.signal.aborted ? 'Request timed out.' : 'Could not reach the FestOS API.', { kind: signal?.aborted ? 'aborted' : controller.signal.aborted ? 'timeout' : 'network' });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
