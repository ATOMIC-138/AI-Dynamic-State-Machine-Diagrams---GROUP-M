import { describe, expect, it } from 'vitest';
import { trackLatestRequest } from '../../src/editor/session';

describe('open requests', () => {
  it('keeps only the newest request current, whichever read finishes first', () => {
    const start = trackLatestRequest();
    const first = start();
    expect(first()).toBe(true);
    const second = start();
    expect(second()).toBe(true);
    // The older file finishing afterwards must still be ignored.
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
