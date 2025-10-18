import { readdir } from 'fs/promises';
import { join } from 'path';

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

export interface ToolListItem {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
let loadedTools: Tool[] | null = null;

async function loadPlugins(): Promise<void> {
  if (loadedTools) return;

  const pluginsRoot = join(process.cwd(), 'src', 'plugins');
  let dirs: string[] = [];
  try {
    const entries = await readdir(pluginsRoot, { withFileTypes: true });
    dirs = entries.filter((e) => e.isDirectory()).map((d) => join(pluginsRoot, d.name));
  } catch {
    dirs = [];
  }

  const tools: Tool[] = [];

  for (const dir of dirs) {
    try {
      const modPath = join(dir, 'index.js');
      const mod = await import(modPath);
      const exported = mod.visualizeDiffTool || mod.default || mod.tool || null;
      if (exported && typeof exported.name === 'string') {
        tools.push(exported as Tool);
      }
    } catch (_err) {
      console.error(`Failed to load plugin at ${dir}:`, _err);
    }
  }

  loadedTools = tools;
}

export const toolRegistry = {
  async init(): Promise<void> {
    await loadPlugins();
  },

  listTools(): ToolListItem[] {
    if (!loadedTools) return [];
    return loadedTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  },

  getTool(name: string): Tool | undefined {
    if (!loadedTools) return undefined;
    return loadedTools.find((tool) => tool.name === name);
  },
};
