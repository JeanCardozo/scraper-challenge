/**
 * Tests unitarios de exportación CSV — writeCsv().
 * Cubre: modo append (sin cabecera duplicada) y filtrado de campos.
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

    // Primer lote: crea archivo con BOM + cabecera + 1 fila de datos
    await writeCsv([
      { _section: 'tfa', _uuid: null, nro: '1', expediente: 'EXP-001' },
    ], filePath);

    // Segundo lote (append): solo añade filas de datos
    await writeCsv([
      { _section: 'tfa', _uuid: null, nro: '2', expediente: 'EXP-002' },
    ], filePath, { append: true });

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // 1 cabecera + 2 filas de datos = 3 líneas total
    expect(lines).toHaveLength(3);

    // La cabecera aparece solo una vez (en la primera línea)
    expect(lines[0]!).toContain('_section');
    expect(lines[0]!).toContain('expediente');

    const headerCount = lines.filter((l) => l.includes('_section')).length;
    expect(headerCount).toBe(1);

    expect(lines[1]!).toContain('1');
    expect(lines[2]!).toContain('2');

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

    // La cabecera debe contener solo los 2 campos filtrados (BOM antepuesto)
    expect(lines[0]!).toContain('nro,expediente');
    expect(lines[0]!).not.toContain('administrado');
    expect(lines[0]!).not.toContain('sector');

    // La fila de datos debe tener exactamente 2 valores separados por coma
    const dataFields = lines[1]!.split(',');
    expect(dataFields).toHaveLength(2);
    expect(dataFields[0]).toBe('1');
    expect(dataFields[1]).toBe('EXP-001');

    unlinkSync(filePath);
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });
});
