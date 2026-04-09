/**
 * claude-buddy engine — deterministic companion generation
 * Matches Claude Code's exact algorithm: wyhash → mulberry32 → species/stats
 */

export const SALT = "friend-2026-401";

export const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
] as const;

export type Species = typeof SPECIES[number];

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = typeof RARITIES[number];

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1,
};

export const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const;
export type StatName = typeof STAT_NAMES[number];

export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50,
};

export const RARITY_STARS: Record<Rarity, string> = {
  common: "\u2605", uncommon: "\u2605\u2605", rare: "\u2605\u2605\u2605",
  epic: "\u2605\u2605\u2605\u2605", legendary: "\u2605\u2605\u2605\u2605\u2605",
};

export const EYES = ["\u00b7", "\u2726", "\u00d7", "\u25c9", "@", "\u00b0"] as const;
export type Eye = typeof EYES[number];

export const HATS = [
  "none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck",
] as const;
export type Hat = typeof HATS[number];

export const HAT_ART: Record<Hat, string> = {
  none:      "",
  crown:     "  \\^^^/  ",
  tophat:    "  [___]  ",
  propeller: "   -+-   ",
  halo:      "  (   )  ",
  wizard:    "   /^\\   ",
  beanie:    "  (___)  ",
  tinyduck:  "   ,>    ",
};

export interface BuddyStats {
  DEBUGGING: number;
  PATIENCE: number;
  CHAOS: number;
  WISDOM: number;
  SNARK: number;
}

export interface BuddyBones {
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: BuddyStats;
  peak: StatName;
  dump: StatName;
}

export interface Companion {
  bones: BuddyBones;
  name: string;
  personality: string;
  hatchedAt: number;
  userId: string;
}

// ─── Hash: wyhash via Bun.hash, FNV-1a fallback ─────────────────────────────

export function hashString(s: string): number {
  if (typeof Bun !== "undefined") {
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn);
  }
  // FNV-1a fallback for Node.js
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── PRNG: Mulberry32 ───────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Generation ─────────────────────────────────────────────────────────────

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r];
    if (roll < 0) return r;
  }
  return "common";
}

export function generateBones(userId: string, salt: string = SALT): BuddyBones {
  const rng = mulberry32(hashString(userId + salt));

  const rarity = rollRarity(rng);
  const species = pick(rng, SPECIES);
  const eye = pick(rng, EYES);
  const hat = rarity === "common" ? "none" : pick(rng, HATS);
  const shiny = rng() < 0.01;

  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);

  const floor = RARITY_FLOOR[rarity];
  const stats = {} as BuddyStats;
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }

  return { rarity, species, eye, hat, shiny, stats, peak, dump };
}

// ─── ASCII Art ──────────────────────────────────────────────────────────────

const FACE_TEMPLATES: Record<Species, string> = {
  duck:     "({E}>",
  goose:    "({E}>",
  blob:     "({E}{E})",
  cat:      "={E}\u03c9{E}=",
  dragon:   "<{E}~{E}>",
  octopus:  "~({E}{E})~",
  owl:      "({E})({E})",
  penguin:  "({E}>)",
  turtle:   "[{E}_{E}]",
  snail:    "{E}(@)",
  ghost:    "/{E}{E}\\",
  axolotl:  "}{E}.{E}{",
  capybara: "({E}oo{E})",
  cactus:   "|{E}  {E}|",
  robot:    "[{E}{E}]",
  rabbit:   "({E}..{E})",
  mushroom: "|{E}  {E}|",
  chonk:    "({E}.{E})",
};

export function renderFace(species: Species, eye: Eye): string {
  return FACE_TEMPLATES[species].replace(/\{E\}/g, eye);
}

export function renderBuddy(bones: BuddyBones): string {
  const face = renderFace(bones.species, bones.eye);
  const hat = HAT_ART[bones.hat];
  const shiny = bones.shiny ? "\u2728 " : "";
  const stars = RARITY_STARS[bones.rarity];

  const lines: string[] = [];
  if (hat) lines.push(hat);
  lines.push(`  ${face}`);
  lines.push("");
  lines.push(`${shiny}${bones.rarity} ${bones.species} ${stars}`);
  lines.push("");

  for (const stat of STAT_NAMES) {
    const val = bones.stats[stat];
    const bar = "\u2588".repeat(Math.floor(val / 5)) + "\u2591".repeat(20 - Math.floor(val / 5));
    const label = stat.padEnd(9);
    const marker = stat === bones.peak ? " \u25b2" : stat === bones.dump ? " \u25bc" : "";
    lines.push(`  ${label} ${bar} ${String(val).padStart(3)}${marker}`);
  }

  return lines.join("\n");
}

// ─── Compact render for status line ─────────────────────────────────────────

export function renderCompact(bones: BuddyBones, name: string, reaction?: string): string {
  const face = renderFace(bones.species, bones.eye);
  const shiny = bones.shiny ? "\u2728" : "";
  const stars = RARITY_STARS[bones.rarity];
  const msg = reaction ? ` \u2502 "${reaction}"` : "";
  return `${face} ${name} ${shiny}${stars}${msg}`;
}

// ─── Search (brute-force) ───────────────────────────────────────────────────

export interface SearchCriteria {
  species: Species;
  rarity: Rarity;
  wantShiny: boolean;
  wantPeak?: StatName;
  wantDump?: StatName;
  statOrder?: StatName[];
}

export interface SearchResult {
  userId: string;
  bones: BuddyBones;
}

export function searchBuddy(
  criteria: SearchCriteria,
  maxAttempts: number,
  onProgress?: (checked: number, found: number) => void,
): SearchResult[] {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  const results: SearchResult[] = [];
  const reportInterval = 2_000_000;

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0 && i % reportInterval === 0) {
      onProgress?.(i, results.length);
    }

    const id = randomBytes(32).toString("hex");
    const rng = mulberry32(hashString(id + SALT));

    const rarity = rollRarity(rng);
    if (rarity !== criteria.rarity) continue;

    const species = pick(rng, SPECIES);
    if (species !== criteria.species) continue;

    const eye = pick(rng, EYES);
    const hat = rarity === "common" ? "none" : pick(rng, HATS);
    const shiny = rng() < 0.01;
    if (criteria.wantShiny && !shiny) continue;

    const peak = pick(rng, STAT_NAMES);
    if (criteria.wantPeak && criteria.wantPeak !== peak) continue;

    let dump = pick(rng, STAT_NAMES);
    while (dump === peak) dump = pick(rng, STAT_NAMES);
    if (criteria.wantDump && criteria.wantDump !== dump) continue;

    const floor = RARITY_FLOOR[rarity];
    const stats = {} as BuddyStats;
    for (const name of STAT_NAMES) {
      if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
      else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
      else stats[name] = floor + Math.floor(rng() * 40);
    }

    if (criteria.statOrder && criteria.statOrder.length > 1) {
      let valid = true;
      for (let j = 0; j < criteria.statOrder.length - 1; j++) {
        if (stats[criteria.statOrder[j]] <= stats[criteria.statOrder[j + 1]]) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
    }

    results.push({ userId: id, bones: { rarity, species, eye, hat, shiny, stats, peak, dump } });

    if (results.length >= 20) break;
  }

  return results;
}
