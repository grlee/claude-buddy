/**
 * Unit tests for achievements.ts
 *
 * Tests the achievement badge system: definitions, event counters,
 * threshold checks, per-slot scoping, and the pure check logic.
 * File I/O functions (checkAndAward, renderers) persist to disk and
 * are not tested here, consistent with the project policy in TESTING.md.
 */

import { describe, test, expect } from "bun:test";
import {
  ACHIEVEMENTS,
  COUNTER_KEYS,
  GLOBAL_KEYS,
  SLOT_KEYS,
  type EventCounters,
  type GlobalCounters,
  type SlotCounters,
} from "./achievements.ts";

const EMPTY_EVENTS: EventCounters = {
  errors_seen: 0,
  tests_failed: 0,
  large_diffs: 0,
  turns: 0,
  pets: 0,
  sessions: 0,
  reactions_given: 0,
  commands_run: 0,
  days_active: 0,
  buddies_collected: 0,
  renames: 0,
  personalities_set: 0,
  mutes: 0,
  unmutes: 0,
  summons: 0,
  dismissals: 0,
  shows: 0,
  helps: 0,
  achievement_views: 0,
  saves: 0,
  lists: 0,
  achievements_unlocked: 0,
};

function makeEvents(overrides: Partial<EventCounters> = {}): EventCounters {
  return { ...EMPTY_EVENTS, ...overrides };
}

// ─── Achievement definitions ─────────────────────────────────────────────

describe("ACHIEVEMENTS array", () => {
  test("is non-empty", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });

  test("every achievement has a unique id", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every achievement has required fields", () => {
    for (const ach of ACHIEVEMENTS) {
      expect(typeof ach.id).toBe("string");
      expect(ach.id.length).toBeGreaterThan(0);
      expect(typeof ach.name).toBe("string");
      expect(ach.name.length).toBeGreaterThan(0);
      expect(typeof ach.description).toBe("string");
      expect(ach.description.length).toBeGreaterThan(0);
      expect(typeof ach.icon).toBe("string");
      expect(typeof ach.secret).toBe("boolean");
      expect(typeof ach.check).toBe("function");
    }
  });

  test("check function accepts EventCounters and returns boolean", () => {
    for (const ach of ACHIEVEMENTS) {
      const result = ach.check(EMPTY_EVENTS);
      expect(typeof result).toBe("boolean");
    }
  });
});

// ─── Counter key partitions ──────────────────────────────────────────────

describe("counter key partitions", () => {
  test("GLOBAL_KEYS and SLOT_KEYS are disjoint", () => {
    const globalSet = new Set(GLOBAL_KEYS as string[]);
    const slotSet = new Set(SLOT_KEYS as string[]);
    for (const k of globalSet) {
      expect(slotSet.has(k)).toBe(false);
    }
  });

  test("COUNTER_KEYS is the union of GLOBAL_KEYS and SLOT_KEYS", () => {
    const counterSet = new Set(COUNTER_KEYS as string[]);
    for (const k of GLOBAL_KEYS) expect(counterSet.has(k)).toBe(true);
    for (const k of SLOT_KEYS) expect(counterSet.has(k)).toBe(true);
    expect(COUNTER_KEYS.length).toBe(GLOBAL_KEYS.length + SLOT_KEYS.length);
  });
});

// ─── COUNTER_KEYS ─────────────────────────────────────────────────────────

describe("COUNTER_KEYS", () => {
  test("matches every key in EventCounters", () => {
    const expectedKeys = Object.keys(EMPTY_EVENTS).sort() as (keyof EventCounters)[];
    const actualKeys = [...COUNTER_KEYS].sort() as (keyof EventCounters)[];
    expect(actualKeys).toEqual(expectedKeys);
  });
});

// ─── Achievement check thresholds ────────────────────────────────────────

