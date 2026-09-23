import { spawn } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import * as readline from 'node:readline';

interface PluginMetadata {
  name: string;
  description: string;
  tools: Array<{ name: string; description: string }>;
  requiredPackages: Record<string, string>;
}

interface PluginChoice extends PluginMetadata {
  selected: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const root = process.cwd();

async function readMetadata(dir: string): Promise<PluginMetadata> {
  const metadataPath = join(dir, 'plugin.json');
  try {
    const value = JSON.parse(
      await readFile(metadataPath, 'utf8'),
    ) as Partial<PluginMetadata>;
    if (!value.name || !value.description || !Array.isArray(value.tools)) {
      throw new Error('name, description, and tools are required');
    }
    return {
      name: value.name,
      description: value.description,
      tools: value.tools,
      requiredPackages: value.requiredPackages ?? {},
    };
  } catch (error) {
    throw new Error(
      `Invalid ${metadataPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function discoverPlugins(): Promise<PluginMetadata[]> {
  const pluginsRoot = join(root, 'src', 'plugins');
  const entries = await readdir(pluginsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const plugins: PluginMetadata[] = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const dir = join(pluginsRoot, entry.name);
    try {
      const metadata = await readMetadata(dir);
      if (metadata.name !== basename(dir)) {
        throw new Error(
          `plugin name must match directory name "${basename(dir)}"`,
        );
      }
      plugins.push(metadata);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

function printPlugins(plugins: PluginMetadata[]): void {
  if (!plugins.length) {
    console.log('No plugins found.');
    return;
  }
  for (const [index, plugin] of plugins.entries()) {
    const packages = Object.keys(plugin.requiredPackages);
    console.log(`${index + 1}. ${plugin.name} - ${plugin.description}`);
    console.log(
      `   tools: ${plugin.tools.map((tool) => tool.name).join(', ')}`,
    );
    console.log(`   dependencies: ${packages.join(', ') || 'none'}`);
  }
}

async function prompt(question: string): Promise<string> {
  return await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function choosePlugins(
  plugins: PluginMetadata[],
): Promise<PluginChoice[]> {
  printPlugins(plugins);
  console.log('\nEnter plugin numbers separated by spaces, "all", or "none".');
  const answer = (await prompt('Selection: ')).toLowerCase();
  if (answer === 'all')
    return plugins.map((plugin) => ({ ...plugin, selected: true }));
  if (!answer || answer === 'none')
    return plugins.map((plugin) => ({ ...plugin, selected: false }));
  const selected = new Set(
    answer
      .split(/\s+/)
      .map(Number)
      .filter(
        (number) =>
          Number.isInteger(number) && number > 0 && number <= plugins.length,
      ),
  );
  return plugins.map((plugin, index) => ({
    ...plugin,
    selected: selected.has(index + 1),
  }));
}

async function updatePackageJson(
  packages: Record<string, string>,
): Promise<boolean> {
  const packagePath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as PackageJson;
  pkg.dependencies ??= {};
  const additions = Object.entries(packages).filter(
    ([name]) => !pkg.dependencies?.[name] && !pkg.devDependencies?.[name],
  );
  for (const [name, version] of additions) pkg.dependencies[name] = version;
  if (additions.length) {
    await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(
      `Added dependencies: ${additions.map(([name]) => name).join(', ')}`,
    );
  }
  return additions.length > 0;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`${command} ${args.join(' ')} exited with code ${code}`),
          ),
    );
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const plugins = await discoverPlugins();
  if (process.exitCode)
    throw new Error('Fix invalid plugin metadata before continuing.');
  if (args.includes('--list') || args.includes('-l')) {
    printPlugins(plugins);
    return;
  }

  const requested = args
    .flatMap((arg, index) =>
      arg === '--plugin' || arg === '-p' ? [args[index + 1]] : [],
    )
    .filter(Boolean);
  const unknown = requested.filter(
    (name) => !plugins.some((plugin) => plugin.name === name),
  );
  if (unknown.length)
    throw new Error(`Unknown plugin(s): ${unknown.join(', ')}`);

  let choices: PluginChoice[];
  if (
    args.includes('--all') ||
    args.includes('-a') ||
    (!process.stdin.isTTY && !requested.length)
  ) {
    choices = plugins.map((plugin) => ({ ...plugin, selected: true }));
  } else if (requested.length) {
    choices = plugins.map((plugin) => ({
      ...plugin,
      selected: requested.includes(plugin.name),
    }));
  } else {
    choices = await choosePlugins(plugins);
  }

  const selected = choices.filter((plugin) => plugin.selected);
  const outDir = join(root, 'out');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'plugins-manifest.json'),
    `${JSON.stringify({ version: 1, plugins: selected.map(({ selected: _selected, ...plugin }) => plugin) }, null, 2)}\n`,
  );
  console.log(
    `Enabled ${selected.length} plugin(s): ${selected.map((plugin) => plugin.name).join(', ') || 'none'}`,
  );

  const dependencies = Object.assign(
    {},
    ...selected.map((plugin) => plugin.requiredPackages),
  );
  const changed = await updatePackageJson(dependencies);
  const skipInstall = args.includes('--no-install');
  const confirmed =
    args.includes('--yes') || args.includes('-y') || !process.stdin.isTTY;
  if (
    !skipInstall &&
    (changed || Object.keys(dependencies).length) &&
    (confirmed || /^y(es)?$/i.test(await prompt('Run bun install? [y/N] ')))
  ) {
    await run('bun', ['install']);
  }
}

main().catch((error) => {
  console.error(
    `Plugin installation failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
