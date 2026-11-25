import { graphemes, shortNames } from './names.js';
import { POSITION_CODES } from './template.js';
import { readableColors } from './theme.js';

const POSITION_LABELS = { P: 'Pitcher', C: 'Catcher', '1B': '1st base', '2B': '2nd base', '3B': '3rd base', SS: 'Shortstop', LF: 'Left field', LC: 'Left center', CF: 'Center', RC: 'Right center', RF: 'Right field' };
const OPEN = '—';
const SCALE = 2;
const PADDING = 24;
const TITLE_HEIGHT = 34;
const SUBTITLE_HEIGHT = 24;
const GAP = 14;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 30;
const LINE_HEIGHT = 20;
const LABEL_WIDTH = 120;
const INNING_WIDTH = 112;
const KICKING_GAP = 20;
const KICKING_WIDTH = 190;
const CELL_PADDING = 10;

export function lineupGrid(lineup) {
  const attending = lineup.players.filter((player) => player.attending);
  const shortNameOf = shortNames(lineup.players.map((player) => player.name));
  const nameOf = (player) => `${shortNameOf.get(player.name.trim())}${player.rsvp === 'maybe' ? '?' : ''}`;
  return {
    innings: lineup.innings,
    rows: POSITION_CODES.map((code) => ({
      label: POSITION_LABELS[code],
      cells: lineup.innings.map((unused, inningIndex) => attending.filter((player) => player.positions[inningIndex] === code).map(nameOf).join(' + ') || OPEN),
    })),
    sitting: lineup.innings.map((unused, inningIndex) => attending.filter((player) => player.positions[inningIndex] === '').map(nameOf)),
    kicking: attending.map(nameOf),
  };
}

function fittedText(context, text, width) {
  if (context.measureText(text).width <= width) return text;
  const pieces = graphemes(text);
  while (pieces.length > 1 && context.measureText(`${pieces.join('')}…`).width > width) pieces.pop();
  return `${pieces.join('')}…`;
}

