// create_mcp_tool (moved into mcp_tooling)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolArguments } from '../../tools/types.js';
import { isPlainObject, isRecordOfStrings } from '../../utils/typeGuards.js';

const BASE_NAME_REGEX = /^[a-z0-9_]+$/;

type StringMap = Record<string, string>;

interface PackageJson {
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

function detectDangerousPatterns(src: string): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const checks: Array<{ re: RegExp; label: string; warn?: boolean }> = [
    { re: /\bchild_process\b/, label: 'child_process' },
    { re: /\bspawn\s*\(/, label: 'spawn()' },
    { re: /\bexec\s*\(/, label: 'exec()' },
    { re: /\bexecFile\s*\(/, label: 'execFile()' },
    { re: /\bfork\s*\(/, label: 'fork()' },
    { re: /\bwriteFile\s*\(/, label: 'fs.writeFile' },
    { re: /\bappendFile\s*\(/, label: 'fs.appendFile' },
    { re: /\brm\s*\(/, label: 'fs.rm' },
    { re: /\brmdir\s*\(/, label: 'fs.rmdir' },
    { re: /\bunlink\s*\(/, label: 'fs.unlink' },
    { re: /\brename\s*\(/, label: 'fs.rename' },
    { re: /\bchmod\s*\(/, label: 'fs.chmod' },
    { re: /\bchown\s*\(/, label: 'fs.chown' },
    { re: /\bcp\s*\(/, label: 'fs.cp' },
    { re: /\beval\s*\(/, label: 'eval()' },
    { re: /new\s+Function\b/, label: 'new Function' },
    { re: /\bvm\./, label: 'vm module' },
    { re: /\.\.\//, label: '../ path traversal' },
    { re: /\bprocess\.env\b/, label: 'process.env', warn: true },
    { re: /\b(?:from\s+['"]\w+['"]|require\(\s*['"]\w+['"]\s*\)|import\(\s*['"]\w+['"]\s*\))/, label: 'http/https/net module', warn: true },
  ];
  for (const c of checks) {
    if (c.re.test(src)) {
      if (c.warn) warnings.push(c.label);
      else blocking.push(c.label);
    }
  }
  return { blocking, warnings };
}

function ensureInsideBase(baseDir: string, target: string): boolean {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(target);
  return resolved === base || resolved.startsWith(base + path.sep);
}

function indentLines(s: string, spaces = 4): string {
  const pad = ' '.repeat(spaces);
  return s.split('\n').map(line => (line ? pad + line : line)).join('\n');
}

function textResponse(msg: string, isError = true): CallToolResult {
  return {
    content: [{ type: 'text', text: msg }],
    isError,
  };
}

async function updateDependencies(projectRoot: string, deps: StringMap | undefined) {
  if (!deps || Object.keys(deps).length === 0) return { updated: false, added: [] as string[] };
  const pkgPath = path.join(projectRoot, 'package.json');
  const raw = await fs.readFile(pkgPath, 'utf8');
  const pkg: PackageJson = JSON.parse(raw);
  pkg.dependencies ||= {};
  const added: string[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (!pkg.dependencies[name]) {
      pkg.dependencies[name] = version;
      added.push(`${name}@${version}`);
    }
  }
  if (added.length) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    return { updated: true, added };
  }
  return { updated: false, added: [] };
}

async function runBunInstall(projectRoot: string, timeoutMs: number) {
  return await new Promise<{ ok: boolean; code: number | null; signal?: string; reason?: string }>((resolve) => {
    const child = spawn('bun', ['install'], { cwd: projectRoot, stdio: 'inherit', env: process.env });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({ ok: false, code: null, reason: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, signal: signal ?? undefined });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, reason: 'Failed to start bun install' });
    });
  });
}

const tool = {
  name: 'create_mcp_tool',
  description: 'Create a new, tagged MCP plugin tool and optionally install dependencies; auto-refresh registry.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      base_name: { type: 'string', pattern: '^[a-z0-9_]+$' },
      description: { type: 'string' },
      input_schema: { type: 'object' },
      handler_code: { type: 'string' },
      template: { type: 'string', enum: ['echo', 'json_transform'] },
      required_packages: { type: 'object', additionalProperties: { type: 'string' } },
      allow_unsafe: { type: 'boolean', default: false },
      install_dependencies: { type: 'boolean', default: false },
    },
    required: ['base_name', 'description', 'input_schema'],
  },
  handler: async (args: ToolArguments, signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted');

    const baseNameValue = args['base_name'];
    const baseName = typeof baseNameValue === 'string' ? baseNameValue : '';
    const descriptionValue = args['description'];
    const inputSchemaValue = args['input_schema'];
    const handlerCode = typeof args['handler_code'] === 'string' ? args['handler_code'] : undefined;
    const template = typeof args['template'] === 'string' ? args['template'] : undefined;
    const requiredPackages = isRecordOfStrings(args['required_packages']) ? args['required_packages'] : undefined;
    const allowUnsafe = args['allow_unsafe'] === true;
    const installDeps = args['install_dependencies'] === true;

    if (!BASE_NAME_REGEX.test(baseName)) {
      return textResponse(`Invalid base_name. Must match ^[a-z0-9_]+$. Received: ${baseName}`);
    }
    if (baseName.startsWith('generated_')) {
      return textResponse("base_name must NOT include the 'generated_' prefix; it is added automatically.");
    }
    if (typeof descriptionValue !== 'string' || !descriptionValue.trim()) {
      return textResponse('description must be a non-empty string');
    }
    if (!isPlainObject(inputSchemaValue)) {
      return textResponse('input_schema must be a JSON object');
    }
    if (handlerCode && template) {
      return textResponse('Provide either handler_code or template, not both');
    }

    const desc = descriptionValue;
    const inputSchema = inputSchemaValue;

    const finalName = `generated_${baseName}`;
    const dirName = finalName;

    const projectRoot = process.cwd();
    const pluginsRoot = path.join(projectRoot, 'src', 'plugins');
    const pluginDir = path.join(pluginsRoot, dirName);
    const pluginFile = path.join(pluginDir, 'index.ts');

    if (!ensureInsideBase(pluginsRoot, pluginDir)) {
      return textResponse('Path safety check failed. Refusing to write outside src/plugins.');
    }

    try {
      await fs.access(pluginDir);
      return textResponse(`Blocked: directory already exists at ${pluginDir}`);
    } catch { /* directory doesn't exist, this is expected */ }

    try {
      const { toolRegistry } = await import('../../tools/registry.js');
      const existing = toolRegistry.getTool?.(finalName);
      if (existing) {
        return textResponse(`Blocked: a tool named '${finalName}' already exists in the registry.`);
      }
    } catch {
      // proceed; directory check above still protects from overwrite
    }

    if (handlerCode) {
      const { blocking, warnings } = detectDangerousPatterns(handlerCode);
      const anyIssues = blocking.length > 0 || warnings.length > 0;
      if (anyIssues && !allowUnsafe) {
        const issues = [
          blocking.length ? `Blocking patterns: ${blocking.join(', ')}` : '',
          warnings.length ? `Warnings: ${warnings.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        return textResponse(
          `Unsafe constructs detected in handler_code. Aborting creation.\n${issues}\n\n` +
          `If you intend to proceed, set allow_unsafe: true and try again.`
        );
      }
    }

    await fs.mkdir(pluginDir, { recursive: false }).catch(async (err) => {
      try { await fs.access(pluginDir); throw err; } catch { await fs.mkdir(pluginDir, { recursive: true }); }
    });

    let handlerBody = '';
    if (handlerCode) {
      handlerBody = handlerCode;
    } else if (template === 'json_transform') {
      handlerBody = `
const input = (args as any).input;
const select = String((args as any).select ?? '');
const parts = select ? select.split('.') : [];
let value: any = input;
for (const key of parts) {
  if (value != null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
    value = (value as any)[key];
  } else {
    value = undefined;
    break;
  }
}
return [{ type: 'text', text: JSON.stringify({ result: value }, null, 2) }];
      `.trim();
    } else {
      handlerBody = `
return [{ type: 'text', text: JSON.stringify({ args }, null, 2) }];
      `.trim();
    }

    const header = "// [generated-tool] This tool was generated by create_mcp_tool";
    const requiredPackagesExport = requiredPackages && Object.keys(requiredPackages).length
      ? `export const requiredPackages = ${JSON.stringify(requiredPackages, null, 2)};`
      : '';

    const generatedSource = `${header}

${requiredPackagesExport ? requiredPackagesExport + '\n' : ''}const tool = {
  name: ${JSON.stringify(finalName)},
  description: ${JSON.stringify(desc)},
  inputSchema: ${JSON.stringify(inputSchema, null, 2)},
  handler: async (args: Record<string, unknown>, signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted');
${indentLines(handlerBody, 4)}
  },
};

export default tool;
`;

    await fs.writeFile(pluginFile, '"use client";\n' + generatedSource, 'utf8');

    let depsUpdated = false;
    let depsAdded: string[] = [];
    if (requiredPackages && Object.keys(requiredPackages).length) {
      const res = await updateDependencies(projectRoot, requiredPackages);
      depsUpdated = res.updated;
      depsAdded = res.added;
    }

    let installAttempted = false;
    let installOk: boolean | null = null;
    let installNote: string | undefined = undefined;
    if (installDeps) {
      installAttempted = true;
      const result = await runBunInstall(projectRoot, 120000);
      installOk = result.ok;
      installNote = result.reason ? result.reason : result.ok ? 'Installed' : `Exit code ${result.code ?? 'unknown'}`;
    }

    let refreshOk = false;
    let refreshNote: string | undefined = undefined;
    try {
      const { toolRegistry } = await import('../../tools/registry.js');
      const refresh = toolRegistry.getTool?.('refresh_plugins');
      if (refresh?.handler) {
        const refreshArgs: ToolArguments = { plugin: finalName };
        await refresh.handler(refreshArgs, signal);
        refreshOk = true;
      } else {
        refreshNote = 'refresh_plugins tool not found';
      }
    } catch (e: unknown) {
      refreshNote = `Registry refresh failed: ${(e as Error).message || String(e)}`;
    }

    const riskNote = handlerCode ? (() => {
      const { blocking, warnings } = detectDangerousPatterns(handlerCode);
      if (blocking.length || warnings.length) {
        return `Unsafe constructs were${allowUnsafe ? '' : ' not'} allowed. Detected: ` +
               `${[blocking.length ? `blocking: ${blocking.join(', ')}` : '', warnings.length ? `warnings: ${warnings.join(', ')}` : ''].filter(Boolean).join(' | ')}`;
      }
      return '';
    })() : '';

    const summary = [
      `Created plugin: ${pluginFile}`,
      `Tool name: ${finalName}`,
      depsUpdated ? `Dependencies added: ${depsAdded.join(', ')}` : 'Dependencies: none added',
      installAttempted ? `bun install attempted -> ${installOk ? 'success' : 'failed'}${installNote ? ` (${installNote})` : ''}` : 'bun install: not attempted',
      refreshOk ? 'Registry refresh: success' : `Registry refresh: failed${refreshNote ? ` (${refreshNote})` : ''}`,
      riskNote,
      'Next steps:',
      '- bun lint',
      '- bun typecheck',
    ].filter(Boolean).join('\n');

    return textResponse(summary, false);
  },
};

export default tool;