describe("achievement thresholds", () => {
  test("first_steps always unlocks", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "first_steps")!;
    expect(ach).toBeDefined();
    expect(ach.check(EMPTY_EVENTS)).toBe(true);
  });

  test("good_boy requires 10 pets", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "good_boy")!;
    expect(ach.check(makeEvents({ pets: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 10 }))).toBe(true);
    expect(ach.check(makeEvents({ pets: 50 }))).toBe(true);
  });

  test("best_friend requires 50 pets", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "best_friend")!;
    expect(ach.check(makeEvents({ pets: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 50 }))).toBe(true);
  });

  test("bug_spotter requires 1 error", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "bug_spotter")!;
    expect(ach.check(makeEvents({ errors_seen: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 1 }))).toBe(true);
  });

  test("error_whisperer requires 25 errors", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "error_whisperer")!;
    expect(ach.check(makeEvents({ errors_seen: 24 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 25 }))).toBe(true);
  });

  test("battle_scarred requires 100 errors and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "battle_scarred")!;
    expect(ach.secret).toBe(true);
    expect(ach.check(makeEvents({ errors_seen: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 100 }))).toBe(true);
  });

  test("test_witness requires 1 test failure", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "test_witness")!;
    expect(ach.check(makeEvents({ tests_failed: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 1 }))).toBe(true);
  });

  test("test_veteran requires 50 test failures", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "test_veteran")!;
    expect(ach.check(makeEvents({ tests_failed: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 50 }))).toBe(true);
  });

  test("big_mover requires 1 large diff", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "big_mover")!;
    expect(ach.check(makeEvents({ large_diffs: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 1 }))).toBe(true);
  });

  test("refactor_machine requires 10 large diffs", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "refactor_machine")!;
    expect(ach.check(makeEvents({ large_diffs: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 10 }))).toBe(true);
  });

  test("chatterbox requires 100 reactions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "chatterbox")!;
    expect(ach.check(makeEvents({ reactions_given: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 100 }))).toBe(true);
  });

  test("week_streak requires 7 days and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "week_streak")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ days_active: 6 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 7 }))).toBe(true);
  });

  test("month_streak requires 30 days and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "month_streak")!;
    expect(ach.secret).toBe(true);
    expect(ach.check(makeEvents({ days_active: 29 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 30 }))).toBe(true);
  });

  test("power_user requires 50 commands", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "power_user")!;
    expect(ach.check(makeEvents({ commands_run: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 50 }))).toBe(true);
  });

  test("dedicated requires 200 turns", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "dedicated")!;
    expect(ach.check(makeEvents({ turns: 199 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 200 }))).toBe(true);
  });

  test("thousand_turns requires 1000 turns and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "thousand_turns")!;
    expect(ach.secret).toBe(true);
    expect(ach.check(makeEvents({ turns: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 1000 }))).toBe(true);
  });

  test("session_regular requires 10 sessions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "session_regular")!;
    expect(ach.check(makeEvents({ sessions: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ sessions: 10 }))).toBe(true);
  });

  test("session_veteran requires 50 sessions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "session_veteran")!;
    expect(ach.check(makeEvents({ sessions: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ sessions: 50 }))).toBe(true);
  });

  test("session_centurion requires 100 sessions and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "session_centurion")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ sessions: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ sessions: 100 }))).toBe(true);
  });

  test("collector requires 3 buddies collected", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "collector")!;
    expect(ach.check(makeEvents({ buddies_collected: 2 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 3 }))).toBe(true);
  });

  test("zookeeper requires 5 buddies collected", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "zookeeper")!;
    expect(ach.check(makeEvents({ buddies_collected: 4 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 5 }))).toBe(true);
  });

  test("identity_crisis requires 1 rename", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "identity_crisis")!;
    expect(ach.check(makeEvents({ renames: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ renames: 1 }))).toBe(true);
  });

  test("method_acting requires 1 personality set", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "method_acting")!;
    expect(ach.check(makeEvents({ personalities_set: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ personalities_set: 1 }))).toBe(true);
  });

  test("pet_overflow requires 100 pets", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "pet_overflow")!;
    expect(ach.check(makeEvents({ pets: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 100 }))).toBe(true);
  });

  test("pet_legend requires 250 pets and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "pet_legend")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ pets: 249 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 250 }))).toBe(true);
  });

  test("error_titan requires 500 errors", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "error_titan")!;
    expect(ach.check(makeEvents({ errors_seen: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 500 }))).toBe(true);
  });

  test("error_god requires 1000 errors and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "error_god")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 1000 }))).toBe(true);
  });

  test("test_survivor requires 200 test failures", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "test_survivor")!;
    expect(ach.check(makeEvents({ tests_failed: 199 }))).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 200 }))).toBe(true);
  });

  test("test_masochist requires 500 test failures and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "test_masochist")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 500 }))).toBe(true);
  });

  test("massive_mover requires 25 large diffs", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "massive_mover")!;
    expect(ach.check(makeEvents({ large_diffs: 24 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 25 }))).toBe(true);
  });

  test("earth_mover requires 50 large diffs", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "earth_mover")!;
    expect(ach.check(makeEvents({ large_diffs: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 50 }))).toBe(true);
  });

  test("social_butterfly requires 250 reactions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "social_butterfly")!;
    expect(ach.check(makeEvents({ reactions_given: 249 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 250 }))).toBe(true);
  });

  test("hypersocial requires 500 reactions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "hypersocial")!;
    expect(ach.check(makeEvents({ reactions_given: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 500 }))).toBe(true);
  });

  test("never_shuts_up requires 1000 reactions and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "never_shuts_up")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 1000 }))).toBe(true);
  });

  test("hundred_days requires 100 days", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "hundred_days")!;
    expect(ach.check(makeEvents({ days_active: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 100 }))).toBe(true);
  });

  test("year_streak requires 365 days and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "year_streak")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ days_active: 364 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 365 }))).toBe(true);
  });

  test("commander requires 200 commands", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "commander")!;
    expect(ach.check(makeEvents({ commands_run: 199 }))).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 200 }))).toBe(true);
  });

  test("command_overlord requires 500 commands and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "command_overlord")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 500 }))).toBe(true);
  });

  test("five_thousand_turns requires 5000 turns", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "five_thousand_turns")!;
    expect(ach.check(makeEvents({ turns: 4999 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 5000 }))).toBe(true);
  });

  test("ten_thousand_turns requires 10000 turns and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "ten_thousand_turns")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ turns: 9999 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 10000 }))).toBe(true);
  });

  test("menagerie requires 10 buddies collected", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "menagerie")!;
    expect(ach.check(makeEvents({ buddies_collected: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 10 }))).toBe(true);
  });

  test("name_chameleon requires 5 renames", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "name_chameleon")!;
    expect(ach.check(makeEvents({ renames: 4 }))).toBe(false);
    expect(ach.check(makeEvents({ renames: 5 }))).toBe(true);
  });

  test("fashionista requires 3 personalities set", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "fashionista")!;
    expect(ach.check(makeEvents({ personalities_set: 2 }))).toBe(false);
    expect(ach.check(makeEvents({ personalities_set: 3 }))).toBe(true);
  });

  test("silent_treatment requires 1 mute", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "silent_treatment")!;
    expect(ach.check(makeEvents({ mutes: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ mutes: 1 }))).toBe(true);
  });

  test("prodigal requires 1 summon", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "prodigal")!;
    expect(ach.check(makeEvents({ summons: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ summons: 1 }))).toBe(true);
  });

  test("menagerie_hop requires 10 summons", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "menagerie_hop")!;
    expect(ach.check(makeEvents({ summons: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ summons: 10 }))).toBe(true);
  });

  test("heartbreaker requires 1 dismissal", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "heartbreaker")!;
    expect(ach.check(makeEvents({ dismissals: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ dismissals: 1 }))).toBe(true);
  });

  test("pet_obsessed requires 500 pets", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "pet_obsessed")!;
    expect(ach.check(makeEvents({ pets: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 500 }))).toBe(true);
  });

  test("pet_god requires 1000 pets and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "pet_god")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ pets: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 1000 }))).toBe(true);
  });

  test("error_apocalypse requires 5000 errors and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "error_apocalypse")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 4999 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 5000 }))).toBe(true);
  });

  test("test_immortal requires 1000 test failures and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "test_immortal")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ tests_failed: 1000 }))).toBe(true);
  });

  test("continental_drift requires 100 large diffs", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "continental_drift")!;
    expect(ach.check(makeEvents({ large_diffs: 99 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 100 }))).toBe(true);
  });

  test("tectonic_shift requires 250 large diffs and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "tectonic_shift")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 249 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 250 }))).toBe(true);
  });

  test("chatterbox_elite requires 2500 reactions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "chatterbox_elite")!;
    expect(ach.check(makeEvents({ reactions_given: 2499 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 2500 }))).toBe(true);
  });

  test("no_off_switch requires 5000 reactions and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "no_off_switch")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 4999 }))).toBe(false);
    expect(ach.check(makeEvents({ reactions_given: 5000 }))).toBe(true);
  });

  test("two_week_streak requires 14 days", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "two_week_streak")!;
    expect(ach.check(makeEvents({ days_active: 13 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 14 }))).toBe(true);
  });

  test("quarter_streak requires 90 days", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "quarter_streak")!;
    expect(ach.check(makeEvents({ days_active: 89 }))).toBe(false);
    expect(ach.check(makeEvents({ days_active: 90 }))).toBe(true);
  });

  test("command_addict requires 1000 commands", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "command_addict")!;
    expect(ach.check(makeEvents({ commands_run: 999 }))).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 1000 }))).toBe(true);
  });

  test("command_deity requires 2500 commands and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "command_deity")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 2499 }))).toBe(false);
    expect(ach.check(makeEvents({ commands_run: 2500 }))).toBe(true);
  });

  test("twenty_five_k_turns requires 25000 turns", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "twenty_five_k_turns")!;
    expect(ach.check(makeEvents({ turns: 24999 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 25000 }))).toBe(true);
  });

  test("fifty_k_turns requires 50000 turns and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "fifty_k_turns")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ turns: 49999 }))).toBe(false);
    expect(ach.check(makeEvents({ turns: 50000 }))).toBe(true);
  });

  test("session_addict requires 250 sessions", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "session_addict")!;
    expect(ach.check(makeEvents({ sessions: 249 }))).toBe(false);
    expect(ach.check(makeEvents({ sessions: 250 }))).toBe(true);
  });

  test("session_machine requires 500 sessions and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "session_machine")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ sessions: 499 }))).toBe(false);
    expect(ach.check(makeEvents({ sessions: 500 }))).toBe(true);
  });

  test("buddy_hoarder requires 20 buddies collected", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "buddy_hoarder")!;
    expect(ach.check(makeEvents({ buddies_collected: 19 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 20 }))).toBe(true);
  });

  test("buddy_tycoon requires 50 buddies and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "buddy_tycoon")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 50 }))).toBe(true);
  });

  test("serial_renamer requires 10 renames", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "serial_renamer")!;
    expect(ach.check(makeEvents({ renames: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ renames: 10 }))).toBe(true);
  });

  test("identity_thief requires 25 renames and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "identity_thief")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ renames: 24 }))).toBe(false);
    expect(ach.check(makeEvents({ renames: 25 }))).toBe(true);
  });

  test("personality_crisis requires 10 personalities set", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "personality_crisis")!;
    expect(ach.check(makeEvents({ personalities_set: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ personalities_set: 10 }))).toBe(true);
  });

  test("menagerie_hopper requires 25 summons", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "menagerie_hopper")!;
    expect(ach.check(makeEvents({ summons: 24 }))).toBe(false);
    expect(ach.check(makeEvents({ summons: 25 }))).toBe(true);
  });

  test("summoner requires 50 summons and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "summoner")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ summons: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ summons: 50 }))).toBe(true);
  });

  test("serial_dumper requires 5 dismissals", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "serial_dumper")!;
    expect(ach.check(makeEvents({ dismissals: 4 }))).toBe(false);
    expect(ach.check(makeEvents({ dismissals: 5 }))).toBe(true);
  });

  test("cold_blooded requires 10 dismissals and is not secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "cold_blooded")!;
    expect(ach.secret).toBe(false);
    expect(ach.check(makeEvents({ dismissals: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ dismissals: 10 }))).toBe(true);
  });

  test("on_off requires mute and unmute", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "on_off")!;
    expect(ach.check(makeEvents({ mutes: 1, unmutes: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ mutes: 0, unmutes: 1 }))).toBe(false);
    expect(ach.check(makeEvents({ mutes: 1, unmutes: 1 }))).toBe(true);
  });

  test("indecisive requires 5 mutes and 5 unmutes", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "indecisive")!;
    expect(ach.check(makeEvents({ mutes: 5, unmutes: 4 }))).toBe(false);
    expect(ach.check(makeEvents({ mutes: 4, unmutes: 5 }))).toBe(false);
    expect(ach.check(makeEvents({ mutes: 5, unmutes: 5 }))).toBe(true);
  });

  test("show_off requires 10 shows", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "show_off")!;
    expect(ach.check(makeEvents({ shows: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ shows: 10 }))).toBe(true);
  });

  test("exhibitionist requires 50 shows", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "exhibitionist")!;
    expect(ach.check(makeEvents({ shows: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ shows: 50 }))).toBe(true);
  });

  test("help_me requires 1 help", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "help_me")!;
    expect(ach.check(makeEvents({ helps: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ helps: 1 }))).toBe(true);
  });

  test("help_addict requires 10 helps", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "help_addict")!;
    expect(ach.check(makeEvents({ helps: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ helps: 10 }))).toBe(true);
  });

  test("achievement_hunter requires 5 achievement views", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "achievement_hunter")!;
    expect(ach.check(makeEvents({ achievement_views: 4 }))).toBe(false);
    expect(ach.check(makeEvents({ achievement_views: 5 }))).toBe(true);
  });

  test("achievement_stalker requires 25 achievement views", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "achievement_stalker")!;
    expect(ach.check(makeEvents({ achievement_views: 24 }))).toBe(false);
    expect(ach.check(makeEvents({ achievement_views: 25 }))).toBe(true);
  });

  test("pack_rat requires 1 save", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "pack_rat")!;
    expect(ach.check(makeEvents({ saves: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ saves: 1 }))).toBe(true);
  });

  test("compulsive_saver requires 10 saves", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "compulsive_saver")!;
    expect(ach.check(makeEvents({ saves: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ saves: 10 }))).toBe(true);
  });

  test("roster_check requires 1 list", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "roster_check")!;
    expect(ach.check(makeEvents({ lists: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ lists: 1 }))).toBe(true);
  });

  test("roster_obsessed requires 10 lists", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "roster_obsessed")!;
    expect(ach.check(makeEvents({ lists: 9 }))).toBe(false);
    expect(ach.check(makeEvents({ lists: 10 }))).toBe(true);
  });

  test("troubled requires 1 error AND 1 test failure", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "troubled")!;
    expect(ach.check(makeEvents({ errors_seen: 1, tests_failed: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 0, tests_failed: 1 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 1, tests_failed: 1 }))).toBe(true);
  });

  test("disaster_zone requires 50 errors AND 50 test failures", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "disaster_zone")!;
    expect(ach.check(makeEvents({ errors_seen: 50, tests_failed: 49 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 50, tests_failed: 50 }))).toBe(true);
  });

  test("apocalypse_survivor requires 500 errors AND 200 test failures and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "apocalypse_survivor")!;
    expect(ach.secret).toBe(true);
    expect(ach.check(makeEvents({ errors_seen: 500, tests_failed: 199 }))).toBe(false);
    expect(ach.check(makeEvents({ errors_seen: 500, tests_failed: 200 }))).toBe(true);
  });

  test("well_rounded requires pet, rename, and personality", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "well_rounded")!;
    expect(ach.check(makeEvents({ pets: 1, renames: 0, personalities_set: 1 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 1, renames: 1, personalities_set: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ pets: 1, renames: 1, personalities_set: 1 }))).toBe(true);
  });

  test("renaissance requires every feature used once and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "renaissance")!;
    expect(ach.secret).toBe(true);
    const partial = makeEvents({ pets: 1, renames: 1, personalities_set: 1, mutes: 1, unmutes: 1, summons: 1, saves: 1, lists: 1, helps: 1, achievement_views: 0 });
    expect(ach.check(partial)).toBe(false);
    const full = makeEvents({ pets: 1, renames: 1, personalities_set: 1, mutes: 1, unmutes: 1, summons: 1, saves: 1, lists: 1, helps: 1, achievement_views: 1 });
    expect(ach.check(full)).toBe(true);
  });

  test("big_and_broken requires 1 large diff AND 1 test failure", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "big_and_broken")!;
    expect(ach.check(makeEvents({ large_diffs: 1, tests_failed: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ large_diffs: 1, tests_failed: 1 }))).toBe(true);
  });

  test("collector_and_destroyer requires 5 collected AND 1 dismissed", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "collector_and_destroyer")!;
    expect(ach.check(makeEvents({ buddies_collected: 5, dismissals: 0 }))).toBe(false);
    expect(ach.check(makeEvents({ buddies_collected: 5, dismissals: 1 }))).toBe(true);
  });

  test("completionist requires all other achievements unlocked and is secret", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "completionist")!;
    expect(ach.secret).toBe(true);
    const totalOthers = ACHIEVEMENTS.length - 1;
    expect(ach.check(makeEvents({ achievements_unlocked: totalOthers - 1 }))).toBe(false);
    expect(ach.check(makeEvents({ achievements_unlocked: totalOthers }))).toBe(true);
  });
});

