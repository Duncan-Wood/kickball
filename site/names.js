export const SHORT_NAME_LENGTH = 12;
const ELLIPSIS = '…';

function label({ first, last, letters }) {
  if (last === '') return first;
  return letters >= last.length ? `${first} ${last}` : `${first} ${last.slice(0, letters)}.`;
}

function fitted(person) {
  const text = label(person);
  if (text.length <= SHORT_NAME_LENGTH) return text;
  const initialPart = text.slice(person.first.length);
  const isInitial = initialPart.endsWith('.');
  const roomForFirst = SHORT_NAME_LENGTH - initialPart.length - ELLIPSIS.length;
  if (isInitial && roomForFirst >= 3) return `${person.first.slice(0, roomForFirst)}${ELLIPSIS}${initialPart}`;
  return `${text.slice(0, SHORT_NAME_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
}

export function shortNames(fullNames) {
  const people = [...new Set(fullNames.map((name) => name.trim()))].map((name) => {
    const words = name.split(/\s+/);
    return { name, first: words[0], last: words.length > 1 ? words[words.length - 1] : '', letters: 1 };
  });
  let lengthened = true;
  while (lengthened) {
    const counts = new Map();
    people.forEach((person) => counts.set(label(person).toLowerCase(), (counts.get(label(person).toLowerCase()) ?? 0) + 1));
    const clashing = people.filter((person) => counts.get(label(person).toLowerCase()) > 1 && person.letters < person.last.length);
    clashing.forEach((person) => { person.letters += 1; });
    lengthened = clashing.length > 0;
  }
  return new Map(people.map((person) => [person.name, fitted(person)]));
}
