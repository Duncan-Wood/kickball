const FIELD_SPOTS = {
  LF: [48, 152], LC: [118, 92], CF: [200, 64], RC: [282, 92], RF: [352, 152],
  SS: [140, 168], '2B': [260, 168], '3B': [88, 224], '1B': [312, 224],
  P: [200, 266], C: [200, 382],
};
const INFIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS'];
const MINIMUM_API_VERSION = 3;
const REFRESH_SECONDS = 10;
const TEAM_CODE_PATTERN = /^[a-z0-9]{12}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FONTS = ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora'];
const THEME_VARIABLES = {
  primary: '--primary',
  accent: '--accent',
  background: '--background',
  ink: '--ink',
  muted: '--muted',
  border: '--border',
  borderSoft: '--border-soft',
  tint: '--tint',
  faint: '--faint',
  tagBackground: '--tag-bg',
  tagText: '--tag-text',
};
const FIRST_LOAD_RETRY_MILLISECONDS = 5000;
const LONGEST_RETRY_MILLISECONDS = 60000;
const LONGEST_REFRESH_BACKOFF_MULTIPLIER = 8;
const ICON_EMOJI_MAXIMUM_CHARACTERS = 8;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHIP_WIDTH = 78;
const COMMENT_TOGGLE_TEXT = 'Anonymous suggestion box';
const COMMENT_CONFIRMATION_MILLISECONDS = 4000;
const RESULT_WORDS = { W: 'Won', L: 'Lost', T: 'Tied' };

const teamCode = new URLSearchParams(location.search).get('team');

let config = null;
let lineups = [];
let selectedLineup = null;
let selectedInningIndex = 0;
let mode = 'inning';
let refreshInFlight = false;
let refreshTimer = null;
let failedRefreshes = 0;
let failedLoads = 0;
let commentToggleResetTimer = null;

function scriptAddress() {
  return window.KICKBALL.workerAddress + '/api/team/' + teamCode;
}

async function readApiResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error('That link did not answer with lineup data. Check that the share link is complete.');
  }
  if (typeof data.apiVersion !== 'number') throw new Error('That link did not answer like a lineup script.');
  if (data.apiVersion < MINIMUM_API_VERSION) throw new Error('This page is out of date. Reload it to try again.');
  if (!data.ok) {
    const failure = new Error(data.error);
    failure.reconnect = data.reconnect === true;
    throw failure;
  }
  return data;
}

async function fetchFromScript(address, options) {
  try {
    return await fetch(address, options);
  } catch (networkError) {
    throw new Error('Could not reach the lineups. Check your connection, and that the share link is complete and still works.');
  }
}

async function apiGet(query) {
  const address = query === undefined ? scriptAddress() : scriptAddress() + '?' + new URLSearchParams(query);
  return readApiResponse(await fetchFromScript(address, { cache: 'no-store' }));
}

async function apiPost(body) {
  return readApiResponse(await fetchFromScript(scriptAddress(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  }));
}

function applyConfig(settings) {
  Object.entries(THEME_VARIABLES).forEach(([key, variable]) => {
    if (!HEX_COLOR_PATTERN.test(settings.theme[key])) throw new Error('The sheet sent an invalid color for ' + key);
    document.documentElement.style.setProperty(variable, settings.theme[key]);
  });
  applyStripe(settings.theme.stripe);
  if (!FONTS.includes(settings.font)) throw new Error('The sheet sent an unknown font');
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=' + settings.font + ':wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);
  document.documentElement.style.setProperty('--font', "'" + settings.font + "'");
  document.getElementById('team-name').textContent = settings.teamName;
  document.title = settings.teamName;
  const seasonTag = document.getElementById('season-tag');
  seasonTag.textContent = settings.seasonLabel;
  seasonTag.hidden = settings.seasonLabel === '';
  applyIcon(settings.icon);
  document.getElementById('comment-toggle').hidden = !settings.suggestionBox;
}

function applyStripe(stripe) {
  if (!Array.isArray(stripe.colors) || !stripe.colors.every((color) => HEX_COLOR_PATTERN.test(color))) {
    throw new Error('The sheet sent an invalid list of stripe colors');
  }
  const segmentPercent = 100 / stripe.colors.length;
  const stops = stripe.colors.map((color, index) => (
    stripe.smooth ? color : color + ' ' + index * segmentPercent + '% ' + (index + 1) * segmentPercent + '%'
  ));
  document.querySelector('.accent-stripe').style.background = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
}