// ─── Unlock simulation (pure logic) ──────────────────────────────────────

describe("unlock simulation via check functions", () => {
  test("with empty events, only first_steps would unlock", () => {
    const wouldUnlock = ACHIEVEMENTS.filter((a) => a.check(EMPTY_EVENTS));
    expect(wouldUnlock.length).toBe(1);
    expect(wouldUnlock[0].id).toBe("first_steps");
  });

  test("with maxed events, all non-completionist achievements unlock", () => {
    const totalOthers = ACHIEVEMENTS.length - 1;
    const maxed = makeEvents({
      errors_seen: 99999,
      tests_failed: 99999,
      large_diffs: 99999,
      turns: 999999,
      pets: 99999,
      sessions: 99999,
      reactions_given: 99999,
      commands_run: 99999,
      days_active: 99999,
      buddies_collected: 99999,
      renames: 99999,
      personalities_set: 99999,
      mutes: 99999,
      unmutes: 99999,
      summons: 99999,
      dismissals: 99999,
      shows: 99999,
      helps: 99999,
      achievement_views: 99999,
      saves: 99999,
      lists: 99999,
      achievements_unlocked: totalOthers,
    });
    const wouldUnlock = ACHIEVEMENTS.filter((a) => a.check(maxed));
    expect(wouldUnlock.length).toBe(ACHIEVEMENTS.length);
  });

  test("progressive: more events satisfy more check functions", () => {
    const s1 = ACHIEVEMENTS.filter((a) => a.check(makeEvents())).length;
    const s2 = ACHIEVEMENTS.filter((a) => a.check(makeEvents({ pets: 10 }))).length;
    const s3 = ACHIEVEMENTS.filter((a) => a.check(makeEvents({ pets: 10, errors_seen: 25 }))).length;
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  test("achievements at exact threshold boundary", () => {
    const events = makeEvents({ pets: 10 });
    const ids = ACHIEVEMENTS.filter((a) => a.check(events)).map((a) => a.id);
    expect(ids).toContain("good_boy");
    expect(ids).toContain("first_steps");
    expect(ids).not.toContain("best_friend");
  });
});

// ─── Per-slot vs global scoping ───────────────────────────────────────────

describe("per-slot vs global counter scoping", () => {
  test("pets is a slot-scoped key", () => {
    expect((SLOT_KEYS as string[]).includes("pets")).toBe(true);
    expect((GLOBAL_KEYS as string[]).includes("pets")).toBe(false);
  });

  test("turns is a global key", () => {
    expect((GLOBAL_KEYS as string[]).includes("turns")).toBe(true);
    expect((SLOT_KEYS as string[]).includes("turns")).toBe(false);
  });

  test("reactions_given is a slot-scoped key", () => {
    expect((SLOT_KEYS as string[]).includes("reactions_given")).toBe(true);
  });

  test("errors_seen is a global key", () => {
    expect((GLOBAL_KEYS as string[]).includes("errors_seen")).toBe(true);
    expect((SLOT_KEYS as string[]).includes("errors_seen")).toBe(false);
  });

  test("tests_failed is a global key", () => {
    expect((GLOBAL_KEYS as string[]).includes("tests_failed")).toBe(true);
  });

  test("days_active is a global key", () => {
    expect((GLOBAL_KEYS as string[]).includes("days_active")).toBe(true);
  });

  test("commands_run is a global key", () => {
    expect((GLOBAL_KEYS as string[]).includes("commands_run")).toBe(true);
  });

  test("good_boy and best_friend check pets (slot-scoped)", () => {
    const good = ACHIEVEMENTS.find((a) => a.id === "good_boy")!;
    const best = ACHIEVEMENTS.find((a) => a.id === "best_friend")!;
    expect(good.check(makeEvents({ pets: 0 }))).toBe(false);
    expect(best.check(makeEvents({ pets: 0 }))).toBe(false);
    expect(good.check(makeEvents({ pets: 10 }))).toBe(true);
    expect(best.check(makeEvents({ pets: 50 }))).toBe(true);
  });

  test("dedicated and thousand_turns check turns (global)", () => {
    const ded = ACHIEVEMENTS.find((a) => a.id === "dedicated")!;
    const thou = ACHIEVEMENTS.find((a) => a.id === "thousand_turns")!;
    expect(ded.check(makeEvents({ turns: 200 }))).toBe(true);
    expect(thou.check(makeEvents({ turns: 1000 }))).toBe(true);
  });

  test("chatterbox checks reactions_given (slot-scoped)", () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === "chatterbox")!;
    expect(ach.check(makeEvents({ reactions_given: 100 }))).toBe(true);
  });
});

