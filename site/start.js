import { findTeams } from './teams.js';
import { addTeamConfigTab, createTeamSheet, saveShareLink } from './template.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEET_ADDRESS_PREFIX = 'https://docs.google.com/spreadsheets/d/';

const reconnectSlug = new URLSearchParams(location.search).get('reconnect');
const SAVED_TEAMS_KEY = 'kickball-teams';
let pendingId = null;
let accessToken = null;

const element = (id) => document.getElementById(id);

function showError(error) {
  const panel = element('error');
  panel.textContent = error.message;
  panel.hidden = false;
}

function clearError() {
  element('error').hidden = true;
}

async function postToWorker(path, body) {
  const response = await fetch(workerAddress + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

function whenLoaded(isReady) {
  return new Promise((resolve) => {
    const check = () => (isReady() ? resolve() : setTimeout(check, 100));
    check();
  });
}

async function signIn() {
  await whenLoaded(() => window.google?.accounts?.oauth2);
  return new Promise((resolve, reject) => {
    google.accounts.oauth2.initCodeClient({
      client_id: googleClientId,
      scope: DRIVE_FILE_SCOPE,
      ux_mode: 'popup',
      callback: (response) => (response.error ? reject(new Error(`Google sign-in was not completed (${response.error})`)) : resolve(response.code)),
      error_callback: (error) => reject(new Error(`Google sign-in was not completed (${error.type})`)),
    }).requestCode();
  });
}

async function pickSpreadsheet() {
  await whenLoaded(() => window.gapi);
  await new Promise((resolve) => gapi.load('picker', resolve));
  return new Promise((resolve, reject) => {
    new google.picker.PickerBuilder()
      .setAppId(googleProjectNumber)
      .setDeveloperKey(googleApiKey)
      .setOAuthToken(accessToken)
      .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST))
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve(data.docs[0].id);
        if (data.action === google.picker.Action.CANCEL) reject(new Error('No sheet was picked'));
      })
      .build()
      .setVisible(true);
  });
}

function savedTeams() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_TEAMS_KEY) ?? '[]');
  } catch (storageUnavailable) {
    return [];
  }
}

function rememberTeam(team) {
  try {
    const others = savedTeams().filter((saved) => saved.slug !== team.slug);
    localStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify([team, ...others]));
  } catch (storageUnavailable) {
    return;
  }
}

function linkElement(text, address, opensNewTab) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = address;
  if (opensNewTab) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  return link;
}

function forgetTeam(slug) {
  try {
    localStorage.setItem(SAVED_TEAMS_KEY, JSON.stringify(savedTeams().filter((saved) => saved.slug !== slug)));
  } catch (storageUnavailable) {
    return;
  }
}

function reconnectAddress(slug) {
  const address = new URL('start.html', location.href);
  address.searchParams.set('reconnect', slug);
  return address.href;
}

async function showTeamProblem(team, item) {
  const response = await fetch(`${workerAddress}/api/team/${team.slug}`);
  const data = await response.json();
  if (data.ok) return;
  const problem = document.createElement('div');
  problem.className = 'problem';
  problem.append(data.reconnect ? 'Your Google connection expired. ' : `${data.error}. `);
  if (data.reconnect) problem.append(linkElement('Reconnect', reconnectAddress(team.slug)));
  item.append(problem);
}

function showSavedTeams() {
  const teams = savedTeams();
  if (reconnectSlug !== null) return;
  const list = element('saved-teams');
  list.replaceChildren();
  element('step-saved').hidden = teams.length === 0;
  teams.forEach((team) => {
    const item = document.createElement('li');
    const heading = document.createElement('strong');
    heading.textContent = `${team.teamName} · ${team.seasonLabel}`;
    const links = document.createElement('div');
    links.className = 'links';
    const stopSharingLink = linkElement('Stop sharing', '#');
    stopSharingLink.addEventListener('click', (event) => {
      event.preventDefault();
      stopSharing(team, stopSharingLink);
    });
    links.append(
      linkElement('Team link', teamAddress(team.slug)),
      ' · ',
      linkElement('Open sheet', SHEET_ADDRESS_PREFIX + team.spreadsheetId, true),
      ' · ',
      stopSharingLink,
    );
    item.append(heading, links);
    list.append(item);
    showTeamProblem(team, item);
  });
}

