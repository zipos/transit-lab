import assert from 'node:assert/strict';
import { plural, setLocale } from '../src/i18n/index.js';

setLocale('pl');
const stops = [
  [1, '1 przystanek'],
  [2, '2 przystanki'],
  [5, '5 przystanków'],
  [12, '12 przystanków'],
  [22, '22 przystanki'],
  [25, '25 przystanków']
];
for (const [count, expected] of stops) assert.equal(plural('count.stops', count), expected);

setLocale('en');
assert.equal(plural('count.stops', 1), '1 stop');
assert.equal(plural('count.stops', 5), '5 stops');