function applyIcon(icon) {
  const teamIcon = document.getElementById('team-icon');
  const favicon = document.getElementById('favicon');
  if (icon.startsWith('https://')) {
    const image = document.createElement('img');
    image.src = icon;
    image.alt = '';
    teamIcon.replaceChildren(image);
    favicon.href = icon;
    return;
  }
  const emoji = Array.from(icon).slice(0, ICON_EMOJI_MAXIMUM_CHARACTERS).join('');
  teamIcon.textContent = emoji;
  const faviconMarkup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90"></text></svg>';
  const faviconDocument = new DOMParser().parseFromString(faviconMarkup, 'image/svg+xml');
  faviconDocument.querySelector('text').textContent = emoji;
  favicon.href = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(faviconDocument));
}

function svgElement(tag, attributes, text) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function drawChip(position, playerNames) {
  const [x, y] = FIELD_SPOTS[position];
  const chip = svgElement('g', { class: playerNames.length === 1 ? 'chip' : 'chip problem' });
  const name = playerNames.length === 0 ? 'open' : playerNames.join(' + ');
  chip.appendChild(svgElement('rect', { class: 'chip-box', x: x - CHIP_WIDTH / 2, y: y - 6, width: CHIP_WIDTH, height: 22, rx: 5 }));
  chip.appendChild(svgElement('rect', { class: 'chip-label-box', x: x - 15, y: y - 18, width: 30, height: 13, rx: 4 }));
  chip.appendChild(svgElement('text', { class: 'chip-label', x, y: y - 8.5 }, position));
  chip.appendChild(svgElement('text', { class: name.length > 12 ? 'chip-name long' : 'chip-name', x, y: y + 9.5 }, name));
  return chip;
}

function summarizeInning(inningIndex) {
  const playersByPosition = {};
  const bench = [];
  const problems = [];
  selectedLineup.players.forEach((player) => {
    const position = player.positions[inningIndex];
    if (position === '') {
      if (player.attending) bench.push(player.name);
      return;
    }
    if (!player.attending) problems.push(player.name + ' is not attending but is at ' + position);
    playersByPosition[position] = (playersByPosition[position] || []).concat(player.name);
  });
  Object.keys(FIELD_SPOTS).forEach((position) => {
    const names = playersByPosition[position] || [];
    if (names.length === 0) problems.push(position + ' is open');
    if (names.length > 1) problems.push(position + ' has ' + names.join(' and '));
  });
  Object.keys(playersByPosition).filter((position) => !FIELD_SPOTS[position]).forEach((position) => {
    problems.push('"' + position + '" is not a field position (' + playersByPosition[position].join(', ') + ')');
  });
  return { playersByPosition, bench, problems };
}

function describeResult(notes) {
  const result = notes.match(/^([WLT]),?\s*(\d+\s*-\s*\d+)$/i);
  if (result === null) return notes;
  return RESULT_WORDS[result[1].toUpperCase()] + ' ' + result[2].replace(/\s/g, '');
}

function renderGameDetails() {
  const details = [describeResult(selectedLineup.notes), selectedLineup.date, selectedLineup.time, selectedLineup.location].filter((detail) => detail !== '');
  document.getElementById('game-details').textContent = details.join(' · ');
}

function renderSubtitle(detail) {
  const subtitle = document.getElementById('subtitle');
  const opponent = document.createElement('strong');
  opponent.textContent = selectedLineup.opponent || 'TBD';
  subtitle.replaceChildren('vs ', opponent, ' · ' + detail);
}

function renderInning() {
  const inning = summarizeInning(selectedInningIndex);
  renderSubtitle('inning ' + selectedLineup.innings[selectedInningIndex]);
  renderGameDetails();

  const chips = document.getElementById('chips');
  chips.replaceChildren(...Object.keys(FIELD_SPOTS).map((position) => drawChip(position, inning.playersByPosition[position] || [])));
  document.getElementById('problems').textContent = inning.problems.join(' · ');

  const kickers = selectedLineup.players.filter((player) => player.attending).map((player) => player.name);
  renderNameList('kicking-order', 'Kicking order', kickers, true);
  renderNameList('bench', 'Sitting (' + inning.bench.length + ')', inning.bench, false);
}

