import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = 'D:/work/relay-claw_123';
const wheelhousePath = join(repoRoot, 'packaging', 'windows', 'python-runtime-wheelhouse.json');
const buildScriptPath = join(repoRoot, 'scripts', 'build-windows-installer.mjs');
function readText(path) {
  return readFileSync(path, 'utf8');
}

const wheelhouse = JSON.parse(readText(wheelhousePath));
const wheelhousePackages = new Set(wheelhouse.groups.flatMap((group) => group.packages ?? []));
const buildScript = readText(buildScriptPath);

test('office skills Python runtime dependencies are explicitly bundled', () => {
  for (const pkg of ['python-docx', 'pypdf', 'pdfplumber', 'pandas', 'reportlab', 'openpyxl', 'xlsxwriter']) {
    assert.equal(wheelhousePackages.has(pkg), true, `wheelhouse missing ${pkg}`);
    assert.match(buildScript, new RegExp(`['"]${pkg.replace('.', '\\.')}['"]`), `build script missing ${pkg}`);
  }
});

test('pptx-craft skill dependencies are installed during Windows bundle staging', () => {
  assert.match(
    buildScript,
    /function installBundledOfficeSkillDependencies\(bundleDir, windowsNode\)/,
    'missing office skill dependency installer',
  );
  assert.match(
    buildScript,
    /join\(bundleDir, 'office-claw-skills', 'pptx-craft'\)/,
    'pptx-craft install target not found',
  );
  assert.match(
    buildScript,
    /runWindowsNpmInstall\(windowsNode\.npmCmdPath, toWindowsPath\(pptxCraftDir\)\)/,
    'pptx-craft npm install not wired into bundle build',
  );
  assert.match(
    buildScript,
    /installBundledOfficeSkillDependencies\(bundleDir, windowsNode\);/,
    'pptx-craft install step not invoked',
  );
});
