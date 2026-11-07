// Game settings. Change numbers here; no other file needs editing.

export const APP = {
  name: 'Spot the Bug',
  version: '0.4.0',
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

export const SCORING = {
  line: 100,            // clicked the vulnerable line
  type: 50,             // picked the right vulnerability type
  speedMax: 50,         // scaled by time left, only when both are right
  streakStep: 10,       // per consecutive clean round after the first
  streakCap: 50,
};

export const STORAGE = {
  // 'local' for now. 'supabase' will be added in storage.js when the shared board ships.
  driver: 'local',
  keyPrefix: 'stb:v1',
  maxEntriesPerBoard: 10,
};
