import { CONFIG_FIELDS, FONTS, STRIPE_STYLES, configFromSettings, settingProblem, settingsFromConfig, settingsWithDefaults } from '../teamSettings.js';
import { COMMENTS_TAB_NAME } from '../template.js';
import { button, formField, node, selectField } from './dom.js';
import { saveTeamSettings } from './settings.js';
import { captain } from './state.js';
import { autosave, setStatus } from './status.js';

const HINT = 'Changes save as you make them. Undo takes them back.';
const CHOICES = {
  stripe: STRIPE_STYLES.map((style) => [style, style]),
  font: FONTS.map((font) => [font, font]),
  toggle: [['On', 'On'], ['Off', 'Off']],
};
const INPUT_TYPES = { text: 'text', icon: 'text' };
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

function colorField(field, value, commit) {
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
  hex.addEventListener('blur', () => {
    hex.value = picker.value;
    commit();
  });
  picker.addEventListener('change', commit);
  row.append(picker, hex);
  label.append(row);
  return label;
}

function sheetAddress(sheetId) {
  const address = `https://docs.google.com/spreadsheets/d/${captain.spreadsheetId}/edit`;
  return sheetId === undefined ? address : `${address}#gid=${sheetId}`;
}

function externalLink(text, address) {
  const link = node('a', 'panel-link', text);
  link.href = address;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function suggestionNote() {
  const note = node('span', 'field-note', 'Players can send you anonymous notes. They land in the Comments tab of your sheet.');
  const commentsTab = captain.tabs.get(COMMENTS_TAB_NAME);
  if (commentsTab !== undefined) note.append(' ', externalLink('Open it ↗', sheetAddress(commentsTab.sheetId)));
  return note;
}

function fieldFor(field, value, commit) {
  let control;
  if (field.kind === 'color') {
    control = colorField(field, value, commit);
  } else if (field.kind in CHOICES) {
    control = selectField(field.label, field.key, CHOICES[field.kind], value);
    control.querySelector('select').addEventListener('change', commit);
  } else {
    control = formField(field.label, INPUT_TYPES[field.kind], field.key, value);
    const input = control.querySelector('input');
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
  }
  control.append(field.key === 'suggestionBox' ? suggestionNote() : node('span', 'field-note', field.note));
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
  const coCaptainSteps = node('p', 'captain-hint', 'To add a co-captain, open the sheet, choose Share and add them as an Editor. Then send them the co-captain link. ');
  coCaptainSteps.append(externalLink('Open the sheet ↗', sheetAddress()));
  links.append(
    linkRow('Link for players', link),
    linkRow('Link for co-captains', `${link}#captain`),
    coCaptainSteps,
  );
  return [links];
}

function redrawPanel() {
  window.fieldView.previewConfig(window.fieldView.currentConfig());
  captain.panelStale = true;
  window.fieldView.rerender();
}

function settingRefusal(field, value) {
  if (value === '') return field.key === 'teamName' ? 'The team name can\'t be empty' : null;
  const problem = settingProblem(field, value);
  return problem === null ? null : `"${field.label}" ${problem}`;
}

export function teamPanel() {
  let savedValues = settingsFromConfig(window.fieldView.currentConfig());
  const form = node('form', 'game-editor team-editor');
  form.addEventListener('submit', (event) => event.preventDefault());
  const commitFor = (field) => () => {
    const value = valuesFrom(form)[field.key];
    if (value === savedValues[field.key]) return;
    const refusal = settingRefusal(field, value);
    if (refusal !== null) {
      setStatus(refusal, { isError: true });
      redrawPanel();
      return;
    }
    const previous = savedValues;
    const next = { ...savedValues, [field.key]: value };
    savedValues = next;
    autosave(() => saveTeamSettings(next, previous), `${field.label} saved`).then((ok) => {
      if (!ok) redrawPanel();
    });
  };
  form.append(...CONFIG_FIELDS.map((field) => fieldFor(field, savedValues[field.key], commitFor(field))));
  form.addEventListener('input', () => previewIfValid(valuesFrom(form)));
  return [node('p', 'captain-hint', HINT), form, ...shareLinkRows()];
}

