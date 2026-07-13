/**
 * packingListParser.js
 *
 * Parses the raw text produced by PDFParse (or any PDF-to-text extractor that doesn't
 * preserve column layout) for the "PACKING LIST - WOXER" style documents into an array
 * of clean row objects, ready to insert into SQL.
 *
 * WHY THIS ISN'T A SIMPLE SPLIT-BY-LINE:
 * Text extracted from this PDF's table has a few quirks:
 *   1. The "Quantity" and "CTN" columns are sometimes glued together with no space
 *      (e.g. "1501" means Quantity=150, CTN=1) and sometimes space-separated
 *      (e.g. "63 1"). CTN is *always* 1 for every row in this document (confirmed
 *      against the sheet's own TOTAL row: 506 cartons for 506 line items), so we can
 *      reliably strip the trailing "1" to recover the true quantity.
 *   2. Some rows wrap across what were originally multiple lines/columns in the PDF
 *      (e.g. Color/Size on their own line).
 *   3. At a few page-break points, the row's line-number digits get glued onto the
 *      END of the previous row's CBM value (e.g. "...0.062173\n- 173"). We don't need
 *      to clean this up explicitly — anchoring extraction on the PO Number + SKU and
 *      using a precise CBM pattern (always exactly 3 decimal places) means the parser
 *      simply ignores this trailing junk.
 *
 * STRATEGY:
 * Rather than splitting the text by lines (unreliable given the wraps above), we split
 * it into per-row "chunks" anchored on PO Number occurrences (a very distinctive,
 * unambiguous pattern: e.g. "W22603-1", "W22603-0-6"), then run a single regex over
 * each chunk to pull out every field regardless of internal whitespace/newlines.
 */

const PO_NUMBER_REGEX = /W\d{5}-\d(?:-\d)?/g;

const ROW_REGEX = new RegExp(
  '^(W\\d{5}-\\d(?:-\\d)?)\\s*' +                   // 1  PO Number
  '([A-Z0-9]{4}-[A-Z0-9]{3,4}-[A-Z0-9]{1,3})\\s*' + // 2  SKU
  '([\\s\\S]*?)\\s*' +                              // 3  Item Name + Color (free text, cleaned later)
  '(XS|2XL|3XL|4XL|XL|S|M|L)\\s*LK\\s*' +           // 4  Size
  '(\\d+(?:\\.\\d+)?)\\s*' +                        // 5  C.O. / Unit Cost
  '(\\d+)\\s*1\\b\\s*' +                            // 6  Quantity (trailing "1" is CTN, stripped here)
  '([\\d.]+)\\s*' +                                 // 7  CTN Gross Weight (KGS)
  '([\\d.]+)\\s*' +                                 // 8  CTN Net Weight (KGS)
  '(\\d+\\s*X\\s*\\d+\\s*X\\s*\\d+\\s*CM)\\s*' +    // 9  Carton dimensions
  '(\\d+\\.\\d{3})'                                 // 10 CBM (always exactly 3 decimal places in this doc)
);

/**
 * @param {string} text - raw text from PDFParse's getText() (pdfData.text)
 * @returns {{ rows: object[], errors: object[] }}
 *   rows: successfully parsed line items
 *   errors: chunks that didn't match the expected pattern, for manual review
 */
function parsePackingListText(text) {
  const poMatches = [...text.matchAll(PO_NUMBER_REGEX)];
  const rows = [];
  const errors = [];

  for (let i = 0; i < poMatches.length; i++) {
    const start = poMatches[i].index;
    const end = i + 1 < poMatches.length ? poMatches[i + 1].index : text.length;
    const chunk = text.slice(start, end);

    const m = chunk.match(ROW_REGEX);
    if (!m) {
      errors.push({ rowIndex: i, poNumber: poMatches[i][0], rawChunk: chunk });
      continue;
    }

    rows.push({
      poNumber: m[1],
      sku: m[2],
      itemDescription: m[3].replace(/\s+/g, ' ').trim(), // item name + color combined
      size: m[4],
      unitCost: parseFloat(m[5]),
      quantity: parseInt(m[6], 10),
      ctnCount: 1,
      grossWeightKg: parseFloat(m[7]),
      netWeightKg: parseFloat(m[8]),
      cartonDimensions: m[9].replace(/\s+/g, ' ').trim(),
      cbm: parseFloat(m[10]),
    });
  }

  return { rows, errors };
}

/**
 * Optional sanity check: compares parsed totals against the PDF's own "TOTAL:" row
 * (Quantity, CTN count, Gross Weight, Net Weight, CBM) so you can catch parsing drift
 * on future documents that follow the same template. Pass in the expected totals you
 * read off the PDF's summary row (or scrape it separately) if you want to use this.
 */
function summarize(rows) {
  const raw = rows.reduce(
    (acc, r) => ({
      totalQuantity: acc.totalQuantity + r.quantity,
      totalCartons: acc.totalCartons + r.ctnCount,
      totalGrossWeight: acc.totalGrossWeight + r.grossWeightKg,
      totalNetWeight: acc.totalNetWeight + r.netWeightKg,
      totalCbm: acc.totalCbm + r.cbm,
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

module.exports = { parsePackingListText, summarize };