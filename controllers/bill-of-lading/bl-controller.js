const db = require("../../sql-connection");

// Helper to convert undefined → null
const clean = (val) => (val === undefined ? null : val);

// Create HBL + update multiple GRNs
exports.createHBL = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let {
      client_id,
      manufacture_id,
      date,
      type,
      shipment_id,
      planned_vessel_name,
      voyage_no,
      etd,
      eta,
      actual_etd,
      actual_eta,
      arrival_port,
      inland_location,
      mbl_mawb_no,
      status,
      no_pieces,
      gross_weight,
      chargeable_weight,
      cbm,
      container_seal_no,
      onboard_date,
      created_by,
      grn_ids
    } = req.body;

    // ===============================
    // VALIDATION
    // ===============================

    if (!grn_ids) {
      throw new Error("grn_ids is required");
    }

    // If sent as "1,2,3" convert to array
    if (typeof grn_ids === "string") {
      grn_ids = grn_ids.split(",").map(id => parseInt(id.trim())).filter(Boolean);
    }

    if (!Array.isArray(grn_ids) || grn_ids.length === 0) {
      throw new Error("grn_ids must be a non-empty array");
    }

    // ===============================
    // INSERT HBL
    // ===============================
    const insertQuery = `
      INSERT INTO freight_tracking_app.hbl_hawb_tbl (
        client_id,
        manufacture_id,
        date,
        type,
        shipment_id,
        planned_vessel_name,
        voyage_no,
        etd,
        eta,
        actual_etd,
        actual_eta,
        arrival_port,
        inland_location,
        mbl_mawb_no,
        status,
        no_pieces,
        gross_weight,
        chargeable_weight,
        cbm,
        container_seal_no,
        onboard_date,
        created_by,
        created_on
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
    `;

    const [result] = await connection.execute(insertQuery, [
      clean(client_id),
      clean(manufacture_id),
      clean(date),
      clean(type),
      clean(shipment_id),
      clean(planned_vessel_name),
      clean(voyage_no),
      clean(etd),
      clean(eta),
      clean(actual_etd),
      clean(actual_eta),
      clean(arrival_port),
      clean(inland_location),
      clean(mbl_mawb_no),
      clean(status),
      clean(no_pieces),
      clean(gross_weight),
      clean(chargeable_weight),
      clean(cbm),
      clean(container_seal_no),
      clean(onboard_date),
      clean(created_by)
    ]);

    const hblId = result.insertId;

    // ===============================
    // UPDATE GRNs (MULTIPLE)
    // ===============================
    const placeholders = grn_ids.map(() => "?").join(",");

    const updateGRNQuery = `
      UPDATE freight_tracking_app.goods_receive_notes
      SET bill_id = ?, updated_by = ?, updated_on = NOW()
      WHERE id IN (${placeholders})
    `;

    const [updateResult] = await connection.execute(updateGRNQuery, [
      hblId,
      created_by || null,
      ...grn_ids
    ]);

    if (updateResult.affectedRows === 0) {
      throw new Error("No GRNs updated. Check grn_ids");
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "HBL created and GRNs updated successfully",
      data: {
        hbl_id: hblId,
        updated_grns: grn_ids,
        grn_updated_count: updateResult.affectedRows
      }
    });

  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error creating HBL and updating GRNs",
      error: error.message
    });

  } finally {
    connection.release();
  }
};


