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

## Getting Started - Let's see if it even runs

```shell
bun install
bun install-plugins    # discover and install plugin dependencies
bun start              # starts the MCP server (stdio transport)
# dev: bun dev
# tests: bun test && bun typecheck
```

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop it like a civilized human, not by closing the terminal window.

<details>
<summary>
<strong>
Available scripts
</strong>
</summary>

```shell
# Install dependencies
bun install

# Start the MCP server
bun start

# Development with watch mode
bun dev

# Run tests
bun test
bun test:watch     # watch mode
bun coverage       # with coverage

# Type checking
bun typecheck

# Linting & formatting
bun lint
bun lint:fix
bun format
bun format:write

# Install MCP plugins
bun install-plugins
```

</details>

## Adding a Tool (the Right Way)

Edit `src/tools/registry.ts` and drop in an object that follows the contract above.

If your tool might take longer than a tweet to execute, use the provided `AbortSignal` and wrap it with `safeToolExecution`.

<details>
<summary>
Example
</summary>

```ts
// src/tools/registry.ts
{
  name: 'my_tool',
  description: 'Echo text back',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  handler: async (args, signal) => ({
    content: [{ type: 'text', text: `You sent: ${String(args.text)}` }]
  })
}
```
</details>

Write a test in `test/`, because future you will forget what this tool does.

## Plugin System - For the modular minded

Huginn supports a plugin architecture for organizing tools into separate modules.

### Installing Plugin Dependencies

```shell
# Scan src/plugins/ and install any required dependencies
bun install-plugins

# Auto-confirm dependency installation
bun install-plugins --yes
```

This will:
1. Discover all plugins in `src/plugins/*/index.ts`
2. Check for exported `requiredPackages` in each plugin
3. Add missing packages to your `package.json`
4. Optionally run `bun install` to install them
5. Generate a plugin manifest in `out/plugins-manifest.json`

### Creating a Plugin

Create a directory under `src/plugins/your-plugin-name/` with an `index.ts` file:

```ts
// src/plugins/my-tool/index.ts
export const myTool = {
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text']
  },
  handler: async (args, signal) => ({
    content: [{ type: 'text', text: `Processed: ${args.text}` }]
  })
};

// Optional: declare npm dependencies this plugin needs
export const requiredPackages = {
  'some-package': '^1.0.0'
};

export default myTool;
```

Then run `bun install-plugins` to register it and install dependencies.

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