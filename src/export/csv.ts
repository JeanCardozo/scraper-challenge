/**
 * @file Exportación CSV con BOM UTF-8 y quoting RFC 4180.
 *
 * Escribe registros extraídos a archivos CSV con codificación compatible
 * con Excel (BOM UTF-8). Soporta modo append (omite la cabecera al añadir)
 * y filtrado opcional de campos.
 *
 * Reglas de quoting (RFC 4180):
 * - Los campos con comas, comillas dobles o saltos de línea se entrecomillan
 * - Las comillas dobles dentro de campos entrecomillados se escapan duplicando ("")
 * - El delimitador es la coma
 */

import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

import type { ScrapedRecord } from '../types.js';

/**
 * Carácter BOM UTF-8 — se antepone como los primeros 3 bytes para
 * compatibilidad con Excel. Asegura que Excel interprete correctamente
 * la codificación UTF-8 al abrir el archivo CSV directamente.
 */
const UTF8_BOM = '\uFEFF';

/**
 * Opciones del escritor CSV.
 */
export interface CsvOptions {
  /** Subconjunto opcional de campos a incluir */
  fieldFilter?: string[];
  /** Append en lugar de sobrescribir (por defecto: false) */
  append?: boolean;
}

/**
 * Escapa y opcionalmente entrecomilla un valor de campo CSV según RFC 4180.
 *
 * Un campo se entrecomilla si contiene coma, comilla doble o salto de línea.
 * Las comillas dobles dentro del campo se escapan duplicando.
 *
 * @param value - Valor crudo del campo (null se convierte en cadena vacía)
 * @returns Representación del campo compatible con RFC 4180
 */
function escapeCsvField(value: string | null): string {
  if (value === null || value === undefined) return '';

  const str = String(value);

  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Determina la lista ordenada de campos a exportar.
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
 * Escribe una fila CSV a partir de un registro.
 *
 * @param record - Registro a serializar
 * @param fields - Nombres de campo ordenados
 * @returns Cadena de fila CSV (sin salto de línea final)
 */
function formatCsvRow(
  record: ScrapedRecord,
  fields: string[],
): string {
  return fields
    .map((field) => escapeCsvField(record[field] ?? null))
    .join(',');
}

/**
 * Escribe registros en un archivo CSV con BOM UTF-8 y quoting RFC 4180.
 *
 * Produce salida compatible con Excel:
 * - Primeros 3 bytes: BOM UTF-8 (\uFEFF)
 * - Primera fila: cabeceras de columna
 * - Filas siguientes: datos de los registros
 * - Conjunto vacío: solo BOM + cabecera, sin filas de datos
 *
 * @param records  - Registros a escribir
 * @param filePath - Ruta del archivo de salida
 * @param options  - Opciones de formato
 */
export async function writeCsv(
  records: ScrapedRecord[],
  filePath: string,
  options: CsvOptions = {},
): Promise<void> {
  const fields = resolveFields(records, options.fieldFilter);
  const flags = options.append ? 'a' : 'w';

  const stream = createWriteStream(filePath, { flags, encoding: 'utf-8' });

  try {
    if (!options.append) {
      stream.write(UTF8_BOM);
      stream.write(fields.join(',') + '\n');
    }

    for (const record of records) {
      stream.write(formatCsvRow(record, fields) + '\n');
    }
  } finally {
    stream.end();
    await once(stream, 'finish');
  }
}
