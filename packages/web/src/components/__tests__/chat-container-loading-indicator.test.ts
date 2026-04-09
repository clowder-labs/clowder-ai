import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/ChatContainer.tsx'), 'utf8');

describe('ChatContainer loading indicator', () => {
  it('uses the chart loading asset with infinite spin animation', () => {
    expect(source).toContain('/icons/chart/loading.svg');
    expect(source).toMatch(/className="[^"]*h-8[^"]*w-8[^"]*animate-spin[^"]*"/);
  });
});
