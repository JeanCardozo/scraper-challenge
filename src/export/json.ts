/**
 * @file Exportación de datos en JSON Lines.
 *
 * Escribe registros extraídos como JSON Lines (un objeto JSON válido
 * por línea, terminado con \n). Soporta modo append para ejecuciones
 * reanudables y filtrado opcional de campos.
 */

import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

import type { ScrapedRecord } from '../types.js';

/**
 * Opciones del escritor JSON Lines.
 */
export interface JsonLinesOptions {
  /** Subconjunto opcional de campos a incluir */
  fieldFilter?: string[];
  /** Append en lugar de sobrescribir (por defecto: false) */
  append?: boolean;
}

/**
 * Determina la lista ordenada de campos a exportar.
 * Deriva los campos del primer registro, opcionalmente filtrados.
 * Los campos del sistema (_section, _uuid) se incluyen por defecto.
 *
 * @param records - Array de registros (usa el primero para descubrir campos)
 * @param filter  - Lista blanca opcional de campos
 * @returns Array ordenado de nombres de campo
 */
function resolveFields(
  records: ScrapedRecord[],
  filter?: string[],
): string[] {
  if (filter && filter.length > 0) return filter;
  if (records.length === 0) return [];
  return Object.keys(records[0]!);
}

/**
 * Escribe registros en un archivo JSON Lines.
 *
 * Cada registro se serializa como un objeto JSON seguido de \n.
 * El archivo se crea vacío (0 bytes) cuando el array de registros está vacío.
 *
 * @param records  - Registros a escribir
 * @param filePath - Ruta del archivo de salida
 * @param options  - Opciones de formato
 */
export async function writeJsonLines(
  records: ScrapedRecord[],
  filePath: string,
  options: JsonLinesOptions = {},
): Promise<void> {
  const fields = resolveFields(records, options.fieldFilter);
  const flags = options.append ? 'a' : 'w';

  const stream = createWriteStream(filePath, { flags, encoding: 'utf-8' });

  try {
    for (const record of records) {
      const line: Record<string, string | null> = {};
      for (const field of fields) {
        line[field] = record[field] ?? null;
      }
      stream.write(JSON.stringify(line) + '\n');
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }
}
