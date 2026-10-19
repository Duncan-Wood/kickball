import { addTeamConfigTab, createTeamSheet, saveShareLink } from './template.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEET_ADDRESS_PREFIX = 'https://docs.google.com/spreadsheets/d/';

const reconnectSlug = new URLSearchParams(location.search).get('reconnect');
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

function teamAddress(slug) {
  const address = new URL('./', location.href);
  address.searchParams.set('team', slug);
  return address.href;
}

async function finish(spreadsheetId) {
  const { slug } = await postToWorker('/api/connect', { pendingId, spreadsheetId });
  await saveShareLink(accessToken, spreadsheetId, teamAddress(slug));
  showTeamLink(slug, spreadsheetId);
}

function showTeamLink(slug, spreadsheetId) {
  const shareLink = teamAddress(slug);
  element('team-link').textContent = shareLink;
  element('open-team').href = shareLink;
  element('open-sheet').href = SHEET_ADDRESS_PREFIX + spreadsheetId;
  element('step-choose').hidden = true;
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

element('sign-in').addEventListener('click', (event) => runStep(event.target, async () => {
  const signInResult = await postToWorker('/api/signin', { code: await signIn() });
  pendingId = signInResult.pendingId;
  accessToken = signInResult.accessToken;
  element('step-sign-in').hidden = true;
  if (reconnectSlug === null) {
    element('step-choose').hidden = false;
    return;
  }
  const { slug, spreadsheetId } = await postToWorker('/api/reconnect', { pendingId, slug: reconnectSlug });
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
