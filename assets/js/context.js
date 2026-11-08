// State shared between screens, and the rules that depend on it.
import { isGameNight } from './gamenight.js';
import { onlineEnabled } from './supa.js';
import { LocalScoreStore, readTeam } from './storage.js';

const team = readTeam();   // { slug, key } from a team link, or null

export const ctx = {
  content: null,                        // { categories: Map, snippets: [] }
  team,
  teamStatus: { info: null, error: null },   // filled in at boot
  local: new LocalScoreStore({ team }),
  result: null,                         // the last finished game, for the results screen
  returnTo: null,                       // where Account sends the player back to after signing in
  go: () => {},                         // set by app.js: go(view, options)
  view: null,
};

// Posting online: the public board, or a team board whose link checked out.
export const canPostOnline = () => onlineEnabled() && (!ctx.team || Boolean(ctx.teamStatus.info));

// Public games open on Fridays (Game Night). Licensed teams train any day, but
// only with a team link that checked out, so a made-up ?team= can't open public play.
export const isOpen = () => Boolean(ctx.teamStatus.info) || isGameNight();

export const boardName = () => (ctx.teamStatus.info ? `${ctx.teamStatus.info.name} team board` : 'online scoreboard');

export function category(id) {
  return ctx.content?.categories.get(id) || { id, name: id, owasp: '', cwe: '', summary: '' };
}
