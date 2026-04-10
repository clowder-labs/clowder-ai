import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app layout metadata', () => {
  it('uses the lobster icon for the page title/favicon metadata', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

    expect(source).toContain("icon: '/images/lobster.svg'");
  });
});
