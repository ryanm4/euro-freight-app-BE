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
      grn_ids,
      ports = []
    } = req.body;

    // =====================
    // Validate GRN IDs
    // =====================
    if (!grn_ids) {
      throw new Error("grn_ids is required");
    }

    if (typeof grn_ids === "string") {
      grn_ids = grn_ids
        .split(",")
        .map(id => parseInt(id.trim()))
        .filter(Boolean);
    }

    if (!Array.isArray(grn_ids) || grn_ids.length === 0) {
      throw new Error("grn_ids must be a non-empty array");
    }

    // =====================
    // Insert HBL
    // =====================
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
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
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

    // =====================
    // Insert Multiple Ports
    // =====================
    if (Array.isArray(ports) && ports.length > 0) {
      const portValues = ports.map(p => [
        hblId,
        clean(p.port),
        clean(p.status),
        clean(created_by),
        new Date()
      ]);

      await connection.query(
        `
        INSERT INTO freight_tracking_app.multi_ports (
          hbl_hawb_id,
          port,
          status,
          created_by,
          created_on
        )
        VALUES ?
        `,
        [portValues]
      );
    }

    // =====================
    // Update GRNs
    // =====================
    const placeholders = grn_ids.map(() => "?").join(",");

    const updateGRNQuery = `
      UPDATE freight_tracking_app.goods_receive_notes
      SET
        bill_id = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id IN (${placeholders})
    `;

    const [updateResult] = await connection.execute(
      updateGRNQuery,
      [
        hblId,
        created_by || null,
        ...grn_ids
      ]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error("No GRNs updated. Check grn_ids");
    }

    // =====================
    // Update Purchase Orders
    // purchase_order -> packing_list -> goods_receive_notes
    // =====================
    const updatePOQuery = `
      UPDATE freight_tracking_app.purchase_order po
      INNER JOIN freight_tracking_app.packing_list pl
        ON po.packing_list_id = pl.id
      SET
        po.hbl_no = ?,
        po.updated_by = ?,
        po.updated_on = NOW()
      WHERE pl.grn_id IN (${placeholders})
    `;

    const [poUpdateResult] = await connection.execute(
      updatePOQuery,
      [
        clean(mbl_mawb_no),
        created_by || null,
        ...grn_ids
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "HBL created successfully",
      data: {
        hbl_id: hblId,
        updated_grns: grn_ids,
        ports_count: ports.length,
        grn_updated_count: updateResult.affectedRows,
        po_updated_count: poUpdateResult.affectedRows
      }
    });

  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error creating HBL",
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
      arrival_port, // STRING (unchanged)
      inland_location, // STRING (you confirmed)
      mbl_mawb_no,
      status,
      no_pieces,
      gross_weight,
      chargeable_weight,
      cbm,
      container_seal_no,
      onboard_date,
      updated_by,
      grn_ids,
      ports = [] // NEW: multi ports
    } = req.body;

    // =========================
    // VALIDATION
    // =========================
    if (!id) throw new Error("HBL id is required");

    if (typeof grn_ids === "string") {
      grn_ids = grn_ids
        .split(",")
        .map((x) => parseInt(x.trim()))
        .filter(Boolean);
    }

    if (!Array.isArray(grn_ids)) grn_ids = [];

    // =========================
    // 1. UPDATE HBL (MAIN TABLE)
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
        arrival_port = ?,        -- STRING (UNCHANGED)
        inland_location = ?,     -- STRING (UNCHANGED)
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
    if (grn_ids.length > 0) {
      const placeholders = grn_ids.map(() => "?").join(",");

      await connection.execute(
        `
        UPDATE freight_tracking_app.goods_receive_notes
        SET bill_id = ?, updated_by = ?, updated_on = NOW()
        WHERE id IN (${placeholders})
        `,
        [id, updated_by || null, ...grn_ids]
      );
    }

    // =========================
    // 4. UPDATE MULTI PORTS
    // =========================

    // delete old ports
    await connection.execute(
      `DELETE FROM freight_tracking_app.multi_ports WHERE hbl_hawb_id = ?`,
      [id]
    );

    // insert new ports
    if (Array.isArray(ports) && ports.length > 0) {
      const values = ports.map(p => [
        id,
        p.port,
        p.status || null,
        updated_by || null,
        new Date()
      ]);

      await connection.query(
        `
        INSERT INTO freight_tracking_app.multi_ports
        (hbl_hawb_id, port, status, created_by, created_on)
        VALUES ?
        `,
        [values]
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "HBL updated successfully",
      data: {
        hbl_id: id,
        linked_grns: grn_ids,
        ports_count: ports.length
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
        h.id,

        client.name AS client_id,
        manufacture.name AS manufacture_id,

        h.date,
        h.type,
        h.shipment_id,
        h.planned_vessel_name,
        h.voyage_no,
        h.etd,
        h.eta,
        h.actual_etd,
        h.actual_eta,
        h.arrival_port,
        h.inland_location,
        h.mbl_mawb_no,
        h.status,
        h.no_pieces,
        h.gross_weight,
        h.chargeable_weight,
        h.cbm,
        h.container_seal_no,
        h.onboard_date,
        h.created_by,
        h.created_on,
        h.updated_by,
        h.updated_on,

        COALESCE(g.grns, JSON_ARRAY()) AS grns,
        COALESCE(p.ports, JSON_ARRAY()) AS ports

      FROM freight_tracking_app.hbl_hawb_tbl h

      LEFT JOIN freight_tracking_app.clients client
        ON h.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON h.manufacture_id = manufacture.id

      LEFT JOIN (
        SELECT 
          grn.bill_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', grn.id,
              'client_id', client.name,
              'manufacture_id', manufacture.name,
              'date', grn.date,
              'quantity', grn.quantity,
              'status', grn.status
            )
          ) AS grns
        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        GROUP BY grn.bill_id
      ) g ON g.bill_id = h.id

      LEFT JOIN (
        SELECT 
          hbl_hawb_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', id,
              'port', port,
              'status', status,
              'created_on', created_on
            )
          ) AS ports
        FROM freight_tracking_app.multi_ports
        GROUP BY hbl_hawb_id
      ) p ON p.hbl_hawb_id = h.id

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
        h.id,

        client.name AS client_id,
        manufacture.name AS manufacture_id,

        h.date,
        h.type,
        h.shipment_id,
        h.planned_vessel_name,
        h.voyage_no,
        h.etd,
        h.eta,
        h.actual_etd,
        h.actual_eta,
        h.arrival_port,
        h.inland_location,
        h.mbl_mawb_no,
        h.status,
        h.no_pieces,
        h.gross_weight,
        h.chargeable_weight,
        h.cbm,
        h.container_seal_no,
        h.onboard_date,
        h.created_by,
        h.created_on,
        h.updated_by,
        h.updated_on,

        COALESCE(g.grns, JSON_ARRAY()) AS grns,
        COALESCE(p.ports, JSON_ARRAY()) AS ports

      FROM freight_tracking_app.hbl_hawb_tbl h

      LEFT JOIN freight_tracking_app.clients client
        ON h.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON h.manufacture_id = manufacture.id

      LEFT JOIN (
        SELECT 
          grn.bill_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', grn.id,
              'client_id', client.name,
              'manufacture_id', manufacture.name,
              'date', grn.date,
              'quantity', grn.quantity,
              'status', grn.status
            )
          ) AS grns
        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        GROUP BY grn.bill_id
      ) g ON g.bill_id = h.id

      LEFT JOIN (
        SELECT 
          hbl_hawb_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', id,
              'port', port,
              'status', status,
              'created_on', created_on
            )
          ) AS ports
        FROM freight_tracking_app.multi_ports
        GROUP BY hbl_hawb_id
      ) p ON p.hbl_hawb_id = h.id

      WHERE h.id = ?
    `;

    const [rows] = await db.execute(query, [id]);

    if (!rows.length) {
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