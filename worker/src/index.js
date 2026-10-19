import { accessTokenFromRefreshToken, ConnectionExpiredError, exchangeAuthorizationCode } from './google.js';
import { appendComment, COMMENTS_PER_HOUR, validatedComment } from './comments.js';
import { readTeamSheet } from './sheetsReader.js';
import { decryptToken, encryptToken, newTeamSlug } from './tokens.js';

const API_VERSION = 2;
const READ_CACHE_SECONDS = 5;
const TEAM_ROUTE = /^\/api\/team\/([a-z0-9]{12})(\/comment)?$/;

function corsHeaders(request, environment) {
  const allowedOrigins = environment.ALLOWED_ORIGINS.split(',');
  const requestOrigin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body, status, request, environment) {
  return new Response(JSON.stringify({ apiVersion: API_VERSION, ...body }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, environment) },
  });
}

async function loadTeam(slug, environment) {
  const stored = await environment.TEAMS.get(`team:${slug}`, 'json');
  if (stored === null) throw new Error('This team link is not recognized. Ask your captain for a new one');
  const refreshToken = await decryptToken(stored.refreshToken, environment.TOKEN_ENCRYPTION_KEY);
  return { spreadsheetId: stored.spreadsheetId, accessToken: await accessTokenFromRefreshToken(refreshToken, environment) };
}

async function teamPayload(slug, environment, context) {
  const cacheKey = new Request(`https://cache.invalid/team/${slug}`);
  const cached = await caches.default.match(cacheKey);
  if (cached !== undefined) return cached.json();
  const { spreadsheetId, accessToken } = await loadTeam(slug, environment);
  const payload = await readTeamSheet(accessToken, spreadsheetId);
  context.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'Cache-Control': `max-age=${READ_CACHE_SECONDS}` } })));
  return payload;
}

async function allowComment(slug) {
  const hour = Math.floor(Date.now() / 3600000);
  const counterKey = new Request(`https://cache.invalid/comments/${slug}/${hour}`);
  const used = Number(await (await caches.default.match(counterKey))?.text() ?? 0);
  if (used >= COMMENTS_PER_HOUR) return false;
  await caches.default.put(counterKey, new Response(String(used + 1), { headers: { 'Cache-Control': 'max-age=3600' } }));
  return true;
}

const PENDING_SIGN_IN_SECONDS = 3600;

async function signIn(request, environment) {
  const { code } = await request.json();
  if (typeof code !== 'string' || code === '') throw new Error('Missing sign-in code');
  const tokens = await exchangeAuthorizationCode(code, environment);
  if (tokens.refresh_token === undefined) throw new Error('Google did not return a long-lived sign-in. Remove the app at myaccount.google.com/permissions and try again');
  const pendingId = newTeamSlug();
  const refreshToken = await encryptToken(tokens.refresh_token, environment.TOKEN_ENCRYPTION_KEY);
  await environment.TEAMS.put(`pending:${pendingId}`, refreshToken, { expirationTtl: PENDING_SIGN_IN_SECONDS });
  return { pendingId, accessToken: tokens.access_token };
}

async function connect(request, environment) {
  const { pendingId, spreadsheetId } = await request.json();
  if (!/^[a-z0-9]{12}$/.test(String(pendingId)) || !/^[A-Za-z0-9_-]{20,}$/.test(String(spreadsheetId))) throw new Error('Missing sign-in or sheet');
  const refreshToken = await environment.TEAMS.get(`pending:${pendingId}`);
  if (refreshToken === null) throw new Error('That sign-in expired. Sign in again');
  const accessToken = await accessTokenFromRefreshToken(await decryptToken(refreshToken, environment.TOKEN_ENCRYPTION_KEY), environment);
  await readTeamSheet(accessToken, spreadsheetId);
  const slug = newTeamSlug();
  await environment.TEAMS.put(`team:${slug}`, JSON.stringify({ spreadsheetId, refreshToken, connectedAt: new Date().toISOString() }));
  await environment.TEAMS.delete(`pending:${pendingId}`);
  return { slug };
}

async function reconnect(request, environment) {
  const { pendingId, slug } = await request.json();
  if (!/^[a-z0-9]{12}$/.test(String(pendingId)) || !/^[a-z0-9]{12}$/.test(String(slug))) throw new Error('Missing sign-in or team');
  const stored = await environment.TEAMS.get(`team:${slug}`, 'json');
  if (stored === null) throw new Error('This team link is not recognized');
  const refreshToken = await environment.TEAMS.get(`pending:${pendingId}`);
  if (refreshToken === null) throw new Error('That sign-in expired. Sign in again');
  const accessToken = await accessTokenFromRefreshToken(await decryptToken(refreshToken, environment.TOKEN_ENCRYPTION_KEY), environment);
  await readTeamSheet(accessToken, stored.spreadsheetId);
  await environment.TEAMS.put(`team:${slug}`, JSON.stringify({ ...stored, refreshToken, connectedAt: new Date().toISOString() }));
  await environment.TEAMS.delete(`pending:${pendingId}`);
  return { slug, spreadsheetId: stored.spreadsheetId };
}

async function handleTeam(request, slug, isComment, environment, context) {
  if (!isComment) {
    const payload = await teamPayload(slug, environment, context);
    const requestedTab = new URL(request.url).searchParams.get('tab');
    if (requestedTab === null) return payload;
    const lineup = payload.lineups.find((candidate) => candidate.tabName === requestedTab);
    if (lineup === undefined) throw new Error(`Tab "${requestedTab}" is no longer a current lineup tab`);
    return { lineup };
  }
  const { action, tab, text } = await request.json();
  if (action !== 'comment') throw new Error(`Unknown action "${action}"`);
  const payload = await teamPayload(slug, environment, context);
  if (!payload.config.suggestionBox) throw new Error('The suggestion box is turned off');
  const trimmedComment = validatedComment(tab, text, payload.lineups.map((lineup) => lineup.tabName));
  if (!(await allowComment(slug))) throw new Error('Too many suggestions this hour, try again later');
  const { spreadsheetId, accessToken } = await loadTeam(slug, environment);
  await appendComment(accessToken, spreadsheetId, tab, trimmedComment);
  return {};
}

export default {
  async fetch(request, environment, context) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, environment) });
    }
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'POST' && pathname === '/api/signin') return jsonResponse({ ok: true, ...(await signIn(request, environment)) }, 200, request, environment);
      if (request.method === 'POST' && pathname === '/api/connect') return jsonResponse({ ok: true, ...(await connect(request, environment)) }, 200, request, environment);
      if (request.method === 'POST' && pathname === '/api/reconnect') return jsonResponse({ ok: true, ...(await reconnect(request, environment)) }, 200, request, environment);
      const teamMatch = TEAM_ROUTE.exec(pathname);
      if (teamMatch !== null) {
        const body = await handleTeam(request, teamMatch[1], teamMatch[2] !== undefined, environment, context);
        return jsonResponse({ ok: true, ...body }, 200, request, environment);
      }
      return jsonResponse({ ok: false, error: 'Not found' }, 404, request, environment);
    } catch (error) {
      console.error(pathname, error);
      return jsonResponse({ ok: false, error: error.message, ...(error instanceof ConnectionExpiredError && { reconnect: true }) }, 200, request, environment);
    }
  },
};
