// Game Night: public games open on Fridays only, from midnight to midnight
// West Africa Time (WAT, UTC+1 all year). That's when the Th3 SpaceIO
// community plays together, live at 6pm.
//
// Team boards (?team=...) stay open every day, for staff training and classes.
// To open public play every day again, set FRIDAY_ONLY to false.
export const FRIDAY_ONLY = true;
export const GAME_NIGHT_URL = 'https://th3spaceio.pages.dev/game-night';

const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRIDAY = 5;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const wat = (now) => new Date(now + WAT_OFFSET_MS); // read the UTC fields as WAT

export function isGameNight(now = Date.now(), fridayOnly = FRIDAY_ONLY) {
  if (!fridayOnly) return true;
  return wat(now).getUTCDay() === FRIDAY;
}

/** The instant the next Friday starts in WAT. Today counts if it is Friday. */
export function nextGameNight(now = Date.now()) {
  const w = wat(now);
  const daysUntil = (FRIDAY - w.getUTCDay() + 7) % 7;
  const startWat = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) + daysUntil * DAY_MS;
  return new Date(startWat - WAT_OFFSET_MS);
}

/** "Friday 13 November". */
export function nextGameNightLabel(now = Date.now()) {
  const d = wat(nextGameNight(now).getTime());
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
