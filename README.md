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

## Getting Started - Let’s see if it even runs

```shell
bun install
bun run src/index.ts # starts the MCP server (stdio transport)
# dev: bun run dev
# tests: bun x vitest --run && bun x tsc --noEmit
```

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop it like a civilized human, not by closing the terminal window.

<details>
<summary>
<strong>
More explicit than needed
</strong>
</summary>

# install
bun install

# start

```fish
bun run src/index.ts
```

# run tests

```
bun x vitest --run
bun x tsc --noEmit
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