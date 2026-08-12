// const ExcelJS = require("exceljs");
import ExcelJS from "exceljs";
 
/**
 * Parses Purchase Order Excel files (matching the Woxer/Brandix-style PO
 * template: header block, VENDOR / SHIP TO blocks, a size-grid line-items
 * table, a qty/total summary row, and a comments section) into JSON.
 *
 * Designed to be used with multer memoryStorage, e.g.:
 *   const upload = multer({ storage: multer.memoryStorage() });
 *   router.post("/purchase-orders/upload", upload.single("file"), uploadPurchaseOrder);
 *
 * The row-scanning approach (searching for label text rather than hardcoding
 * row numbers) keeps this resilient to a few blank rows shifting between POs,
 * as long as the overall template layout stays the same.
 */
 
const SIZE_COLUMNS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
 
// ---------- low level cell helpers ----------
 
const cellText = (cell) => {
  if (!cell) return null;
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && v.richText) {
    return v.richText.map((r) => r.text).join("").trim();
  }
  if (typeof v === "object" && "formula" in v) {
    // formula cell -> use the cached computed result, if Excel saved one.
    // (Formulas that were never recalculated/saved have no cached result.)
    if (v.result === undefined || v.result === null) return null;
    return v.result instanceof Date ? v.result : String(v.result).trim();
  }
  return typeof v === "string" ? v.trim() : v;
};
 
const toNumber = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
};
 
const normalize = (val) =>
  typeof val === "string" ? val.trim().toLowerCase() : val;
 
/** Finds the first cell in the sheet whose text matches `matcher` exactly (case-insensitive). */
const findCell = (sheet, matcher, { fromRow = 1 } = {}) => {
  const target = matcher.toLowerCase();
  for (let r = fromRow; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = cellText(row.getCell(c));
      if (typeof text === "string" && text.toLowerCase() === target) {
        return { row: r, col: c };
      }
    }
  }
  return null;
};
 
/** Reads N non-empty lines going down a single column, starting at a given row. */
const readColumnLines = (sheet, col, startRow, maxLines = 6) => {
  const lines = [];
  for (let r = startRow; r < startRow + maxLines; r += 1) {
    const text = cellText(sheet.getRow(r).getCell(col));
    if (text) lines.push(text);
  }
  return lines;
};
 
// ---------- section extractors ----------
 
const extractHeader = (sheet) => {
  const dateLabel = findCell(sheet, "date issued");
  const poNumberLabel = findCell(sheet, "purchase order number");
  const vendorLabel = findCell(sheet, "vendor");
  const shipToLabel = findCell(sheet, "ship to");
 
  const dateIssued = dateLabel
    ? cellText(sheet.getRow(dateLabel.row + 1).getCell(dateLabel.col))
    : null;
  const poNumber = poNumberLabel
    ? cellText(sheet.getRow(poNumberLabel.row + 1).getCell(poNumberLabel.col))
    : null;
 
  // Buyer / issuer block sits in column A above the VENDOR/SHIP TO row.
  const issuerLines = vendorLabel
    ? readColumnLines(sheet, 1, 1, vendorLabel.row - 1)
    : [];
 
  const vendorLines = vendorLabel
    ? readColumnLines(sheet, vendorLabel.col, vendorLabel.row + 1)
    : [];
  const shipToLines = shipToLabel
    ? readColumnLines(sheet, shipToLabel.col, shipToLabel.row + 1)
    : [];
 
  return {
    issuer: {
      name: issuerLines[0] || null,
      contact: issuerLines[1] || null,
      addressLines: issuerLines.slice(2),
    },
    poNumber,
    dateIssued,
    vendor: {
      name: vendorLines[0] || null,
      addressLines: vendorLines.slice(1, -1),
      phone: vendorLines[vendorLines.length - 1] || null,
    },
    shipTo: {
      name: shipToLines[0] || null,
      addressLines: shipToLines.slice(1, -1),
      phone: shipToLines[shipToLines.length - 1] || null,
    },
  };
};
 
