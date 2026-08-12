// Helper: format a date value as YYYYMMDD
export const formatDateYYYYMMDD = (dateInput) => {
  const d = new Date(dateInput);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}${mm}${yy}`;
};

// Guards against NaN slipping through ?? fallbacks - same fix pattern
// used in createPackingList/updatePackingList.
export const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// issuer/vendor/shipTo are VARCHAR(45) columns - the parser output gives
// objects like { name, contact, addressLines, phone }. We only persist the
// name, and hard-truncate to 45 chars so inserts never fail silently.
export const toShortString = (v) => {
  if (v === null || v === undefined) return null;
  const str = typeof v === "object" ? (v.name ?? "") : String(v);
  return str.slice(0, 45);
};

// sizes come in as { XS, S, M, L, XL, 2XL, 3XL, 4XL } from the parser -
// normalize to the lowercase column keys used in po_items.
export const extractSizes = (sizes = {}) => {
  return {
    xs: toNumber(sizes.XS),
    s: toNumber(sizes.S),
    m: toNumber(sizes.M),
    l: toNumber(sizes.L),
    xl: toNumber(sizes.XL),
    xxl: toNumber(sizes["2XL"]),
    xxxl: toNumber(sizes["3XL"]),
    xxxxl: toNumber(sizes["4XL"]),
  };
};

// If an item's totalQty is null (as several rows are in your sample PDF),
// fall back to summing the size buckets rather than writing null/NaN.
export const resolveItemTotalQty = (item, sizeVals) => {
  const direct = toNumber(item.totalQty);
  if (direct !== null) return direct;
  return Object.values(sizeVals).reduce((sum, n) => sum + (n ?? 0), 0);
};

export const insertItems = async (connection, poId, items = []) => {
  if (!items.length) return;

  const rows = items.map((item) => {
    const sizeVals = extractSizes(item.sizes);
    const totalQty = resolveItemTotalQty(item, sizeVals);
    return [
      poId,
      item.product ?? null,
      item.style ?? null,
      item.colorway ?? null,
      sizeVals.xs,
      sizeVals.s,
      sizeVals.m,
      sizeVals.l,
      sizeVals.xl,
      sizeVals.xxl,
      sizeVals.xxxl,
      sizeVals.xxxxl,
      totalQty,
    ];
  });

  // Bulk insert in one round trip rather than looping single INSERTs.
  await connection.query(
    `INSERT INTO po_items
       (po_id, product, style, colorway, xs, s, m, l, xl, \`2xl\`, \`3xl\`, \`4xl\`, totalQty)
     VALUES ?`,
    [rows],
  );
};

// Sum item totalQty as a fallback for the PO-level totalQty when the
// parser's totals.totalQty comes back null.
export const resolvePoTotalQty = (body) => {
  const direct = toNumber(body?.totals?.totalQty ?? body?.totalQty);
  if (direct !== null) return direct;

  const items = body.items ?? [];
  return items.reduce((sum, item) => {
    const sizeVals = extractSizes(item.sizes);
    return sum + resolveItemTotalQty(item, sizeVals);
  }, 0);
};

export const toMysqlDateTime = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};
