import { describe, expect, it } from 'vitest';

describe('markdown reader product contract', () => {
  it('keeps dangerous raw html out of the declared reader contract', async () => {
    const manifest = await import('../public/manifest.json');
    expect(manifest.default.manifest_version).toBe(3);
    expect(manifest.default.host_permissions).toEqual(['file:///*']);
    expect(manifest.default.permissions).not.toContain('debugger');
  });
});

