const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const signerPath = path.join(__dirname, 'signer.js');
const signerSource = fs.readFileSync(signerPath, 'utf8');
const signerModule = new Module(signerPath, module);

signerModule.filename = signerPath;
signerModule.paths = Module._nodeModulePaths(__dirname);
signerModule._compile(signerSource, signerPath);

module.exports = signerModule.exports;
