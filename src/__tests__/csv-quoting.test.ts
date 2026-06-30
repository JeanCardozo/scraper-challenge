/**
 * Test de quoting CSV según RFC 4180.
 * Verifica que los campos con comas se entrecomillen, las comillas
 * dobles se escapen duplicando, y los campos sin caracteres especiales
 * no se entrecomillen.
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
    // Cabecera: _section,_uuid,name,age
    // La fila de datos debe tener el nombre entrecomillado
    const lines = content.split('\n');
    expect(lines[1]).toContain('"Smith, John & Sons"');
    expect(lines[1]).toContain(',30');

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

    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });
});
