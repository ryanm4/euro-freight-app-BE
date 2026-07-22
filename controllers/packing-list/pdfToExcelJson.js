/**
 * pdfToExcelJson.js
 *
 * Converts a WOXER-style "PACKING LIST" PDF into a real .xlsx workbook
 * (using the PDF's own coordinate grid to place each value in the correct
 * column), then reads that workbook back and returns clean JSON — instead
 * of the old approach of regex-matching raw, layout-less text.
 *
 * WHY THIS IS BETTER THAN THE OLD pdf-parse + regex APPROACH:
 * pdf-parse's getText() collapses the PDF into a single text stream and loses
 * column position entirely. Here we read each text run's actual (x, top)
 * position on the page and bucket it into a column.
 *
 * COLUMN DETECTION: earlier versions of this file hardcoded pixel x-ranges
 * for each column. That broke the moment a different packing-list export
 * used a different page scale/margins (the PO Number column landed at a
 * different absolute x on different files, even though the layout was
 * otherwise identical). This version instead locates the header row on each
 * PDF by matching known header labels, reads *their* x-positions, and
 * builds column bucket edges as the midpoints between them. That makes
 * column assignment self-calibrating per document instead of assuming a
 * fixed coordinate grid.
 *
 * PIPELINE:
 *   1. pdfjs-dist reads every text run on every page with its (x, top) position.
 *   2. The header row is located (by matching known column labels) and used
 *      to build this document's column bucket boundaries.
 *   3. Runs are clustered into rows by y-position, then each run is dropped
 *      into a column bucket by x-position using those boundaries.
 *   4. Rows that don't contain a valid PO Number (e.g. the header row, the
 *      manufacturer/ship-to block, the TOTAL row) are discarded.
 *   5. Clean rows are written to a real .xlsx file with ExcelJS.
 *   6. The .xlsx is then re-opened and walked row-by-row to build the JSON
 *      that's returned — so the JSON is genuinely sourced from the Excel
 *      file, not straight from the PDF text.
 *
 * USAGE:
 *   const { convertPackingListPdfToExcelAndJson } = require('./pdfToExcelJson');
 *   const { items, errors, totals, excelPath } =
 *     await convertPackingListPdfToExcelAndJson(pdfBuffer, '/tmp/packing-list.xlsx');
 *
 * Each item mirrors the PDF's own column headers:
 *   { ctnNo, poNumber, sku, itemName, color, size, co, unitCost, quantity,
 *     ctn, grossWeightKg, netWeightKg, ctnDemi, cbm }
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ExcelJS = require('exceljs');

// PO numbers have varied across real Woxer exports seen so far:
//   W22602-1A     (digit + trailing letter suffix)
//   W22509-0-2    (two dash-separated suffix groups)
//   W2251125-3    (7-digit body instead of 5)
// This pattern covers all of those: W + 4-8 digit body + 1-2 dash groups,
// each an optional-letter-suffixed number.
const PO_NUMBER_REGEX = /^W\d{4,8}(-\d+[A-Z]?){1,2}$/;

// Known header labels on this template, in column order, mapped to the
// internal bucket key we want each column's values grouped under.
const HEADER_LABELS = [
  { label: 'CTN NO', key: 'lineNo' },
  { label: 'PO Number', key: 'poNumber' },
  { label: 'Sku', key: 'sku' },
  { label: 'Item Name (Style)', key: 'itemName' },
  { label: 'Color', key: 'color' },
  { label: 'Size', key: 'size' },
  { label: 'C.O.', key: 'co' },
  { label: 'Unit Cost', key: 'unitCost' },
  { label: 'Quantity', key: 'quantity' },
  { label: 'CTN', key: 'ctn' },
  { label: 'G.W. (KGS)', key: 'grossWeight' },
  { label: 'N.W. (KGS)', key: 'netWeight' },
  { label: 'CTN Demi', key: 'dimensions' },
  { label: 'CBM', key: 'cbm' },
];

// pdfjs-dist (even the "legacy" Node build) references browser globals like
// DOMMatrix at module-evaluation time. Node has no DOMMatrix, so we polyfill
// it via @napi-rs/canvas *before* pdfjs-dist is imported anywhere.
function ensurePdfjsGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    const { DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');
    globalThis.DOMMatrix = DOMMatrix;
    globalThis.ImageData = ImageData;
    globalThis.Path2D = Path2D;
  }
}

/**
 * Reads all text runs from every page of the PDF, tagged with their
 * page number and (x, top) position.
 */