function drawLineupImage(grid, { title, subtitle, theme: teamTheme, font }) {
  const theme = { ...teamTheme, ...readableColors(teamTheme) };
  const tableWidth = LABEL_WIDTH + grid.innings.length * INNING_WIDTH;
  const sittingHeight = Math.max(1, ...grid.sitting.map((names) => names.length)) * LINE_HEIGHT + CELL_PADDING;
  const tableHeight = HEADER_HEIGHT + grid.rows.length * ROW_HEIGHT + sittingHeight;
  const kickingHeight = HEADER_HEIGHT + grid.kicking.length * LINE_HEIGHT + CELL_PADDING;
  const width = PADDING * 2 + tableWidth + KICKING_GAP + KICKING_WIDTH;
  const top = PADDING + TITLE_HEIGHT + SUBTITLE_HEIGHT + GAP;
  const height = top + Math.max(tableHeight, kickingHeight) + PADDING;
  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const context = canvas.getContext('2d');
  context.scale(SCALE, SCALE);
  const fontOf = (weight, size) => `${weight} ${size}px '${font}', sans-serif`;
  const text = (value, x, y, maxWidth, { weight = 500, size = 14, color = theme.ink } = {}) => {
    context.font = fontOf(weight, size);
    context.fillStyle = color;
    context.fillText(fittedText(context, value, maxWidth), x, y);
  };
  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);
  context.textBaseline = 'middle';
  text(title, PADDING, PADDING + TITLE_HEIGHT / 2, width - PADDING * 2, { weight: 700, size: 22, color: theme.primary });
  text(subtitle, PADDING, PADDING + TITLE_HEIGHT + SUBTITLE_HEIGHT / 2, width - PADDING * 2, { size: 14, color: theme.muted });
  const box = (x, y, boxWidth, boxHeight, fill) => {
    context.fillStyle = fill;
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeStyle = theme.border;
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, boxWidth, boxHeight);
  };
  const tableLeft = PADDING;
  box(tableLeft, top, LABEL_WIDTH, HEADER_HEIGHT, theme.tint);
  grid.innings.forEach((inning, index) => {
    const x = tableLeft + LABEL_WIDTH + index * INNING_WIDTH;
    box(x, top, INNING_WIDTH, HEADER_HEIGHT, theme.tint);
    text(`Inning ${inning}`, x + CELL_PADDING, top + HEADER_HEIGHT / 2, INNING_WIDTH - CELL_PADDING * 2, { weight: 700, size: 13 });
  });
  grid.rows.forEach((row, rowIndex) => {
    const y = top + HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
    box(tableLeft, y, LABEL_WIDTH, ROW_HEIGHT, '#ffffff');
    text(row.label, tableLeft + CELL_PADDING, y + ROW_HEIGHT / 2, LABEL_WIDTH - CELL_PADDING * 2, { weight: 600, size: 13, color: theme.muted });
    row.cells.forEach((cell, index) => {
      const x = tableLeft + LABEL_WIDTH + index * INNING_WIDTH;
      box(x, y, INNING_WIDTH, ROW_HEIGHT, '#ffffff');
      text(cell, x + CELL_PADDING, y + ROW_HEIGHT / 2, INNING_WIDTH - CELL_PADDING * 2, { color: cell === OPEN ? theme.faint : theme.ink });
    });
  });
  const sittingTop = top + HEADER_HEIGHT + grid.rows.length * ROW_HEIGHT;
  box(tableLeft, sittingTop, LABEL_WIDTH, sittingHeight, theme.tint);
  text('Sitting', tableLeft + CELL_PADDING, sittingTop + LINE_HEIGHT / 2 + CELL_PADDING / 2, LABEL_WIDTH - CELL_PADDING * 2, { weight: 600, size: 13, color: theme.muted });
  grid.sitting.forEach((names, index) => {
    const x = tableLeft + LABEL_WIDTH + index * INNING_WIDTH;
    box(x, sittingTop, INNING_WIDTH, sittingHeight, theme.tint);
    names.forEach((name, line) => text(name, x + CELL_PADDING, sittingTop + CELL_PADDING / 2 + line * LINE_HEIGHT + LINE_HEIGHT / 2, INNING_WIDTH - CELL_PADDING * 2, { size: 13 }));
  });
  const kickingLeft = tableLeft + tableWidth + KICKING_GAP;
  box(kickingLeft, top, KICKING_WIDTH, HEADER_HEIGHT, theme.tint);
  text('Kicking order', kickingLeft + CELL_PADDING, top + HEADER_HEIGHT / 2, KICKING_WIDTH - CELL_PADDING * 2, { weight: 700, size: 13 });
  box(kickingLeft, top + HEADER_HEIGHT, KICKING_WIDTH, kickingHeight - HEADER_HEIGHT, '#ffffff');
  grid.kicking.forEach((name, index) => {
    const y = top + HEADER_HEIGHT + CELL_PADDING / 2 + index * LINE_HEIGHT + LINE_HEIGHT / 2;
    text(`${index + 1}`, kickingLeft + CELL_PADDING, y, 24, { weight: 700, size: 13, color: theme.primary });
    text(name, kickingLeft + CELL_PADDING + 26, y, KICKING_WIDTH - CELL_PADDING * 2 - 26, { size: 14 });
  });
  return canvas;
}

function imageTitles(lineup, config) {
  const game = lineup.opponent === '' ? lineup.label : `${lineup.label} vs ${lineup.opponent}`;
  return { title: `${config.teamName} · ${game}`, subtitle: [lineup.date, lineup.time, lineup.location].filter((detail) => detail !== '').join(' · ') };
}

export function canShareImages() {
  return navigator.canShare?.({ files: [new File([''], 'lineup.png', { type: 'image/png' })] }) === true;
}

export async function lineupImageFile(lineup, config) {
  await document.fonts.load(`700 16px '${config.font}'`);
  const { title, subtitle } = imageTitles(lineup, config);
  const canvas = drawLineupImage(lineupGrid(lineup), { title, subtitle, theme: config.theme, font: config.font });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const fileName = `${config.teamName} ${lineup.label}.png`.replace(/[\\/:*?"<>|]/g, '-');
  return { file: new File([blob], fileName, { type: 'image/png' }), title };
}

export function saveImage(file) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

export async function shareLineup(lineup, config) {
  const { file, title } = await lineupImageFile(lineup, config);
  if (!canShareImages()) {
    saveImage(file);
    return 'downloaded';
  }
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (error) {
    if (error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export async function saveLineup(lineup, config) {
  saveImage((await lineupImageFile(lineup, config)).file);
}
