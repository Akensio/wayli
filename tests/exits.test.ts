// A station's entrance or exit in words (src/text/travel.ts exitText): the letter and the street, in both languages,
// and nothing for a walk that meets no station with entrances.
import { test, expect, afterEach } from 'vitest';
import { exitText } from '../src/text/travel';
import { lang } from '../src/common/i18n';

const was = lang.value;
afterEach(() => {
  lang.value = was;
});
const b = { ref: 'B', name: '', lat: 32.0624, lon: 34.7748, street: 'רוטשילד' };
const unnamed = { ref: '', name: '', lat: 32.8, lon: 35, street: '' };
const named = { ref: '', name: 'Paris Square', lat: 32.8, lon: 35, street: '' };

test('an exit and an entrance, lettered, with the street', () => {
  lang.value = 'he';
  expect(exitText(b, false)).toBe('יציאה B (רוטשילד)');
  expect(exitText(b, true)).toBe('כניסה B (רוטשילד)');
  lang.value = 'en';
  expect(exitText(b, false)).toBe('Exit B (רוטשילד)'); // the street as the book names it in the leg's language
});

test("no letter: the word alone, or with the entrance's own name; none for no entrance", () => {
  lang.value = 'en';
  expect(exitText(unnamed, false)).toBe('Exit');
  expect(exitText(named, true)).toBe('Entrance (Paris Square)');
  expect(exitText(undefined, false)).toBe('');
});
