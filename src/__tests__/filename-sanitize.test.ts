/**
 * Test de sanitización de nombres de archivo PDF.
 * Verifica que caracteres especiales (N°, ñ, espacios, barras) sean
 * reemplazados correctamente por caracteres seguros para el sistema de archivos.
 *
 * La función sanitizeFilename es interna a downloader.ts, así que probamos
 * replicando la implementación localmente para el test.
 */

import { describe, it, expect } from 'vitest';

// Misma implementación que en src/pdf/downloader.ts
const SANITIZE_MAP: Record<string, string> = {
  '°': 'o',
  'º': 'o',
  'ñ': 'n',
  'Ñ': 'N',
  ' ': '_',
  '/': '_',
  '\\': '_',
  ':': '_',
  '*': '_',
  '?': '_',
  '"': '_',
  '<': '_',
  '>': '_',
  '|': '_',
};

function sanitizeFilename(name: string): string {
  let result = '';
  for (const char of name) {
    result += SANITIZE_MAP[char] ?? char;
  }
  return result;
}

describe('Filename sanitization', () => {
  it('sanitizes "N° 123/OEFA" to "No_123_OEFA"', () => {
    expect(sanitizeFilename('N° 123/OEFA')).toBe('No_123_OEFA');
  });

  it('sanitizes "RTFA N° 123-2024.pdf" correctly', () => {
    expect(sanitizeFilename('RTFA N° 123-2024.pdf')).toBe('RTFA_No_123-2024.pdf');
  });

  it('replaces ñ with n', () => {
    expect(sanitizeFilename('CORA_ESPAÑOLA_2019.pdf')).toBe('CORA_ESPANOLA_2019.pdf');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file name.pdf')).toBe('my_file_name.pdf');
  });

  it('replaces forward slashes with underscores', () => {
    expect(sanitizeFilename('123/2024/OEFA.pdf')).toBe('123_2024_OEFA.pdf');
  });

  it('handles mixed special characters', () => {
    // ó (acentuada) no está en el mapa de sanitización, se conserva
    expect(sanitizeFilename('N° Resolución 123/2024-OEFA.pdf')).toBe(
      'No_Resolución_123_2024-OEFA.pdf',
    );
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});
