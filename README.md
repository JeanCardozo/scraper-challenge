# scraper-challenge

Scraper TypeScript para sistemas de consulta pública basados en **JSF 2.x / PrimeFaces 6.0**. Implementa scraping AJAX paginado a traves del ciclo de respuesta parcial de JSF sin necesidad de un navegador headless.

Incluye un adapter para **OEFA** (Organismo de Evaluacion y Fiscalizacion Ambiental de Peru) con tres secciones de consulta publica.

## Requisitos previos

- **Node.js 18+** (probado con Node 22)
- npm (incluido con Node.js)

## Instalacion

```bash
npm install
```

## Uso

### CLI

```bash
npx tsx src/cli/index.ts <seccion> <dir-salida> [opciones]
```

#### Secciones

| Seccion | Clave | Descripcion |
|---------|-------|-------------|
| TFA | `tfa` | Tribunal de Fiscalizacion Ambiental |
| DFSAI | `dfsai` | Direccion de Fiscalizacion Sancion y Asuntos de Impacto |
| IGA | `iga` | Instrumentos de Gestion Ambiental |
| Todas | `all` | Las tres secciones (cada una con su propia ejecucion) |

#### Opciones

| Opcion | Descripcion |
|--------|-------------|
| `--resume` | Omitir archivos JSONL/CSV/PDF existentes; reintentar solo descargas fallidas |
| `--concurrency N` | Tamano del pool de descarga PDF (1-10, por defecto 3) |
| `--help` | Mostrar mensaje de ayuda |

#### Ejemplos

Extraer registros TFA en `./output`:

```bash
npx tsx src/cli/index.ts tfa ./output
```

Extraer todas las secciones en `./data` con 5 descargas PDF concurrentes:

```bash
npx tsx src/cli/index.ts all ./data --concurrency 5
```

Reanudar una ejecucion interrumpida (omitir archivos ya descargados):

```bash
npx tsx src/cli/index.ts dfsai ./data --resume
```

### Comportamiento de descarga PDF

El scraper opera en dos fases:

1.  **Extraccion de metadatos**: Peticiones AJAX paginadas extraen registros de las tablas PrimeFaces DataTables (numero de resolucion, fecha, sumilla, etc.). Los registros se guardan como JSON Lines (`.jsonl`) y CSV (`.csv`) con BOM UTF-8 para compatibilidad con Excel.

2.  **Descarga PDF**: Cada registro con enlace de descarga se encola. El descargador:
    - Hace POST con los parametros del formulario JSF y el UUID del documento
    - Sigue las redirecciones HTTP hasta el PDF real
    - Extrae el nombre del archivo de la cabecera `Content-Disposition`
    - Sanitiza caracteres especiales (`ñ` -> `n`, `N°` -> `No`, espacios -> `_`, etc.)
    - Usa `{uuid}.pdf` como nombre alternativo si no hay cabecera
    - Reintenta descargas fallidas con backoff exponencial (maximo 3 veces)
    - **No** reintenta en errores 4xx (excepto 429 rate-limit)

Con `--resume`, el scraper omite los archivos JSONL/CSV y PDF existentes, y solo procesa elementos nuevos o previamente fallidos.

### Formato de salida

#### JSON Lines (`.jsonl`)

Un objeto JSON por linea. Compatible con herramientas de streaming y la mayoria de pipelines de procesamiento de datos.

```json
{"nro":"1","expediente":"EXP-001","administrado":"ACME SAC","_section":"tfa","_uuid":"abc-123"}
```

#### CSV (`.csv`)

UTF-8 con BOM para compatibilidad con Excel. Citado segun RFC 4180 (comas y comillas dobles escapadas correctamente).

### Configuracion

La configuracion vive en `openspec/changes/scraper-challenge/`. El adapter OEFA en `src/oefa/adapter.ts` define las URLs, IDs de formulario y mapeos de columnas para cada seccion. Para agregar un nuevo sitio, implementa la interfaz `SiteAdapter` (ver `src/scraper/adapter.ts`).

## Estructura del proyecto

```
src/
├── cli/
│   └── index.ts          # Punto de entrada CLI
├── export/
│   ├── csv.ts            # Escritor CSV (BOM UTF-8, RFC 4180)
│   └── json.ts           # Escritor JSON Lines
├── oefa/
│   ├── adapter.ts        # Adapter del sitio OEFA (3 secciones)
│   └── types.ts          # Interfaces de registro tipado OEFA
├── pdf/
│   ├── downloader.ts     # Descarga PDF con reintento + backoff
│   └── queue.ts          # Pool de descarga basado en semaforo
├── scraper/
│   ├── adapter.ts        # Interfaz SiteAdapter
│   ├── engine.ts         # Motor de scraping JSF paginado
│   ├── session.ts        # Sesion HTTP + gestion de ViewState
│   └── xml-parser.ts     # Parser de XML de respuesta parcial JSF
├── types.ts              # Definiciones de tipos compartidos
└── __tests__/            # Tests unitarios y de integracion
```

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `npm run build` | Compilar TypeScript |
| `npm run typecheck` | Verificar tipos sin emitir archivos |
| `npm test` | Ejecutar tests con vitest |
| `npm run test:watch` | Ejecutar tests en modo watch |
| `npm start` | Ejecutar `src/cli/index.ts` via tsx |

## Notas importantes

- El sitio principal objetivo es **jurisprudencia.pj.gob.pe** (Poder Judicial de Peru), que requiere una direccion IP peruana para acceder. El adapter OEFA apunta a **publico.oefa.gob.pe**.
- Esta herramienta interactua con sitios web reales. Respeta los recursos del servidor -- la concurrencia por defecto de 3 mantiene la carga razonable.
- El ciclo de vida del ViewState de JSF implica que cada peticion de paginacion depende del ViewState de la respuesta anterior. Si la sesion expira durante la ejecucion, la herramienta reporta un `StaleSessionError`.
