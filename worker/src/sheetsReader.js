import { CONFIG_TAB_NAME } from '../../site/teamSettings.js';
import { readConfig } from './config.js';
import { defaultLineupTabName, isCurrentLineupTab, orderedLineups, readLineup } from './lineup.js';

const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_FILES_ADDRESS = 'https://www.googleapis.com/drive/v3/files';
const SHEET_GONE_MESSAGE = 'This team\'s sheet was deleted from Google Drive. Ask your captain to set the team up again';
const CELL_FIELDS = 'formattedValue,effectiveValue.numberValue,effectiveFormat(textFormat.strikethrough,backgroundColor)';

export class SheetGoneError extends Error {}

export class RateLimitedError extends Error {
  constructor() {
    super('Google is limiting reads of this sheet right now. The page will catch up in a minute');
  }
}

async function sheetsGet(accessToken, path) {
  const response = await fetch(`${SHEETS_ADDRESS}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) throw new SheetGoneError(SHEET_GONE_MESSAGE);
  if (response.status === 429) throw new RateLimitedError();
  if (!response.ok) throw new Error(`Google could not read the sheet (${response.status}). The captain may need to reconnect it`);
  return response.json();
}

export function channelHex(fraction) {
  return Math.round((fraction ?? 0) * 255).toString(16).padStart(2, '0');
}

export function normalizedRows(sheet) {
  const rowData = sheet.data?.[0]?.rowData ?? [];
  const rows = rowData.map((row) => (row.values ?? []).map((cell) => ({
    text: cell.formattedValue ?? '',
    strikethrough: cell.effectiveFormat?.textFormat?.strikethrough === true,
    serialDate: cell.effectiveValue?.numberValue,
    backgroundHex: cell.effectiveFormat?.backgroundColor === undefined
      ? ''
      : `#${channelHex(cell.effectiveFormat.backgroundColor.red)}${channelHex(cell.effectiveFormat.backgroundColor.green)}${channelHex(cell.effectiveFormat.backgroundColor.blue)}`,
  })));
  const width = Math.max(0, ...rows.map((row) => row.length));
  const emptyCell = () => ({ text: '', strikethrough: false, serialDate: undefined, backgroundHex: '' });
  return rows.map((row) => row.concat(Array.from({ length: width - row.length }, emptyCell)));
}

function quotedRange(tabName) {
  return `'${tabName.replaceAll("'", "''")}'`;
}

async function throwIfTrashed(accessToken, spreadsheetId) {
  const response = await fetch(`${DRIVE_FILES_ADDRESS}/${spreadsheetId}?fields=trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) throw new SheetGoneError(SHEET_GONE_MESSAGE);
  if (response.ok && (await response.json()).trashed === true) throw new SheetGoneError(SHEET_GONE_MESSAGE);
}

export async function readTeamSheet(accessToken, spreadsheetId, now = new Date()) {
  const [overview] = await Promise.all([
    sheetsGet(accessToken, `${spreadsheetId}?fields=properties.timeZone,sheets.properties.title`),
    throwIfTrashed(accessToken, spreadsheetId),
  ]);
  const tabNames = overview.sheets.map((sheet) => sheet.properties.title);
  const wantedTabNames = tabNames.filter((tabName) => isCurrentLineupTab(tabName) || tabName === CONFIG_TAB_NAME);
  const query = new URLSearchParams({ includeGridData: 'true', fields: `sheets(properties.title,data.rowData.values(${CELL_FIELDS}))` });
  wantedTabNames.forEach((tabName) => query.append('ranges', quotedRange(tabName)));
  const detail = await sheetsGet(accessToken, `${spreadsheetId}?${query}`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: overview.properties.timeZone }).format(now);
  const rowsByTab = new Map(detail.sheets.map((sheet) => [sheet.properties.title, normalizedRows(sheet)]));
  const { lineups, problems } = orderedLineups(tabNames
    .filter(isCurrentLineupTab)
    .map((tabName) => readLineup(tabName, rowsByTab.get(tabName))));
  return { config: readConfig(rowsByTab.get(CONFIG_TAB_NAME) ?? null), lineups, problems, activeTabName: defaultLineupTabName(lineups, today) };
}
