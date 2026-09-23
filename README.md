<div align="center">

![huginn](./huginn.svg)

<h1>
Huginn
</h1>

**Simple, composable, and just opinionated enough to annoy the right people.**

</div>

## Stack

| What     | Info                                                    |
| -------- | ------------------------------------------------------- |
| Language | TypeScript — because JavaScript without types is chaos. |
| Runtime  | Bun — faster, lighter, and doesn’t smell like Node.     |
| Protocol | Model Context Protocol (via @modelcontextprotocol/sdk)  |
| License  | MIT — do whatever, just don’t blame me.                 |

<details> <summary>
<strong>
Stack rationale
</strong>
 — click if you’re the type who reads EULAs
</summary>

Bun — because startup time shouldn’t be measured in coffee breaks.

TypeScript — your future self deserves better than `undefined is not a function [object object]`.

`@modelcontextprotocol/sdk` — because reinventing protocols is for those who hate finishing projects.

</details>

## What Huginn Actually Does

Keeps a registry of tools (name, schema, handler).

Lets clients list and call tools over stdio like it’s the 1980s, but JSON.

Executes handlers safely, with timeouts, aborts, and structured logs — so you can look professional while debugging and pulling your hair out.

## The Sacred Tool Contract

Everything revolves around this simple contract, mess it up, and Huginn will politely do nothing and fully ignore you.

```ts
{
  name: string,
  description: string,
  inputSchema: Record<string, any>,
  handler: async (args: Record<string, any>, signal: AbortSignal) => {
    content: Array<{ type: string; text: string }>,
    isError?: boolean
  }
}
```

Think of it as OpenAPI’s introverted cousin — minimal, yet oddly particular.

## Getting Started

Huginn requires [Bun](https://bun.sh/). The one-command setup installs the server and all bundled plugin dependencies:

```shell
bun run setup
bunx playwright install chromium # required only by image-rendering plugins
bun run doctor
bun start
```

To enable only the plugins you need at runtime, select them explicitly instead:

```shell
bun install
bun plugins --list
bun plugins --plugin mcp_tooling --yes
bun start
```

The server uses MCP's stdio transport, so stdout is reserved for protocol messages. Diagnostics are written to stderr.

### Development commands

```shell
bun dev             # restart on source changes
bun test            # run unit and integration tests
bun run check       # typecheck, lint, formatting, and tests
bun run format:write
bun run doctor      # verify the manifest and load every enabled plugin
```

## Adding a Plugin

Each directory under `src/plugins/` contains an `index.ts` runtime entry point and a static `plugin.json`. Static metadata lets the installer discover dependencies without importing a plugin whose optional packages have not been installed yet.

```text
src/plugins/my-plugin/
├── index.ts
└── plugin.json
```

```ts
// index.ts
import type { Tool } from '../../tools/types.js';

const echo: Tool = {
  name: 'echo',
  description: 'Echo text back',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
  handler: async (args, signal) => {
    if (signal.aborted) throw new Error('Aborted');
    return { content: [{ type: 'text', text: String(args.text) }] };
  },
};

export const tools = [echo];
```

```json
{
  "name": "my-plugin",
  "description": "Example plugin",
  "tools": [{ "name": "echo", "description": "Echo text back" }],
  "requiredPackages": {}
}
```

Enable it with `bun plugins --plugin my-plugin --yes`. The installer writes `out/plugins-manifest.json`; when this file exists, only selected plugins (plus locally generated plugins) are loaded. Without it, Huginn attempts to load every discovered plugin for backwards compatibility.

### Plugin CLI

```shell
bun plugins --list                         # inspect plugins without importing them
bun plugins                                # interactive selection
bun plugins --all --yes                    # enable all and install dependencies
bun plugins --plugin my-plugin --yes       # enable one or more named plugins
bun plugins --all --no-install             # update manifest/package.json only
```

The loader validates tool exports, rejects duplicate names, keeps per-plugin diagnostics, and reports failures through `bun run doctor`. `refresh_plugins` reloads enabled modules without restarting the MCP process.

### Generated Tools (quality-of-life, not sorcery)

- `create_mcp_tool`: scaffold a new plugin folder with a properly tagged tool name (`generated_<base>`), path-safe writes, optional dependency add, optional install (you confirm), and auto-refresh.
- `remove_generated_tool`: deletes only tools that were generated (header + `generated_` prefix) and refreshes the registry.
- `rename_generated_tool`: renames a generated tool (folder + tool name), with safety checks, then refresh.
- `edit_generated_tool`: updates description, input_schema, handler_code, and optional requiredPackages; unsafe code is gated behind a flag with explicit warnings.

Rules are simple: you bring the logic, Huginn brings the boundaries. Stay inside `src/plugins/`, export `tools = [...]`, and we’ll do the rest.

## Included Plugins

### code_screenshot

Render a styled PNG from a code string with syntax highlighting, line numbers, and optional line highlighting.

Args:

- code (string, required)
- language (string, default: "plaintext")
- transparent (boolean, default: false)
- highlight (string, line ranges like "3,5-7,10")
- scale (number, default: 2)
- titleOverride (string)

Notes:

- Fixed line height (18px) and preserved indentation; empty lines keep height.
- Highlight uses an inset left bar (no layout shift) and avoids first-glyph overlap.
- Very long lines are supported; the viewport auto-expands to capture full width.
- Transparent mode: rounded corners, smaller title, margin + shadow for separation.
- Iosevka is embedded when available; falls back to system monospace.

### visualize_diff_image

Generate HTML or PNG from a unified diff.

Args:

- diff (string, required)
- format ("html" | "image", default: "html")
- outputType ("side-by-side" | "line-by-line", default: "side-by-side")

## Built-in Management Tools

### refresh_plugins

Reload plugins without restarting the server.

Schema:

- plugin (string, optional): tool name or plugin directory to refresh only that plugin.

Examples:

```json
{ "name": "refresh_plugins", "arguments": {} }
```

```json
{ "name": "refresh_plugins", "arguments": { "plugin": "code_screenshot" } }
```

## Logging & Config - For the paranoid

Logs: `logs/mcp-tools.log`(JSON-lines). Override with `MCP_TOOL_LOG_FILE`.

Timeout: `MCP_TOOL_TIMEOUT_MS` (milliseconds).
— Yes, you can set it to Infinity, but don’t.

## Roadmap - Aka. “The Illusion of Progress”

<details> <summary>Planned items</summary>

Minimal example MCP client (stdio) demonstrating ListTools + CallTool flows.

More example tools, plus E2E tests for the one person who will actually run them.

</details>

## License

MIT — go make something useful. Or something deeply cursed.
Huginn doesn’t judge, but he does know.
