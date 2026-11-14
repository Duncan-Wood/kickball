const OUTCOME_WORDS = { W: 'Won', L: 'Lost', T: 'Tied' };
const RESULT_PATTERN = /\b(W|L|T|Won|Lost|Tied)\b[\s,:]*(\d+)\s*[-–]\s*(\d+)/i;

export function resultFromText(text) {
  const match = text.match(RESULT_PATTERN);
  if (match === null) return null;
  return { outcome: match[1][0].toUpperCase(), ourRuns: Number(match[2]), theirRuns: Number(match[3]) };
}

export function describeResult({ outcome, ourRuns, theirRuns }) {
  return `${OUTCOME_WORDS[outcome]} ${ourRuns}-${theirRuns}`;
}
