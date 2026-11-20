import { CONFIG_FIELDS, CONFIG_TAB_NAME, FONTS, STRIPE_STYLES, STRIPE_THICKNESSES, configFromSettings, settingProblem, settingsWithDefaults, sheetColorFromHex } from '../teamSettings.js';
import { cellAddress } from '../edits.js';
import { columnValues, sheetIdFor, sheetsRequest, writeValues } from './sheetApi.js';
import { captain } from './state.js';

const SETTING_LABEL_COLUMN_INDEX = 0;
const SETTING_VALUE_COLUMN_INDEX = 1;
const SETTING_LABEL_ROWS = 40;
const LIST_CHOICES = { stripe: STRIPE_STYLES, thickness: STRIPE_THICKNESSES, font: FONTS, toggle: ['On', 'Off'] };

const SETTING_NOTE_COLUMN_INDEX = 2;

async function addMissingSettingRows(labels, changedFields) {
  const missing = changedFields.filter((field) => !labels.includes(field.label));
  if (missing.length === 0) return labels;
  const sheetId = await sheetIdFor(CONFIG_TAB_NAME);
  const updatedLabels = [...labels];
  const added = missing.map((field) => {
    const earlierLabels = CONFIG_FIELDS.slice(0, CONFIG_FIELDS.indexOf(field)).map(({ label }) => label);
    const anchorIndex = Math.max(0, ...earlierLabels.map((label) => updatedLabels.indexOf(label)));
    updatedLabels.splice(anchorIndex + 1, 0, field.label);
    return { field, rowIndex: anchorIndex + 1 };
  });
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: added.map(({ rowIndex }) => ({ insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }, inheritFromBefore: true } })) }),
  });
  await writeValues(added.map(({ field }) => {
    const row = updatedLabels.indexOf(field.label) + 1;
    const noteCell = cellAddress(CONFIG_TAB_NAME, SETTING_NOTE_COLUMN_INDEX, row).split('!')[1];
    return { range: `${cellAddress(CONFIG_TAB_NAME, SETTING_LABEL_COLUMN_INDEX, row)}:${noteCell}`, values: [[field.label, '', field.note]] };
  }), 'RAW');
  return updatedLabels;
}

function settingRows(labels, changedFields) {
  return changedFields.map((field) => {
    const row = labels.indexOf(field.label) + 1;
    if (row === 0) throw new Error(`The ${CONFIG_TAB_NAME} tab has no "${field.label}" row, so it cannot be saved from here`);
    return { field, row };
  });
}

function currentChoicesRequest(sheetId, { field, row }) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: SETTING_VALUE_COLUMN_INDEX, endColumnIndex: SETTING_VALUE_COLUMN_INDEX + 1 },
      rule: { condition: { type: 'ONE_OF_LIST', values: LIST_CHOICES[field.kind].map((choice) => ({ userEnteredValue: choice })) }, showCustomUi: true, strict: true },
    },
  };
}

function colorRequest(sheetId, { field, row }, values) {
  return {
    updateCells: {
      rows: [{ values: [{ userEnteredFormat: { backgroundColor: sheetColorFromHex(values[field.key]) } }] }],
      start: { sheetId, rowIndex: row - 1, columnIndex: SETTING_VALUE_COLUMN_INDEX },
      fields: 'userEnteredFormat.backgroundColor',
    },
  };
}

export async function saveTeamSettings(values, previousValues) {
  const changedFields = CONFIG_FIELDS.filter((field) => values[field.key] !== previousValues[field.key]);
  changedFields.forEach((field) => {
    const problem = values[field.key] === '' ? null : settingProblem(field, values[field.key]);
    if (problem !== null) throw new Error(`"${field.label}" ${problem}`);
  });
  const labels = await addMissingSettingRows(await columnValues(`'${CONFIG_TAB_NAME}'!A1:A${SETTING_LABEL_ROWS}`), changedFields);
  const rows = settingRows(labels, changedFields);
  const formatRequests = (sheetId) => [
    ...rows.filter(({ field }) => field.kind in LIST_CHOICES).map((row) => currentChoicesRequest(sheetId, row)),
    ...rows.filter(({ field }) => field.kind === 'color').map((row) => colorRequest(sheetId, row, values)),
  ];
  if (rows.some(({ field }) => field.kind in LIST_CHOICES || field.kind === 'color')) {
    await sheetsRequest(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: formatRequests(await sheetIdFor(CONFIG_TAB_NAME)) }) });
  }
  const valueWrites = rows.filter(({ field }) => field.kind !== 'color').map(({ field, row }) => ({ range: cellAddress(CONFIG_TAB_NAME, SETTING_VALUE_COLUMN_INDEX, row), values: [[values[field.key]]] }));
  if (valueWrites.length > 0) await writeValues(valueWrites, 'RAW');
  window.fieldView.saveConfig(configFromSettings(settingsWithDefaults(values)));
  captain.panelStale = true;
  return () => saveTeamSettings(previousValues, values);
}