function renderNameList(elementId, headingText, names, numbered) {
  const element = document.getElementById(elementId);
  element.replaceChildren();
  if (names.length === 0) return;
  const heading = document.createElement('h2');
  heading.textContent = headingText;
  const list = document.createElement('ul');
  names.forEach((name, index) => {
    const item = document.createElement('li');
    if (numbered) {
      const order = document.createElement('span');
      order.className = 'order';
      order.textContent = index + 1;
      item.appendChild(order);
    }
    item.append(name);
    list.appendChild(item);
  });
  element.append(heading, list);
}

function tableCell(tag, text, className) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function tableRow(cells) {
  const row = document.createElement('tr');
  row.append(...cells);
  return row;
}

function renderWholeGame() {
  renderSubtitle('whole game, in kicking order');
  renderGameDetails();
  const headerRow = tableRow([
    tableCell('th', '#'),
    tableCell('th', 'Player', 'name'),
    ...selectedLineup.innings.map((inning) => tableCell('th', inning)),
    tableCell('th', 'Played'),
  ]);
  const playerRows = selectedLineup.players.filter((player) => player.attending).map((player, kickingIndex) => {
    const inningsPlayed = player.positions.filter((position) => position !== '').length;
    return tableRow([
      tableCell('td', kickingIndex + 1, 'kicking-order'),
      tableCell('td', player.name, 'name'),
      ...player.positions.map((position) => (position === '' ? tableCell('td', 'sit', 'sat') : tableCell('td', position))),
      tableCell('td', inningsPlayed + ' of ' + selectedLineup.innings.length, 'played'),
    ]);
  });
  document.getElementById('summary').replaceChildren(headerRow, ...playerRows);

  const inningsByProblem = new Map();
  selectedLineup.innings.forEach((inning, inningIndex) => {
    summarizeInning(inningIndex).problems.forEach((problem) => {
      inningsByProblem.set(problem, (inningsByProblem.get(problem) || []).concat(inning));
    });
  });
  const problems = [...inningsByProblem].map(([problem, innings]) => {
    if (innings.length === selectedLineup.innings.length) return problem + ' every inning';
    return problem + (innings.length === 1 ? ' in inning ' : ' in innings ') + innings.join(', ');
  });
  document.getElementById('problems').textContent = problems.join(' · ');
  document.getElementById('bench').replaceChildren();
  document.getElementById('kicking-order').replaceChildren();
}

function seasonTotals(playedLineups) {
  const totalsByName = new Map();
  lineups.forEach((lineup) => {
    lineup.players.forEach((player) => {
      if (!totalsByName.has(player.name)) {
        totalsByName.set(player.name, { name: player.name, games: 0, played: 0, sat: 0, infield: 0, outfield: 0 });
      }
    });
  });
  playedLineups.forEach((lineup) => {
    lineup.players.filter((player) => player.attending).forEach((player) => {
      const totals = totalsByName.get(player.name);
      totals.games += 1;
      player.positions.forEach((position) => {
        if (position === '') totals.sat += 1;
        else totals.played += 1;
        if (INFIELD_POSITIONS.includes(position)) totals.infield += 1;
        else if (FIELD_SPOTS[position]) totals.outfield += 1;
      });
    });
  });
  return [...totalsByName.values()];
}

function renderSeason() {
  const playedLineups = lineups.filter((lineup) => lineup.played);
  const playedGameNames = playedLineups.map((lineup) => {
    return lineup.notes === '' ? lineup.label : lineup.label + ' ' + describeResult(lineup.notes);
  });
  document.getElementById('subtitle').textContent = playedLineups.length === 0
    ? 'Season totals: no games played yet'
    : 'Season totals in innings, counting games already played: ' + playedGameNames.join(', ') + '. A game is added the day after it is played.';
  const headerRow = tableRow([
    tableCell('th', 'Player', 'name'),
    ...['Games', 'Played', 'Sat', 'Infield', 'Outfield'].map((heading) => tableCell('th', heading)),
  ]);
  const playerRows = seasonTotals(playedLineups).map((totals) => tableRow([
    tableCell('td', totals.name, 'name'),
    tableCell('td', totals.games, totals.games === 0 ? 'sat' : ''),
    tableCell('td', totals.played, totals.games === 0 ? 'sat' : 'played'),
    tableCell('td', totals.sat, totals.sat === 0 ? 'sat' : ''),
    tableCell('td', totals.infield),
    tableCell('td', totals.outfield),
  ]));
  document.getElementById('summary').replaceChildren(headerRow, ...playerRows);
  document.getElementById('problems').textContent = '';
  document.getElementById('game-details').textContent = '';
  document.getElementById('bench').replaceChildren();
  document.getElementById('kicking-order').replaceChildren();
}

