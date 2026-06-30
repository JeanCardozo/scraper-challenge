/**
 * Tests unitarios de OefaAdapter — configuración de secciones, parseo
 * de filas y extracción de enlaces PDF mediante param_uuid.
 *
 * NOTA: La regex de extractParamUuid espera claves entrecomilladas
 * (ej. 'param_uuid':'value'), que coincide con el formato real de
 * salida de mojarra.jsfcljs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { load } from 'cheerio';
import { OefaAdapter, extractParamUuid } from '../oefa/adapter.js';

function buildTableRow(cells: string[], actionHtml?: string): string {
  const tds = [...cells];
  if (actionHtml !== undefined) tds.push(actionHtml);
  return `<table><tbody><tr>${tds.map((c) => `<td>${c}</td>`).join('')}</tr></tbody></table>`;
}

describe('OefaAdapter', () => {
  let adapter: OefaAdapter;

  beforeEach(() => {
    adapter = new OefaAdapter();
  });

  // -----------------------------------------------------------------------
  // parseRow
  // -----------------------------------------------------------------------

  describe('parseRow', () => {
    it('parses a TFA row with all columns present', () => {
      adapter.useSection('tfa');
      const html = buildTableRow(
        ['1', 'EXP-001-2024', 'Minera Los Andes S.A.', 'UNIDAD-001', 'Mineria', 'RES-001-2024'],
      );
      const $tr = load(html)('tr').first();
      const record = adapter.parseRow($tr as any);

      expect(record).not.toBeNull();
      expect(record!._section).toBe('tfa');
      expect(record!.nro).toBe('1');
      expect(record!.expediente).toBe('EXP-001-2024');
      expect(record!.administrado).toBe('Minera Los Andes S.A.');
      expect(record!.unidadFiscalizable).toBe('UNIDAD-001');
      expect(record!.sector).toBe('Mineria');
      expect(record!.nroResolucionApelacion).toBe('RES-001-2024');
    });

    it('extracts UUID from last column onclick when present', () => {
      adapter.useSection('tfa');
      const html = buildTableRow(
        ['1', 'EXP-001', 'Admin', 'UF', 'Min', 'RES-001'],
        '<a onclick="mojarra.jsfcljs(document.getElementById(\'f\'),{\'param_uuid\':\'uuid-123\'},\'_blank\')">DL</a>',
      );
      const $tr = load(html)('tr').first();
      const record = adapter.parseRow($tr as any);

      expect(record).not.toBeNull();
      expect(record!._uuid).toBe('uuid-123');
    });

    it('handles missing optional fields (empty) as null', () => {
      adapter.useSection('tfa');
      const html = buildTableRow(
        ['2', 'EXP-002-2024', 'Empresa SAC', '', 'Pesca', ''],
      );
      const $tr = load(html)('tr').first();
      const record = adapter.parseRow($tr as any);

      expect(record).not.toBeNull();
      expect(record!.nro).toBe('2');
      expect(record!.unidadFiscalizable).toBeNull();
      expect(record!.nroResolucionApelacion).toBeNull();
    });

    it('returns null when no <td> elements exist', () => {
      adapter.useSection('tfa');
      const $ = load('<table><tbody><tr></tr></tbody></table>');
      const record = adapter.parseRow($('tr').first() as any);
      expect(record).toBeNull();
    });

    it('parses a DFSAI row with correct field mapping', () => {
      adapter.useSection('dfsai');
      const html = buildTableRow(
        ['1', 'EXP-DFS-001', 'Admin DFSAI', 'UF-DFS-001', 'Hidrocarburos', 'RES-SANC-001'],
      );
      const $tr = load(html)('tr').first();
      const record = adapter.parseRow($tr as any);

      expect(record).not.toBeNull();
      expect(record!._section).toBe('dfsai');
      expect(record!.nroResolucionSancion).toBe('RES-SANC-001');
      // El campo TFA no debe estar presente bajo DFSAI
      expect(record!.nroResolucionApelacion).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // extractParamUuid
  // -----------------------------------------------------------------------

  describe('extractParamUuid', () => {
    it('extracts UUID from mojarra.jsfcljs onclick with single-quoted keys', () => {
      const onclick = "mojarra.jsfcljs(document.getElementById('f'),{'param_uuid':'550e8400-e29b-41d4-a716-446655440000'},'_blank')";
      expect(extractParamUuid(onclick)).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('extracts UUID from onclick with double-quoted keys', () => {
      const onclick = 'mojarra.jsfcljs(document.getElementById("form"),{"param_uuid":"abc-def-456"},"_blank")';
      expect(extractParamUuid(onclick)).toBe('abc-def-456');
    });

    it('returns null when onclick is empty', () => {
      expect(extractParamUuid('')).toBeNull();
    });

    it('returns null when onclick has no param_uuid', () => {
      const onclick = "mojarra.jsfcljs(document.getElementById('form'),{s:'link'},'_blank')";
      expect(extractParamUuid(onclick)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getSection
  // -----------------------------------------------------------------------

  describe('getSection', () => {
    it('returns config for valid key', () => {
      const config = adapter.getSection('tfa');
      expect(config).not.toBeNull();
      expect(config!.key).toBe('tfa');
      expect(config!.label).toBe('TFA');
      expect(config!.path).toBe('/consultaTfa.xhtml');
      expect(config!.pageSize).toBe(10);
      expect(config!.formId).toBe('listarDetalleInfraccionRAAForm');
      expect(config!.widgetVar).toBe('listarDetalleInfraccionRAAForm:dt');
    });

    it('returns null for unknown key', () => {
      const config = adapter.getSection('unknown');
      expect(config).toBeNull();
    });
  });
});
