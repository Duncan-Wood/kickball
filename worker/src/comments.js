import { isCurrentLineupTab } from './lineup.js';

const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const COMMENTS_TAB_NAME = 'Comments';
export const COMMENTS_PER_HOUR = 60;
const COMMENT_MAXIMUM_LENGTH = 1000;

async function sheetsSend(accessToken, path, method, body) {
  const response = await fetch(`${SHEETS_ADDRESS}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
}

export function validatedComment(tabName, commentText, currentTabNames) {
  if (!currentTabNames.some((candidate) => candidate === tabName && isCurrentLineupTab(candidate))) {
    throw new Error(`Tab "${tabName}" is no longer a current lineup tab`);
  }
  const trimmedComment = String(commentText).trim();
  if (trimmedComment === '') throw new Error('Comment is empty');
  if (trimmedComment.length > COMMENT_MAXIMUM_LENGTH) throw new Error(`Comment is longer than ${COMMENT_MAXIMUM_LENGTH} characters`);
  return trimmedComment;
}

export async function appendComment(accessToken, spreadsheetId, tabName, trimmedComment, now = new Date()) {
  const row = [now.toISOString(), tabName.replace(/ Lineup$/, ''), trimmedComment];
  const address = `${spreadsheetId}/values/${encodeURIComponent(`'${COMMENTS_TAB_NAME}'!A:C`)}:append?valueInputOption=RAW`;
  let response = await sheetsSend(accessToken, address, 'POST', { values: [row] });
  if (response.status === 400) {
    const created = await sheetsSend(accessToken, `${spreadsheetId}:batchUpdate`, 'POST', { requests: [{ addSheet: { properties: { title: COMMENTS_TAB_NAME } } }] });
    if (!created.ok) throw new Error(`Could not create the ${COMMENTS_TAB_NAME} tab (${created.status})`);
    await sheetsSend(accessToken, `${spreadsheetId}/values/${encodeURIComponent(`'${COMMENTS_TAB_NAME}'!A1:C1`)}?valueInputOption=RAW`, 'PUT', { values: [['Submitted', 'Game', 'Comment']] });
    response = await sheetsSend(accessToken, address, 'POST', { values: [row] });
  }
  if (!response.ok) throw new Error(`Could not save the comment (${response.status})`);
}
