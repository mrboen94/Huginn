import { html as diffToHtml } from 'diff2html';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { chromium } from 'playwright-core';

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (
    args: Record<string, any>,
    signal: AbortSignal,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

export interface ToolListItem {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const tools: Tool[] = [
  {
    name: 'hello-world',
    description: 'Say hello to the world',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name to greet',
        },
      },
      additionalProperties: false,
    },
    handler: async (args: Record<string, any>) => {
      const name = args.name || 'World';
      return {
        content: [
          {
            type: 'text',
            text: `Hello, ${name}!`,
          },
        ],
      };
    },
  },
  {
    name: 'visualize_diff_image',
    description: 'Generate HTML or PNG visualization from a unified diff',
    inputSchema: {
      type: 'object',
      properties: {
        diff: {
          type: 'string',
          description: 'Unified diff text',
        },
        format: {
          type: 'string',
          enum: ['html', 'image'],
          description: 'Output format',
          default: 'html',
        },
        outputType: {
          type: 'string',
          enum: ['side-by-side', 'line-by-line'],
          description: 'Diff display style',
          default: 'side-by-side',
        },
      },
      required: ['diff'],
      additionalProperties: false,
    },
    handler: async (
      args: Record<string, any>,
      signal: AbortSignal,
    ) => {
      const { diff, format = 'html', outputType = 'side-by-side' } = args as {
        diff: string;
        format?: 'html' | 'image';
        outputType?: 'side-by-side' | 'line-by-line';
      };

      if (!diff || typeof diff !== 'string') {
        throw new Error('Argument "diff" must be a non-empty string');
      }

      if (signal.aborted) {
        throw new Error('Aborted');
      }

      const htmlBody = diffToHtml(diff, {
        drawFileList: true,
        matching: 'lines',
        outputFormat: outputType,
      });

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Diff Visualization</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css">
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif; margin: 20px; }
    .d2h-wrapper { max-width: none !important; }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;

      const outputDir = join(process.cwd(), 'out', 'visualize_diff_image');
      await mkdir(outputDir, { recursive: true });

      if (format === 'html') {
        const htmlPath = join(outputDir, 'diff.html');
        await writeFile(htmlPath, fullHtml, 'utf8');
        return {
          content: [
            {
              type: 'text',
              text: `HTML diff generated. Saved to: ${htmlPath}`,
            },
          ],
        };
      }

      // format === 'image'
      let browser: import('playwright-core').Browser | undefined;
      try {
        browser = await chromium.launch();
        const page = await browser.newPage();

        if (signal.aborted) {
          throw new Error('Aborted');
        }

        await page.setContent(fullHtml, { waitUntil: 'load' });

        if (signal.aborted) {
          throw new Error('Aborted');
        }

        const pngPath = join(outputDir, 'diff.png');
        await page.screenshot({ path: pngPath, fullPage: true });

        return {
          content: [
            {
              type: 'text',
              text: `PNG diff generated. Saved to: ${pngPath}`,
            },
          ],
        };
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch {
            // ignore
          }
        }
      }
    },
  },
];

export const toolRegistry = {
  listTools(): ToolListItem[] {
    return tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  },

  getTool(name: string): Tool | undefined {
    return tools.find((tool) => tool.name === name);
  },
};
