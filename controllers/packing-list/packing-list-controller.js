const db = require("../../sql-connection");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { parsePackingListText, summarize } = require("./Packing-list-parser");
const { formatDateYYYYMMDD } = require("../../helpers/helper-functions");
const { PACKING_LIST_STATUSES } = require("../../types/types");

exports.createPackingList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      client_id,
      manufacturer_id,
      date,
      gdn_id,
      grn_id,
      ship_to,
      document_date,
      shipping_mode, // NEW: needed to build packing_list_no
      status,
      total_volume,
      created_by,
      items, // parsed packing list line items, sent directly as JSON
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items is required",
      });
    }

    // po_detail_ids is no longer sent by the client — derive the unique set
    // of PO numbers straight from the submitted items instead.
    const poNumbers = [
      ...new Set(items.map((i) => i.poNumber).filter(Boolean)),
    ];

    // purchase_order linkage is best-effort: the PO numbers in a freshly
    // uploaded packing list may not exist in purchase_order yet, so any
    // failure here (missing table/column, no matching rows, query error)
    // is swallowed and simply skipped rather than blocking packing_list
    // creation.
    let conflictingPOs = [];
    let matchedPurchaseOrderIds = [];

    if (poNumbers.length > 0) {
      try {
        const [existing] = await connection.query(
          `
            SELECT id, po_number
            FROM freight_tracking_app.purchase_order
            WHERE po_number IN (?)
            AND packing_list_id IS NOT NULL
          `,
          [poNumbers],
        );
        conflictingPOs = existing;
      } catch (poErr) {
        console.warn(
          "purchase_order lookup failed, continuing without it:",
          poErr.message,
        );
      }
    }

    if (conflictingPOs.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Some purchase orders are already assigned to a packing list",
        data: conflictingPOs,
      });
    }

    const totals = summarize(items);

    // 1. Create packing list (header) using totals derived from the submitted items
    const insertPackingListQuery = `
      INSERT INTO freight_tracking_app.packing_list
      (
        client_id,
        manufacturer_id,
        date,
        gdn_id,
        grn_id,
        total_quantity,
        ship_to,
        document_date,
        total_cartons,
        total_gross_weight_kg,
        total_net_weight_kg,
        total_cbm,
        total_volume,
        shipping_mode,
        status,
        created_by,
        created_on
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [packingResult] = await connection.query(insertPackingListQuery, [
      client_id,
      manufacturer_id || null,
      date,
      gdn_id || null,
      grn_id || null,
      totals.totalQuantity,
      ship_to || null,
      document_date || null,
      totals.totalCartons,
      totals.totalGrossWeight,
      totals.totalNetWeight,
      totals.totalCbm,
      total_volume || null,
      shipping_mode || null,
      status || null,
      created_by,
    ]);

    const packingListId = packingResult.insertId;

    // 1b. Generate packing_list_no now that we have the id: YYYYMMDD/shipping_mode/id
    const datePart = formatDateYYYYMMDD(date);
    const modePart = shipping_mode || "NA";
    const packingListNo = `${datePart}/${modePart}/${packingListId}`;

    await connection.query(
      `
        UPDATE freight_tracking_app.packing_list
        SET packing_list_no = ?
        WHERE id = ?
      `,
      [packingListNo, packingListId],
    );

    // 2. Bulk insert the submitted line items, linked to the new packing list
    const itemValues = items.map((r) => [
      packingListId,
      r.poNumber,
      r.sku,
      r.itemDescription,
      r.size,
      r.unitCost,
      r.quantity,
      r.ctnCount,
      r.grossWeightKg,
      r.netWeightKg,
      r.cartonDimensions,
      r.cbm,
    ]);

    await connection.query(
      `
        INSERT INTO freight_tracking_app.packing_list_items
          (shipment_id, po_number, sku, item_description, size, unit_cost,
           quantity, ctn_count, gross_weight_kg, net_weight_kg, carton_dimensions, cbm)
        VALUES ?
      `,
      [itemValues],
    );

    // 3. Assign PO to packing list (best-effort, see note above)
    if (poNumbers.length > 0) {
      try {
        const [updateResult] = await connection.query(
          `
            UPDATE freight_tracking_app.purchase_order
            SET
              packing_list_id = ?,
              updated_by = ?,
              updated_on = NOW()
            WHERE po_number IN (?)
          `,
          [packingListId, created_by, poNumbers],
        );
        matchedPurchaseOrderIds = updateResult.affectedRows;
      } catch (poErr) {
        console.warn(
          "purchase_order linking failed, continuing without it:",
          poErr.message,
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Packing list created successfully",
      packing_list_id: packingListId,
      packing_list_no: packingListNo,
      rowCount: items.length,
      poNumbers,
      purchaseOrdersLinked: matchedPurchaseOrderIds,
      totals,
      // items,
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      success: false,
      message: "Failed to create packing list",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.updatePackingList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const {
      client_id,
      manufacturer_id,
      date,
      gdn_id,
      grn_id,
      ship_to,
      document_date,
      total_volume,
      shipping_mode,
      status,
      updated_by,
      items, // parsed packing list line items, sent directly as JSON
    } = req.body;

    if (!items || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "items is required",
      });
    }

    // Check if packing list exists
    const [existing] = await connection.query(
      `SELECT * FROM freight_tracking_app.packing_list WHERE id = ?`,
      [id],
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Packing list not found",
      });
    }

    // po_detail_ids is no longer sent by the client — derive the unique set
    // of PO numbers straight from the submitted items instead.
    const poNumbers = [
      ...new Set(items.map((i) => i.poNumber).filter(Boolean)),
    ];

    const totals = summarize(items);

    // 1. Update packing list header (DO NOT TOUCH created_by / created_on)
    const updatePackingListQuery = `
      UPDATE freight_tracking_app.packing_list
      SET
        client_id = ?,
        manufacturer_id = ?,
        date = ?,
        gdn_id = ?,
        grn_id = ?,
        total_quantity = ?,
        ship_to = ?,
        document_date = ?,
        total_cartons = ?,
        total_gross_weight_kg = ?,
        total_net_weight_kg = ?,
        total_cbm = ?,
        total_volume = ?,
        shipping_mode = ?,
        status = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    await connection.query(updatePackingListQuery, [
      client_id,
      manufacturer_id || null,
      date,
      gdn_id || null,
      grn_id || null,
      totals.totalQuantity,
      ship_to || null,
      document_date || null,
      totals.totalCartons,
      totals.totalGrossWeight,
      totals.totalNetWeight,
      totals.totalCbm,
      total_volume || null,
      shipping_mode || null,
      status || null,
      updated_by,
      id,
    ]);

    // 2. Replace line items: wipe old rows for this packing list, insert the new set
    await connection.query(
      `DELETE FROM freight_tracking_app.packing_list_items WHERE shipment_id = ?`,
      [id],
    );

    const itemValues = items.map((r) => [
      id,
      r.poNumber,
      r.sku,
      r.itemDescription,
      r.size,
      r.unitCost,
      r.quantity,
      r.ctnCount,
      r.grossWeightKg,
      r.netWeightKg,
      r.cartonDimensions,
      r.cbm,
    ]);

    await connection.query(
      `
        INSERT INTO freight_tracking_app.packing_list_items
          (shipment_id, po_number, sku, item_description, size, unit_cost,
           quantity, ctn_count, gross_weight_kg, net_weight_kg, carton_dimensions, cbm)
        VALUES ?
      `,
      [itemValues],
    );

    // 3. Re-link purchase_order rows by po_number (best-effort, see note below).
    // The PO numbers on a re-uploaded packing list may not exist in
    // purchase_order yet, so any failure here (missing table/column, no
    // matching rows, query error) is swallowed and simply skipped rather
    // than blocking the update.
    let purchaseOrdersLinked = 0;
    try {
      // Remove old PO assignments linked to this packing list
      await connection.query(
        `
          UPDATE freight_tracking_app.purchase_order
          SET
            packing_list_id = NULL,
            updated_by = ?,
            updated_on = NOW()
          WHERE packing_list_id = ?
        `,
        [updated_by, id],
      );

      // Assign new PO details
      if (poNumbers.length > 0) {
        const [updateResult] = await connection.query(
          `
            UPDATE freight_tracking_app.purchase_order
            SET
              packing_list_id = ?,
              updated_by = ?,
              updated_on = NOW()
            WHERE po_number IN (?)
          `,
          [id, updated_by, poNumbers],
        );
        purchaseOrdersLinked = updateResult.affectedRows;
      }
    } catch (poErr) {
      console.warn(
        "purchase_order relinking failed, continuing without it:",
        poErr.message,
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Packing list updated successfully",
      packing_list_id: Number(id),
      rowCount: items.length,
      poNumbers,
      purchaseOrdersLinked,
      totals,
      // items,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update packing list",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// GET ALL Packing Lists
exports.getAllPackingLists = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
          pl.id AS packing_list_id,
          pl.packing_list_no,
          c.name AS client_name,
          m.name AS manufacturer_name,
          pl.date,
          pl.gdn_id,
          pl.grn_id,
          pl.ship_to,
          pl.document_date,
          pl.total_quantity,
          pl.total_cartons,
          pl.total_gross_weight_kg,
          pl.total_net_weight_kg,
          pl.total_cbm,
          pl.total_volume,
          pl.shipping_mode,
          pl.status,
          pl.created_by,
          pl.created_on,
          pl.updated_by,
          pl.updated_on,

          po.po_number,
          po.po_quantity

      FROM freight_tracking_app.packing_list pl

      LEFT JOIN freight_tracking_app.clients c
          ON c.id = CAST(pl.client_id AS UNSIGNED)

      LEFT JOIN freight_tracking_app.clients m
          ON m.id = CAST(pl.manufacturer_id AS UNSIGNED)

      LEFT JOIN (
          SELECT
              pli.shipment_id AS packing_list_id,
              pli.po_number,
              SUM(pli.quantity) AS po_quantity
          FROM freight_tracking_app.packing_list_items pli
          GROUP BY pli.shipment_id, pli.po_number
      ) po
          ON po.packing_list_id = pl.id
    `;

    const params = [];

    if (status) {
      query += ` WHERE pl.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY pl.id DESC`;

    const [rows] = await db.query(query, params);

    const map = new Map();

    rows.forEach((r) => {
      if (!map.has(r.packing_list_id)) {
        map.set(r.packing_list_id, {
          packing_list_id: r.packing_list_id,
          packing_list_no: r.packing_list_no,
          client_name: r.client_name,
          manufacturer_name: r.manufacturer_name,
          gdn_id: r.gdn_id,
          grn_id: r.grn_id,
          ship_to: r.ship_to,
          date: r.date,
          document_date: r.document_date,
          total_quantity: r.total_quantity,
          total_cartons: r.total_cartons,
          total_gross_weight_kg: r.total_gross_weight_kg,
          total_net_weight_kg: r.total_net_weight_kg,
          total_cbm: r.total_cbm,
          total_volume: r.total_volume,
          status: r.status,
          shipping_mode: r.shipping_mode,
          created_by: r.created_by,
          created_on: r.created_on,
          updated_by: r.updated_by,
          updated_on: r.updated_on,
          purchase_orders: [],
        });
      }

      if (r.po_number) {
        map.get(r.packing_list_id).purchase_orders.push({
          po_number: r.po_number,
          po_id: null,
          po_quantity: r.po_quantity,
        });
      }
    });

    res.json({
      success: true,
      data: Array.from(map.values()),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getPackingListById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT 
        pl.id AS packing_list_id,
        pl.packing_list_no,
        c.name AS client_name,
        m.name AS manufacturer_name,
        pl.date,
        pl.gdn_id,
        pl.grn_id,
        pl.ship_to,
        pl.document_date,
        pl.total_quantity,
        pl.total_cartons,
        pl.total_gross_weight_kg,
        pl.total_net_weight_kg,
        pl.total_cbm,
        pl.total_volume,
        pl.shipping_mode AS shipping_mode,
        pl.status AS status,
        pl.created_by,
        pl.created_on,
        pl.updated_by,
        pl.updated_on

      FROM freight_tracking_app.packing_list pl

      LEFT JOIN freight_tracking_app.clients c
          ON c.id = CAST(pl.client_id AS UNSIGNED)

      LEFT JOIN freight_tracking_app.clients m
          ON m.id = CAST(pl.manufacturer_id AS UNSIGNED)

      WHERE pl.id = ?
    `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Packing list not found",
      });
    }

    // Line items live in their own table (a full join here would fan out
    // against every purchase_order row above), so fetch them separately.
    const [items] = await db.query(
      `
        SELECT 
          id AS item_id,
          po_number,
          sku,
          item_description,
          size,
          unit_cost,
          quantity,
          ctn_count,
          gross_weight_kg,
          net_weight_kg,
          carton_dimensions,
          cbm
        FROM freight_tracking_app.packing_list_items
        WHERE shipment_id = ?
        ORDER BY id ASC
      `,
      [id],
    );

    // purchase_orders is sourced from the distinct po_number values on the
    // items themselves (the source of truth for what's actually in this
    // packing list), then enriched with metadata from purchase_order where
    // a matching row exists. This avoids silently dropping POs whose
    // packing_list_id link never got set (see createPackingList's
    // best-effort PO linking).
    const poNumbers = [
      ...new Set(items.map((i) => i.po_number).filter(Boolean)),
    ];

    // Sum item quantities per po_number
    const poQuantityMap = new Map();
    items.forEach((i) => {
      if (!i.po_number) return;
      const current = poQuantityMap.get(i.po_number) || 0;
      poQuantityMap.set(i.po_number, current + Number(i.quantity || 0));
    });

    let purchaseOrders = poNumbers.map((po_number) => ({
      po_number,
      po_id: null,
      po_quantity: poQuantityMap.get(po_number) ?? null,
      shipping_mode: null,
      final_destination: null,
      status: null,
    }));

    if (poNumbers.length > 0) {
      const [poRows] = await db.query(
        `
          SELECT 
            id AS po_id,
            po_number,
            po_quantity,
            shipping_mode,
            final_destination,
            status
          FROM freight_tracking_app.purchase_order
          WHERE po_number IN (?)
        `,
        [poNumbers],
      );

      const poMap = new Map(poRows.map((p) => [p.po_number, p]));

      purchaseOrders = poNumbers.map((po_number) => {
        const match = poMap.get(po_number);
        return {
          po_number,
          po_id: match?.po_id ?? null,
          po_quantity: poQuantityMap.get(po_number) ?? null,
          // shipping_mode: match?.shipping_mode ?? null,
          // final_destination: match?.final_destination ?? null,
          // status: match?.status ?? null,
        };
      });
    }

    const result = {
      packing_list_id: rows[0].packing_list_id,
      packing_list_no: rows[0].packing_list_no,
      client_name: rows[0].client_name,
      manufacturer_name: rows[0].manufacturer_name,
      gdn_id: rows[0].gdn_id,
      grn_id: rows[0].grn_id,
      ship_to: rows[0].ship_to,
      date: rows[0].date,
      document_date: rows[0].document_date,
      total_quantity: rows[0].total_quantity,
      total_cartons: rows[0].total_cartons,
      total_gross_weight_kg: rows[0].total_gross_weight_kg,
      total_net_weight_kg: rows[0].total_net_weight_kg,
      total_cbm: rows[0].total_cbm,
      total_volume: rows[0].total_volume,
      shipping_mode: rows[0].shipping_mode,
      status: rows[0].status,
      created_by: rows[0].created_by,
      created_on: rows[0].created_on,
      updated_by: rows[0].updated_by,
      updated_on: rows[0].updated_on,
      purchase_orders: purchaseOrders,
      items,
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.uploadPackingListFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Extract text from PDF
    const pdfData = await pdfParse(req.file.buffer);

    console.log("PDF TEXT LENGTH:", pdfData.text.length);

    // Parse packing list text
    const { rows, errors } = parsePackingListText(pdfData.text);

    return res.status(200).json({
      success: true,
      filename: req.file.originalname,
      pages: pdfData.numpages,
      rowCount: rows.length,
      rowsFailedToParse: errors.length,
      totals: summarize(rows),
      items: rows,
      parseErrors: errors,
    });
  } catch (err) {
    console.error("UPLOAD PACKING LIST ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.updatePackingListStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id, status } = req.params;
    const { updated_by } = req.body;

    if (!PACKING_LIST_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${PACKING_LIST_STATUSES.join(", ")}`,
      });
    }

    const [result] = await connection.query(
      `
        UPDATE freight_tracking_app.packing_list
        SET
          status = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id = ?
      `,
      [status, updated_by || null, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Packing list not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Packing list status updated successfully",
      packing_list_id: Number(id),
      status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update packing list status",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};
