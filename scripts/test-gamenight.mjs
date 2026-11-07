// Checks the Friday-only Game Night rule. 6 November 2026 is a Friday; WAT is UTC+1.
import assert from 'node:assert/strict';
import { isGameNight, nextGameNight, nextGameNightLabel } from '../assets/js/gamenight.js';

const at = (iso) => Date.parse(iso);
assert.equal(isGameNight(at('2026-11-05T22:59:00Z')), false, 'Thursday 23:59 WAT is closed');
assert.equal(isGameNight(at('2026-11-05T23:00:00Z')), true, 'Friday 00:00 WAT is open');
assert.equal(isGameNight(at('2026-11-06T17:00:00Z')), true, 'Friday 18:00 WAT is open');
assert.equal(isGameNight(at('2026-11-06T22:59:00Z')), true, 'Friday 23:59 WAT is open');
assert.equal(isGameNight(at('2026-11-06T23:00:00Z')), false, 'Saturday 00:00 WAT is closed');
assert.equal(isGameNight(at('2026-12-31T23:30:00Z')), true, 'Friday 1 January 2027 in WAT is open');
assert.equal(isGameNight(at('2026-11-04T12:00:00Z'), false), true, 'always open when Friday-only is off');
assert.equal(nextGameNight(at('2026-11-04T12:00:00Z')).toISOString(), '2026-11-05T23:00:00.000Z');
assert.equal(nextGameNightLabel(at('2026-11-04T12:00:00Z')), 'Friday 6 November');
assert.equal(nextGameNightLabel(at('2026-11-07T10:00:00Z')), 'Friday 13 November');
console.log('Game Night rule: all checks passed');
