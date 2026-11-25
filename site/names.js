export const SHORT_NAME_LENGTH = 12;
const ELLIPSIS = '…';
const SCRIPTS_WITHOUT_INITIALS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(text) {
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

function firstGraphemes(text, count) {
  return graphemes(text).slice(0, count).join('');
}

function label({ first, last, letters }) {
  if (last === '') return first;
  return letters >= graphemes(last).length ? `${first} ${last}` : `${first} ${firstGraphemes(last, letters)}.`;
}

function fitted(person) {
  const text = label(person);
  const length = graphemes(text).length;
  if (length <= SHORT_NAME_LENGTH) return text;
  const initialPart = text.slice(person.first.length);
  const isInitial = initialPart.endsWith('.');
  const roomForFirst = SHORT_NAME_LENGTH - graphemes(initialPart).length - ELLIPSIS.length;
  if (isInitial && roomForFirst >= 3) return `${firstGraphemes(person.first, roomForFirst)}${ELLIPSIS}${initialPart}`;
  return `${firstGraphemes(text, SHORT_NAME_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function shortNames(fullNames) {
  const people = [...new Set(fullNames.map((name) => name.trim()))].map((name) => {
    if (SCRIPTS_WITHOUT_INITIALS.test(name)) return { name, first: name, last: '', letters: 1 };
    const words = name.split(/\s+/);
    return { name, first: words[0], last: words.length > 1 ? words[words.length - 1] : '', letters: 1 };
  });
  let lengthened = true;
  while (lengthened) {
    const counts = new Map();
    people.forEach((person) => counts.set(label(person).toLocaleLowerCase(), (counts.get(label(person).toLocaleLowerCase()) ?? 0) + 1));
    const clashing = people.filter((person) => counts.get(label(person).toLocaleLowerCase()) > 1 && person.letters < graphemes(person.last).length);
    clashing.forEach((person) => { person.letters += 1; });
    lengthened = clashing.length > 0;
  }
  return new Map(people.map((person) => [person.name, fitted(person)]));
}
