const db = require("../../sql-connection");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parsePurchaseOrderExcel } = require("./po-parser");
const {
  resolvePoTotalQty,
  insertItems,
  toShortString,
  toNumber,
  extractSizes,
  resolveItemTotalQty,
  toMysqlDateTime,
} = require("../../helpers/helper-functions");

// Upload Purchase Order
exports.uploadPurchaseOrderFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const uploadDir = path.join(os.tmpdir(), "uploads", "po");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const d = new Date();
    const dateStr = [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear(),
    ].join("");
    const timeStr = [
      String(d.getHours()).padStart(2, "0"),
      String(d.getMinutes()).padStart(2, "0"),
    ].join("");
    const fileName = `po-${dateStr}-${timeStr}.xlsx`;

    const filePath = path.join(uploadDir, fileName);

    // Save uploaded PDF to /tmp so the parser has a real path to write to
    fs.writeFileSync(filePath, req.file.buffer);

    // Parse directly from the in-memory buffer — no disk write needed
    const {
      issuer,
      poNumber,
      dateIssued,
      vendor,
      shipTo,
      items,
      totals,
      comments,
    } = await parsePurchaseOrderExcel(req.file.buffer);

    return res.status(200).json({
      success: true,
      filename: fileName,
      poNumber,
      dateIssued,
      issuer,
      vendor,
      shipTo,
      itemCount: items.length,
      items,
      totals,
      comments,
    });
  } catch (err) {
    console.error("UPLOAD PURCHASE ORDER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const body = req.body;

    if (!body.poNumber) {
      connection.release();
      return res
        .status(400)
        .json({ success: false, message: "poNumber is required" });
    }

    const createdBy = req.user?.username ?? req.user?.id ?? null;

    await connection.beginTransaction();

    // createPurchaseOrder
    const [result] = await connection.query(
      `INSERT INTO purchase_order
     (poNumber, dateIssued, issuer, vendor, shipTo, totalQty,
      ex_factory_date, dc_in_house_date, filePath, packing_list_id,
      hbl_nos, created_by, created_on)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        body.poNumber,
        body.dateIssued ?? null,
        toShortString(body.issuer),
        toShortString(body.vendor),
        toShortString(body.shipTo),
        resolvePoTotalQty(body),
        toMysqlDateTime(body.exFactoryDate), // <-- changed
        toMysqlDateTime(body.dcInHouseDate), // <-- changed
        body.filePath ?? null,
        body.packingListId ?? null,
        body.hblNos ?? null,
        body.created_by ?? null,
      ],
    );

    const poId = result.insertId;

    await insertItems(connection, poId, body.items);

    await connection.commit();

    const [[po]] = await connection.query(
      `SELECT * FROM purchase_order WHERE id = ?`,
      [poId],
    );
    const [items] = await connection.query(
      `SELECT * FROM po_items WHERE po_id = ?`,
      [poId],
    );

    return res.status(201).json({ success: true, data: { ...po, items } });
  } catch (err) {
    await connection.rollback();
    console.error("createPurchaseOrder error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create purchase order" });
  } finally {
    connection.release();
  }
};

// ---------- GET ALL ----------

exports.getAllPurchaseOrders = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    const offset = (toNumber(page) - 1) * toNumber(limit);
    const params = [];
    let where = "";

    if (search) {
      where = `WHERE po.poNumber LIKE ? OR po.vendor LIKE ? OR po.issuer LIKE ?`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    // Step 1: paginate POs, still surfacing itemCount for list-view badges
    const [poRows] = await db.query(
      `SELECT
         po.*,
         COUNT(pi.id) AS itemCount
       FROM purchase_order po
       LEFT JOIN po_items pi ON pi.po_id = po.id
       ${where}
       GROUP BY po.id
       ORDER BY po.created_on DESC
       LIMIT ? OFFSET ?`,
      [...params, toNumber(limit), offset],
    );

    const poIds = poRows.map((po) => po.id);

    // Step 2: fetch full po_items rows for exactly the POs on this page
    let itemsByPoId = new Map();
    if (poIds.length) {
      const placeholders = poIds.map(() => "?").join(", ");
      const [itemRows] = await db.query(
        `SELECT
           id,
           po_id,
           product,
           style,
           colorway,
           xs,
           s,
           m,
           l,
           xl,
           \`2xl\`,
           \`3xl\`,
           \`4xl\`,
           totalQty
         FROM po_items
         WHERE po_id IN (${placeholders})`,
        poIds,
      );

      itemsByPoId = itemRows.reduce((map, item) => {
        const list = map.get(item.po_id) || [];
        list.push(item);
        map.set(item.po_id, list);
        return map;
      }, new Map());
    }

    // Step 3: attach items array to each PO
    const data = poRows.map((po) => ({
      ...po,
      items: itemsByPoId.get(po.id) || [],
    }));

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM purchase_order po ${where}`,
      params,
    );

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: toNumber(page),
        limit: toNumber(limit),
      },
    });
  } catch (err) {
    console.error("getAllPurchaseOrders error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch purchase orders" });
  }
};

// ---------- GET BY ID ----------

exports.getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const [[po]] = await db.query(`SELECT * FROM purchase_order WHERE id = ?`, [
      toNumber(id),
    ]);

    if (!po) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase order not found" });
    }

    const [items] = await db.query(
      `SELECT * FROM po_items WHERE po_id = ? ORDER BY id ASC`,
      [toNumber(id)],
    );

    return res.status(200).json({ success: true, data: { ...po, items } });
  } catch (err) {
    console.error("getPurchaseOrderById error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch purchase order" });
  }
};

// ---------- PUT ----------

exports.updatePurchaseOrder = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const poId = toNumber(id);
    const body = req.body;

    const [[existing]] = await connection.query(
      `SELECT id FROM purchase_order WHERE id = ?`,
      [poId],
    );
    if (!existing) {
      connection.release();
      return res
        .status(404)
        .json({ success: false, message: "Purchase order not found" });
    }

    const updatedBy = req.user?.username ?? req.user?.id ?? null;

    await connection.beginTransaction();

    await connection.query(
      `UPDATE purchase_order SET
        poNumber = ?, dateIssued = ?, issuer = ?, vendor = ?, shipTo = ?,
        totalQty = ?, ex_factory_date = ?, dc_in_house_date = ?, filePath = ?,
        packing_list_id = ?, hbl_nos = ?, updated_by = ?, updated_on = NOW()
        WHERE id = ?`,
      [
        body.poNumber,
        body.dateIssued ?? null,
        toShortString(body.issuer),
        toShortString(body.vendor),
        toShortString(body.shipTo),
        resolvePoTotalQty(body),
        toMysqlDateTime(body.ex_factory_date), // <-- changed
        toMysqlDateTime(body.dc_in_house_date), // <-- changed
        body.filePath ?? null,
        body.packingListId ?? null,
        body.hblNos ?? null,
        body.updated_by ?? null,
        poId,
      ],
    );

    // Replace items wholesale rather than diffing - same delete-then-reinsert
    // approach avoids the stale-schema carryover bugs updatePackingList hit.
    if (Array.isArray(body.items)) {
      await connection.query(`DELETE FROM po_items WHERE po_id = ?`, [poId]);
      await insertItems(connection, poId, body.items);
    }

    await connection.commit();

    const [[po]] = await connection.query(
      `SELECT * FROM purchase_order WHERE id = ?`,
      [poId],
    );
    const [items] = await connection.query(
      `SELECT * FROM po_items WHERE po_id = ?`,
      [poId],
    );

    return res.status(200).json({ success: true, data: { ...po, items } });
  } catch (err) {
    await connection.rollback();
    console.error("updatePurchaseOrder error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update purchase order" });
  } finally {
    connection.release();
  }
};
