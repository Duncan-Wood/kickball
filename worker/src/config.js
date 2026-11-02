import { CONFIG_FIELDS, CONFIG_TAB_NAME, configFromSettings, settingProblem, settingsWithDefaults } from '../../site/teamSettings.js';

export function readConfig(configRows) {
  const enteredValues = configRows === null ? {} : readEnteredSettings(configRows);
  const settings = {};
  CONFIG_FIELDS.forEach((field) => {
    const entered = enteredValues[field.label] || '';
    if (entered !== '') validateSetting(field, entered);
    settings[field.key] = entered;
  });
  return configFromSettings(settingsWithDefaults(settings));
}

function readEnteredSettings(configRows) {
  const entered = {};
  configRows.slice(1).forEach((row) => {
    const label = (row[0]?.text ?? '').trim();
    const field = CONFIG_FIELDS.find((candidate) => candidate.label === label);
    entered[label] = field !== undefined && field.kind === 'color' ? (row[1]?.backgroundHex ?? '') : (row[1]?.text ?? '').trim();
  });
  return entered;
}

function validateSetting(field, entered) {
  const problem = settingProblem(field, entered);
  if (problem !== null) throw new Error(`"${field.label}" is "${entered}", which ${problem}. Fix it on the ${CONFIG_TAB_NAME} tab`);
}
