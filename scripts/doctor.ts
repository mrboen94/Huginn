import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { toolRegistry } from '../src/tools/registry.js';

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
const root = process.cwd();

try {
  await access(join(root, 'package.json'));
  checks.push({ name: 'project root', ok: true, detail: root });
} catch {
  checks.push({
    name: 'project root',
    ok: false,
    detail: 'package.json was not found',
  });
}

try {
  const manifest = JSON.parse(
    await readFile(join(root, 'out', 'plugins-manifest.json'), 'utf8'),
  ) as { plugins?: unknown[] };
  checks.push({
    name: 'plugin manifest',
    ok: Array.isArray(manifest.plugins),
    detail: Array.isArray(manifest.plugins)
      ? `${manifest.plugins.length} plugin(s) enabled`
      : 'invalid manifest shape',
  });
} catch {
  checks.push({
    name: 'plugin manifest',
    ok: true,
    detail: 'not generated; all discovered plugins will be attempted',
  });
}

await toolRegistry.init();
for (const diagnostic of toolRegistry.getDiagnostics()) {
  checks.push({
    name: `plugin ${diagnostic.plugin}`,
    ok: diagnostic.status === 'loaded',
    detail:
      diagnostic.status === 'loaded'
        ? `${diagnostic.tools.length} tool(s): ${diagnostic.tools.join(', ')}`
        : (diagnostic.error ?? 'unknown load failure'),
  });
}

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}: ${check.detail}`);
}

if (checks.some((check) => !check.ok)) process.exitCode = 1;