// ─── Secret achievement visibility ───────────────────────────────────────

describe("secret achievements", () => {
  test("secret achievements are correctly flagged", () => {
    const secretIds = ACHIEVEMENTS.filter((a) => a.secret).map((a) => a.id);
    expect(secretIds).toContain("battle_scarred");
    expect(secretIds).toContain("month_streak");
    expect(secretIds).toContain("thousand_turns");
    expect(secretIds).toContain("apocalypse_survivor");
    expect(secretIds).toContain("renaissance");
    expect(secretIds).toContain("completionist");
  });

  test("non-secret achievements are the majority", () => {
    const nonSecret = ACHIEVEMENTS.filter((a) => !a.secret);
    expect(nonSecret.length).toBeGreaterThan(0);
    const secret = ACHIEVEMENTS.filter((a) => a.secret);
    expect(nonSecret.length).toBeGreaterThan(secret.length);
  });
});

// ─── EventCounters shape ─────────────────────────────────────────────────

describe("EventCounters", () => {
  test("EMPTY_EVENTS has all counter keys set to 0", () => {
    for (const key of COUNTER_KEYS) {
      expect(EMPTY_EVENTS[key]).toBe(0);
    }
  });

  test("all counter keys are numeric fields", () => {
    for (const key of COUNTER_KEYS) {
      expect(typeof EMPTY_EVENTS[key]).toBe("number");
    }
  });
});
