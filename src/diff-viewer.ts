import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { html as diffToHtml } from "diff2html";
import { chromium } from "playwright-core";
import { writeFileSync } from "fs";
import { join } from "path";

class UnifiedDiffServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "unified-diff-mcp",
        version: "1.0.0",
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
      tools: [
        {
          name: "visualize_diff_image",
          description: "Generate beautiful HTML/PNG diff visualization",
          inputSchema: {
            type: "object",
            properties: {
              diff: {
                type: "string",
                description: "Unified diff text",
              },
              format: {
                type: "string",
                enum: ["html", "image"],
                description: "Output format",
                default: "html",
              },
              outputType: {
                type: "string",
                enum: ["side-by-side", "line-by-line"],
                description: "Diff display style",
                default: "side-by-side",
              },
            },
            required: ["diff"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "visualize_diff_image") {
        return await this.generateDiffVisualization(request.params.arguments ?? {});
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  private async generateDiffVisualization(args: Record<string, unknown>) {
    const { diff, format = "html", outputType = "side-by-side" } = args as {
      diff: string;
      format?: 'html' | 'image';
      outputType?: 'side-by-side' | 'line-by-line';
    };

    try {
      const html = diffToHtml(diff, {
        drawFileList: true,
        matching: "lines",
        outputFormat: outputType,
      });

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Diff Visualization</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css">
          <style>
            body { font-family: 'Monaco', 'Consolas', monospace; margin: 20px; }
            .d2h-wrapper { max-width: none !important; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      const outputPath = join(process.cwd(), "out", "diff-viewer");

      if (format === "html") {
        const htmlPath = join(outputPath, "diff.html");
        writeFileSync(htmlPath, fullHtml);

        return {
          content: [
            {
              type: "text",
              text: ` HTML diff generated successfully!\nSaved to: ${htmlPath}`,
            },
          ],
        };
      } else {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.setContent(fullHtml);

        const pngPath = join(outputPath, "diff.png");
        await page.screenshot({
          path: pngPath,
          fullPage: true,
        });

        await browser.close();

        return {
          content: [
            {
              type: "text",
              text: ` PNG diff generated successfully!\nSaved to: ${pngPath}`,
            },
          ],
        };
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating diff: ${String(err)}`,
          },
        ],
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(" Unified Diff MCP Server running with Bun!");
  }
}

const server = new UnifiedDiffServer();
server.run().catch(console.error);
