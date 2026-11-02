const RAINBOW_STRIPE_COLORS = ['#ff9aa2', '#ffc48c', '#ffe98a', '#a8e0a0', '#9cc4f0', '#c9a8e8'];

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
    stripe: stripeStyle === 'Rainbow'
      ? { colors: RAINBOW_STRIPE_COLORS, smooth: false }
      : { colors: [mainColor, secondColor], smooth: true },
  };
}
