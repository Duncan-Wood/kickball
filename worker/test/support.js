import { encryptToken } from '../src/tokens.js';

export const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
export const SLUG = 'abcdefghij12';
export const SPREADSHEET_ID = 'sheet-id-with-twenty-chars';
export const ALLOWED_ORIGIN = 'https://example.test';

export function fakeStore(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get: async (key, type) => (data.has(key) ? (type === 'json' ? JSON.parse(data.get(key)) : data.get(key)) : null),
    put: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
  };
}

export async function environmentWithTeam() {
  const refreshToken = await encryptToken('refresh-secret', ENCRYPTION_KEY);
  const teams = fakeStore({ [`team:${SLUG}`]: JSON.stringify({ spreadsheetId: SPREADSHEET_ID, refreshToken, connectedAt: 'then' }) });
  return {
    TEAMS: teams,
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ALLOWED_ORIGINS: `${ALLOWED_ORIGIN},http://localhost:8766`,
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
  };
}

function fakeEdgeCache() {
  const entries = new Map();
  return {
    default: {
      match: async (request) => (entries.has(request.url) ? new Response(entries.get(request.url)) : undefined),
      put: async (request, response) => { entries.set(request.url, await response.text()); },
    },
  };
}

const cell = (text) => ({ formattedValue: text });

export function lineupTab(title) {
  const rows = [['Game #:', '1'], ['Name', '', '1'], ['Chad S', '', 'SS'], ['Open spots', '', '']];
  return { properties: { title }, data: [{ rowData: rows.map((row) => ({ values: row.map(cell) })) }] };
}

export function sheetWithLineups(titles) {
  return { properties: { timeZone: 'America/New_York' }, sheets: titles.map(lineupTab) };
}

export async function withGoogle(answer, work) {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const calls = [];
  globalThis.caches = fakeEdgeCache();
  globalThis.fetch = async (address, options = {}) => {
    const call = { address: String(address), method: options.method ?? 'GET', authorization: options.headers?.Authorization, body: options.body };
    calls.push(call);
    return answer(call);
  };
  try {
    return await work(calls);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
}

export function googleWithLineups(titles, overrides = () => undefined) {
  return (call) => {
    const override = overrides(call);
    if (override !== undefined) return override;
    if (call.address.includes('oauth2')) return Response.json({ access_token: 'access' });
    if (call.method === 'POST' && call.address.includes(':append')) return Response.json({});
    return Response.json(sheetWithLineups(titles));
  };
}

export const noContext = { waitUntil: () => {} };
