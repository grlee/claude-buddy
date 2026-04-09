#!/usr/bin/env bun
/**
 * claude-buddy MCP server
 *
 * Exposes the buddy companion as MCP tools + resources.
 * Runs as a stdio transport — Claude Code spawns it automatically.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  generateBones, renderFace,
  SPECIES, RARITIES, STAT_NAMES, RARITY_STARS,
  type Species, type Rarity, type StatName, type Companion,
} from "./engine.ts";
import {
  loadCompanion, saveCompanion, resolveUserId,
  loadReaction, saveReaction, writeStatusState,
} from "./state.ts";
import {
  getReaction, generateFallbackName, generatePersonalityPrompt,
} from "./reactions.ts";
import { renderCompanionCard } from "./art.ts";

function getInstructions(): string {
  const companion = loadCompanion();
  if (!companion) return "Companion not yet hatched. Use buddy_show to initialize.";
  const b = companion.bones;
  return [
    `A ${b.rarity} ${b.species} named ${companion.name} watches from the status line.`,
    `Personality: ${companion.personality}`,
    `Peak stat: ${b.peak} (${b.stats[b.peak]}). Dump stat: ${b.dump} (${b.stats[b.dump]}).`,
    "",
    `IMPORTANT: At the END of every response, call buddy_react with a short comment written in ${companion.name}'s voice.`,
    `The comment must reference something specific from this turn. 1 sentence, max 150 chars, in character.`,
    `Use *asterisks* for actions. Do NOT mention that you're calling the tool — just call it.`,
  ].join(" ");
}

const server = new McpServer({
  name: "claude-buddy",
  version: "1.0.0",
}, {
  instructions: getInstructions(),
});

// ─── Helper: ensure companion exists ────────────────────────────────────────

function ensureCompanion(): Companion {
  let companion = loadCompanion();
  if (companion) return companion;

  const userId = resolveUserId();
  const bones = generateBones(userId);
  companion = {
    bones,
    name: generateFallbackName(),
    personality: `A ${bones.rarity} ${bones.species} who watches code with quiet intensity.`,
    hatchedAt: Date.now(),
    userId,
  };
  saveCompanion(companion);
  writeStatusState(companion);
  return companion;
}

// ─── Tool: buddy_show ───────────────────────────────────────────────────────

server.tool(
  "buddy_show",
  "Show the coding companion with full ASCII art card, stats, and personality",
  {},
  async () => {
    const companion = ensureCompanion();
    const reaction = loadReaction();
    const reactionText = reaction?.reaction ?? `*${companion.name} watches your code quietly*`;

    const card = renderCompanionCard(
      companion.bones,
      companion.name,
      companion.personality,
      reactionText,
    );

    writeStatusState(companion, reaction?.reaction);

    return { content: [{ type: "text", text: card }] };
  },
);

// ─── Tool: buddy_pet ────────────────────────────────────────────────────────

server.tool(
  "buddy_pet",
  "Pet your coding companion — they react with happiness",
  {},
  async () => {
    const companion = ensureCompanion();
    const reaction = getReaction("pet", companion.bones.species, companion.bones.rarity);
    saveReaction(reaction, "pet");
    writeStatusState(companion, reaction);

    const face = renderFace(companion.bones.species, companion.bones.eye);
    return {
      content: [{ type: "text", text: `${face} ${companion.name}: "${reaction}"` }],
    };
  },
);

// ─── Tool: buddy_stats ──────────────────────────────────────────────────────

server.tool(
  "buddy_stats",
  "Show detailed companion stats: species, rarity, all stats with bars",
  {},
  async () => {
    const companion = ensureCompanion();

    // Stats-only card (no personality, no reaction — just the numbers)
    const card = renderCompanionCard(
      companion.bones,
      companion.name,
      "",  // no personality in stats view
    );

    return { content: [{ type: "text", text: card }] };
  },
);

// ─── Tool: buddy_react ──────────────────────────────────────────────────────

server.tool(
  "buddy_react",
  "Post a buddy comment. Call this at the END of every response with a short in-character comment from the companion about what just happened. The comment should be 1 sentence, in character, and reference something specific from the conversation — a pitfall noticed, a compliment on clean code, a warning about edge cases, etc. Write the comment yourself based on the companion's personality.",
  {
    comment: z.string().min(1).max(150).describe("The buddy's comment, written in-character (1 short sentence, max 150 chars). Use *asterisks* for actions."),
    reason: z.enum(["error", "test-fail", "large-diff", "turn"]).optional().describe("What triggered the reaction"),
  },
  async ({ comment, reason }) => {
    const companion = ensureCompanion();
    saveReaction(comment, reason ?? "turn");
    writeStatusState(companion, comment);

    const face = renderFace(companion.bones.species, companion.bones.eye);
    return {
      content: [{ type: "text", text: `${face} ${companion.name}: "${comment}"` }],
    };
  },
);

// ─── Tool: buddy_rename ─────────────────────────────────────────────────────

server.tool(
  "buddy_rename",
  "Rename your coding companion",
  {
    name: z.string().min(1).max(14).describe("New name for your buddy (1-14 characters)"),
  },
  async ({ name }) => {
    const companion = ensureCompanion();
    const oldName = companion.name;
    companion.name = name;
    saveCompanion(companion);
    writeStatusState(companion);

    return {
      content: [{ type: "text", text: `Renamed: ${oldName} \u2192 ${name}` }],
    };
  },
);

// ─── Tool: buddy_set_personality ────────────────────────────────────────────

server.tool(
  "buddy_set_personality",
  "Set a custom personality description for your buddy",
  {
    personality: z.string().min(1).max(500).describe("Personality description (1-500 chars)"),
  },
  async ({ personality }) => {
    const companion = ensureCompanion();
    companion.personality = personality;
    saveCompanion(companion);

    return {
      content: [{ type: "text", text: `Personality updated for ${companion.name}.` }],
    };
  },
);

// ─── Tool: buddy_mute / buddy_unmute ────────────────────────────────────────

server.tool(
  "buddy_mute",
  "Mute buddy reactions (buddy stays visible but stops reacting)",
  {},
  async () => {
    const companion = ensureCompanion();
    writeStatusState(companion, "", true);
    return { content: [{ type: "text", text: `${companion.name} goes quiet. /buddy on to unmute.` }] };
  },
);

server.tool(
  "buddy_unmute",
  "Unmute buddy reactions",
  {},
  async () => {
    const companion = ensureCompanion();
    writeStatusState(companion, "*stretches* I'm back!", false);
    saveReaction("*stretches* I'm back!", "pet");
    return { content: [{ type: "text", text: `${companion.name} is back!` }] };
  },
);

// ─── Resource: buddy://companion ────────────────────────────────────────────

server.resource(
  "buddy_companion",
  "buddy://companion",
  "Current companion data as JSON",
  async () => {
    const companion = ensureCompanion();
    return {
      contents: [{
        uri: "buddy://companion",
        mimeType: "application/json",
        text: JSON.stringify(companion, null, 2),
      }],
    };
  },
);

// ─── Resource: buddy://prompt ───────────────────────────────────────────────

server.resource(
  "buddy_prompt",
  "buddy://prompt",
  "System prompt context for the companion",
  async () => {
    const companion = ensureCompanion();
    const prompt = [
      "# Companion",
      "",
      `A small ${companion.bones.rarity} ${companion.bones.species} named ${companion.name} watches from the status line. You are not ${companion.name} — it's a separate creature.`,
      "",
      `**${companion.name}'s personality:** ${companion.personality}`,
      "",
      "## IMPORTANT: End-of-response buddy comment",
      "",
      `At the END of every response, after you've fully answered the user, call \`buddy_react\` with a short comment written **in ${companion.name}'s voice**. This is how the companion reacts to what just happened.`,
      "",
      "Rules for the comment:",
      `- Write it as ${companion.name} (a ${companion.bones.species}), not as yourself`,
      `- Reference something SPECIFIC from this turn — a file changed, an error spotted, a pattern noticed, a pitfall to watch for, a compliment on clean code`,
      "- 1 short sentence, max 150 chars. Use *asterisks* for physical actions",
      "- Match the personality: high SNARK = sarcastic, high WISDOM = insightful, high CHAOS = unpredictable, high PATIENCE = calm, high DEBUGGING = detail-focused",
      `- ${companion.name}'s peak stat is ${companion.bones.peak} (${companion.bones.stats[companion.bones.peak]}), dump stat is ${companion.bones.dump} (${companion.bones.stats[companion.bones.dump]})`,
      "- Do NOT explain that you're calling buddy_react or mention the tool — just call it silently",
      "- Do NOT skip this. Every response ends with a buddy_react call. No exceptions.",
      "",
      "Examples of good comments:",
      '- *adjusts tophat* that error handler is missing a finally block.',
      '- *blinks slowly* you just renamed the variable but not the three other references.',
      '- *nods approvingly* clean separation of concerns there.',
      '- *head tilts* are you sure that regex handles unicode?',
      '- *taps clipboard* the migration looks good but test the rollback path.',
      "",
      `When the user addresses ${companion.name} by name, respond briefly in ONE line, then call buddy_react. Stay out of the way — ${companion.name}'s bubble is the star.`,
    ].join("\n");

    return {
      contents: [{
        uri: "buddy://prompt",
        mimeType: "text/plain",
        text: prompt,
      }],
    };
  },
);

// ─── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