function render() {
  document.getElementById('field').style.display = mode === 'inning' ? '' : 'none';
  document.getElementById('summary').hidden = mode === 'inning';
  if (mode === 'inning') renderInning();
  if (mode === 'game') renderWholeGame();
  if (mode === 'season') renderSeason();
  document.querySelectorAll('#innings button').forEach((button) => {
    const matchesInning = mode !== 'inning' || Number(button.dataset.inningIndex) === selectedInningIndex;
    button.classList.toggle('selected', button.dataset.mode === mode && matchesInning);
  });
}

function modeButton(label, buttonMode, inningIndex) {
  const button = document.createElement('button');
  button.textContent = label;
  button.dataset.mode = buttonMode;
  if (buttonMode === 'inning') button.dataset.inningIndex = inningIndex;
  else button.className = 'wide';
  button.addEventListener('click', () => {
    mode = buttonMode;
    if (buttonMode === 'inning') selectedInningIndex = inningIndex;
    render();
  });
  return button;
}

function selectLineup(tabName) {
  selectedLineup = lineups.find((lineup) => lineup.tabName === tabName);
  selectedInningIndex = Math.min(selectedInningIndex, selectedLineup.innings.length - 1);
  document.getElementById('innings').replaceChildren(
    ...selectedLineup.innings.map((inning, index) => modeButton(inning, 'inning', index)),
    modeButton('All', 'game'),
    modeButton('Season', 'season'),
  );
  render();
}

function start(data) {
  config = data.config;
  applyConfig(config);
  lineups = data.lineups;
  document.getElementById('status').textContent = 'No current tabs ending in "Lineup" were found.';
  if (lineups.length === 0) return;
  const game = document.getElementById('game');
  lineups.forEach((lineup) => {
    const option = document.createElement('option');
    option.value = lineup.tabName;
    option.textContent = lineup.label;
    game.appendChild(option);
  });
  const startingLineup = lineups.find((lineup) => lineup.tabName === data.activeTabName)
    || lineups.find((lineup) => !lineup.played)
    || lineups[lineups.length - 1];
  game.value = startingLineup.tabName;
  game.addEventListener('change', () => {
    selectLineup(game.value);
    resetCommentToggle();
  });
  document.getElementById('comment-toggle').addEventListener('click', () => setCommentFormOpen(true));
  document.getElementById('comment-cancel').addEventListener('click', () => setCommentFormOpen(false));
  document.getElementById('comment-form').addEventListener('submit', submitCommentForm);
  clearFailure();
  document.getElementById('status').hidden = true;
  document.getElementById('view').hidden = false;
  selectLineup(startingLineup.tabName);
  document.addEventListener('visibilitychange', scheduleRefresh);
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (document.hidden || refreshInFlight) return;
  const backoff = Math.min(2 ** failedRefreshes, LONGEST_REFRESH_BACKOFF_MULTIPLIER);
  refreshTimer = setTimeout(refresh, REFRESH_SECONDS * 1000 * backoff);
}

async function refresh() {
  refreshInFlight = true;
  let freshLineup;
  try {
    freshLineup = (await apiGet({ tab: selectedLineup.tabName })).lineup;
  } catch (error) {
    refreshInFlight = false;
    failedRefreshes += 1;
    showFailure('Live update failed, showing the last good lineup', error);
    scheduleRefresh();
    return;
  }
  refreshInFlight = false;
  failedRefreshes = 0;
  applyRefresh(freshLineup);
}

