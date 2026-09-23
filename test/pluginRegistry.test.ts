import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { toolRegistry } from '../src/tools/registry.js';
import createTool from '../src/plugins/mcp_tooling/create_mcp_tool.js';

describe('plugin architecture', () => {
  it('loads every enabled plugin and exposes unique tools', async () => {
    await toolRegistry.init();

    const diagnostics = toolRegistry.getDiagnostics();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((item) => item.status === 'loaded')).toBe(true);

    const names = toolRegistry.listTools().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('refresh_plugins');
  });

  it('has valid static metadata for every plugin directory', async () => {
    const root = join(process.cwd(), 'src', 'plugins');
    const entries = await readdir(root, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());

    for (const directory of directories) {
      const metadata = JSON.parse(
        await readFile(join(root, directory.name, 'plugin.json'), 'utf8'),
      ) as { name?: string; tools?: unknown[]; requiredPackages?: unknown };
      expect(metadata.name).toBe(directory.name);
      expect(Array.isArray(metadata.tools)).toBe(true);
      expect(metadata.requiredPackages).toBeTypeOf('object');
    }
  });

  it('creates a discoverable and executable generated plugin', async () => {
    const name = 'generated_registry_test';
    const directory = join(process.cwd(), 'src', 'plugins', name);
    await rm(directory, { recursive: true, force: true });

    try {
      const creation = await createTool.handler(
        {
          base_name: 'registry_test',
          description: 'Temporary registry integration test',
          template: 'echo',
          input_schema: { type: 'object' },
        },
        new AbortController().signal,
      );
      expect(creation.isError).not.toBe(true);

      const generated = toolRegistry.getTool(name);
      expect(generated).toBeDefined();
      const result = await generated?.handler(
        { message: 'hello' },
        new AbortController().signal,
      );
      expect(result).toMatchObject({
        content: [{ type: 'text', text: expect.stringContaining('hello') }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
      const refresh = toolRegistry.getTool('refresh_plugins');
      await refresh?.handler({}, new AbortController().signal);
    }
  });
});
