/**
 * Achievement badges — milestones that unlock as you code with your buddy
 *
 * Event counters are split into two scopes:
 *   Global (events.json):      coding-activity counters (errors, tests, diffs, days, sessions, commands)
 *   Per-slot (events.<slot>.json): buddy-relationship counters (pets, turns, reactions)
 *
 * Achievement checks merge both scopes so threshold logic is transparent.
 * All writes use tmp+rename for atomicity (same pattern as state.ts).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { buddyStateDir } from "./path.ts";

const STATE_DIR = buddyStateDir();
const EVENTS_FILE = join(STATE_DIR, "events.json");
const DAYS_FILE = join(STATE_DIR, "active_days.json");
const UNLOCKED_FILE = join(STATE_DIR, "unlocked.json");

function slotEventsFile(slot: string): string {
  return join(STATE_DIR, `events.${slot}.json`);
}

function ensureDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function atomicWrite(path: string, data: string): void {
  ensureDir();
  const tmp = path + ".tmp";
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// ─── Event counters (global) ─────────────────────────────────────────────────

export interface GlobalCounters {
  errors_seen: number;
  tests_failed: number;
  large_diffs: number;
  sessions: number;
  commands_run: number;
  days_active: number;
  turns: number;
  buddies_collected: number;
  renames: number;
  personalities_set: number;
  mutes: number;
  unmutes: number;
  summons: number;
  dismissals: number;
  shows: number;
  helps: number;
  achievement_views: number;
  saves: number;
  lists: number;
  achievements_unlocked: number;
}

// ─── Event counters (per-slot) ────────────────────────────────────────────────

export interface SlotCounters {
  pets: number;
  reactions_given: number;
}

// ─── Merged view for achievement checks ───────────────────────────────────────

export interface EventCounters extends GlobalCounters {
  pets: number;
  reactions_given: number;
}

export const GLOBAL_KEYS: (keyof GlobalCounters)[] = [
  "errors_seen", "tests_failed", "large_diffs",
  "sessions", "commands_run", "days_active", "turns",
  "buddies_collected", "renames", "personalities_set",
  "mutes", "unmutes", "summons", "dismissals",
  "shows", "helps", "achievement_views", "saves", "lists",
  "achievements_unlocked",
];

export const SLOT_KEYS: (keyof SlotCounters)[] = [
  "pets", "reactions_given",
];

export const COUNTER_KEYS: (keyof EventCounters)[] = [
  "errors_seen", "tests_failed", "large_diffs", "turns", "pets",
  "sessions", "reactions_given", "commands_run", "days_active",
  "buddies_collected", "renames", "personalities_set",
  "mutes", "unmutes", "summons", "dismissals",
  "shows", "helps", "achievement_views", "saves", "lists",
  "achievements_unlocked",
];

const EMPTY_GLOBAL: GlobalCounters = {
  errors_seen: 0, tests_failed: 0, large_diffs: 0,
  sessions: 0, commands_run: 0, days_active: 0, turns: 0,
  buddies_collected: 0, renames: 0, personalities_set: 0,
  mutes: 0, unmutes: 0, summons: 0, dismissals: 0,
  shows: 0, helps: 0, achievement_views: 0, saves: 0, lists: 0,
  achievements_unlocked: 0,
};

const EMPTY_SLOT: SlotCounters = {
  pets: 0, reactions_given: 0,
};

export function loadGlobalEvents(): GlobalCounters {
  try {
    const parsed = JSON.parse(readFileSync(EVENTS_FILE, "utf8"));
    return { ...EMPTY_GLOBAL, ...parsed };
  } catch {
    return { ...EMPTY_GLOBAL };
  }
}

export function saveGlobalEvents(events: GlobalCounters): void {
  atomicWrite(EVENTS_FILE, JSON.stringify(events, null, 2));
}

export function loadSlotEvents(slot: string): SlotCounters {
  try {
    const parsed = JSON.parse(readFileSync(slotEventsFile(slot), "utf8"));
    return { ...EMPTY_SLOT, ...parsed };
  } catch {
    return { ...EMPTY_SLOT };
  }
}

export function saveSlotEvents(slot: string, events: SlotCounters): void {
  atomicWrite(slotEventsFile(slot), JSON.stringify(events, null, 2));
}

export function loadEvents(slot?: string): EventCounters {
  const global = loadGlobalEvents();
  if (!slot) {
    return { ...global, pets: 0, reactions_given: 0 };
  }
  const slotEvents = loadSlotEvents(slot);
  return {
    ...global,
    pets: slotEvents.pets,
    reactions_given: slotEvents.reactions_given,
  };
}

export function incrementEvent(key: keyof EventCounters, amount: number = 1, slot?: string): EventCounters {
  if ((SLOT_KEYS as string[]).includes(key) && slot) {
    const slotEvents = loadSlotEvents(slot);
    (slotEvents as any)[key] += amount;
    saveSlotEvents(slot, slotEvents);
  } else {
    const global = loadGlobalEvents();
    if ((GLOBAL_KEYS as string[]).includes(key)) {
      (global as any)[key] += amount;
    }
    saveGlobalEvents(global);
  }
  return loadEvents(slot);
}

// ─── Backward-compatible overloads ────────────────────────────────────────────
// The shell hooks (react.sh) write directly to events.json for global counters
// like errors_seen and tests_failed. The loadEvents() and saveEvents() names
// below maintain that compatibility.

export { loadEvents as loadGlobalEventsCompat, loadGlobalEvents as loadGlobalEventsDirect };

// ─── Day tracking ────────────────────────────────────────────────────────────

interface DayTracker {
  lastDate: string;
  totalDays: number;
}

export function trackActiveDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  let tracker: DayTracker;
  try {
    tracker = JSON.parse(readFileSync(DAYS_FILE, "utf8"));
  } catch {
    tracker = { lastDate: "", totalDays: 0 };
  }
  if (tracker.lastDate === today) return;

  tracker.lastDate = today;
  tracker.totalDays += 1;
  atomicWrite(DAYS_FILE, JSON.stringify(tracker, null, 2));

  const events = loadGlobalEvents();
  events.days_active = tracker.totalDays;
  saveGlobalEvents(events);
}

// ─── Achievement definitions ─────────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (events: EventCounters) => boolean;
  secret: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_steps",
    name: "First Steps",
    description: "Hatch your buddy for the first time",
    icon: "\ud83c\udf1f",
    check: () => true,
    secret: false,
  },
  {
    id: "good_boy",
    name: "Good Buddy",
    description: "Pet your companion 10 times",
    icon: "\ud83e\uddf9",
    check: (e) => e.pets >= 10,
    secret: false,
  },
  {
    id: "best_friend",
    name: "Best Friend",
    description: "Pet your companion 50 times",
    icon: "\ud83d\udc95",
    check: (e) => e.pets >= 50,
    secret: false,
  },
  {
    id: "bug_spotter",
    name: "Bug Spotter",
    description: "Witness your first error together",
    icon: "\ud83d\udc1b",
    check: (e) => e.errors_seen >= 1,
    secret: false,
  },
  {
    id: "error_whisperer",
    name: "Error Whisperer",
    description: "Survive 25 errors as a team",
    icon: "\ud83d\udd27",
    check: (e) => e.errors_seen >= 25,
    secret: false,
  },
  {
    id: "battle_scarred",
    name: "Battle-Scarred",
    description: "Survive 100 errors together",
    icon: "\ud83d\udc80",
    check: (e) => e.errors_seen >= 100,
    secret: true,
  },
  {
    id: "test_witness",
    name: "Test Witness",
    description: "See your first test failure",
    icon: "\u274c",
    check: (e) => e.tests_failed >= 1,
    secret: false,
  },
  {
    id: "test_veteran",
    name: "Test Veteran",
    description: "Witness 50 test failures",
    icon: "\ud83d\udcca",
    check: (e) => e.tests_failed >= 50,
    secret: false,
  },
  {
    id: "big_mover",
    name: "Big Mover",
    description: "Make a diff with 80+ lines",
    icon: "\ud83d\udce6",
    check: (e) => e.large_diffs >= 1,
    secret: false,
  },
  {
    id: "refactor_machine",
    name: "Refactor Machine",
    description: "Make 10 large diffs",
    icon: "\ud83d\udd28",
    check: (e) => e.large_diffs >= 10,
    secret: false,
  },
  {
    id: "chatterbox",
    name: "Chatterbox",
    description: "Your buddy reacts 100 times",
    icon: "\ud83d\udcac",
    check: (e) => e.reactions_given >= 100,
    secret: false,
  },
  {
    id: "week_streak",
    name: "Week Streak",
    description: "Code with your buddy for 7 days",
    icon: "\ud83d\udd25",
    check: (e) => e.days_active >= 7,
    secret: false,
  },
  {
    id: "month_streak",
    name: "Month Streak",
    description: "Code with your buddy for 30 days",
    icon: "\ud83d\udc51",
    check: (e) => e.days_active >= 30,
    secret: true,
  },
  {
    id: "power_user",
    name: "Power User",
    description: "Run 50 buddy commands",
    icon: "\u26a1",
    check: (e) => e.commands_run >= 50,
    secret: false,
  },
  {
    id: "dedicated",
    name: "Dedicated Companion",
    description: "Complete 200 turns together",
    icon: "\ud83c\udfc5",
    check: (e) => e.turns >= 200,
    secret: false,
  },
  {
    id: "thousand_turns",
    name: "Thousand Turns",
    description: "Reach 1000 turns together",
    icon: "\ud83c\udf96",
    check: (e) => e.turns >= 1000,
    secret: true,
  },
  {
    id: "session_regular",
    name: "Regular",
    description: "Start 10 coding sessions",
    icon: "\ud83d\udd04",
    check: (e) => e.sessions >= 10,
    secret: false,
  },
  {
    id: "session_veteran",
    name: "Session Veteran",
    description: "Start 50 coding sessions",
    icon: "\ud83c\udfe2",
    check: (e) => e.sessions >= 50,
    secret: false,
  },
  {
    id: "session_centurion",
    name: "Centurion",
    description: "Start 100 coding sessions",
    icon: "\ud83d\udcaf",
    check: (e) => e.sessions >= 100,
    secret: false,
  },
  {
    id: "collector",
    name: "Collector",
    description: "Save 3 buddies to your menagerie",
    icon: "\ud83d\udcda",
    check: (e) => e.buddies_collected >= 3,
    secret: false,
  },
  {
    id: "zookeeper",
    name: "Zookeeper",
    description: "Save 5 buddies to your menagerie",
    icon: "\ud83d\udc12",
    check: (e) => e.buddies_collected >= 5,
    secret: false,
  },
  {
    id: "identity_crisis",
    name: "Identity Crisis",
    description: "Rename your buddy for the first time",
    icon: "\ud83c\udd94",
    check: (e) => e.renames >= 1,
    secret: false,
  },
  {
    id: "method_acting",
    name: "Method Acting",
    description: "Give your buddy a custom personality",
    icon: "\ud83c\udfad",
    check: (e) => e.personalities_set >= 1,
    secret: false,
  },
  {
    id: "pet_overflow",
    name: "Century of Pets",
    description: "Pet your companion 100 times",
    icon: "\ud83d\udc3e",
    check: (e) => e.pets >= 100,
    secret: false,
  },
  {
    id: "pet_legend",
    name: "Legendary Petter",
    description: "Pet your companion 250 times",
    icon: "\ud83e\udd1e",
    check: (e) => e.pets >= 250,
    secret: false,
  },
  {
    id: "error_titan",
    name: "Error Titan",
    description: "Survive 500 errors together",
    icon: "\ud83c\udf0b",
    check: (e) => e.errors_seen >= 500,
    secret: false,
  },
  {
    id: "error_god",
    name: "Error God",
    description: "Survive 1000 errors together",
    icon: "\ud83c\udf20",
    check: (e) => e.errors_seen >= 1000,
    secret: false,
  },
  {
    id: "test_survivor",
    name: "Test Survivor",
    description: "Witness 200 test failures",
    icon: "\ud83e\uddea",
    check: (e) => e.tests_failed >= 200,
    secret: false,
  },
  {
    id: "test_masochist",
    name: "Test Masochist",
    description: "Witness 500 test failures",
    icon: "\ud83d\udc80",
    check: (e) => e.tests_failed >= 500,
    secret: false,
  },
  {
    id: "massive_mover",
    name: "Massive Mover",
    description: "Make 25 large diffs",
    icon: "\ud83d\udea7",
    check: (e) => e.large_diffs >= 25,
    secret: false,
  },
  {
    id: "earth_mover",
    name: "Earth Mover",
    description: "Make 50 large diffs",
    icon: "\ud83c\udf0d",
    check: (e) => e.large_diffs >= 50,
    secret: false,
  },
  {
    id: "social_butterfly",
    name: "Social Butterfly",
    description: "Your buddy reacts 250 times",
    icon: "\ud83e\udd8b",
    check: (e) => e.reactions_given >= 250,
    secret: false,
  },
  {
    id: "hypersocial",
    name: "Hypersocial",
    description: "Your buddy reacts 500 times",
    icon: "\ud83d\udce3",
    check: (e) => e.reactions_given >= 500,
    secret: false,
  },
  {
    id: "never_shuts_up",
    name: "Never Shuts Up",
    description: "Your buddy reacts 1000 times",
    icon: "\ud83e\udd2b",
    check: (e) => e.reactions_given >= 1000,
    secret: false,
  },
  {
    id: "hundred_days",
    name: "Hundred Days",
    description: "Code with your buddy for 100 days",
    icon: "\ud83d\udcc5",
    check: (e) => e.days_active >= 100,
    secret: false,
  },
  {
    id: "year_streak",
    name: "Year Streak",
    description: "Code with your buddy for 365 days",
    icon: "\ud83d\udcc6",
    check: (e) => e.days_active >= 365,
    secret: false,
  },
  {
    id: "commander",
    name: "Commander",
    description: "Run 200 buddy commands",
    icon: "\ud83c\udf96",
    check: (e) => e.commands_run >= 200,
    secret: false,
  },
  {
    id: "command_overlord",
    name: "Command Overlord",
    description: "Run 500 buddy commands",
    icon: "\ud83c\udff9",
    check: (e) => e.commands_run >= 500,
    secret: false,
  },
  {
    id: "five_thousand_turns",
    name: "Five Thousand Turns",
    description: "Reach 5000 turns together",
    icon: "\ud83d\udd2e",
    check: (e) => e.turns >= 5000,
    secret: false,
  },
  {
    id: "ten_thousand_turns",
    name: "Ten Thousand Turns",
    description: "Reach 10000 turns together",
    icon: "\ud83c\udf00",
    check: (e) => e.turns >= 10000,
    secret: false,
  },
  {
    id: "menagerie",
    name: "Menagerie",
    description: "Save 10 buddies to your menagerie",
    icon: "\ud83c\udfaa",
    check: (e) => e.buddies_collected >= 10,
    secret: false,
  },
  {
    id: "name_chameleon",
    name: "Name Chameleon",
    description: "Rename your buddy 5 times",
    icon: "\ud83e\udd8e",
    check: (e) => e.renames >= 5,
    secret: false,
  },
  {
    id: "fashionista",
    name: "Fashionista",
    description: "Change your buddy's personality 3 times",
    icon: "\ud83d\udc85",
    check: (e) => e.personalities_set >= 3,
    secret: false,
  },
  {
    id: "silent_treatment",
    name: "Silent Treatment",
    description: "Mute your buddy for the first time",
    icon: "\ud83d\udd07",
    check: (e) => e.mutes >= 1,
    secret: false,
  },
  {
    id: "prodigal",
    name: "Prodigal",
    description: "Summon a buddy from your menagerie",
    icon: "\ud83d\udd19",
    check: (e) => e.summons >= 1,
    secret: false,
  },
  {
    id: "menagerie_hop",
    name: "Menagerie Hop",
    description: "Summon buddies 10 times",
    icon: "\ud83d\udd00",
    check: (e) => e.summons >= 10,
    secret: false,
  },
  {
    id: "heartbreaker",
    name: "Heartbreaker",
    description: "Dismiss your first buddy",
    icon: "\ud83d\udc94",
    check: (e) => e.dismissals >= 1,
    secret: false,
  },
  {
    id: "pet_obsessed",
    name: "Pet Obsessed",
    description: "Pet your companion 500 times",
    icon: "\ud83e\udd11",
    check: (e) => e.pets >= 500,
    secret: false,
  },
  {
    id: "pet_god",
    name: "Pet God",
    description: "Pet your companion 1000 times",
    icon: "\ud83d\udc51",
    check: (e) => e.pets >= 1000,
    secret: false,
  },
  {
    id: "error_apocalypse",
    name: "Error Apocalypse",
    description: "Survive 5000 errors together",
    icon: "\ud83c\udf0b",
    check: (e) => e.errors_seen >= 5000,
    secret: false,
  },
  {
    id: "test_immortal",
    name: "Test Immortal",
    description: "Witness 1000 test failures",
    icon: "\ud83e\uddd8",
    check: (e) => e.tests_failed >= 1000,
    secret: false,
  },
  {
    id: "continental_drift",
    name: "Continental Drift",
    description: "Make 100 large diffs",
    icon: "\ud83c\udf0f",
    check: (e) => e.large_diffs >= 100,
    secret: false,
  },
  {
    id: "tectonic_shift",
    name: "Tectonic Shift",
    description: "Make 250 large diffs",
    icon: "\ud83c\udf0b",
    check: (e) => e.large_diffs >= 250,
    secret: false,
  },
  {
    id: "chatterbox_elite",
    name: "Chatterbox Elite",
    description: "Your buddy reacts 2500 times",
    icon: "\ud83c\udf0a",
    check: (e) => e.reactions_given >= 2500,
    secret: false,
  },
  {
    id: "no_off_switch",
    name: "No Off Switch",
    description: "Your buddy reacts 5000 times",
    icon: "\ud83d\udd0a",
    check: (e) => e.reactions_given >= 5000,
    secret: false,
  },
  {
    id: "two_week_streak",
    name: "Two Week Warrior",
    description: "Code with your buddy for 14 days",
    icon: "\u270a",
    check: (e) => e.days_active >= 14,
    secret: false,
  },
  {
    id: "quarter_streak",
    name: "Quarter Streak",
    description: "Code with your buddy for 90 days",
    icon: "\ud83d\udcc8",
    check: (e) => e.days_active >= 90,
    secret: false,
  },
  {
    id: "command_addict",
    name: "Command Addict",
    description: "Run 1000 buddy commands",
    icon: "\ud83d\udcbb",
    check: (e) => e.commands_run >= 1000,
    secret: false,
  },
  {
    id: "command_deity",
    name: "Command Deity",
    description: "Run 2500 buddy commands",
    icon: "\ud83d\udd31",
    check: (e) => e.commands_run >= 2500,
    secret: false,
  },
  {
    id: "twenty_five_k_turns",
    name: "25K Turns",
    description: "Reach 25000 turns together",
    icon: "\ud83d\udcb0",
    check: (e) => e.turns >= 25000,
    secret: false,
  },
  {
    id: "fifty_k_turns",
    name: "50K Turns",
    description: "Reach 50000 turns together",
    icon: "\ud83d\udc8e",
    check: (e) => e.turns >= 50000,
    secret: false,
  },
  {
    id: "session_addict",
    name: "Session Addict",
    description: "Start 250 coding sessions",
    icon: "\ud83d\udcb8",
    check: (e) => e.sessions >= 250,
    secret: false,
  },
  {
    id: "session_machine",
    name: "Session Machine",
    description: "Start 500 coding sessions",
    icon: "\ud83e\udd16",
    check: (e) => e.sessions >= 500,
    secret: false,
  },
  {
    id: "buddy_hoarder",
    name: "Buddy Hoarder",
    description: "Save 20 buddies to your menagerie",
    icon: "\ud83c\udf81",
    check: (e) => e.buddies_collected >= 20,
    secret: false,
  },
  {
    id: "buddy_tycoon",
    name: "Buddy Tycoon",
    description: "Save 50 buddies to your menagerie",
    icon: "\ud83c\udfe6",
    check: (e) => e.buddies_collected >= 50,
    secret: false,
  },
  {
    id: "serial_renamer",
    name: "Serial Renamer",
    description: "Rename your buddy 10 times",
    icon: "\ud83d\udcdb",
    check: (e) => e.renames >= 10,
    secret: false,
  },
  {
    id: "identity_thief",
    name: "Identity Thief",
    description: "Rename your buddy 25 times",
    icon: "\ud83d\ude08",
    check: (e) => e.renames >= 25,
    secret: false,
  },
  {
    id: "personality_crisis",
    name: "Personality Crisis",
    description: "Change your buddy's personality 10 times",
    icon: "\ud83e\uddd8",
    check: (e) => e.personalities_set >= 10,
    secret: false,
  },
  {
    id: "menagerie_hopper",
    name: "Menagerie Hopper",
    description: "Summon buddies 25 times",
    icon: "\ud83c\udfb0",
    check: (e) => e.summons >= 25,
    secret: false,
  },
  {
    id: "summoner",
    name: "Summoner",
    description: "Summon buddies 50 times",
    icon: "\u2728",
    check: (e) => e.summons >= 50,
    secret: false,
  },
  {
    id: "serial_dumper",
    name: "Serial Dumper",
    description: "Dismiss 5 buddies",
    icon: "\ud83d\udca9",
    check: (e) => e.dismissals >= 5,
    secret: false,
  },
  {
    id: "cold_blooded",
    name: "Cold Blooded",
    description: "Dismiss 10 buddies",
    icon: "\ud83e\udd82",
    check: (e) => e.dismissals >= 10,
    secret: false,
  },
  {
    id: "on_off",
    name: "On Off",
    description: "Mute and unmute your buddy",
    icon: "\ud83d\udd1c",
    check: (e) => e.mutes >= 1 && e.unmutes >= 1,
    secret: false,
  },
  {
    id: "indecisive",
    name: "Indecisive",
    description: "Mute and unmute 5 times each",
    icon: "\ud83e\udee3",
    check: (e) => e.mutes >= 5 && e.unmutes >= 5,
    secret: false,
  },
  {
    id: "show_off",
    name: "Show Off",
    description: "Show your buddy 10 times",
    icon: "\ud83d\udc40",
    check: (e) => e.shows >= 10,
    secret: false,
  },
  {
    id: "exhibitionist",
    name: "Exhibitionist",
    description: "Show your buddy 50 times",
    icon: "\ud83c\udfa9",
    check: (e) => e.shows >= 50,
    secret: false,
  },
  {
    id: "help_me",
    name: "Help Me",
    description: "Ask for help for the first time",
    icon: "\u2753",
    check: (e) => e.helps >= 1,
    secret: false,
  },
  {
    id: "help_addict",
    name: "Help Addict",
    description: "Ask for help 10 times",
    icon: "\ud83d\udcd6",
    check: (e) => e.helps >= 10,
    secret: false,
  },
  {
    id: "achievement_hunter",
    name: "Achievement Hunter",
    description: "Check your achievements 5 times",
    icon: "\ud83d\udd0d",
    check: (e) => e.achievement_views >= 5,
    secret: false,
  },
  {
    id: "achievement_stalker",
    name: "Achievement Stalker",
    description: "Check your achievements 25 times",
    icon: "\ud83d\udd2d",
    check: (e) => e.achievement_views >= 25,
    secret: false,
  },
  {
    id: "pack_rat",
    name: "Pack Rat",
    description: "Save a buddy to a slot",
    icon: "\ud83d\udcbe",
    check: (e) => e.saves >= 1,
    secret: false,
  },
  {
    id: "compulsive_saver",
    name: "Compulsive Saver",
    description: "Save buddies 10 times",
    icon: "\ud83d\udd04",
    check: (e) => e.saves >= 10,
    secret: false,
  },
  {
    id: "roster_check",
    name: "Roster Check",
    description: "List your buddies for the first time",
    icon: "\ud83d\udccb",
    check: (e) => e.lists >= 1,
    secret: false,
  },
  {
    id: "roster_obsessed",
    name: "Roster Obsessed",
    description: "List your buddies 10 times",
    icon: "\ud83d\udcdd",
    check: (e) => e.lists >= 10,
    secret: false,
  },
  {
    id: "troubled",
    name: "Troubled",
    description: "See an error AND a test failure",
    icon: "\ud83d\ude2d",
    check: (e) => e.errors_seen >= 1 && e.tests_failed >= 1,
    secret: false,
  },
  {
    id: "disaster_zone",
    name: "Disaster Zone",
    description: "See 50 errors AND 50 test failures",
    icon: "\ud83c\udf0a",
    check: (e) => e.errors_seen >= 50 && e.tests_failed >= 50,
    secret: false,
  },
  {
    id: "apocalypse_survivor",
    name: "Apocalypse Survivor",
    description: "See 500 errors AND 200 test failures",
    icon: "\ud83d\udc7e",
    check: (e) => e.errors_seen >= 500 && e.tests_failed >= 200,
    secret: true,
  },
  {
    id: "well_rounded",
    name: "Well Rounded",
    description: "Pet, rename, and customize your buddy",
    icon: "\ud83c\udfaf",
    check: (e) => e.pets >= 1 && e.renames >= 1 && e.personalities_set >= 1,
    secret: false,
  },
  {
    id: "renaissance",
    name: "Renaissance",
    description: "Use every buddy feature at least once",
    icon: "\ud83c\udfa8",
    check: (e) =>
      e.pets >= 1 && e.renames >= 1 && e.personalities_set >= 1 &&
      e.mutes >= 1 && e.unmutes >= 1 && e.summons >= 1 &&
      e.saves >= 1 && e.lists >= 1 && e.helps >= 1 &&
      e.achievement_views >= 1,
    secret: true,
  },
  {
    id: "big_and_broken",
    name: "Big and Broken",
    description: "Make a large diff AND see a test failure",
    icon: "\ud83d\udca5",
    check: (e) => e.large_diffs >= 1 && e.tests_failed >= 1,
    secret: false,
  },
  {
    id: "collector_and_destroyer",
    name: "Collector & Destroyer",
    description: "Collect 5 buddies AND dismiss one",
    icon: "\ud83d\udea8",
    check: (e) => e.buddies_collected >= 5 && e.dismissals >= 1,
    secret: false,
  },
  {
    id: "completionist",
    name: "Completionist",
    description: "Unlock every other achievement",
    icon: "\ud83c\udf08",
    check: (e) => e.achievements_unlocked >= ACHIEVEMENTS.length - 1,
    secret: true,
  },
];

// ─── Unlocked badges persistence ─────────────────────────────────────────────

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  slot?: string;
}

export function loadUnlocked(): UnlockedAchievement[] {
  try {
    return JSON.parse(readFileSync(UNLOCKED_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function saveUnlocked(unlocked: UnlockedAchievement[]): void {
  atomicWrite(UNLOCKED_FILE, JSON.stringify(unlocked, null, 2));
}

// ─── Check + award ───────────────────────────────────────────────────────────

export function checkAndAward(slot?: string): Achievement[] {
  const e = loadEvents(slot);
  const unlocked = loadUnlocked();
  const unlockedIds = new Set(unlocked.map((u) => u.id));

  const newlyUnlocked: Achievement[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (unlockedIds.has(ach.id)) continue;
    if (ach.check(e)) {
      unlocked.push({ id: ach.id, unlockedAt: Date.now(), slot: slot ?? undefined });
      newlyUnlocked.push(ach);
    }
  }

  if (newlyUnlocked.length > 0) {
    saveUnlocked(unlocked);
  }

  const global = loadGlobalEvents();
  if (global.achievements_unlocked !== unlocked.length) {
    global.achievements_unlocked = unlocked.length;
    saveGlobalEvents(global);
  }

  return newlyUnlocked;
}

// ─── Render achievement card ─────────────────────────────────────────────────

const GOLD = "\x1b[38;2;255;193;7m";
const NC = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

export function renderAchievementsCard(): string {
  const unlocked = loadUnlocked();
  const unlockedIds = new Set(unlocked.map((u) => u.id));

  const W = 40;
  const hr = "\u2500".repeat(W - 2);
  const sep = `\u251c${"\u254c".repeat(W - 2)}\u2524`;
  const lines: string[] = [];

  const total = ACHIEVEMENTS.length;
  const earned = unlockedIds.size;

  lines.push(`${GOLD}\u256d${hr}\u256e${NC}`);

  const header = "\ud83c\udfc6 ACHIEVEMENTS";
  lines.push(`${GOLD}\u2502${NC}  ${BOLD}${header}${NC}${"".padEnd(W - header.length - 4)}${GOLD}\u2502${NC}`);

  const barFilled = total > 0 ? Math.round((earned / total) * 20) : 0;
  const bar = "\u2588".repeat(barFilled) + "\u2591".repeat(20 - barFilled);
  const barText = `${bar} ${earned}/${total}`;
  lines.push(`${GOLD}\u2502${NC}  ${barText}${"".padEnd(W - barText.length - 4)}${GOLD}\u2502${NC}`);

  lines.push(`${GOLD}${sep}${NC}`);

  for (const ach of ACHIEVEMENTS) {
    if (ach.secret && !unlockedIds.has(ach.id)) continue;

    const done = unlockedIds.has(ach.id);
    const status = done ? "\u2705" : "\u2610";
    const content = ` ${ach.icon}${status} ${ach.name}`;
    const descContent = `    ${ach.description}`;

    if (done) {
      lines.push(`${GOLD}\u2502${NC} ${BOLD}${content}${NC}${"".padEnd(W - content.length - 3)}${GOLD}\u2502${NC}`);
    } else {
      lines.push(`${GOLD}\u2502${NC} ${DIM}${content}${NC}${"".padEnd(W - content.length - 3)}${GOLD}\u2502${NC}`);
    }
    lines.push(`${GOLD}\u2502${NC} ${DIM}${descContent}${NC}${"".padEnd(W - descContent.length - 3)}${GOLD}\u2502${NC}`);
  }

  if (earned > 0 && earned === ACHIEVEMENTS.length) {
    lines.push(`${GOLD}${sep}${NC}`);
    const complete = "\u2728 ALL ACHIEVEMENTS UNLOCKED! \u2728";
    lines.push(`${GOLD}\u2502${NC}  ${BOLD}${complete}${NC}${"".padEnd(W - complete.length - 4)}${GOLD}\u2502${NC}`);
  }

  lines.push(`${GOLD}\u2570${hr}\u256f${NC}`);

  return lines.join("\n");
}

export function renderAchievementsCardMarkdown(): string {
  const unlocked = loadUnlocked();
  const unlockedIds = new Set(unlocked.map((u) => u.id));
  const total = ACHIEVEMENTS.length;
  const earned = unlockedIds.size;

  const barFilled = total > 0 ? Math.round((earned / total) * 20) : 0;
  const bar = "\u2588".repeat(barFilled) + "\u2591".repeat(20 - barFilled);

  const parts: string[] = [];
  parts.push(`### \ud83c\udfc6 Achievements \u2014 ${earned}/${total}`);
  parts.push("");
  parts.push(`\`${bar}\``);
  parts.push("");

  for (const ach of ACHIEVEMENTS) {
    if (ach.secret && !unlockedIds.has(ach.id)) continue;
    const done = unlockedIds.has(ach.id);
    const status = done ? "\u2705" : "\u2610";
    const line = `${ach.icon}${status} **${ach.name}** \u2014 ${ach.description}`;
    parts.push(line);
  }

  if (earned > 0 && earned === ACHIEVEMENTS.length) {
    parts.push("");
    parts.push("\u2728 **ALL ACHIEVEMENTS UNLOCKED!** \u2728");
  }

  return parts.join("\n");
}
