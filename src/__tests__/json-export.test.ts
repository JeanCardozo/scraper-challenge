/**
 * Unit tests for JSON Lines export — writeJsonLines().
 *
 * Covers: record count, empty array, field filtering, and append mode.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonLines } from '../export/json.js';

describe('JSON Lines export', () => {
  it('writes 3 records as 3 valid JSON lines', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'json-test-'));
    const filePath = join(tmpDir, 'output.jsonl');

    await writeJsonLines([
      { _section: 'tfa', _uuid: null, nro: '1', expediente: 'EXP-001' },
      { _section: 'tfa', _uuid: null, nro: '2', expediente: 'EXP-002' },
      { _section: 'tfa', _uuid: null, nro: '3', expediente: 'EXP-003' },
    ], filePath);

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);

    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Verify content of each line
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0]!.nro).toBe('1');
    expect(parsed[1]!.nro).toBe('2');
    expect(parsed[2]!.nro).toBe('3');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('creates empty file for empty array', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'json-test-'));
    const filePath = join(tmpDir, 'empty.jsonl');

    await writeJsonLines([], filePath);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe('');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('writes only specified fields when fieldFilter is provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'json-test-'));
    const filePath = join(tmpDir, 'filtered.jsonl');

    await writeJsonLines([
      { _section: 'tfa', _uuid: null, nro: '1', expediente: 'EXP-001', administrado: 'Admin', sector: 'Minería' },
    ], filePath, { fieldFilter: ['nro', 'expediente'] });

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(Object.keys(parsed)).toHaveLength(2);
    expect(parsed).toHaveProperty('nro', '1');
    expect(parsed).toHaveProperty('expediente', 'EXP-001');
    expect(parsed).not.toHaveProperty('administrado');
    expect(parsed).not.toHaveProperty('sector');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('appends new data without corrupting existing content', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'json-test-'));
    const filePath = join(tmpDir, 'append.jsonl');

    // Write first batch
    await writeJsonLines([
      { _section: 'tfa', _uuid: null, nro: '1' },
    ], filePath);

    // Append second batch
    await writeJsonLines([
      { _section: 'tfa', _uuid: null, nro: '2' },
    ], filePath, { append: true });

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    // Both lines should be valid JSON
    const first = JSON.parse(lines[0]!);
    const second = JSON.parse(lines[1]!);
    expect(first.nro).toBe('1');
    expect(second.nro).toBe('2');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });
});
