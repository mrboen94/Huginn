import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isPlainObject } from '../utils/typeGuards.js';
import {
  EMPTY_TOOL_ARGS,
  type Tool,
  type ToolArguments,
  type ToolListItem,
} from './types.js';

interface PluginManifest {
  plugins?: Array<{ name?: unknown }>;
}

export interface PluginDiagnostic {
  plugin: string;
  status: 'loaded' | 'failed';
  tools: string[];
  error?: string;
}

let loadedTools: Tool[] | null = null;
let diagnostics: PluginDiagnostic[] = [];
const toolMeta = new Map<string, { dir: string }>();

function isToolCandidate(value: unknown): value is Tool {
  if (!isPlainObject(value)) return false;
  const { name, description, inputSchema, handler } = value;
  return (
    typeof name === 'string' &&
    name.trim() !== '' &&
    typeof description === 'string' &&
    isPlainObject(inputSchema) &&
    typeof handler === 'function'
  );
}

async function findEntryPoint(dir: string): Promise<string> {
  for (const filename of ['index.ts', 'index.js']) {
    const candidate = join(dir, filename);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported entry point.
    }
  }
  throw new Error('No index.ts or index.js entry point found');
}

async function enabledPluginNames(
  root: string,
): Promise<Set<string> | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(join(root, 'out', 'plugins-manifest.json'), 'utf8'),
    ) as PluginManifest;
    if (!Array.isArray(parsed.plugins)) return undefined;
    return new Set(
      parsed.plugins
        .map((plugin) => plugin.name)
        .filter((name): name is string => typeof name === 'string'),
    );
  } catch {
    return undefined;
  }
}

async function loadPlugins(): Promise<void> {
  if (loadedTools) return;

  const root = process.cwd();
  const pluginsRoot = join(root, 'src', 'plugins');
  const enabled = await enabledPluginNames(root);
  const entries = await readdir(pluginsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const dirs = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (!enabled ||
          enabled.has(entry.name) ||
          entry.name.startsWith('generated_')),
    )
    .map((entry) => join(pluginsRoot, entry.name))
    .sort();
  const tools = new Map<string, Tool>();
  diagnostics = [];
  toolMeta.clear();

  for (const dir of dirs) {
    const plugin = basename(dir);
    try {
      const entryPoint = await findEntryPoint(dir);
      const moduleValue: unknown = await import(
        `${pathToFileURL(entryPoint).href}?refresh=${Date.now()}`
      );
      const exportedTools = isPlainObject(moduleValue)
        ? moduleValue.tools
        : undefined;
      if (!Array.isArray(exportedTools))
        throw new Error("Plugin does not export a 'tools' array");

      const names: string[] = [];
      for (const candidate of exportedTools) {
        if (!isToolCandidate(candidate))
          throw new Error('Plugin exports an invalid tool');
        if (tools.has(candidate.name))
          throw new Error(`Duplicate tool name: ${candidate.name}`);
        tools.set(candidate.name, candidate);
        toolMeta.set(candidate.name, { dir });
        names.push(candidate.name);
      }
      diagnostics.push({ plugin, status: 'loaded', tools: names });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({ plugin, status: 'failed', tools: [], error: message });
      console.error(`[Huginn] Failed to load plugin "${plugin}": ${message}`);
    }
  }

  const refreshTool: Tool = {
    name: 'refresh_plugins',
    description:
      'Reload enabled plugin modules from disk without restarting the MCP server',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        plugin: {
          type: 'string',
          description:
            'Optional plugin directory or tool name to verify before reloading',
        },
      },
    },
    handler: async (args: ToolArguments = EMPTY_TOOL_ARGS) => {
      const requested =
        typeof args.plugin === 'string' ? args.plugin : undefined;
      loadedTools = null;
      await loadPlugins();
      if (
        requested &&
        !toolMeta.has(requested) &&
        !diagnostics.some((item) => item.plugin === requested)
      ) {
        return {
          content: [{ type: 'text', text: `Plugin not found: ${requested}` }],
          isError: true,
        };
      }
      const failures = diagnostics.filter((item) => item.status === 'failed');
      return {
        content: [
          {
            type: 'text',
            text: `Plugins reloaded. ${toolRegistry.listTools().length} tools available; ${failures.length} plugin(s) failed.`,
          },
        ],
        isError: failures.length > 0,
      };
    },
  };

  tools.set(refreshTool.name, refreshTool);
  loadedTools = [...tools.values()];
}

export const toolRegistry = {
  async init(): Promise<void> {
    await loadPlugins();
  },

  listTools(): ToolListItem[] {
    return (loadedTools ?? []).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  },

  getTool(name: string): Tool | undefined {
    return loadedTools?.find((tool) => tool.name === name);
  },

  getDiagnostics(): PluginDiagnostic[] {
    return diagnostics.map((diagnostic) => ({
      ...diagnostic,
      tools: [...diagnostic.tools],
    }));
  },
};
