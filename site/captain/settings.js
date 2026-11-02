import { CONFIG_FIELDS, CONFIG_TAB_NAME, configFromSettings, settingProblem, settingsWithDefaults, sheetColorFromHex } from '../teamSettings.js';
import { cellAddress } from '../edits.js';
import { columnValues, sheetIdFor, sheetsRequest, writeValues } from './sheetApi.js';
import { captain } from './state.js';

const SETTING_VALUE_COLUMN_INDEX = 1;
const SETTING_LABEL_ROWS = 40;

function settingRows(labels, changedFields) {
  return changedFields.map((field) => {
    const row = labels.indexOf(field.label) + 1;
    if (row === 0) throw new Error(`The ${CONFIG_TAB_NAME} tab has no "${field.label}" row, so it cannot be saved from here`);
    return { field, row };
  });
}

export async function saveTeamSettings(values, previousValues) {
  const changedFields = CONFIG_FIELDS.filter((field) => values[field.key] !== previousValues[field.key]);
  changedFields.forEach((field) => {
    const problem = values[field.key] === '' ? null : settingProblem(field, values[field.key]);
    if (problem !== null) throw new Error(`"${field.label}" ${problem}`);
  });
  const rows = settingRows(await columnValues(`'${CONFIG_TAB_NAME}'!A1:A${SETTING_LABEL_ROWS}`), changedFields);
  const textRows = rows.filter(({ field }) => field.kind !== 'color');
  const colorRows = rows.filter(({ field }) => field.kind === 'color');
  if (textRows.length > 0) {
    await writeValues(textRows.map(({ field, row }) => ({ range: cellAddress(CONFIG_TAB_NAME, SETTING_VALUE_COLUMN_INDEX, row), values: [[values[field.key]]] })), 'RAW');
  }
  if (colorRows.length > 0) {
    const sheetId = await sheetIdFor(CONFIG_TAB_NAME);
    await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: colorRows.map(({ field, row }) => ({
          updateCells: {
            rows: [{ values: [{ userEnteredFormat: { backgroundColor: sheetColorFromHex(values[field.key]) } }] }],
            start: { sheetId, rowIndex: row - 1, columnIndex: SETTING_VALUE_COLUMN_INDEX },
            fields: 'userEnteredFormat.backgroundColor',
          },
        })),
      }),
    });
  }
  window.fieldView.saveConfig(configFromSettings(settingsWithDefaults(values)));
  captain.panelStale = true;
  return () => saveTeamSettings(previousValues, values);
}