async function extractTextRuns(pdfBuffer) {
  ensurePdfjsGlobals();
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdfjs's Node "fake worker" needs pdf.worker.mjs's actual code, but it's
  // loaded via a runtime-built path that Vercel's build tracer can miss.
  // require.resolve() with a literal string forces the tracer to bundle it,
  // and pathToFileURL() keeps the resulting path valid for Node's ESM
  // loader on Windows too (raw "D:\..." paths are rejected there).
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

  const runs = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      const text = item.str;
      if (!text || !text.trim()) continue;
      runs.push({
        page: pageNum,
        x: item.transform[4],
        top: viewport.height - item.transform[5],
        text: text.trim(),
      });
    }
  }
  return runs;
}

/**
 * Locates the header row (the row containing "PO Number") and builds
 * column bucket boundaries from that row's own x-positions, so column
 * assignment is calibrated per-document instead of assuming a fixed grid.
 */
function buildColumnBuckets(runs) {
  const headerRun = runs.find(r => r.text === 'PO Number');
  if (!headerRun) {
    throw new Error(
      'Could not locate the "PO Number" header on this PDF — the template ' +
      'may differ from the expected Woxer packing list layout.'
    );
  }

  const headerRuns = runs.filter(
    r => r.page === headerRun.page && Math.abs(r.top - headerRun.top) < 3
  );

  const matched = [];
  for (const hr of headerRuns) {
    const known = HEADER_LABELS.find(h => h.label === hr.text);
    if (known) matched.push({ key: known.key, x: hr.x });
  }
  matched.sort((a, b) => a.x - b.x);

  if (matched.length < HEADER_LABELS.length) {
    const foundKeys = new Set(matched.map(m => m.key));
    const missing = HEADER_LABELS.filter(h => !foundKeys.has(h.key)).map(h => h.label);
    throw new Error(`Could not find these expected columns on the header row: ${missing.join(', ')}`);
  }

  return matched.map((m, i) => {
    const nextX = matched[i + 1] ? matched[i + 1].x : Infinity;
    const max = nextX === Infinity ? Infinity : (m.x + nextX) / 2;
    return { key: m.key, max };
  });
}

function bucketForX(buckets, x) {
  for (const bucket of buckets) {
    if (x < bucket.max) return bucket.key;
  }
  return buckets[buckets.length - 1].key;
}

/**
 * Groups text runs into visual rows (same page, y-position within tolerance),
 * then buckets each run into a column by x-position using this document's
 * own header-derived buckets.
 */
function groupRunsIntoRows(runs, buckets, yTolerance = 3) {
  const byPage = new Map();
  for (const run of runs) {
    if (!byPage.has(run.page)) byPage.set(run.page, []);
    byPage.get(run.page).push(run);
  }

  const rows = [];
  for (const [page, pageRuns] of byPage) {
    pageRuns.sort((a, b) => a.top - b.top || a.x - b.x);

    let currentRow = null;
    for (const run of pageRuns) {
      if (!currentRow || run.top - currentRow.top > yTolerance) {
        currentRow = { page, top: run.top, cells: {} };
        rows.push(currentRow);
      }
      const bucket = bucketForX(buckets, run.x);
      currentRow.cells[bucket] = currentRow.cells[bucket]
        ? `${currentRow.cells[bucket]} ${run.text}`
        : run.text;
    }
  }
  return rows;
}

/**
 * Keeps only rows that represent a real line item (i.e. have a valid PO
 * Number in the poNumber bucket) and normalizes them into row objects.
 */
function rowsToLineItems(rows) {
  const items = [];
  const errors = [];

  for (const row of rows) {
    const poNumber = (row.cells.poNumber || '').trim();
    if (!PO_NUMBER_REGEX.test(poNumber)) continue; // header/footer/info rows

    const quantity = parseInt((row.cells.quantity || '').replace(/[^\d]/g, ''), 10);
    const ctnCount = parseInt((row.cells.ctn || '').replace(/[^\d]/g, ''), 10);
    const unitCost = parseFloat(row.cells.unitCost);
    const grossWeightKg = parseFloat(row.cells.grossWeight);
    const netWeightKg = parseFloat(row.cells.netWeight);
    const cbm = parseFloat(row.cells.cbm);
    const sku = (row.cells.sku || '').trim();
    const dimensions = (row.cells.dimensions || '').replace(/\s+/g, ' ').trim();
    const lineNoMatch = (row.cells.lineNo || '').match(/\d+/);

    const item = {
      ctnNo: lineNoMatch ? parseInt(lineNoMatch[0], 10) : null,
      poNumber,
      sku,
      itemName: (row.cells.itemName || '').replace(/\s+/g, ' ').trim(),
      color: (row.cells.color || '').replace(/\s+/g, ' ').trim(),
      size: (row.cells.size || '').trim(),
      co: (row.cells.co || '').trim(),
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      quantity,
      ctn: Number.isFinite(ctnCount) ? ctnCount : 1,
      grossWeightKg,
      netWeightKg,
      ctnDemi: dimensions,
      cbm,
    };

    const isValid =
      sku &&
      Number.isFinite(quantity) &&
      Number.isFinite(grossWeightKg) &&
      Number.isFinite(netWeightKg) &&
      Number.isFinite(cbm);

    if (!isValid) {
      errors.push({ page: row.page, poNumber, rawCells: row.cells });
      continue;
    }

    items.push(item);
  }

  return { items, errors };
}

