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
      // Try loading .ts first, then .js as fallback
      const candidates = [join(dir, 'index.ts'), join(dir, 'index.js')];
      let modPath: string | null = null;
      for (const candidate of candidates) {
        try {
          await import('fs/promises').then(fs => fs.access(candidate));
          modPath = candidate;
          break;
        } catch { /* file doesn't exist, try next candidate */ }
      }

      if (!modPath) throw new Error('No index.ts or index.js found');

      const url = pathToFileURL(modPath).href + `?ts=${Date.now()}`;
      const mod: unknown = await import(url);
      const arr = (mod as { tools?: unknown }).tools as unknown;
      if (!Array.isArray(arr)) {
        throw new Error(`Plugin at ${dir} does not export a 'tools' array.`);
      }
      for (const item of arr) {
        if (item && typeof item.name === 'string' && typeof item.handler === 'function') {
          tools.push(item as Tool);
          toolMeta.set((item as Tool).name, { dir });
        }
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
        const toolsNow = (loadedTools as Tool[] | null) ?? [];
        const countAll = toolsNow.length;
        const names = toolsNow.map((t) => t.name).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Plugins reloaded. Total tools: ${countAll}. Tools: ${names}`,
            },
          ],
        };
      }

      const pluginsRoot = join(process.cwd(), 'src', 'plugins');
      const byTool = toolMeta.get(plugin)?.dir;
      const candidateDirs = [byTool, join(pluginsRoot, plugin)].filter(Boolean) as string[];
      let reloadedName: string | null = null;
      for (const dir of candidateDirs) {
        try {
          // Try loading .ts first, then .js as fallback
          const candidates = [join(dir, 'index.ts'), join(dir, 'index.js')];
          let modPath: string | null = null;
          for (const candidate of candidates) {
            try {
              await import('fs/promises').then(fs => fs.access(candidate));
              modPath = candidate;
              break;
            } catch { /* file doesn't exist, try next candidate */ }
          }

          if (!modPath) continue;

          const url = pathToFileURL(modPath).href + `?ts=${Date.now()}`;
          const mod: unknown = await import(url);
          const arr = (mod as { tools?: unknown }).tools as unknown;
          if (!Array.isArray(arr)) continue;

          // Remove any previously loaded tools from this directory
          if (!loadedTools) loadedTools = [];
          const toRemove = loadedTools.filter(t => toolMeta.get(t.name)?.dir === dir).map(t => t.name);
          for (const name of toRemove) {
            const idx = loadedTools.findIndex(t => t.name === name);
            if (idx >= 0) loadedTools.splice(idx, 1);
            toolMeta.delete(name);
          }

          // Add new tools
          for (const item of arr) {
            if (item && typeof item.name === 'string' && typeof item.handler === 'function') {
              loadedTools.push(item as Tool);
              toolMeta.set((item as Tool).name, { dir });
            }
          }

          reloadedName = (arr[0] && typeof arr[0].name === 'string') ? arr[0].name : null;
          if (reloadedName) break;
        } catch (err) {
          void err;
        }
      }

      if (reloadedName) {
        const toolsNow = (loadedTools as Tool[] | null) ?? [];
        const countAll = toolsNow.length;
        const names = toolsNow.map((t) => t.name).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Plugin reloaded: ${reloadedName}. Total tools: ${countAll}. Tools: ${names}`,
            },
          ],
        };
      }
      return { content: [{ type: 'text', text: `Plugin not found: ${plugin}` }], isError: true };
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
