import { readdir, writeFile, mkdir, readFile } from 'fs/promises';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { join } from 'path';

interface PluginTool {
    name: string;
    description?: string;
    inputSchema: object;
    handler: (...args: unknown[]) => unknown;
}

interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}

async function findPluginDirs(root: string): Promise<string[]> {
    const pluginsRoot = join(root, 'src', 'plugins');
    try {
        const entries = await readdir(pluginsRoot, { withFileTypes: true });
        return entries
            .filter((e) => e.isDirectory())
            .map((d) => join(pluginsRoot, d.name));
    } catch {
        return [];
    }
}

async function loadPlugin(dir: string): Promise<{ tool?: PluginTool; requiredPackages?: Record<string, string> } | null> {
    try {
        const mod = await import(join(dir, 'index.ts'));
        return {
            tool: mod.default || mod.tool || Object.values(mod).find(v => 
                v && typeof v === 'object' && 'name' in v && 'handler' in v
            ),
            requiredPackages: mod.requiredPackages
        };
    } catch {
        return null;
    }
}

async function runBunInstall(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const process = spawn('bun', ['install'], { stdio: 'inherit' });
        process.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`bun install failed with code ${code}`));
            }
        });
        process.on('error', reject);
    });
}

async function promptUser(question: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(/^y(es)?$/i.test(answer.trim()));
        });
    });
}

async function updatePackageJson(packages: Record<string, string>): Promise<boolean> {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg: PackageJson = JSON.parse(await readFile(pkgPath, 'utf8'));
    
    pkg.dependencies = pkg.dependencies || {};
    
    const newPackages = Object.entries(packages).filter(
        ([name]) => !pkg.dependencies![name] && !pkg.devDependencies?.[name]
    );
    
    if (newPackages.length === 0) {
        console.log('No new packages to add.');
        return false;
    }
    
    console.log('Adding packages:');
    for (const [name, version] of newPackages) {
        console.log(`  - ${name}: ${version}`);
        pkg.dependencies[name] = version;
    }
    
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('package.json updated.');
    return true;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const autoYes = args.includes('--yes') || args.includes('-y');
    
    const pluginDirs = await findPluginDirs(process.cwd());
    
    if (pluginDirs.length === 0) {
        console.log('No plugins found.');
        return;
    }
    
    const manifest: Array<{ name: string; description: string }> = [];
    const allPackages: Record<string, string> = {};
    
    for (const dir of pluginDirs) {
        const plugin = await loadPlugin(dir);
        
        if (plugin?.tool) {
            manifest.push({
                name: plugin.tool.name,
                description: plugin.tool.description || ''
            });
            
            if (plugin.requiredPackages) {
                Object.assign(allPackages, plugin.requiredPackages);
            }
        }
    }
    
    console.log(`Loaded ${manifest.length} plugin(s).`);
    
    const outDir = join(process.cwd(), 'out');
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'plugins-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    
    if (Object.keys(allPackages).length === 0) {
        return;
    }
    
    const updated = await updatePackageJson(allPackages);
    
    if (updated) {
        if (autoYes || (!process.stdin.isTTY || await promptUser('Run bun install? [y/N] '))) {
            await runBunInstall();
            console.log('Done.');
        }
    }
}

main().catch((err) => {
    console.error('Plugin installation failed:', err);
    process.exit(1);
});
