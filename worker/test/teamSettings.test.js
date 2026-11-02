import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_FIELDS, configFromSettings, settingProblem, settingsFromConfig, settingsWithDefaults, sheetColorFromHex } from '../../site/teamSettings.js';

const fieldFor = (key) => CONFIG_FIELDS.find((field) => field.key === key);

test('blank settings fall back to their defaults', () => {
  const settings = settingsWithDefaults({ teamName: 'Fruity Bunts', seasonLabel: '' });
  assert.equal(settings.teamName, 'Fruity Bunts');
  assert.equal(settings.seasonLabel, 'Season');
  assert.equal(settings.font, 'Fredoka');
});

test('a config turns back into the settings it came from', () => {
  const settings = { ...settingsWithDefaults({}), teamName: 'Fruity Bunts', mainColor: '#6a1b9a', stripeStyle: 'Rainbow', suggestionBox: 'Off' };
  assert.deepEqual(settingsFromConfig(configFromSettings(settings)), settings);
});

test('each kind of setting names what is wrong with a bad value', () => {
  assert.match(settingProblem(fieldFor('mainColor'), 'blue'), /not a color/);
  assert.match(settingProblem(fieldFor('font'), 'Comic Sans'), /not one of/);
  assert.match(settingProblem(fieldFor('stripeStyle'), 'Zebra'), /not one of/);
  assert.match(settingProblem(fieldFor('suggestionBox'), 'Maybe'), /not On or Off/);
  assert.match(settingProblem(fieldFor('icon'), 'http://example.test/a.png'), /not an emoji or an https/);
  assert.match(settingProblem(fieldFor('teamName'), 'x'.repeat(61)), /longer than 60/);
  assert.equal(settingProblem(fieldFor('mainColor'), '#2B6CB0'), null);
});

test('a hex color becomes the fractions the Sheets API expects', () => {
  assert.deepEqual(sheetColorFromHex('#ff0000'), { red: 1, green: 0, blue: 0 });
  const { red, green, blue } = sheetColorFromHex('#2b6cb0');
  assert.deepEqual([red, green, blue].map((channel) => Math.round(channel * 255)), [43, 108, 176]);
});
