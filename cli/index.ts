#!/usr/bin/env bun
/**
 * claude-buddy CLI
 *
 * Usage:
 *   npx claude-buddy              Interactive install
 *   npx claude-buddy install      Install MCP + skill + hooks + statusline
 *   npx claude-buddy show         Show current buddy
 *   npx claude-buddy hunt         Search for a specific buddy
 *   npx claude-buddy uninstall    Remove all integrations
 *   npx claude-buddy verify       Verify what buddy your ID produces
 */

const args = process.argv.slice(2);
const command = args[0] || "install";

switch (command) {
  case "install":
    await import("./install.ts");
    break;
  case "show":
    await import("./show.ts");
    break;
  case "hunt":
    await import("./hunt.ts");
    break;
  case "uninstall":
    await import("./uninstall.ts");
    break;
  case "verify":
    await import("./verify.ts");
    break;
  case "doctor":
    await import("./doctor.ts");
    break;
  case "test-statusline":
    await import("./test-statusline.ts");
    break;
  case "backup":
    await import("./backup.ts");
    break;
  case "disable":
    await import("./disable.ts");
    break;
  case "--help":
  case "-h":
    console.log(`
claude-buddy — permanent coding companion for Claude Code

Commands:
  install           Set up MCP server, skill, hooks, and status line
  show              Display your current buddy
  hunt              Search for a specific buddy (species, rarity, stats)
  verify            Verify what buddy your current ID produces
  doctor            Run diagnostic report (paste output in bug reports)
  test-statusline   Install temporary diagnostic status line in Claude Code
  backup            Snapshot or restore all claude-buddy state
  disable           Temporarily deactivate buddy (re-enable with install-buddy)
  uninstall         Remove all claude-buddy integrations

Options:
  --help, -h        Show this help
`);
    break;
  default:
    console.error(`Unknown command: ${command}\nRun 'claude-buddy --help' for usage.`);
    process.exit(1);
}
