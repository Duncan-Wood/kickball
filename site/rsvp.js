export const ATTENDING_ANSWERS = ['yes', 'maybe'];

export function isAttending(answer) {
  return ATTENDING_ANSWERS.includes(answer);
}
