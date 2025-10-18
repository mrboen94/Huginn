import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { toolRegistry } from './tools/registry.js';
import { safeToolExecution } from './utils/safeToolExecution.js';

class MyMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'my-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolRegistry.listTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = toolRegistry.getTool(request.params.name);

      if (!tool) {
        const availableTools = toolRegistry.listTools();
        const availableNames = availableTools.map((t) => t.name).join(', ');
        console.error(`Unknown tool requested: ${request.params.name}`);
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${request.params.name}. Available tools: ${availableNames}`,
            },
          ],
          tools: availableTools,
        } as unknown as Record<string, any>;
      }

      const args = request.params.arguments ?? {};
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
    console.error('MCP Server [Huginn] running with Bun!');
  }
}

const server = new MyMCPServer();
server.run().catch(console.error);
