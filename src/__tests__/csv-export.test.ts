/**
 * Unit tests for CSV export — writeCsv().
 *
 * Covers: append mode (no duplicate header), field filtering.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeCsv } from '../export/csv.js';

describe('CSV export', () => {
  it('appends data rows without duplicating the header', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
    const filePath = join(tmpDir, 'append.csv');

    // Write first batch: creates file with BOM + header + 1 data row
    await writeCsv([
      { _section: 'tfa', _uuid: null, nro: '1', expediente: 'EXP-001' },
    ], filePath);

    // Append second batch: should add data rows only
    await writeCsv([
      { _section: 'tfa', _uuid: null, nro: '2', expediente: 'EXP-002' },
    ], filePath, { append: true });

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // BOM is prepended to header on the first line
    // → 1 header + 2 data rows = 3 lines total
    expect(lines).toHaveLength(3);

    // Header appears only once (on first line)
    expect(lines[0]!).toContain('_section');
    expect(lines[0]!).toContain('expediente');

    // Verify only one header line exists
    const headerCount = lines.filter((l) => l.includes('_section')).length;
    expect(headerCount).toBe(1);

    // Data rows
    expect(lines[1]!).toContain('1');
    expect(lines[2]!).toContain('2');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('writes only requested columns when fieldFilter is provided', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
    const filePath = join(tmpDir, 'filtered.csv');

    await writeCsv(
      [{
        _section: 'tfa',
        _uuid: null,
        nro: '1',
        expediente: 'EXP-001',
        administrado: 'Admin Name',
        sector: 'Minería',
        unidadFiscalizable: 'UF-001',
      }],
      filePath,
      { fieldFilter: ['nro', 'expediente'] },
    );

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // Header should contain only the 2 filtered fields (BOM is prepended)
    expect(lines[0]!).toContain('nro,expediente');
    // Should NOT contain the other fields
    expect(lines[0]!).not.toContain('administrado');
    expect(lines[0]!).not.toContain('sector');

    // Data row should have exactly 2 comma-separated values
    const dataFields = lines[1]!.split(',');
    expect(dataFields).toHaveLength(2);
    expect(dataFields[0]).toBe('1');
    expect(dataFields[1]).toBe('EXP-001');

    // Cleanup
    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });
});