const extractLineItems = (sheet) => {
  const headerCell = findCell(sheet, "product");
  if (!headerCell) {
    throw new Error('Could not locate the "PRODUCT" header row in the sheet');
  }
 
  const headerRow = headerCell.row;
  const headerCells = sheet.getRow(headerRow);
  const colIndex = {};
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const text = cellText(headerCells.getCell(c));
    if (text) colIndex[String(text).toUpperCase()] = c;
  }
 
  const items = [];
  let r = headerRow + 1;
  let totalQtyRow = null;
 
  while (r <= sheet.rowCount) {
    const row = sheet.getRow(r);
 
    // The qty summary row (e.g. "TOTAL QTY" | 36110) is the real end of the
    // table. Product groups are separated by blank spacer rows, so a blank
    // PRODUCT cell alone does NOT mean the table has ended.
    const isSummaryRow = Array.from(
      { length: sheet.columnCount },
      (_, i) => cellText(row.getCell(i + 1))
    ).some((v) => typeof v === "string" && v.toUpperCase() === "TOTAL QTY");
 
    if (isSummaryRow) {
      totalQtyRow = r;
      break;
    }
 
    const product = cellText(row.getCell(colIndex["PRODUCT"]));
    if (!product) {
      r += 1;
      continue; // blank spacer row between product groups
    }
 
    const sizes = {};
    SIZE_COLUMNS.forEach((size) => {
      if (colIndex[size]) sizes[size] = toNumber(cellText(row.getCell(colIndex[size]))) || 0;
    });
 
    items.push({
      product,
      style: cellText(row.getCell(colIndex["STYLE #"])) || null,
      colorway: cellText(row.getCell(colIndex["COLORWAY"])) || null,
      sizes,
      totalQty: toNumber(cellText(row.getCell(colIndex["TOTAL QTY"]))),
      unitPrice: toNumber(cellText(row.getCell(colIndex["UNIT PRICE"]))),
      total: toNumber(cellText(row.getCell(colIndex["TOTAL"]))),
    });
 
    r += 1;
  }
 
  return { items, headerRow, colIndex, totalQtyRow: totalQtyRow ?? r };
};
 
const extractTotals = (sheet, colIndex, totalQtyRow) => {
  // "TOTAL QTY" label sits one column left of its value on the summary row.
  const qtyRow = sheet.getRow(totalQtyRow);
  const totalQty = colIndex["TOTAL QTY"]
    ? toNumber(cellText(qtyRow.getCell(colIndex["TOTAL QTY"])))
    : null;
 
  // Order total ("TOTAL" label, exact match) appears a few rows below, also
  // with its value one column to the right of the label.
  const totalLabel = findCell(sheet, "total", { fromRow: totalQtyRow + 1 });
  const totalAmount = totalLabel
    ? toNumber(cellText(sheet.getRow(totalLabel.row).getCell(totalLabel.col + 1)))
    : null;
 
  return { totalQty, totalAmount };
};
 
const extractComments = (sheet, fromRow) => {
  const commentsLabel = findCell(sheet, "other comments or special instructions", {
    fromRow,
  });
  const contactLabel = findCell(sheet, "authorized by", { fromRow });
 
  if (!commentsLabel) return { notes: [], contact: null };
 
  const endRow = contactLabel ? contactLabel.row : sheet.rowCount;
  const notes = [];
  for (let r = commentsLabel.row + 1; r < endRow; r += 1) {
    const text = cellText(sheet.getRow(r).getCell(1));
    if (text) notes.push(text);
  }
 
  // Free-text contact note usually appears below the "Authorized by" row.
  const contactLines = contactLabel
    ? readColumnLines(sheet, 1, contactLabel.row + 1, 4)
    : [];
 
  return { notes, contact: contactLines.join(" ") || null };
};
 
// ---------- public API ----------
 
/**
 * Parses a Purchase Order workbook buffer into structured JSON.
 * @param {Buffer} buffer - the raw .xlsx file contents
 */
export const parsePurchaseOrderExcel = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
 
  // The PO layout lives on the first sheet. A second "Data" sheet (if
  // present) is just a lookup table backing formulas and is ignored.
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Uploaded workbook has no worksheets");
 
  const header = extractHeader(sheet);
  const { items, colIndex, totalQtyRow } = extractLineItems(sheet);
  const totals = extractTotals(sheet, colIndex, totalQtyRow);
  const comments = extractComments(sheet, totalQtyRow);
 
  return { ...header, items, totals, comments };
};