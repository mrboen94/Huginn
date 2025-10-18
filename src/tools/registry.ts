import { readdir } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';

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
const toolMeta = new Map<string, { dir: string }>();

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
  toolMeta.clear();

  for (const dir of dirs) {
    try {
      const modPath = join(dir, 'index.js');
      const url = pathToFileURL(modPath).href + `?ts=${Date.now()}`;
      const mod = await import(url);
      const exported = mod.visualizeDiffTool || mod.default || mod.tool || null;
      if (exported && typeof exported.name === 'string') {
        tools.push(exported as Tool);
        toolMeta.set((exported as Tool).name, { dir });
      }
    } catch (_err) {
      console.error(`Failed to load plugin at ${dir}:`, _err);
    }
  }

  const refreshTool: Tool = {
    name: 'refresh_plugins',
    description: 'Reload plugin modules from disk without restarting the MCP server',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plugin: {
          type: 'string',
          description: 'Optional: refresh only this plugin (tool name or directory name)'
        }
      }
    },
    handler: async (args: Record<string, unknown>) => {
      const plugin = typeof args?.plugin === 'string' ? args.plugin : undefined;
      if (!plugin) {
        loadedTools = null;
        await loadPlugins();
        const countAll = loadedTools?.length ?? 0;
        return { content: [{ type: 'text', text: `Plugins reloaded. Total tools: ${countAll}` }] } as any;
      }

      const pluginsRoot = join(process.cwd(), 'src', 'plugins');
      const byTool = toolMeta.get(plugin)?.dir;
      const candidateDirs = [byTool, join(pluginsRoot, plugin)].filter(Boolean) as string[];
      let reloadedName: string | null = null;
      for (const dir of candidateDirs) {
        try {
          const modPath = join(dir, 'index.js');
          const url = pathToFileURL(modPath).href + `?ts=${Date.now()}`;
          const mod = await import(url);
          const exported = mod.visualizeDiffTool || mod.default || mod.tool || null;
          if (exported && typeof exported.name === 'string') {
            reloadedName = (exported as Tool).name;
            if (!loadedTools) loadedTools = [];
            const idx = loadedTools.findIndex((t) => t.name === reloadedName);
            if (idx >= 0) loadedTools[idx] = exported as Tool; else loadedTools.push(exported as Tool);
            toolMeta.set(reloadedName, { dir });
            break;
          }
        } catch (err) {
          void err;
        }
      }

      if (reloadedName) {
        return { content: [{ type: 'text', text: `Plugin reloaded: ${reloadedName}` }] } as any;
      }
      return { content: [{ type: 'text', text: `Plugin not found: ${plugin}` }], isError: true } as any;
    },
  };

  tools.push(refreshTool);

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
