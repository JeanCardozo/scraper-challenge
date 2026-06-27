/**
 * 7.5 CSV quoting test.
 *
 * Verifies RFC 4180 quoting rules:
 * - Fields containing commas are quoted
 * - Double quotes within fields are escaped by doubling
 * - Fields without special characters are not quoted
 */

import { describe, it, expect } from 'vitest';
import { writeCsv } from '../export/csv.js';
import { readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CSV quoting', () => {
  it('quotes fields containing commas', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
    const filePath = join(tmpDir, 'test.csv');

    await writeCsv(
      [{ name: 'Smith, John & Sons', age: '30', _section: 'test', _uuid: null }],
      filePath,
    );

    const content = readFileSync(filePath, 'utf-8');
    // Header: _section,_uuid,name,age
    // Data row should have name quoted
    const lines = content.split('\n');
    expect(lines[1]).toContain('"Smith, John & Sons"');
    expect(lines[1]).toContain(',30');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('doubles double-quotes inside quoted fields', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
    const filePath = join(tmpDir, 'test.csv');

    await writeCsv(
      [{ note: 'He said "hello"', _section: 'test', _uuid: null }],
      filePath,
    );

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('"He said ""hello"""');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('writes plain fields without quoting', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
    const filePath = join(tmpDir, 'test.csv');

    await writeCsv(
      [{ name: 'John', age: '25', _section: 'test', _uuid: null }],
      filePath,
    );

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('John,25');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });
});
