/**
 * State management — reads/writes companion data to ~/.claude-buddy/
 *
 * Storage layout (v2 — multi-buddy slots):
 *   ~/.claude-buddy/
 *     active                  ← plain text: current slot name
 *     companions/
 *       <slot>.json           ← one file per saved buddy
 *     reaction.json           ← transient reaction state (unchanged)
 *     status.json             ← compact state for status line (unchanged)
 *
 * Migration: on first load, if the legacy companion.json exists it is
 * moved into companions/<slug>.json and active is written automatically.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Companion, BuddyBones } from "./engine.ts";

const STATE_DIR      = join(homedir(), ".claude-buddy");
const COMPANIONS_DIR = join(STATE_DIR, "companions");
const ACTIVE_FILE    = join(STATE_DIR, "active");
const LEGACY_FILE    = join(STATE_DIR, "companion.json");  // pre-v2
const REACTION_FILE  = join(STATE_DIR, "reaction.json");

function ensureDir(): void {
  if (!existsSync(STATE_DIR))      mkdirSync(STATE_DIR,      { recursive: true });
  if (!existsSync(COMPANIONS_DIR)) mkdirSync(COMPANIONS_DIR, { recursive: true });
}

// ─── Slot helpers ────────────────────────────────────────────────────────────

/** Normalise a string to a safe slot key (a-z0-9-, max 14 chars). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 14) || "buddy";
}

export function loadActiveSlot(): string {
  try {
    return readFileSync(ACTIVE_FILE, "utf8").trim() || "buddy";
  } catch {
    return "buddy";
  }
}

export function saveActiveSlot(slot: string): void {
  ensureDir();
  writeFileSync(ACTIVE_FILE, slot);
}

// ─── Per-slot companion persistence ─────────────────────────────────────────

export function loadCompanionSlot(slot: string): Companion | null {
  try {
    return JSON.parse(readFileSync(join(COMPANIONS_DIR, `${slot}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function saveCompanionSlot(companion: Companion, slot: string): void {
  ensureDir();
  writeFileSync(join(COMPANIONS_DIR, `${slot}.json`), JSON.stringify(companion, null, 2));
}

export function deleteCompanionSlot(slot: string): void {
  try {
    unlinkSync(join(COMPANIONS_DIR, `${slot}.json`));
  } catch { /* noop */ }
}

export function listCompanionSlots(): Array<{ slot: string; companion: Companion }> {
  ensureDir();
  try {
    return readdirSync(COMPANIONS_DIR)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        const slot = f.slice(0, -5);
        const companion = loadCompanionSlot(slot);
        return companion ? [{ slot, companion }] : [];
      });
  } catch {
    return [];
  }
}

// ─── Migration: legacy companion.json → companions/<slot>.json ───────────────

function migrateIfNeeded(): void {
  if (!existsSync(LEGACY_FILE)) return;
  ensureDir();

  const existing = readdirSync(COMPANIONS_DIR).filter((f) => f.endsWith(".json"));
  if (existing.length === 0) {
    // First boot after upgrade — move legacy companion into a slot
    try {
      const companion: Companion = JSON.parse(readFileSync(LEGACY_FILE, "utf8"));
      const slot = slugify(companion.name);
      saveCompanionSlot(companion, slot);
      saveActiveSlot(slot);
    } catch { /* malformed — just delete */ }
  }

  try { unlinkSync(LEGACY_FILE); } catch { /* noop */ }
}

// ─── Primary companion API (slot-aware) ──────────────────────────────────────

export function loadCompanion(): Companion | null {
  migrateIfNeeded();
  return loadCompanionSlot(loadActiveSlot());
}

export function saveCompanion(companion: Companion): void {
  saveCompanionSlot(companion, loadActiveSlot());
}

export function deleteCompanion(): void {
  deleteCompanionSlot(loadActiveSlot());
}

// ─── Reaction state (for status line) ───────────────────────────────────────

export interface ReactionState {
  reaction: string;
  timestamp: number;
  reason: string;
}

export function loadReaction(): ReactionState | null {
  try {
    const data: ReactionState = JSON.parse(readFileSync(REACTION_FILE, "utf8"));
    // Reactions expire after 60 seconds
    if (Date.now() - data.timestamp > 60_000) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveReaction(reaction: string, reason: string): void {
  ensureDir();
  const state: ReactionState = { reaction, timestamp: Date.now(), reason };
  writeFileSync(REACTION_FILE, JSON.stringify(state));
}

// ─── Identity resolution ────────────────────────────────────────────────────

export function resolveUserId(): string {
  try {
    const claudeJson = JSON.parse(
      readFileSync(join(homedir(), ".claude.json"), "utf8"),
    );
    return claudeJson.oauthAccount?.accountUuid ?? claudeJson.userID ?? "anon";
  } catch {
    return "anon";
  }
}

// ─── Status line state (compact JSON for the shell script) ──────────────────

export interface StatusState {
  name: string;
  species: string;
  rarity: string;
  stars: string;
  face: string;
  shiny: boolean;
  hat: string;
  reaction: string;
  muted: boolean;
}

export function writeStatusState(companion: Companion, reaction?: string, muted?: boolean): void {
  ensureDir();
  const { renderFace, RARITY_STARS } = require("./engine.ts") as typeof import("./engine.ts");
  const state: StatusState = {
    name: companion.name,
    species: companion.bones.species,
    rarity: companion.bones.rarity,
    stars: RARITY_STARS[companion.bones.rarity],
    face: renderFace(companion.bones.species, companion.bones.eye),
    shiny: companion.bones.shiny,
    hat: companion.bones.hat,
    reaction: reaction ?? "",
    muted: muted ?? false,
  };
  writeFileSync(join(STATE_DIR, "status.json"), JSON.stringify(state));
}
