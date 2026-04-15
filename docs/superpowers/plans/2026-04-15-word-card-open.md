# Word Card Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Word document attachment cards to CLI output so generated `.docx` artifacts render like PPT cards and can be opened on both Windows and macOS through the existing local-open API.

**Architecture:** Extend the existing local generated file extraction flow in `CliOutputBlock` to recognize Word artifacts, keep path resolution shared across file types, and reuse the same attachment card/open-local flow with Word-specific UI identifiers and iconography. Verify behavior with focused component tests that cover absolute and relative paths on Windows and POSIX-style paths.

**Tech Stack:** React, TypeScript, Vitest, existing `apiFetch` workspace APIs

---

### Task 1: Add failing tests for Word attachment cards

**Files:**
- Modify: `packages/web/src/components/__tests__/cli-output-block.test.ts`

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders a word attachment card from an absolute generated file path and opens that file', async () => {
  // Expect cli-output-word-card and cli-output-word-open to appear for a .docx path
});

it('joins a relative word path with a POSIX project path before open-local', async () => {
  // Expect /Users/.../workspace/output/report.docx to be sent to local-file-meta/open-local
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/__tests__/cli-output-block.test.ts --testNamePattern "word"`
Expected: FAIL because Word cards are not recognized/rendered yet.

### Task 2: Implement Word file extraction and card rendering

**Files:**
- Modify: `packages/web/src/components/cli-output/CliOutputBlock.tsx`

- [ ] **Step 1: Extend file-kind detection**

```ts
type LocalGeneratedFileKind = 'ppt' | 'markdown' | 'word';
```

- [ ] **Step 2: Add Word path extraction and shared helpers**

```ts
const WORD_PATH_PATTERNS = [/* .docx absolute path patterns */];
const RELATIVE_WORD_PATH_TOKENS = /[^\s"'`<>]+\.(?:docx|doc)\b/gi;
```

- [ ] **Step 3: Reuse the existing open-local card flow for Word**

```tsx
const isWord = file.kind === 'word';
data-testid={isWord ? 'cli-output-word-card' : ...}
```

- [ ] **Step 4: Prefer markdown, then word, then ppt when selecting a local artifact**

```ts
const localGeneratedFile = useMemo(
  () => extractLocalMarkdownFile(events) ?? extractLocalWordFile(events) ?? extractLocalPresentationFile(events),
  [events],
);
```

### Task 3: Verify targeted behavior

**Files:**
- Test: `packages/web/src/components/__tests__/cli-output-block.test.ts`

- [ ] **Step 1: Run the focused test file**

Run: `pnpm --filter web exec vitest run src/components/__tests__/cli-output-block.test.ts`
Expected: PASS

- [ ] **Step 2: Spot-check no regression in existing card flow**

Run: `pnpm --filter web exec vitest run src/components/__tests__/cli-output-block.test.ts --testNamePattern "ppt|markdown|word"`
Expected: PASS
