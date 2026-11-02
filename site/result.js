const OUTCOME_WORDS = { W: 'Won', L: 'Lost', T: 'Tied' };
const RESULT_PATTERN = /^([WLT]),?\s*(\d+)\s*-\s*(\d+)$/i;

export function resultFromNotes(notes) {
  const match = notes.trim().match(RESULT_PATTERN);
  if (match === null) return null;
  return { outcome: match[1].toUpperCase(), ourRuns: Number(match[2]), theirRuns: Number(match[3]) };
}

export function notesFromResult({ outcome, ourRuns, theirRuns }) {
  if (!Number.isInteger(ourRuns) || !Number.isInteger(theirRuns) || ourRuns < 0 || theirRuns < 0) throw new Error('Enter both scores as whole numbers');
  if (outcome === 'W' && ourRuns <= theirRuns) throw new Error('A win needs more runs for your team than the other team');
  if (outcome === 'L' && ourRuns >= theirRuns) throw new Error('A loss needs fewer runs for your team than the other team');
  if (outcome === 'T' && ourRuns !== theirRuns) throw new Error('A tie needs the same runs for both teams');
  return `${outcome}, ${ourRuns}-${theirRuns}`;
}

export function describeResult({ outcome, ourRuns, theirRuns }) {
  return `${OUTCOME_WORDS[outcome]} ${ourRuns}-${theirRuns}`;
}
