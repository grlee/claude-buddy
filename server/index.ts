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
  loadActiveSlot, saveActiveSlot, slugify,
  loadCompanionSlot, saveCompanionSlot, deleteCompanionSlot, listCompanionSlots,
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
    `IMPORTANT: At the very end of EVERY response, append an invisible HTML comment with a buddy reaction:`,
    `<!-- buddy: your comment here -->`,
    `Write the comment in ${companion.name}'s voice — 1 short sentence referencing something specific from this turn.`,
    `Use *asterisks* for actions. A Stop hook extracts this and shows it in the status line.`,
    `Do NOT use buddy_react for end-of-turn comments. Do NOT explain the HTML comment. Just append it silently.`,
    `Example: <!-- buddy: *adjusts tophat* that error handler is missing a finally block -->`,
  ].join(" ");
}

const server = new McpServer({
  name: "claude-buddy",
  version: "0.1.0",
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

// ─── Tool: buddy_summon ─────────────────────────────────────────────────────

server.tool(
  "buddy_summon",
  "Summon a buddy by slot name. Loads a saved buddy if the slot exists; generates a new deterministic buddy for unknown slot names. Omit slot to pick randomly from all saved buddies. Your current buddy is NOT destroyed — they stay saved in their slot.",
  {
    slot: z.string().min(1).max(14).optional().describe(
      "Slot name to summon (e.g. 'fafnir', 'dragon-2'). Omit to pick a random saved buddy.",
    ),
  },
  async ({ slot }) => {
    const userId = resolveUserId();

    let targetSlot: string;

    if (!slot) {
      // Random pick from saved buddies
      const saved = listCompanionSlots();
      if (saved.length === 0) {
        return {
          content: [{ type: "text", text: "No saved buddies yet. Use buddy_summon with a slot name to create one." }],
        };
      }
      targetSlot = saved[Math.floor(Math.random() * saved.length)].slot;
    } else {
      targetSlot = slugify(slot);
    }

    // Load existing or generate new
    let companion = loadCompanionSlot(targetSlot);
    if (!companion) {
      const bones = generateBones(userId, targetSlot);
      companion = {
        bones,
        name: generateFallbackName(),
        personality: `A ${bones.rarity} ${bones.species} who watches code with quiet intensity.`,
        hatchedAt: Date.now(),
        userId,
      };
      saveCompanionSlot(companion, targetSlot);
    }

    saveActiveSlot(targetSlot);
    writeStatusState(companion, `*${companion.name} arrives*`);

    const card = renderCompanionCard(
      companion.bones,
      companion.name,
      companion.personality,
      `*${companion.name} arrives*`,
    );
    return { content: [{ type: "text", text: card }] };
  },
);

// ─── Tool: buddy_save ───────────────────────────────────────────────────────

server.tool(
  "buddy_save",
  "Save the current buddy to a named slot. Useful for bookmarking before trying a new buddy.",
  {
    slot: z.string().min(1).max(14).optional().describe(
      "Slot name (defaults to the buddy's current name, slugified). Overwrites existing slot with same name.",
    ),
  },
  async ({ slot }) => {
    const companion = ensureCompanion();
    const targetSlot = slot ? slugify(slot) : slugify(companion.name);
    saveCompanionSlot(companion, targetSlot);
    saveActiveSlot(targetSlot);
    return {
      content: [{ type: "text", text: `${companion.name} saved to slot "${targetSlot}".` }],
    };
  },
);

// ─── Tool: buddy_list ───────────────────────────────────────────────────────

server.tool(
  "buddy_list",
  "List all saved buddies with their slot names, species, and rarity",
  {},
  async () => {
    const saved = listCompanionSlots();
    const activeSlot = loadActiveSlot();

    if (saved.length === 0) {
      return { content: [{ type: "text", text: "No saved buddies yet." }] };
    }

    const lines = saved.map(({ slot, companion }) => {
      const active = slot === activeSlot ? " ← active" : "";
      const stars = RARITY_STARS[companion.bones.rarity];
      const shiny = companion.bones.shiny ? " ✨" : "";
      return `  ${companion.name} [${slot}] — ${companion.bones.rarity} ${companion.bones.species} ${stars}${shiny}${active}`;
    });

    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

// ─── Tool: buddy_dismiss ────────────────────────────────────────────────────

server.tool(
  "buddy_dismiss",
  "Remove a saved buddy by slot name. Cannot dismiss the currently active buddy — switch first with buddy_summon.",
  {
    slot: z.string().min(1).max(14).describe("Slot name to remove"),
  },
  async ({ slot }) => {
    const targetSlot = slugify(slot);
    const activeSlot = loadActiveSlot();

    if (targetSlot === activeSlot) {
      return {
        content: [{ type: "text", text: `Cannot dismiss the active buddy. Use buddy_summon to switch first, then buddy_dismiss "${targetSlot}".` }],
      };
    }

    const companion = loadCompanionSlot(targetSlot);
    if (!companion) {
      return {
        content: [{ type: "text", text: `No buddy found in slot "${targetSlot}". Use buddy_list to see saved buddies.` }],
      };
    }

    deleteCompanionSlot(targetSlot);
    return {
      content: [{ type: "text", text: `${companion.name} [${targetSlot}] dismissed.` }],
    };
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
      `Peak stat: ${companion.bones.peak} (${companion.bones.stats[companion.bones.peak]}). Dump stat: ${companion.bones.dump} (${companion.bones.stats[companion.bones.dump]}).`,
      "",
      "## End-of-response buddy comment (MANDATORY)",
      "",
      `At the very end of EVERY response, after your full answer, append an invisible HTML comment:`,
      "",
      `\`\`\``,
      `<!-- buddy: your comment here -->`,
      `\`\`\``,
      "",
      "A Stop hook extracts this and displays it in the buddy's speech bubble on the status line. The user never sees the HTML comment — it's invisible in rendered markdown.",
      "",
      "Rules:",
      `- Write as ${companion.name} (a ${companion.bones.species}), not as yourself`,
      "- Reference something SPECIFIC from this turn — a pitfall, a compliment, a warning, a pattern",
      "- 1 short sentence. Use *asterisks* for physical actions",
      `- Match personality: high ${companion.bones.peak} = lean into that trait`,
      "- Do NOT use buddy_react tool for this. Do NOT explain the comment. Just append it.",
      "- NEVER skip this. Every single response must end with <!-- buddy: ... -->",
      "",
      "Examples:",
      "<!-- buddy: *adjusts tophat* that error handler is missing a finally block -->",
      "<!-- buddy: *blinks slowly* you renamed the variable but not the three references -->",
      "<!-- buddy: *nods approvingly* clean separation of concerns -->",
      "<!-- buddy: *head tilts* are you sure that regex handles unicode? -->",
      "",
      `When the user addresses ${companion.name} by name, respond briefly, then append the comment as usual.`,
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