function summarize(items) {
  const raw = items.reduce(
    (acc, r) => ({
      totalQuantity: acc.totalQuantity + (r.quantity || 0),
      totalCartons: acc.totalCartons + (r.ctn || 0),
      totalGrossWeight: acc.totalGrossWeight + (r.grossWeightKg || 0),
      totalNetWeight: acc.totalNetWeight + (r.netWeightKg || 0),
      totalCbm: acc.totalCbm + (r.cbm || 0),
    }),
    { totalQuantity: 0, totalCartons: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 }
  );

  return {
    totalQuantity: raw.totalQuantity,
    totalCartons: raw.totalCartons,
    totalGrossWeight: +raw.totalGrossWeight.toFixed(3),
    totalNetWeight: +raw.totalNetWeight.toFixed(3),
    totalCbm: +raw.totalCbm.toFixed(3),
  };
}

const EXCEL_COLUMNS = [
  { header: 'CTN NO', key: 'ctnNo', width: 8 },
  { header: 'PO Number', key: 'poNumber', width: 14 },
  { header: 'Sku', key: 'sku', width: 16 },
  { header: 'Item Name (Style)', key: 'itemName', width: 20 },
  { header: 'Color', key: 'color', width: 18 },
  { header: 'Size', key: 'size', width: 8 },
  { header: 'C.O.', key: 'co', width: 6 },
  { header: 'Unit Cost', key: 'unitCost', width: 10 },
  { header: 'Quantity', key: 'quantity', width: 10 },
  { header: 'CTN', key: 'ctn', width: 6 },
  { header: 'G.W. (KGS)', key: 'grossWeightKg', width: 12 },
  { header: 'N.W. (KGS)', key: 'netWeightKg', width: 12 },
  { header: 'CTN Demi', key: 'ctnDemi', width: 20 },
  { header: 'CBM', key: 'cbm', width: 10 },
];

/** Step A: write parsed line items to a real .xlsx file. */
async function writeExcel(items, excelPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Packing List');
  sheet.columns = EXCEL_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  for (const item of items) sheet.addRow(item);
  await fs.promises.mkdir(path.dirname(excelPath), { recursive: true });
  await workbook.xlsx.writeFile(excelPath);
}

/** Step B: read the .xlsx file back and build the JSON payload from it. */
async function readExcelToJson(excelPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet = workbook.worksheets[0];

  const keys = EXCEL_COLUMNS.map(c => c.key);
  const items = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const values = row.values.slice(1); // exceljs row.values is 1-indexed
    const obj = {};
    keys.forEach((key, i) => { obj[key] = values[i] !== undefined ? values[i] : null; });
    items.push(obj);
  });

  return items;
}

/**
 * Full pipeline: PDF buffer -> parsed rows -> .xlsx file -> JSON (read back
 * from that .xlsx file).
 */
async function convertPackingListPdfToExcelAndJson(pdfBuffer, excelPath) {
  const runs = await extractTextRuns(pdfBuffer);
  const buckets = buildColumnBuckets(runs);
  const rows = groupRunsIntoRows(runs, buckets);
  const { items, errors } = rowsToLineItems(rows);

  await writeExcel(items, excelPath);
  const itemsFromExcel = await readExcelToJson(excelPath);

  return {
    rowCount: itemsFromExcel.length,
    rowsFailedToParse: errors.length,
    totals: summarize(items),
    items: itemsFromExcel,
    parseErrors: errors,
    excelPath,
  };
}

module.exports = {
  convertPackingListPdfToExcelAndJson,
  extractTextRuns,
  buildColumnBuckets,
  groupRunsIntoRows,
  rowsToLineItems,
  summarize,
};