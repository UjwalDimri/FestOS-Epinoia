import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
let api, setToken, setUnauthorizedHandler, types, ApiError, NetworkError, UnauthorizedError, ForbiddenError, ValidationError, ConflictError, NotFoundError, ServerError;
beforeEach(async () => {
  vi.resetModules(); vi.unstubAllEnvs();
  ({ api, setToken, setUnauthorizedHandler, ApiError, NetworkError, UnauthorizedError, ForbiddenError, ValidationError, ConflictError, NotFoundError, ServerError } = await import('../src/api.js'));
  types = { ApiError, NetworkError, UnauthorizedError, ForbiddenError, ValidationError, ConflictError, NotFoundError, ServerError };
  global.fetch = vi.fn();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('API client', () => {
  it('sends JSON and parses a successful response', async () => {
    fetch.mockResolvedValue(json({ ok: true }));
    await expect(api('/me')).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[0][0]).toBe('/api/me');
  });
  it('sends configured base URL and bearer token', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1/'); vi.resetModules();
    ({ api, setToken } = await import('../src/api.js')); setToken('abc'); fetch.mockResolvedValue(json({ ok: true }));
    await api('/me'); expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/v1/me'); expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });
  it('rejects successful non-JSON responses', async () => {
    fetch.mockResolvedValue(new Response('oops', { headers: { 'content-type':'text/plain' } }));
    await expect(api('/me')).rejects.toMatchObject({ kind:'invalid-response' });
  });
  it.each([[400,'ValidationError'],[422,'ValidationError'],[401,'UnauthorizedError'],[403,'ForbiddenError'],[404,'NotFoundError'],[409,'ConflictError'],[500,'ServerError']])('classifies HTTP %s errors', async (status, name) => {
    fetch.mockResolvedValue(json({ error:'Nope', details:{ field:'x' } },status));
    await expect(api('/x')).rejects.toBeInstanceOf(types[name]);
  });
  it('calls the global handler on 401', async () => {
    const handler=vi.fn(); setUnauthorizedHandler(handler); fetch.mockResolvedValue(json({error:'expired'},401));
    await expect(api('/me')).rejects.toBeInstanceOf(UnauthorizedError); expect(handler).toHaveBeenCalledOnce();
  });
  it('classifies network errors and preserves server details', async () => {
    fetch.mockRejectedValue(new TypeError('offline')); await expect(api('/x')).rejects.toBeInstanceOf(NetworkError);
    fetch.mockResolvedValue(json({error:'conflict',details:{key:'id'}},409)); await expect(api('/x')).rejects.toMatchObject({details:{key:'id'}});
  });
  it('rejects non-JSON HTTP failures with typed status', async () => {
    fetch.mockResolvedValue(new Response('forbidden', {status:403,headers:{'content-type':'text/html'}}));
    await expect(api('/x')).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('classifies request timeouts', async () => {
    fetch.mockImplementation((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
    await expect(api('/slow',{timeout:5})).rejects.toMatchObject({kind:'timeout'});
  });
});
