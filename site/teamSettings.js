import { themeFromColors } from './theme.js';

export const CONFIG_TAB_NAME = 'Team Config';
export const STRIPE_STYLES = ['Blend', 'Rainbow'];
export const FONTS = ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora'];

const TEXT_SETTING_MAXIMUM_LENGTH = 60;
const ICON_MAXIMUM_LENGTH = 300;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const CONFIG_FIELDS = [
  { key: 'teamName', label: 'Team name', kind: 'text', defaultValue: 'My Team', note: 'The heading on the page' },
  { key: 'seasonLabel', label: 'Season label', kind: 'text', defaultValue: 'Season', note: 'The tag beside the team name, like "Fall 2026"' },
  { key: 'icon', label: 'Icon', kind: 'icon', defaultValue: 'https://duncan-wood.github.io/kickball/icons/kickball.svg', note: 'One emoji, or a link starting with https:// to a small image' },
  { key: 'mainColor', label: 'Main color', kind: 'color', defaultValue: '#2b6cb0', note: 'Buttons, headings and text' },
  { key: 'secondColor', label: 'Second color', kind: 'color', defaultValue: '#ed8936', note: 'Page background, highlights and borders' },
  { key: 'stripeStyle', label: 'Stripe', kind: 'stripe', defaultValue: 'Blend', note: 'Blend fades from main to second color, Rainbow shows six pastel bands' },
  { key: 'font', label: 'Font', kind: 'font', defaultValue: 'Fredoka', note: 'Pick from the list' },
  { key: 'suggestionBox', label: 'Suggestion box', kind: 'toggle', defaultValue: 'On', note: 'On shows the anonymous suggestion box, Off hides it' },
];

export function settingProblem(field, entered) {
  if (field.kind === 'color') return COLOR_PATTERN.test(entered) ? null : 'is not a color like #2b6cb0';
  if (field.kind === 'stripe') return STRIPE_STYLES.includes(entered) ? null : `is not one of ${STRIPE_STYLES.join(', ')}`;
  if (field.kind === 'font') return FONTS.includes(entered) ? null : `is not one of ${FONTS.join(', ')}`;
  if (field.kind === 'toggle') return ['on', 'off'].includes(entered.toLowerCase()) ? null : 'is not On or Off';
  if (field.kind === 'icon') return entered.length <= ICON_MAXIMUM_LENGTH && (!/^https?:/i.test(entered) || /^https:\/\//i.test(entered)) ? null : 'is not an emoji or an https:// link';
  return entered.length <= TEXT_SETTING_MAXIMUM_LENGTH ? null : `is longer than ${TEXT_SETTING_MAXIMUM_LENGTH} characters`;
}

export function settingsWithDefaults(entered) {
  return Object.fromEntries(CONFIG_FIELDS.map(({ key, defaultValue }) => [key, entered[key] === undefined || entered[key] === '' ? defaultValue : entered[key]]));
}

export function configFromSettings(settings) {
  const { mainColor, secondColor, stripeStyle, suggestionBox, ...pageSettings } = settings;
  return {
    ...pageSettings,
    suggestionBox: suggestionBox.toLowerCase() === 'on',
    theme: themeFromColors(mainColor.toLowerCase(), secondColor.toLowerCase(), stripeStyle),
  };
}

export function settingsFromConfig(config) {
  const { theme, suggestionBox, ...pageSettings } = config;
  return {
    ...pageSettings,
    mainColor: theme.primary,
    secondColor: theme.accent,
    stripeStyle: theme.stripe.smooth ? 'Blend' : 'Rainbow',
    suggestionBox: suggestionBox ? 'On' : 'Off',
  };
}

export function sheetColorFromHex(hex) {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  return { red, green, blue };
}
