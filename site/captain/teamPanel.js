import { CONFIG_FIELDS, FONTS, STRIPE_STYLES, configFromSettings, settingProblem, settingsFromConfig, settingsWithDefaults } from '../teamSettings.js';
import { button, formField, node, selectField } from './dom.js';
import { saveTeamSettings } from './settings.js';
import { captain } from './state.js';
import { saveEdit } from './status.js';

const HINT = 'Changes show on the page right away. Save writes them to the Team Config tab.';
const CHOICES = {
  stripe: STRIPE_STYLES.map((style) => [style, style]),
  font: FONTS.map((font) => [font, font]),
  toggle: [['On', 'On'], ['Off', 'Off']],
};
const INPUT_TYPES = { text: 'text', icon: 'text', color: 'color' };

function fieldFor(field, value) {
  const control = field.kind in CHOICES
    ? selectField(field.label, field.key, CHOICES[field.kind], value)
    : formField(field.label, INPUT_TYPES[field.kind], field.key, value);
  control.append(node('span', 'field-note', field.note));
  return control;
}

function valuesFrom(form) {
  const fields = new FormData(form);
  return Object.fromEntries(CONFIG_FIELDS.map(({ key }) => [key, fields.get(key).trim()]));
}

function previewIfValid(values) {
  const hasProblem = CONFIG_FIELDS.some((field) => values[field.key] !== '' && settingProblem(field, values[field.key]) !== null);
  if (!hasProblem) window.fieldView.previewConfig(configFromSettings(settingsWithDefaults(values)));
}

export function teamPanel() {
  const savedValues = settingsFromConfig(window.fieldView.currentConfig());
  const form = node('form', 'game-editor team-editor');
  form.append(...CONFIG_FIELDS.map((field) => fieldFor(field, savedValues[field.key])));
  form.addEventListener('input', () => previewIfValid(valuesFrom(form)));
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Save');
  save.type = 'submit';
  actions.append(save, button('Reset', 'panel-action', () => {
    window.fieldView.previewConfig(window.fieldView.currentConfig());
    captain.panelStale = true;
    window.fieldView.rerender();
  }));
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const values = valuesFrom(form);
    saveEdit(() => saveTeamSettings(values, savedValues), 'Team settings saved');
  });
  return [node('p', 'captain-hint', HINT), form];
}
