import { captain } from './state.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
const TOKEN_EXPIRY_MILLISECONDS_MARGIN = 60000;

export const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client';

const scriptLoads = new Map();

export function loadScript(address) {
  if (!scriptLoads.has(address)) {
    scriptLoads.set(address, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = address;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and try again'));
      document.head.append(script);
    }));
  }
  return scriptLoads.get(address);
}

export async function requestAccessToken(prompt) {
  await loadScript(SIGN_IN_SCRIPT);
  return new Promise((resolve, reject) => {
    google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: DRIVE_FILE_SCOPE,
      prompt,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Google sign-in was not completed (${response.error})`));
          return;
        }
        captain.accessToken = response.access_token;
        captain.accessTokenExpiresAt = Date.now() + Number(response.expires_in) * 1000;
        resolve(captain.accessToken);
      },
      error_callback: (error) => reject(new Error(`Google sign-in was not completed (${error.type})`)),
    }).requestAccessToken();
  });
}

export async function currentAccessToken() {
  if (captain.accessToken !== null && Date.now() < captain.accessTokenExpiresAt - TOKEN_EXPIRY_MILLISECONDS_MARGIN) return captain.accessToken;
  return requestAccessToken('');
}

export async function askWorkerForAccess(accessToken) {
  const response = await fetch(`${workerAddress}/api/team/${window.fieldView.teamCode}/captain`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accessToken }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function pickSheet(accessToken) {
  await Promise.all([loadScript(PICKER_SCRIPT), loadScript(SIGN_IN_SCRIPT)]);
  await new Promise((resolve) => gapi.load('picker', resolve));
  return new Promise((resolve, reject) => {
    new google.picker.PickerBuilder()
      .setAppId(googleProjectNumber)
      .setDeveloperKey(googleApiKey)
      .setOAuthToken(accessToken)
      .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST))
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve();
        if (data.action === google.picker.Action.CANCEL) reject(new Error('No sheet was picked'));
      })
      .build()
      .setVisible(true);
  });
}

export async function sheetsRequest(path, options = {}, alreadyRetried = false) {
  const accessToken = await currentAccessToken();
  const response = await fetch(`${SHEETS_ADDRESS}/${captain.spreadsheetId}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (response.status === 401 && !alreadyRetried) {
    captain.accessToken = null;
    return sheetsRequest(path, options, true);
  }
  if (response.status === 403 || response.status === 404) throw new Error('Google says you can no longer edit this sheet');
  if (!response.ok) throw new Error(`Google could not save the change (${response.status})`);
  return response.json();
}

export async function refreshTabs() {
  const overview = await sheetsRequest('?fields=sheets.properties(sheetId,title,index)');
  captain.tabs = new Map(overview.sheets.map(({ properties }) => [properties.title, properties]));
}

export async function sheetIdFor(tabName) {
  if (!captain.tabs.has(tabName)) await refreshTabs();
  if (!captain.tabs.has(tabName)) throw new Error(`The tab "${tabName}" is no longer in the sheet`);
  return captain.tabs.get(tabName).sheetId;
}

export async function sheetRows(range) {
  const { values = [] } = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
  return values;
}

export async function columnValues(range) {
  return (await sheetRows(range)).map((row) => (row[0] ?? '').trim());
}

export async function writeValues(data, valueInputOption = 'USER_ENTERED') {
  await sheetsRequest('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption, data }) });
}

async function currentCellValues(addresses) {
  const query = addresses.map((address) => `ranges=${encodeURIComponent(address)}`).join('&');
  const { valueRanges } = await sheetsRequest(`/values:batchGet?${query}`);
  return valueRanges.map((range) => (range.values?.[0]?.[0] ?? '').trim());
}

export async function confirmSheetStillMatches(expectations) {
  const current = await currentCellValues(expectations.map(({ address }) => address));
  const changedIndex = expectations.findIndex(({ expected }, index) => expected.toLowerCase() !== current[index].toLowerCase());
  if (changedIndex !== -1) {
    window.fieldView.refreshNow();
    throw new Error('The sheet changed since this page last updated, so nothing was saved. Look at the lineup and try again');
  }
}
