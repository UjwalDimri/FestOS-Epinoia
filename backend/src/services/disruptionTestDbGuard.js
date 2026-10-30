export function assertIsolatedTestDbUri(uri) {
  if (!uri) throw new Error('Set MONGODB_TEST_URI to an isolated MongoDB test database URI');
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error('MONGODB_TEST_URI must be a valid MongoDB URI'); }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database !== 'festos_test') throw new Error('MONGODB_TEST_URI must use database "festos_test"');
  return database;
}
