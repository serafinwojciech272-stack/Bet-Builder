import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Core Engine central AI contract', () => {
  it('keeps direct OpenRouter credentials out of the Bet Builder reasoning adapter', () => {
    const source = readFileSync(new URL('../api/decision-reasoning.ts', import.meta.url), 'utf8');
    expect(source).toContain('/api/integrations');
    expect(source).toContain("x-core-engine-client");
    expect(source).not.toContain('OPENROUTER_API_KEY');
  });
});
