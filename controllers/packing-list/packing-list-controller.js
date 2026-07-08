const db = require("../../sql-connection");

exports.createPackingList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      client_id,
      date,
      po_detail_ids,
      created_by,
      quantity,
    } = req.body;

    if (!po_detail_ids || po_detail_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "po_detail_ids is required",
      });
    }

    // 1. CHECK if any PO already assigned
    const [existing] = await connection.query(
      `
        SELECT id, po_number
        FROM freight_tracking_app.purchase_order
        WHERE id IN (?)
        AND packing_list_id IS NOT NULL
      `,
      [po_detail_ids]
    );

    if (existing.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Some purchase orders are already assigned to a packing list",
        data: existing,
      });
    }

    // 2. Create packing list
    const insertPackingListQuery = `
      INSERT INTO freight_tracking_app.packing_list
      (
        client_id,
        date,
        created_by,
        created_on,
        quantity
      )
      VALUES (?, ?, ?, NOW(), ?)
    `;

    const [packingResult] = await connection.query(
      insertPackingListQuery,
      [client_id, date, created_by, quantity]
    );

    const packingListId = packingResult.insertId;

    // 3. Assign PO to packing list
    await connection.query(
      `
        UPDATE freight_tracking_app.purchase_order
        SET
          packing_list_id = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
      `,
      [packingListId, created_by, po_detail_ids]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Packing list created successfully",
      packing_list_id: packingListId,
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
      date,
      po_detail_ids,
      updated_by,
    } = req.body;

    // Check if packing list exists
    const [existing] = await connection.query(
      `SELECT * FROM freight_tracking_app.packing_list WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Packing list not found",
      });
    }

    // Update packing list (DO NOT TOUCH created_by / created_on)
    const updatePackingListQuery = `
      UPDATE freight_tracking_app.packing_list
      SET
        client_id = ?,
        date = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    await connection.query(updatePackingListQuery, [
      client_id,
      date,
      updated_by,
      id,
    ]);

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
      [updated_by, id]
    );

    // Assign new PO details
    if (po_detail_ids && po_detail_ids.length > 0) {
      await connection.query(
        `
          UPDATE freight_tracking_app.purchase_order
          SET
            packing_list_id = ?,
            updated_by = ?,
            updated_on = NOW()
          WHERE id IN (?)
        `,
        [id, updated_by, po_detail_ids]
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Packing list updated successfully",
      packing_list_id: Number(id),
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
    const [rows] = await db.query(`
      SELECT 
        pl.id AS packing_list_id,
        c.name AS client_id,
        pl.date,
        pl.gdn_id,
        pl.quantity,
        pl.grn_id,
        pl.created_by,
        pl.created_on,
        pl.updated_by,
        pl.updated_on,

        po.id AS po_id,
        po.po_number,
        po.po_quantity,
        po.status

      FROM freight_tracking_app.packing_list pl

      LEFT JOIN freight_tracking_app.clients c
        ON c.id = pl.client_id

      LEFT JOIN freight_tracking_app.purchase_order po
        ON po.packing_list_id = pl.id

      ORDER BY pl.id DESC
    `);

    const map = new Map();

    rows.forEach((r) => {
      if (!map.has(r.packing_list_id)) {
        map.set(r.packing_list_id, {
          packing_list_id: r.packing_list_id,
          client_id: r.client_id, // returns client name
          gdn_id: r.gdn_id,
          grn_id: r.grn_id,
          date: r.date,
          created_by: r.created_by,
          created_on: r.created_on,
          updated_by: r.updated_by,
          updated_on: r.updated_on,
          quantity: r.quantity,
          purchase_orders: [],
        });
      }

      if (r.po_id) {
        map.get(r.packing_list_id).purchase_orders.push({
          po_id: r.po_id,
          po_number: r.po_number,
          po_quantity: r.po_quantity,
          status: r.status,
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

    const [rows] = await db.query(`
      SELECT 
        pl.id AS packing_list_id,
        c.name AS client_id,
        pl.date,
        pl.gdn_id,
        pl.grn_id,
        pl.created_by,
        pl.created_on,
        pl.updated_by,
        pl.updated_on,
        pl.quantity,

        po.id AS po_id,
        po.po_number,
        po.po_quantity,
        po.shipping_mode,
        po.final_destination,
        po.status

      FROM freight_tracking_app.packing_list pl

      LEFT JOIN freight_tracking_app.clients c
        ON c.id = pl.client_id

      LEFT JOIN freight_tracking_app.purchase_order po
        ON po.packing_list_id = pl.id

      WHERE pl.id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Packing list not found",
      });
    }

    const result = {
      packing_list_id: rows[0].packing_list_id,
      client_id: rows[0].client_id, // returns client name instead of ID
      gdn_id: rows[0].gdn_id,
      date: rows[0].date,
      created_by: rows[0].created_by,
      created_on: rows[0].created_on,
      updated_by: rows[0].updated_by,
      updated_on: rows[0].updated_on,
      quantity: rows[0].quantity,
      grn_id: rows[0].grn_id,
      purchase_orders: [],
    };

    rows.forEach((r) => {
      if (r.po_id) {
        result.purchase_orders.push({
          po_id: r.po_id,
          po_number: r.po_number,
          po_quantity: r.po_quantity,
          shipping_mode: r.shipping_mode,
          final_destination: r.final_destination,
          status: r.status,
        });
      }
    });

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