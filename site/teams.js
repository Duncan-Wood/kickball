const DRIVE_FILES_ADDRESS = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_QUERY = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
const CONFIG_RANGE = "'Team Config'!A1:B20";
const SLUG_PATTERN = /^[a-z0-9]{12}$/;

async function googleGet(accessToken, address) {
  const response = await fetch(address, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 400) return null;
  if (!response.ok) throw new Error(`Google could not list your teams (${response.status})`);
  return response.json();
}

async function listSpreadsheetIds(accessToken) {
  const address = `${DRIVE_FILES_ADDRESS}?${new URLSearchParams({ q: SPREADSHEET_QUERY, fields: 'files(id)', pageSize: '100' })}`;
  const { files } = await googleGet(accessToken, address);
  return files.map((file) => file.id);
}

function teamFromConfigRows(spreadsheetId, rows) {
  const valueOf = (label) => rows.find((row) => row[0] === label)?.[1] ?? '';
  const slug = new URL(valueOf('Share link') || 'https://invalid.invalid/').searchParams.get('team');
  if (!SLUG_PATTERN.test(slug ?? '')) return null;
  return { slug, spreadsheetId, teamName: valueOf('Team name'), seasonLabel: valueOf('Season label') };
}

export async function findTeams(accessToken) {
  const spreadsheetIds = await listSpreadsheetIds(accessToken);
  const configs = await Promise.all(spreadsheetIds.map((spreadsheetId) => googleGet(accessToken, `${SHEETS_ADDRESS}/${spreadsheetId}/values/${encodeURIComponent(CONFIG_RANGE)}`)));
  return configs.flatMap((config, index) => {
    const team = config === null ? null : teamFromConfigRows(spreadsheetIds[index], config.values ?? []);
    return team === null ? [] : [team];
  });
}
