#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HOTFIX_PATTERNS = [
  { term: 'hotfix', regex: /\bhot[-\s]?fix\b/i },
  { term: 'quick fix', regex: /\bquick\s+fix\b/i },
  { term: 'minimal fix', regex: /\bminimal\s+fix\b/i },
  { term: 'band-aid', regex: /\bband[-\s]?aid\b/i },
  { term: 'temp', regex: /^temp(?:\([^)]+\))?!?(?=$|[\s:])/i },
  {
    term: 'temporary',
    regex:
      /\btemp(?:orary)?\s+(?:fix|patch|workaround|mitigation|band[-\s]?aid|disable|bypass|skip)\b|\b(?:fix|patch|workaround|mitigation|band[-\s]?aid)\s+(?:is\s+)?temp(?:orary)?\b/i,
  },
  { term: 'workaround', regex: /\bworkaround\b/i },
  { term: 'fix', regex: /^(?:fix|bugfix)(?:\([^)]+\))?!?(?=$|[\s:])/i },
];

const DETECTOR_REFERENCE_REGEX = /\b(?:hot[-\s]?fix\s+detector|check-hotfix-pattern)\b/i;
const DETECTOR_REFERENCE_GLOBAL_REGEX = /\bhot[-\s]?fix\s+detector\b|\bcheck-hotfix-pattern\b/gi;
const DETECTOR_OUTPUT_PREFIX_REGEX =
  /(?:\b(?:hot[-\s]?fix\s+detector|check-hotfix-pattern)\b\s*(?::\s*)?(?:(?:`[^`\r\n]*`|[^`\r\n]*\bcheck-hotfix-pattern\b[^`\r\n]*?)\s*)?|`[^`\r\n]*\bcheck-hotfix-pattern\b[^`\r\n]*`\s*)(?:\b(?:returned|reported|outputs?|printed|emitted)\b\s*:?\s*|=>\s*)/gi;

export function detectHotfixSignals(pr) {
  const matches = [];
  for (const candidate of collectCandidates(pr)) {
    const textForMatch = candidate.textForMatch ?? stripDetectorSelfReferenceTokens(candidate.text);
    for (const pattern of HOTFIX_PATTERNS) {
      if (pattern.regex.test(textForMatch)) {
        matches.push({
          source: candidate.source,
          term: pattern.term,
          text: candidate.text,
        });
      }
    }
  }
  return { hotfix: matches.length > 0, matches };
}

function collectCandidates(pr) {
  const candidates = [];
  if (typeof pr?.title === 'string' && pr.title.trim()) {
    candidates.push({ source: 'title', text: pr.title.trim() });
  }

  const commits = Array.isArray(pr?.commits) ? pr.commits : [];
  for (const commit of commits) {
    for (const part of [
      commit?.messageHeadline,
      commit?.messageBody,
      commit?.message,
      commit?.headline,
      commit?.body,
    ]) {
      if (typeof part !== 'string') continue;
      collectCommitPartCandidates(candidates, part);
    }
  }

  return candidates;
}

function collectCommitPartCandidates(candidates, part) {
  const outputRanges = findDetectorOutputRanges(part);
  for (const line of splitLinesWithOffsets(part)) {
    const text = line.text.trim();
    if (!text) continue;

    const lineForMatch = removeRangesFromSlice(part, line.start, line.end, outputRanges);
    candidates.push({
      source: 'commit',
      text,
      textForMatch: stripDetectorLineTokens(lineForMatch).trim(),
    });
  }
}

function stripDetectorSelfReferenceTokens(text) {
  if (!DETECTOR_REFERENCE_REGEX.test(text)) return text;
  return stripDetectorLineTokens(removeRangesFromText(text, findDetectorOutputRanges(text)));
}

function stripDetectorLineTokens(text) {
  if (!DETECTOR_REFERENCE_REGEX.test(text)) return text;
  return text.replace(DETECTOR_REFERENCE_GLOBAL_REGEX, 'detector');
}

function findDetectorOutputRanges(text) {
  const ranges = [];
  DETECTOR_OUTPUT_PREFIX_REGEX.lastIndex = 0;

  for (;;) {
    const match = DETECTOR_OUTPUT_PREFIX_REGEX.exec(text);
    if (!match) break;

    const outputStart = DETECTOR_OUTPUT_PREFIX_REGEX.lastIndex;
    const outputEnd = findDetectorOutputEnd(text, outputStart);
    if (outputEnd <= outputStart) {
      DETECTOR_OUTPUT_PREFIX_REGEX.lastIndex = outputStart + 1;
      continue;
    }

    ranges.push([match.index, outputEnd]);
    DETECTOR_OUTPUT_PREFIX_REGEX.lastIndex = outputEnd;
  }

  return mergeRanges(ranges);
}

function findDetectorOutputEnd(text, outputStart) {
  const trimmedStart = skipWhitespaceAndBackticks(text, outputStart);
  if (text[trimmedStart] === '{') {
    const objectEnd = findBalancedObjectEnd(text, trimmedStart);
    if (objectEnd === -1) return outputStart;
    return text[objectEnd + 1] === '`' ? objectEnd + 2 : objectEnd + 1;
  }

  const booleanMatch = /^(?:\\?["']hot[-\s]?fix\\?["']|\bhot[-\s]?fix\b)\s*[:=]\s*(?:true|false)\b`?/i.exec(
    text.slice(trimmedStart),
  );
  if (booleanMatch) return trimmedStart + booleanMatch[0].length;

  return outputStart;
}

function skipWhitespaceAndBackticks(text, start) {
  let index = start;
  while (index < text.length && /[\s`]/.test(text[index])) index += 1;
  return index;
}

function findBalancedObjectEnd(text, objectStart) {
  let depth = 0;
  let inString = false;
  let escapedQuoteString = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escapedQuoteString && isEscapedJsonSyntaxQuote(text, index)) {
        inString = false;
        escapedQuoteString = false;
        continue;
      }
      if (!escapedQuoteString && isUnescapedJsonQuote(text, index)) {
        inString = false;
      }
      continue;
    }

    if (isEscapedJsonSyntaxQuote(text, index)) {
      inString = true;
      escapedQuoteString = true;
      continue;
    }
    if (isUnescapedJsonQuote(text, index)) {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function isEscapedJsonSyntaxQuote(text, index) {
  return text[index] === '"' && countBackslashesBefore(text, index) % 2 === 1;
}

function isUnescapedJsonQuote(text, index) {
  return text[index] === '"' && countBackslashesBefore(text, index) % 2 === 0;
}

function countBackslashesBefore(text, index) {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    count += 1;
  }
  return count;
}

function splitLinesWithOffsets(text) {
  const lines = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index !== text.length && text[index] !== '\n') continue;

    const end = index > start && text[index - 1] === '\r' ? index - 1 : index;
    lines.push({ start, end, text: text.slice(start, end) });
    start = index + 1;
  }
  return lines;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
      continue;
    }
    merged.push([start, end]);
  }
  return merged;
}

function removeRangesFromText(text, ranges) {
  return removeRangesFromSlice(text, 0, text.length, ranges);
}

function removeRangesFromSlice(text, sliceStart, sliceEnd, ranges) {
  if (ranges.length === 0) return text.slice(sliceStart, sliceEnd);

  let result = '';
  let cursor = sliceStart;
  for (const [rangeStart, rangeEnd] of ranges) {
    if (rangeEnd <= sliceStart) continue;
    if (rangeStart >= sliceEnd) break;

    const overlapStart = Math.max(rangeStart, sliceStart);
    const overlapEnd = Math.min(rangeEnd, sliceEnd);
    result += text.slice(cursor, overlapStart);
    cursor = overlapEnd;
  }

  return result + text.slice(cursor, sliceEnd);
}

function parseArgs(argv) {
  const args = {
    applyLabelPrNumber: null,
    inputJsonPath: null,
    prNumber: process.env.PR_NUMBER || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply-label') {
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        args.applyLabelPrNumber = next;
        index += 1;
      } else {
        args.applyLabelPrNumber = args.prNumber;
      }
      continue;
    }
    if (arg === '--input-json') {
      args.inputJsonPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!arg.startsWith('--') && !args.prNumber) {
      args.prNumber = arg;
    }
  }

  return args;
}

async function loadPrInput(args) {
  if (args.inputJsonPath) {
    return JSON.parse(await readFile(args.inputJsonPath, 'utf8'));
  }
  if (!args.prNumber) {
    throw new Error('Missing PR number. Set PR_NUMBER, pass a PR number, or use --input-json.');
  }

  const [titleResult, repoResult] = await Promise.all([
    execFileAsync('gh', ['pr', 'view', String(args.prNumber), '--json', 'title', '--jq', '.title']),
    execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']),
  ]);
  const repoFullName = repoResult.stdout.trim();
  if (!repoFullName) throw new Error('Unable to resolve repository nameWithOwner.');

  const [{ stdout: commitsJsonLines }, { stdout: filesJsonLines }] = await Promise.all([
    execFileAsync('gh', [
      'api',
      '--paginate',
      `repos/${repoFullName}/pulls/${args.prNumber}/commits`,
      '--jq',
      '.[] | {message: .commit.message}',
    ]),
    execFileAsync('gh', [
      'api',
      '--paginate',
      `repos/${repoFullName}/pulls/${args.prNumber}/files`,
      '--jq',
      '.[] | {filename, additions, deletions, changes}',
    ]),
  ]);

  return {
    title: titleResult.stdout.trim(),
    commits: parseJsonLines(commitsJsonLines),
    files: parseJsonLines(filesJsonLines),
  };
}

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function applyHotfixLabel(prNumber) {
  if (!prNumber) return 'Cannot apply label: missing PR number';
  try {
    await execFileAsync('gh', ['pr', 'edit', String(prNumber), '--add-label', 'hotfix']);
    return null;
  } catch (error) {
    return cleanError(error);
  }
}

function getAutoLabelEligibility(pr) {
  if (!Array.isArray(pr?.files)) {
    return { eligible: false, reason: 'missing changed-file stats' };
  }
  if (pr.files.length !== 1) {
    return { eligible: false, reason: `changed file count ${pr.files.length} is not 1` };
  }

  const changedLines = getChangedLineCount(pr.files[0]);
  if (!Number.isFinite(changedLines)) {
    return { eligible: false, reason: 'missing changed-line count' };
  }
  if (changedLines > 50) {
    return { eligible: false, reason: `changed lines ${changedLines} exceeds 50` };
  }
  return { eligible: true };
}

function getChangedLineCount(file) {
  const changes = Number(file?.changes);
  if (Number.isFinite(changes)) return changes;

  const additions = Number(file?.additions);
  const deletions = Number(file?.deletions);
  if (Number.isFinite(additions) && Number.isFinite(deletions)) return additions + deletions;
  return Number.NaN;
}

function buildOutput(result, extras = {}) {
  const matchedTerms = [...new Set(result.matches.map((match) => match.term))];
  return {
    hotfix: result.hotfix,
    matchedTerms,
    matches: result.matches,
    ...extras,
  };
}

function cleanError(error) {
  const text = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join('\n');
  return text.trim().replace(/\s+/g, ' ').slice(0, 500) || 'Unknown error';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    const pr = await loadPrInput(args);
    const result = detectHotfixSignals(pr);
    const extras = {};
    if (result.hotfix && args.applyLabelPrNumber) {
      const labelEligibility = getAutoLabelEligibility(pr);
      if (!labelEligibility.eligible) {
        extras.labelSkippedReason = labelEligibility.reason;
      } else {
        const labelError = await applyHotfixLabel(args.applyLabelPrNumber);
        if (labelError) extras.labelError = labelError;
        else extras.labelApplied = true;
      }
    }
    console.log(JSON.stringify(buildOutput(result, extras)));
  } catch (error) {
    process.exitCode = 1;
    console.log(
      JSON.stringify(
        buildOutput({ hotfix: true, matches: [] }, { detectionError: cleanError(error), failClosed: true }),
      ),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