function teamAddress(slug) {
  const address = new URL('./', location.href);
  address.searchParams.set('team', slug);
  return address.href;
}

async function finish(spreadsheetId) {
  const { slug } = await postToWorker('/api/connect', { pendingId, spreadsheetId });
  await saveShareLink(accessToken, spreadsheetId, teamAddress(slug));
  rememberTeam({ slug, spreadsheetId, teamName: element('team-name').value.trim(), seasonLabel: element('season-label').value.trim() });
  showTeamLink(slug, spreadsheetId);
}

function showTeamLink(slug, spreadsheetId) {
  const shareLink = teamAddress(slug);
  element('team-link').textContent = shareLink;
  element('open-team').href = shareLink;
  element('open-sheet').href = SHEET_ADDRESS_PREFIX + spreadsheetId;
  element('step-choose').hidden = true;
  element('step-saved').hidden = true;
  element('step-done').hidden = false;
}

const teamDetailsButtons = ['create-sheet', 'pick-sheet'];

function teamDetailsFilledIn() {
  return element('team-name').value.trim() !== '' && element('season-label').value.trim() !== '';
}

function updateTeamDetailsButtons() {
  teamDetailsButtons.forEach((id) => { element(id).disabled = !teamDetailsFilledIn(); });
}

async function runStep(button, work) {
  clearError();
  button.disabled = true;
  try {
    await work();
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
    updateTeamDetailsButtons();
  }
}

async function establishSignIn() {
  const signInResult = await postToWorker('/api/signin', { code: await signIn() });
  pendingId = signInResult.pendingId;
  accessToken = signInResult.accessToken;
}

async function stopSharing(team, link) {
  const confirmation = `Stop sharing ${team.teamName}? The team link will stop working for your players. Your sheet stays in your Drive.`;
  if (!confirm(confirmation)) return;
  await runStep(link, async () => {
    await establishSignIn();
    await postToWorker('/api/disconnect', { pendingId, slug: team.slug });
    pendingId = null;
    await saveShareLink(accessToken, team.spreadsheetId, '');
    forgetTeam(team.slug);
    showSavedTeams();
  });
}

element('sign-in').addEventListener('click', (event) => runStep(event.target, async () => {
  await establishSignIn();
  element('step-sign-in').hidden = true;
  if (reconnectSlug === null) {
    element('step-choose').hidden = false;
    (await findTeams(accessToken)).forEach(rememberTeam);
    showSavedTeams();
    return;
  }
  const { slug, spreadsheetId, teamName, seasonLabel } = await postToWorker('/api/reconnect', { pendingId, slug: reconnectSlug });
  rememberTeam({ slug, spreadsheetId, teamName, seasonLabel });
  showTeamLink(slug, spreadsheetId);
}));

element('create-sheet').addEventListener('click', (event) => runStep(event.target, async () => {
  const { spreadsheetId } = await createTeamSheet(accessToken, element('team-name').value.trim(), element('season-label').value.trim());
  await finish(spreadsheetId);
}));

element('pick-sheet').addEventListener('click', (event) => runStep(event.target, async () => {
  const spreadsheetId = await pickSpreadsheet();
  await addTeamConfigTab(accessToken, spreadsheetId, element('team-name').value.trim(), element('season-label').value.trim());
  await finish(spreadsheetId);
}));

['team-name', 'season-label'].forEach((id) => element(id).addEventListener('input', updateTeamDetailsButtons));
updateTeamDetailsButtons();
showSavedTeams();
