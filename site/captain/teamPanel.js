import { CONFIG_FIELDS, FONTS, STRIPE_STYLES, configFromSettings, settingProblem, settingsFromConfig, settingsWithDefaults } from '../teamSettings.js';
import { button, formField, node, selectField } from './dom.js';
import { saveTeamSettings } from './settings.js';
import { captain } from './state.js';
import { saveEdit, setStatus } from './status.js';

const HINT = 'Changes preview here. Save to keep them.';
const CHOICES = {
  stripe: STRIPE_STYLES.map((style) => [style, style]),
  font: FONTS.map((font) => [font, font]),
  toggle: [['On', 'On'], ['Off', 'Off']],
};
const INPUT_TYPES = { text: 'text', icon: 'text' };
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

function colorField(field, value) {
  const label = node('label', undefined, field.label);
  const row = node('span', 'color-row');
  const picker = node('input');
  picker.type = 'color';
  picker.name = field.key;
  picker.value = value;
  const hex = node('input');
  hex.type = 'text';
  hex.value = value;
  hex.maxLength = 7;
  hex.autocomplete = 'off';
  hex.spellcheck = false;
  hex.setAttribute('aria-label', `${field.label} hex code`);
  picker.addEventListener('input', () => { hex.value = picker.value; });
  hex.addEventListener('input', () => {
    const typed = hex.value.trim().toLowerCase();
    const withHash = typed.startsWith('#') ? typed : `#${typed}`;
    if (HEX_PATTERN.test(withHash)) picker.value = withHash;
  });
  hex.addEventListener('blur', () => { hex.value = picker.value; });
  row.append(picker, hex);
  label.append(row);
  return label;
}

function fieldFor(field, value) {
  let control;
  if (field.kind === 'color') control = colorField(field, value);
  else if (field.kind in CHOICES) control = selectField(field.label, field.key, CHOICES[field.kind], value);
  else control = formField(field.label, INPUT_TYPES[field.kind], field.key, value);
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

function linkRow(labelText, link) {
  const row = button('', 'share-link', () => {
    navigator.clipboard.writeText(link).then(() => setStatus(`${labelText} copied`), () => setStatus('Could not copy the link', { isError: true }));
  });
  const text = node('span', 'share-link-text');
  text.append(node('span', 'share-link-label', labelText), node('span', 'share-link-address', link.replace(/^https?:\/\//, '')));
  row.append(text, node('span', 'share-link-action', 'Copy'));
  return row;
}

function shareLinkRows() {
  const link = `${location.origin}${location.pathname}?team=${window.fieldView.teamCode}`;
  const links = node('div', 'share-links');
  links.append(
    linkRow('Link for players', link),
    linkRow('Link for co-captains', `${link}#captain`),
    node('p', 'captain-hint', 'Share the sheet with a co-captain first, then send them this link.'),
  );
  return [links];
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
  return [node('p', 'captain-hint', HINT), form, ...shareLinkRows()];
}

