// Game settings. Change numbers here; no other file needs editing.

export const APP = {
  name: 'Spot the Bug',
  version: '0.14.0',
  org: 'Th3 SpaceIO',
  tagline: 'LEARN. BUILD. SECURE.',
  sister: { name: 'LureLens', url: 'https://thespaceio.github.io/LureLens/' },
};

export const LEVELS = {
  beginner: {
    id: 'beginner',
    label: 'Beginner',
    blurb: 'One clear flaw in short, readable handlers. Learn the classic patterns.',
    seconds: 60,
    options: 4,          // vulnerability types offered per round
    multiplier: 1,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate',
    blurb: 'Flaws hide among realistic code and partial defences.',
    seconds: 45,
    options: 6,
    multiplier: 1.5,
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'Subtle bugs, every vulnerability type on the table, less time.',
    seconds: 40,
    options: 10,
    multiplier: 2,
  },
};

export const ROUNDS_PER_GAME = 10;

// The online scoreboard re-scores every posted game with these same numbers
// (public.arcade_submit_spot_the_bug in supabase/migrations). Change both together.
export const SCORING = {
  line: 100,            // clicked the vulnerable line
  type: 50,             // picked the right vulnerability type
  speedMax: 50,         // scaled by time left, only when both are right
  streakStep: 10,       // per consecutive clean round after the first
  streakCap: 50,
};

export const STORAGE = {
  keyPrefix: 'stb:v1',      // scores saved on this device (used when offline)
  maxEntriesPerBoard: 10,
};

// Shared online scoreboard. Lives in the "LureLens" Supabase project
// (organization "Th3 SpaceIO"), in its own "arcade" schema. The publishable key
// is meant to be public: the database only lets it call three functions.
export const ONLINE = {
  enabled: true,
  url: 'https://rxyhvpdbfuboukqgbych.supabase.co',
  key: 'sb_publishable_v58sr6nGSPrgvUHMP8HVyw_SADkXbTk',
  game: 'spot-the-bug',
  boardSize: 10,
  // Same key as LureLens on the same site, so one sign-in covers both games.
  authStorageKey: 'lurelens-auth',
  profileCacheKey: 'lurelens_profile_v1',
  liveTopic: 'arcade:spot-the-bug',
};

// Public links and contacts.
export const SITE_URL = 'https://thespaceio.github.io/spot-the-bug/';
export const CONTACT_EMAIL = 'th3officialspaceio@gmail.com';
export const REPO_URL = 'https://github.com/thespaceio/spot-the-bug';
