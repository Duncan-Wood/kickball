const PRIDE_COLORS = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982'];
const FLAG_STRIPES = {
  Pride: PRIDE_COLORS,
  'Progress Pride': ['#000000', '#613915', '#74d7ee', '#ffafc8', '#ffffff', ...PRIDE_COLORS],
  Trans: ['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa'],
  Bi: ['#d60270', '#d60270', '#9b4f96', '#0038a8', '#0038a8'],
  Lesbian: ['#d52d00', '#ef7627', '#ff9a56', '#ffffff', '#d162a4', '#b55690', '#a30262'],
  Nonbinary: ['#fcf434', '#ffffff', '#9c59d1', '#2c2c2c'],
};
const STRIPE_HEIGHT = 3;

function stripeFor(name, mainColor, secondColor) {
  const drawing = (style, colors) => ({ name, height: STRIPE_HEIGHT, style, colors });
  if (name in FLAG_STRIPES) return drawing('bands', FLAG_STRIPES[name]);
  if (name === 'Solid') return drawing('bands', [mainColor]);
  if (name === 'Split') return drawing('bands', [mainColor, secondColor]);
  if (name === 'Candy') return drawing('candy', [mainColor, secondColor]);
  return drawing('blend', [mainColor, secondColor]);
}

export function blendedColor(colorShares, baseColor = '#ffffff') {
  const channel = (color, start) => parseInt(color.slice(start, start + 2), 16);
  const baseShare = 1 - colorShares.reduce((total, [, share]) => total + share, 0);
  const channels = [1, 3, 5].map((start) => {
    const blended = colorShares.reduce((total, [color, share]) => total + channel(color, start) * share, channel(baseColor, start) * baseShare);
    return Math.round(blended).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export function themeFromColors(mainColor, secondColor, stripeStyle) {
  const mutedColor = blendedColor([[mainColor, 0.28]], '#6b6b6b');
  return {
    primary: mainColor,
    accent: secondColor,
    background: blendedColor([[secondColor, 0.12]]),
    ink: blendedColor([[mainColor, 0.22]], '#111111'),
    muted: mutedColor,
    border: blendedColor([[mainColor, 0.15], [secondColor, 0.35]]),
    borderSoft: blendedColor([[mainColor, 0.05], [secondColor, 0.25]]),
    tint: blendedColor([[secondColor, 0.35]]),
    faint: blendedColor([[mutedColor, 0.45]]),
    tagBackground: blendedColor([[secondColor, 0.3]]),
    tagText: blendedColor([[secondColor, 0.55]], '#000000'),
    stripe: stripeFor(stripeStyle, mainColor, secondColor),
  };
}
