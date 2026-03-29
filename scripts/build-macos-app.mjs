#!/usr/bin/env node

import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

const APP_DISPLAY_NAME = 'Clowder AI';
const APP_EXECUTABLE_NAME = 'ClowderAI';
const APP_BUNDLE_ID = 'ai.clowder.desktop';

function parseArgs(argv) {
  const options = {
    outputDir: resolve(repoRoot, 'dist', 'macos'),
    appName: APP_DISPLAY_NAME,
    bundleId: APP_BUNDLE_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    switch (arg) {
      case '--output-dir':
        options.outputDir = resolve(repoRoot, value ?? '');
        index += 1;
        break;
      case '--app-name':
        options.appName = value ?? options.appName;
        index += 1;
        break;
      case '--bundle-id':
        options.bundleId = value ?? options.bundleId;
        index += 1;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          `Usage: node scripts/build-macos-app.mjs [options]\n\nOptions:\n  --output-dir <path>  Override dist/macos output root\n  --app-name <name>    Override app display name\n  --bundle-id <id>     Override CFBundleIdentifier\n`,
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function logStep(message) {
  process.stdout.write(`\n[macos-app] ${message}\n`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function fillInfoPlist(templatePath, options) {
  const template = readFileSync(templatePath, 'utf8');
  return template
    .replaceAll('__APP_DISPLAY_NAME__', options.appName)
    .replaceAll('__APP_EXECUTABLE_NAME__', APP_EXECUTABLE_NAME)
    .replaceAll('__APP_BUNDLE_ID__', options.bundleId)
    .replaceAll('__APP_VERSION__', rootPackageJson.version);
}

function copyExecutable(sourcePath, destinationPath) {
  cpSync(sourcePath, destinationPath, { force: true });
  chmodSync(destinationPath, 0o755);
}

function writeRuntimeReleaseMetadata(runtimeRoot, options) {
  const metadata = {
    name: options.appName,
    version: rootPackageJson.version,
    generatedAt: new Date().toISOString(),
    platform: 'darwin',
    executableName: APP_EXECUTABLE_NAME,
    bundleId: options.bundleId,
    scaffold: true,
    managedTopLevelPaths: ['scripts', 'node', 'packages', 'assets', '.clowder-release.json', 'package.json'],
  };
  writeFileSync(join(runtimeRoot, '.clowder-release.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function writeRuntimePackageJson(runtimeRoot) {
  const runtimePackageJson = {
    name: 'clowder-ai-runtime',
    version: rootPackageJson.version,
    private: true,
  };
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify(runtimePackageJson, null, 2)}\n`, 'utf8');
}

function copyIfPresent(sourcePath, destinationPath) {
  if (!existsSync(sourcePath)) {
    return;
  }
  ensureDir(dirname(destinationPath));
  cpSync(sourcePath, destinationPath, { recursive: true, force: true });
}

function buildAppSkeleton(options) {
  const outputDir = options.outputDir;
  const appRoot = join(outputDir, `${options.appName}.app`);
  const contentsDir = join(appRoot, 'Contents');
  const macOsDir = join(contentsDir, 'MacOS');
  const resourcesDir = join(contentsDir, 'Resources');
  const runtimeRoot = join(resourcesDir, 'runtime');
  const runtimeScriptsDir = join(runtimeRoot, 'scripts');
  const runtimeNodeDir = join(runtimeRoot, 'node');
  const runtimePackagesDir = join(runtimeRoot, 'packages');
  const runtimeAssetsDir = join(runtimeRoot, 'assets');

  logStep('Preparing app output directories');
  ensureDir(outputDir);
  resetDir(appRoot);
  ensureDir(macOsDir);
  ensureDir(resourcesDir);
  ensureDir(runtimeScriptsDir);
  ensureDir(runtimeNodeDir);
  ensureDir(runtimePackagesDir);
  ensureDir(runtimeAssetsDir);
  ensureDir(join(runtimePackagesDir, 'api'));
  ensureDir(join(runtimePackagesDir, 'web'));
  ensureDir(join(runtimePackagesDir, 'mcp-server'));
  ensureDir(join(runtimePackagesDir, 'shared'));

  logStep('Writing Info.plist');
  const infoPlist = fillInfoPlist(join(repoRoot, 'packaging', 'macos', 'Info.plist'), options);
  writeFileSync(join(contentsDir, 'Info.plist'), infoPlist, 'utf8');

  logStep('Installing launcher scaffold');
  copyExecutable(join(repoRoot, 'packaging', 'macos', 'launcher-stub.sh'), join(macOsDir, APP_EXECUTABLE_NAME));

  logStep('Staging runtime scripts');
  copyExecutable(join(repoRoot, 'scripts', 'start-macos-bundle.sh'), join(runtimeScriptsDir, 'start-macos-bundle.sh'));
  copyExecutable(join(repoRoot, 'scripts', 'stop-macos-bundle.sh'), join(runtimeScriptsDir, 'stop-macos-bundle.sh'));
  copyExecutable(
    join(repoRoot, 'scripts', 'write-runtime-state.mjs'),
    join(runtimeScriptsDir, 'write-runtime-state.mjs'),
  );

  logStep('Writing scaffold runtime metadata');
  writeRuntimePackageJson(runtimeRoot);
  writeRuntimeReleaseMetadata(runtimeRoot, options);

  logStep('Copying placeholder assets when available');
  copyIfPresent(join(repoRoot, 'packaging', 'windows', 'desktop', 'splash.jpg'), join(runtimeAssetsDir, 'splash.jpg'));

  logStep(`macOS app scaffold ready at ${appRoot}`);
  return { appRoot, runtimeRoot };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== 'darwin') {
    throw new Error('macOS app packaging scaffold must run on darwin');
  }
  buildAppSkeleton(options);
}

main();
