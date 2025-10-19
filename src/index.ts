import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolRegistry } from './tools/registry.js';
import type { ToolArguments } from './tools/types.js';
import { safeToolExecution } from './utils/safeToolExecution.js';
import { isPlainObject } from './utils/typeGuards.js';

class HuginnMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'huginn',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.initialize();
  }

  private async initialize() {
    await toolRegistry.init();
    this.setupHandlers();

    const tools = toolRegistry.listTools();
    const names = tools.map((t) => t.name).join(', ');
    console.error(`[Huginn] Loaded ${tools.length} tool(s): ${names || '—'}`);
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolRegistry.listTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = toolRegistry.getTool(request.params.name);

      if (!tool) {
        const availableNames = toolRegistry.listTools().map((t) => t.name).join(', ');
        console.error(`[Huginn] Unknown tool requested: ${request.params.name}`);
        const result: CallToolResult = {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${request.params.name}. Available tools: ${availableNames}`,
            },
          ],
        };
        return result;
      }

      const args: ToolArguments = isPlainObject(request.params.arguments)
        ? request.params.arguments
        : {};
      return await safeToolExecution(
        tool.name,
        (signal) => tool.handler(args, signal),
        { logArgs: args },
      );
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Huginn] MCP server running (stdio).');
  }
}

const server = new HuginnMCPServer();
server.run().catch((err) => {
  console.error('[Huginn] Fatal error:', err);
});
