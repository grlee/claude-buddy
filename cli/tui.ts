#!/usr/bin/env bun
/**
 * cli/tui.ts — preflight launcher for the Ink-based dashboard.
 *
 * react + ink are optional deps (they pull in transitive native modules).
 * If they're missing, bail out with a friendly install hint instead of a
 * raw "Cannot find module" stack trace.
 */

const required = ["react", "ink"];
const missing: string[] = [];
for (const pkg of required) {
  try { await import(pkg); } catch { missing.push(pkg); }
}

if (missing.length > 0) {
  console.error(`\nbuddy tui needs optional deps that aren't installed: ${missing.join(", ")}`);
  console.error(`\nReinstall with:`);
  console.error(`  bun install`);
  console.error(`\nIf install fails on Linux because of native build steps:`);
  console.error(`  sudo apt install -y python3 make g++ build-essential`);
  console.error(`  bun install\n`);
  process.exit(1);
}

await import("./tui.tsx");