// Update HBL + reassign GRNs
exports.updateHBL = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    let {
      client_id,
      manufacture_id,
      date,
      type,
      shipment_id,
      planned_vessel_name,
      voyage_no,
      etd,
      eta,
      actual_etd,
      actual_eta,
      arrival_port,
      inland_location,
      mbl_mawb_no,
      status,
      no_pieces,
      gross_weight,
      chargeable_weight,
      cbm,
      container_seal_no,
      onboard_date,
      updated_by,
      grn_ids
    } = req.body;

    // =========================
    // VALIDATION
    // =========================
    if (!id) throw new Error("HBL id is required");

    if (grn_ids) {
      if (typeof grn_ids === "string") {
        grn_ids = grn_ids
          .split(",")
          .map((x) => parseInt(x.trim()))
          .filter(Boolean);
      }

      if (!Array.isArray(grn_ids)) {
        throw new Error("grn_ids must be array or comma-separated string");
      }
    }

    // =========================
    // 1. UPDATE HBL
    // =========================
    const updateHBLQuery = `
      UPDATE freight_tracking_app.hbl_hawb_tbl
      SET
        client_id = ?,
        manufacture_id = ?,
        date = ?,
        type = ?,
        shipment_id = ?,
        planned_vessel_name = ?,
        voyage_no = ?,
        etd = ?,
        eta = ?,
        actual_etd = ?,
        actual_eta = ?,
        arrival_port = ?,
        inland_location = ?,
        mbl_mawb_no = ?,
        status = ?,
        no_pieces = ?,
        gross_weight = ?,
        chargeable_weight = ?,
        cbm = ?,
        container_seal_no = ?,
        onboard_date = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    const [hblUpdate] = await connection.execute(updateHBLQuery, [
      clean(client_id),
      clean(manufacture_id),
      clean(date),
      clean(type),
      clean(shipment_id),
      clean(planned_vessel_name),
      clean(voyage_no),
      clean(etd),
      clean(eta),
      clean(actual_etd),
      clean(actual_eta),
      clean(arrival_port),
      clean(inland_location),
      clean(mbl_mawb_no),
      clean(status),
      clean(no_pieces),
      clean(gross_weight),
      clean(chargeable_weight),
      clean(cbm),
      clean(container_seal_no),
      clean(onboard_date),
      clean(updated_by),
      id
    ]);

    if (hblUpdate.affectedRows === 0) {
      throw new Error("HBL not found");
    }

    // =========================
    // 2. RESET OLD GRN LINKS
    // =========================
    await connection.execute(
      `
      UPDATE freight_tracking_app.goods_receive_notes
      SET bill_id = NULL
      WHERE bill_id = ?
      `,
      [id]
    );

    // =========================
    // 3. SET NEW GRN LINKS
    // =========================
    if (grn_ids && grn_ids.length > 0) {
      const placeholders = grn_ids.map(() => "?").join(",");

      const updateGRNQuery = `
        UPDATE freight_tracking_app.goods_receive_notes
        SET bill_id = ?, updated_by = ?, updated_on = NOW()
        WHERE id IN (${placeholders})
      `;

      await connection.execute(updateGRNQuery, [
        id,
        updated_by || null,
        ...grn_ids
      ]);
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "HBL updated successfully",
      data: {
        hbl_id: id,
        linked_grns: grn_ids || []
      }
    });
  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error updating HBL",
      error: error.message
    });
  } finally {
    connection.release();
  }
};

// Get all HBLs with linked GRNs
exports.getAllHBL = async (req, res) => {
  try {
    const query = `
      SELECT 
        h.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', g.id,
            'client_id', g.client_id,
            'manufacture_id', g.manufacture_id,
            'forwarder_id', g.forwarder_id,
            'date', g.date,
            'quantity', g.quantity,
            'status', g.status
          )
        ) AS grns
      FROM freight_tracking_app.hbl_hawb_tbl h
      LEFT JOIN freight_tracking_app.goods_receive_notes g 
        ON g.bill_id = h.id
      GROUP BY h.id
      ORDER BY h.id DESC
    `;

    const [rows] = await db.execute(query);

    return res.status(200).json({
      success: true,
      message: "HBL list fetched successfully",
      data: rows
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching HBL list",
      error: error.message
    });
  }
};

// Get HBL by ID with GRNs
exports.getHBLById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        h.*,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', g.id,
            'client_id', g.client_id,
            'manufacture_id', g.manufacture_id,
            'forwarder_id', g.forwarder_id,
            'date', g.date,
            'quantity', g.quantity,
            'status', g.status
          )
        ) AS grns
      FROM freight_tracking_app.hbl_hawb_tbl h
      LEFT JOIN freight_tracking_app.goods_receive_notes g 
        ON g.bill_id = h.id
      WHERE h.id = ?
      GROUP BY h.id
    `;

    const [rows] = await db.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "HBL not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "HBL fetched successfully",
      data: rows[0]
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching HBL",
      error: error.message
    });
  }
};