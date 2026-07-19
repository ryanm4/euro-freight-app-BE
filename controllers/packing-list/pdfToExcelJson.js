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
 * column position entirely, which is why the old parser had to guess (e.g.
 * stripping a trailing "1" to separate Quantity from CTN, or fighting
 * page-break artifacts). Here we read each text run's actual (x, y)
 * position on the page — the number "115" and the number "1" next to it
 * are two separate text objects at two different x-coordinates, not a
 * glued "1151" string. That means Quantity and CTN are just "whichever
 * column each x-coordinate falls into," with no guessing required.
 *
 * PIPELINE:
 *   1. pdfjs-dist reads every text run on every page with its (x, top) position.
 *   2. Runs are clustered into rows by y-position, then each run is dropped into
 *      a column bucket by x-position (bucket edges = midpoints between the
 *      known header x-positions on this document template).
 *   3. Rows that don't contain a valid PO Number (e.g. the header row, the
 *      manufacturer/ship-to block, the TOTAL row) are discarded.
 *   4. Clean rows are written to a real .xlsx file with ExcelJS.
 *   5. The .xlsx is then re-opened and walked row-by-row to build the JSON
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

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

function ensurePdfjsGlobals() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    const { DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
    globalThis.DOMMatrix = DOMMatrix;
    globalThis.ImageData = ImageData;
    globalThis.Path2D = Path2D;
  }
}

const PO_NUMBER_REGEX = /^W\d{5}-\d(?:-\d)?$/;

// Column bucket right-edges, derived from the midpoints between this
// template's header x-positions (see header row inspection notes below).
// A text run is assigned to the first bucket whose `max` is greater than
// the run's x0. Order matters — narrowest/leftmost first.
const COLUMN_BUCKETS = [
  { key: "lineNo", max: 190 },
  { key: "poNumber", max: 250 },
  { key: "sku", max: 355 },
  { key: "itemName", max: 462 },
  { key: "color", max: 559 },
  { key: "size", max: 629 },
  { key: "co", max: 670 },
  { key: "unitCost", max: 713 },
  { key: "quantity", max: 758 },
  { key: "ctn", max: 803 },
  { key: "grossWeight", max: 854 },
  { key: "netWeight", max: 910 },
  { key: "dimensions", max: 991 },
  { key: "cbm", max: Infinity },
];

function bucketForX(x) {
  for (const bucket of COLUMN_BUCKETS) {
    if (x < bucket.max) return bucket.key;
  }
  return COLUMN_BUCKETS[COLUMN_BUCKETS.length - 1].key;
}

/**
 * Reads all text runs from every page of the PDF, tagged with their
 * page number and (x, top) position.
 */
async function extractTextRuns(pdfBuffer) {
  ensurePdfjsGlobals(); // <-- add this line, before the dynamic import below
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs's Node "fake worker" needs pdf.worker.mjs's actual code, but it's
  // loaded via a runtime-built path, so Vercel's build tracer misses it.
  // require.resolve() with a literal string forces the tracer to bundle
  // this file, and gives us the on-disk path to hand to workerSrc.
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })
    .promise;

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
 * Groups text runs into visual rows (same page, y-position within tolerance),
 * then buckets each run into a column by x-position.
 */
function groupRunsIntoRows(runs, yTolerance = 3) {
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
      const bucket = bucketForX(run.x);
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
    const poNumber = (row.cells.poNumber || "").trim();
    if (!PO_NUMBER_REGEX.test(poNumber)) continue; // header/footer/info rows

    const quantity = parseInt(
      (row.cells.quantity || "").replace(/[^\d]/g, ""),
      10,
    );
    const ctnCount = parseInt((row.cells.ctn || "").replace(/[^\d]/g, ""), 10);
    const unitCost = parseFloat(row.cells.unitCost);
    const grossWeightKg = parseFloat(row.cells.grossWeight);
    const netWeightKg = parseFloat(row.cells.netWeight);
    const cbm = parseFloat(row.cells.cbm);
    const sku = (row.cells.sku || "").trim();
    const dimensions = (row.cells.dimensions || "").replace(/\s+/g, " ").trim();
    const lineNoMatch = (row.cells.lineNo || "").match(/\d+/);

    const item = {
      ctnNo: lineNoMatch ? parseInt(lineNoMatch[0], 10) : null,
      poNumber,
      sku,
      itemName: (row.cells.itemName || "").replace(/\s+/g, " ").trim(),
      color: (row.cells.color || "").replace(/\s+/g, " ").trim(),
      size: (row.cells.size || "").trim(),
      co: (row.cells.co || "").trim(),
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
    {
      totalQuantity: 0,
      totalCartons: 0,
      totalGrossWeight: 0,
      totalNetWeight: 0,
      totalCbm: 0,
    },
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
  { header: "CTN NO", key: "ctnNo", width: 8 },
  { header: "PO Number", key: "poNumber", width: 14 },
  { header: "Sku", key: "sku", width: 16 },
  { header: "Item Name (Style)", key: "itemName", width: 20 },
  { header: "Color", key: "color", width: 18 },
  { header: "Size", key: "size", width: 8 },
  { header: "C.O.", key: "co", width: 6 },
  { header: "Unit Cost", key: "unitCost", width: 10 },
  { header: "Quantity", key: "quantity", width: 10 },
  { header: "CTN", key: "ctn", width: 6 },
  { header: "G.W. (KGS)", key: "grossWeightKg", width: 12 },
  { header: "N.W. (KGS)", key: "netWeightKg", width: 12 },
  { header: "CTN Demi", key: "ctnDemi", width: 20 },
  { header: "CBM", key: "cbm", width: 10 },
];

/** Step A: write parsed line items to a real .xlsx file. */
async function writeExcel(items, excelPath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Packing List");
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

  const keys = EXCEL_COLUMNS.map((c) => c.key);
  const items = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const values = row.values.slice(1); // exceljs row.values is 1-indexed
    const obj = {};
    keys.forEach((key, i) => {
      obj[key] = values[i] !== undefined ? values[i] : null;
    });
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
  const rows = groupRunsIntoRows(runs);
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
  groupRunsIntoRows,
  rowsToLineItems,
  summarize,
};
