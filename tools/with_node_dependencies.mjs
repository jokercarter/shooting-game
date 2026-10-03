import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, copyFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = join(homedir(), '.codex', 'workspace-deps', 'SWE-AI');
const externalModules = join(runtimeRoot, 'node_modules');
const localModules = join(workspaceRoot, 'node_modules');
const task = process.argv[2];
const taskArgs = process.argv.slice(3);

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runNpm(args) {
  const result = spawnSync('npm', args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function ensureExternalDependencies() {
  if (!existsSync(externalModules)) {
    throw new Error(`External Node dependencies not found at ${externalModules}. Run npm run install:dependencies.`);
  }
  if (existsSync(localModules)) {
    const localReal = realpathSync(localModules);
    const externalReal = realpathSync(externalModules);
    if (localReal === externalReal) return true;
    return false;
  }

  mkdirSync(workspaceRoot, { recursive: true });
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const command = `New-Item -ItemType Junction -Path ${quote(localModules)} -Target ${quote(externalModules)} -ErrorAction Stop | Out-Null`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not create the temporary Node dependency junction.');
  return true;
}

function removeTemporaryJunction() {
  const python = join(runtimeRoot, 'venv', 'Scripts', 'python.exe');
  const result = spawnSync(python, ['-c', 'import os,sys; os.rmdir(sys.argv[1])', localModules], {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Could not remove the temporary Node dependency junction.');
}

function installExternalDependencies() {
  mkdirSync(runtimeRoot, { recursive: true });
  const manifestFiles = ['package.json', 'package-lock.json'];
  const created = [];
  try {
    for (const name of manifestFiles) {
      const source = join(workspaceRoot, name);
      const target = join(runtimeRoot, name);
      if (!existsSync(source)) throw new Error(`Missing ${name} in the workspace.`);
      if (existsSync(target)) throw new Error(`Won't overwrite external ${name}: ${target}`);
      copyFileSync(source, target);
      created.push(target);
    }
    return runNpm(['ci', '--prefix', runtimeRoot]);
  } finally {
    for (const path of created) if (existsSync(path)) unlinkSync(path);
  }
}

if (task === 'install') {
  process.exitCode = installExternalDependencies();
} else {
  let temporaryJunction = false;
  try {
    temporaryJunction = ensureExternalDependencies();
    let status = 1;
    if (task === 'build') {
      status = runNode([join(workspaceRoot, 'build.mjs')]);
      if (status === 0) status = runNode([join(externalModules, 'vite', 'bin', 'vite.js'), 'build']);
    } else if (task === 'typecheck') {
      status = runNode([join(externalModules, 'typescript', 'bin', 'tsc'), '--noEmit']);
    } else if (task === 'browser-test') {
      status = runNode([join(externalModules, '@playwright', 'test', 'cli.js'), 'test', ...taskArgs]);
    } else {
      throw new Error(`Unknown Node task: ${task || '(missing)'}`);
    }
    process.exitCode = status;
  } finally {
    if (temporaryJunction) removeTemporaryJunction();
  }
}