function applyRefresh(freshLineup) {
  const index = lineups.findIndex((lineup) => lineup.tabName === freshLineup.tabName);
  const changed = JSON.stringify(lineups[index]) !== JSON.stringify(freshLineup);
  lineups[index] = freshLineup;
  clearFailure();
  if (changed) saveLineups();
  if (changed && selectedLineup.tabName === freshLineup.tabName) selectLineup(freshLineup.tabName);
  scheduleRefresh();
}

function setCommentFormOpen(open) {
  document.getElementById('comment-form').hidden = !open;
  document.getElementById('comment-toggle').hidden = open || !config.suggestionBox;
  if (open) {
    resetCommentToggle();
    document.getElementById('comment-text').focus();
  }
}

function resetCommentToggle() {
  clearTimeout(commentToggleResetTimer);
  document.getElementById('comment-toggle').textContent = COMMENT_TOGGLE_TEXT;
  document.getElementById('comment-status').textContent = '';
}

async function submitCommentForm(event) {
  event.preventDefault();
  const commentText = document.getElementById('comment-text');
  const submitButton = document.getElementById('comment-submit');
  const commentStatus = document.getElementById('comment-status');
  submitButton.disabled = true;
  commentStatus.textContent = 'Sending…';
  try {
    await apiPost({ action: 'comment', tab: selectedLineup.tabName, text: commentText.value });
  } catch (error) {
    submitButton.disabled = false;
    commentStatus.textContent = 'Could not send: ' + error.message;
    return;
  }
  submitButton.disabled = false;
  commentText.value = '';
  commentStatus.textContent = '';
  setCommentFormOpen(false);
  document.getElementById('comment-toggle').textContent = "Thanks, it's in the box!";
  commentToggleResetTimer = setTimeout(resetCommentToggle, COMMENT_CONFIRMATION_MILLISECONDS);
}

function showFailure(title, error) {
  const panel = document.getElementById('error-panel');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('div');
  detail.textContent = error instanceof Error ? error.message : String(error);
  const hint = document.createElement('div');
  hint.className = 'error-hint';
  hint.textContent = 'This page keeps trying on its own.';
  panel.replaceChildren(heading, detail, hint);
  if (error instanceof Error && error.reconnect === true) {
    const reconnectLink = document.createElement('a');
    reconnectLink.href = new URL('start.html?reconnect=' + teamCode, location.href).href;
    reconnectLink.textContent = 'Captain: reconnect here';
    hint.append(' ', reconnectLink);
  }
  panel.hidden = false;
}

function clearFailure() {
  document.getElementById('error-panel').hidden = true;
}

function savedLineupsKey() {
  return 'lineups:v' + MINIMUM_API_VERSION + ':' + teamCode;
}

function saveLineups() {
  try {
    localStorage.setItem(savedLineupsKey(), JSON.stringify({ savedAt: Date.now(), config, lineups }));
  } catch (storageUnavailable) {
    return;
  }
}

function savedLineups() {
  try {
    return JSON.parse(localStorage.getItem(savedLineupsKey()));
  } catch (storageUnavailable) {
    return null;
  }
}

function describeAge(savedAt) {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  return Math.round(hours / 24) + ' days ago';
}

async function loadLineups() {
  let data;
  try {
    data = await apiGet();
  } catch (error) {
    const saved = savedLineups();
    if (saved === null) {
      showLoadFailure(error);
      return;
    }
    start(saved);
    showFailure('Showing the lineup saved ' + describeAge(saved.savedAt), error);
    return;
  }
  start(data);
  saveLineups();
}

function showLoadFailure(error) {
  showFailure('Could not load the lineups', error);
  document.getElementById('status').textContent = 'Trying again…';
  failedLoads += 1;
  setTimeout(loadLineups, Math.min(FIRST_LOAD_RETRY_MILLISECONDS * 2 ** (failedLoads - 1), LONGEST_RETRY_MILLISECONDS));
}

window.addEventListener('error', (event) => showFailure('Something broke in this page, reload to try again', event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showFailure('Something broke in this page, reload to try again', event.reason));

if (TEAM_CODE_PATTERN.test(teamCode || '')) {
  loadLineups();
} else {
  document.getElementById('status').textContent = 'This link is missing its team code. Ask your captain for the share link, or set up your own team at start.html.';
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
