const db = require("../../sql-connection");
const { formatDateYYYYMMDD } = require("../../helpers/helper-functions");

// Create Goods Deliver Receive Note
exports.createGDN = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      client_id,
      manufacture_id,
      forwarder_id,
      date,
      packing_list_ids,
      cartoons,
      actual_cartoons,
      gross_weight,
      actual_gross_weight,
      gross_volume,
      actual_gross_volume,
      status,
      created_by,
      gdn_grn_ref,
      vehicle_no,
      driver_id,

      // GDN fields
      dispatch_location,
      transport_mode,
      container_no,
      container_size,
      primary_seal_no,
      secondary_seal_no,
      custom_doc_status,
      wharf_staff_id,
      driver_contact_no,
      wharf_contact_no,

      // Multiple measurements
      measurements,
    } = req.body;

    // ---------------------------------------------------------
    // 1. Validate measurements
    // ---------------------------------------------------------
    if (measurements !== undefined && !Array.isArray(measurements)) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "measurements must be an array",
      });
    }

    // ---------------------------------------------------------
    // 1b. Sanitize empty-string values for numeric/nullable columns
    // ---------------------------------------------------------
    const toNullIfEmpty = (val) =>
      val === "" || val === undefined ? null : val;

    const gdn_grn_ref_clean = toNullIfEmpty(gdn_grn_ref);
    const driver_id_clean = toNullIfEmpty(driver_id);
    const wharf_staff_id_clean = toNullIfEmpty(wharf_staff_id);
    const cartoons_clean = toNullIfEmpty(cartoons);
    const actual_cartoons_clean = toNullIfEmpty(actual_cartoons);
    const gross_weight_clean = toNullIfEmpty(gross_weight);
    const actual_gross_weight_clean = toNullIfEmpty(actual_gross_weight);
    const gross_volume_clean = toNullIfEmpty(gross_volume);
    const actual_gross_volume_clean = toNullIfEmpty(actual_gross_volume);

    // ---------------------------------------------------------
    // 2. Insert GDN
    // ---------------------------------------------------------
    const insertQuery = `
      INSERT INTO freight_tracking_app.goods_deliver_notes (
        client_id,
        manufacture_id,
        forwarder_id,
        date,
        cartoons,
        actual_cartoons,
        gross_weight,
        actual_gross_weight,
        gross_volume,
        actual_gross_volume,
        status,
        gdn_grn_ref,
        vehicle_no,
        driver_id,
        created_by,
        created_on,
        dispatch_location,
        transport_mode,
        container_no,
        container_size,
        primary_seal_no,
        secondary_seal_no,
        custom_doc_status,
        wharf_staff_id,
        driver_contact_no,
        wharf_contact_no
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(),
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.query(insertQuery, [
      client_id,
      manufacture_id,
      forwarder_id,
      date,
      cartoons_clean,
      actual_cartoons_clean,
      gross_weight_clean,
      actual_gross_weight_clean,
      gross_volume_clean,
      actual_gross_volume_clean,
      status,
      gdn_grn_ref_clean,
      vehicle_no,
      driver_id_clean,
      created_by,

      dispatch_location,
      transport_mode,
      container_no,
      container_size,
      primary_seal_no,
      secondary_seal_no,
      custom_doc_status,
      wharf_staff_id_clean,
      driver_contact_no,
      wharf_contact_no,
    ]);

    const gdnId = result.insertId;

    // ---------------------------------------------------------
    // 3. Generate GDN No
    // ---------------------------------------------------------
    const gdnNo = `GDN/${formatDateYYYYMMDD(date)}/${gdnId}`;

    await connection.query(
      `
        UPDATE freight_tracking_app.goods_deliver_notes
        SET gdn_no = ?
        WHERE id = ?
      `,
      [gdnNo, gdnId],
    );

    // ---------------------------------------------------------
    // 4. Insert GDN Measurements
    // ---------------------------------------------------------
    if (measurements && measurements.length > 0) {
      const measurementValues = measurements.map((measurement) => [
        gdnId,
        measurement.length_cm ?? null,
        measurement.width_cm ?? null,
        measurement.height_cm ?? null,
        measurement.packages ?? null,
        measurement.total ?? null,
        measurement.uom ?? null,
        measurement.cbm ?? null,
        measurement.volume ?? null,
      ]);

      await connection.query(
        `
          INSERT INTO freight_tracking_app.gdn_measurements (
            gdn_id,
            length_cm,
            width_cm,
            height_cm,
            packages,
            total,
            uom,
            cbm,
            volume
          )
          VALUES ?
        `,
        [measurementValues],
      );
    }

    // ---------------------------------------------------------
    // 5. Update Packing Lists → Attach GDN & Close
    // ---------------------------------------------------------
    // if (packing_list_ids && packing_list_ids.length > 0) {
    //   await connection.query(
    //     `
    //       UPDATE freight_tracking_app.packing_list
    //       SET
    //         gdn_id = ?,
    //         status = ?,
    //         updated_by = ?,
    //         updated_on = NOW()
    //       WHERE id IN (?)
    //     `,
    //     [gdnId, "Closed", created_by, packing_list_ids],
    //   );
    // }

    // ---------------------------------------------------------
    // 6. Update Purchase Orders
    // ---------------------------------------------------------
    // await connection.query(
    //   `
    //     UPDATE freight_tracking_app.purchase_order po
    //     INNER JOIN freight_tracking_app.packing_list pl
    //       ON po.packing_list_id = pl.id
    //     SET
    //       po.cargo_dispatch_date = ?,
    //       po.status = ?,
    //       po.updated_by = ?,
    //       po.updated_on = NOW()
    //     WHERE pl.gdn_id = ?
    //   `,
    //   [date, "GDN Created", created_by, gdnId],
    // );

    // ---------------------------------------------------------
    // 7. Commit Transaction
    // ---------------------------------------------------------
    await connection.commit();

    return res.status(201).json({
      success: true,
      message:
        "Goods Deliver Note created successfully and Purchase Orders updated",
      gdn_id: gdnId,
      gdn_no: gdnNo,
      measurement_count: measurements?.length || 0,
    });
  } catch (error) {
    await connection.rollback();

    console.error("GDN Creation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating Goods Deliver Note",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.updateGDN = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const gdnId = req.params.id;

    const {
      client_id,
      manufacture_id,
      forwarder_id,
      date,
      packing_list_ids,
      cartoons,
      actual_cartoons,
      gross_weight,
      actual_gross_weight,
      gross_volume,
      actual_gross_volume,
      status,
      updated_by,
      gdn_grn_ref,
      vehicle_no,
      driver_id,

      // New fields
      dispatch_location,
      transport_mode,
      container_no,
      container_size,
      primary_seal_no,
      secondary_seal_no,
      custom_doc_status,
      wharf_staff_id,
      driver_contact_no,
      wharf_contact_no,
      length_cm,
      width_cm,
      height_cm,
    } = req.body || {};

    // ---------------------------------------------------------
    // Sanitize empty-string values for numeric/nullable columns
    // ---------------------------------------------------------
    const toNullIfEmpty = (val) =>
      val === "" || val === undefined ? null : val;

    const gdn_grn_ref_clean = toNullIfEmpty(gdn_grn_ref);
    const driver_id_clean = toNullIfEmpty(driver_id);
    const wharf_staff_id_clean = toNullIfEmpty(wharf_staff_id);
    const cartoons_clean = toNullIfEmpty(cartoons);
    const actual_cartoons_clean = toNullIfEmpty(actual_cartoons);
    const gross_weight_clean = toNullIfEmpty(gross_weight);
    const actual_gross_weight_clean = toNullIfEmpty(actual_gross_weight);
    const gross_volume_clean = toNullIfEmpty(gross_volume);
    const actual_gross_volume_clean = toNullIfEmpty(actual_gross_volume);
    const length_cm_clean = toNullIfEmpty(length_cm);
    const width_cm_clean = toNullIfEmpty(width_cm);
    const height_cm_clean = toNullIfEmpty(height_cm);

    const [existing] = await connection.query(
      `SELECT id 
       FROM freight_tracking_app.goods_deliver_notes
       WHERE id = ?`,
      [gdnId],
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Goods Deliver Note not found",
      });
    }

    const updateQuery = `
      UPDATE freight_tracking_app.goods_deliver_notes
      SET
        client_id = ?,
        manufacture_id = ?,
        forwarder_id = ?,
        date = ?,
        cartoons = ?,
        actual_cartoons = ?,
        gross_weight = ?,
        actual_gross_weight = ?,
        gross_volume = ?,
        actual_gross_volume = ?,
        status = ?,
        gdn_grn_ref = ?,
        vehicle_no = ?,
        driver_id = ?,

        dispatch_location = ?,
        transport_mode = ?,
        container_no = ?,
        container_size = ?,
        primary_seal_no = ?,
        secondary_seal_no = ?,
        custom_doc_status = ?,
        wharf_staff_id = ?,
        length_cm = ?,
        width_cm = ?,
        height_cm = ?,
        driver_contact_no = ?,
        wharf_contact_no = ?,

        updated_by = ?,
        updated_on = NOW()

      WHERE id = ?
    `;

    await connection.query(updateQuery, [
      client_id,
      manufacture_id,
      forwarder_id,
      date,
      cartoons_clean,
      actual_cartoons_clean,
      gross_weight_clean,
      actual_gross_weight_clean,
      gross_volume_clean,
      actual_gross_volume_clean,
      status,
      gdn_grn_ref_clean,
      vehicle_no,
      driver_id_clean,

      dispatch_location,
      transport_mode,
      container_no,
      container_size,
      primary_seal_no,
      secondary_seal_no,
      custom_doc_status,
      wharf_staff_id_clean,
      length_cm_clean,
      width_cm_clean,
      height_cm_clean,
      driver_contact_no,
      wharf_contact_no,
      updated_by,
      gdnId,
    ]);

    // Remove old packing list mappings
    await connection.query(
      `
      UPDATE freight_tracking_app.packing_list
      SET
        gdn_id = NULL,
        updated_by = ?,
        updated_on = NOW()
      WHERE gdn_id = ?
      `,
      [updated_by, gdnId],
    );

    // Add new packing list mappings
    if (packing_list_ids && packing_list_ids.length > 0) {
      await connection.query(
        `
        UPDATE freight_tracking_app.packing_list
        SET
          gdn_id = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
        `,
        [gdnId, updated_by, packing_list_ids],
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Goods Deliver Note updated successfully",
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Error updating Goods Deliver Note",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// Get All Goods Deliver Receive Notes
exports.getAllGDN = async (req, res) => {
  const { status } = req.query;

  try {
    let query = `
      SELECT
        g.id,
        g.gdn_no,

        client.name AS client_name,
        manufacture.name AS manufacture_name,
        forwarder.name AS forwarder_name,

        g.date,
        g.cartoons,
        g.actual_cartoons,
        g.gross_weight,
        g.actual_gross_weight,
        g.gross_volume,
        g.actual_gross_volume,

        g.status,
        g.gdn_grn_ref,
        g.vehicle_no,

        -- Driver details
        g.driver_id,
        driver.name AS driver_name,

        -- Wharf staff details
        g.wharf_staff_id,
        wharf.name AS wharf_staff_name,

        g.dispatch_location,
        g.transport_mode,
        g.container_no,
        g.container_size,
        g.primary_seal_no,
        g.secondary_seal_no,
        g.custom_doc_status,
        g.driver_contact_no,
        g.wharf_contact_no,

        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,

        -- Packing list details
        COALESCE(
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', p.id,
                'shipping_mode', p.shipping_mode,
                'packing_list_no', p.packing_list_no
              )
            )
            FROM freight_tracking_app.packing_list p
            WHERE p.gdn_id = g.id
          ),
          JSON_ARRAY()
        ) AS packing_lists,

        -- GDN measurements
        COALESCE(
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', gm.id,
                'length_cm', gm.length_cm,
                'width_cm', gm.width_cm,
                'height_cm', gm.height_cm,
                'packages', gm.packages,
                'total', gm.total,
                'uom', gm.uom,
                'cbm', gm.cbm,
                'volume', gm.volume
              )
            )
            FROM freight_tracking_app.gdn_measurements gm
            WHERE gm.gdn_id = g.id
          ),
          JSON_ARRAY()
        ) AS measurements

      FROM freight_tracking_app.goods_deliver_notes g

      LEFT JOIN freight_tracking_app.clients client
        ON g.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON g.manufacture_id = manufacture.id

      LEFT JOIN freight_tracking_app.clients forwarder
        ON g.forwarder_id = forwarder.id

      LEFT JOIN freight_tracking_app.drivers driver
        ON g.driver_id = driver.id

      LEFT JOIN freight_tracking_app.wharf_staff wharf
        ON g.wharf_staff_id = wharf.id

      
    `;
    const params = [];

    if (status) {
      query += ` WHERE g.status = ?`;
      params.push(status);
    }
    query += `ORDER BY g.id DESC;`;

    const [rows] = await db.query(query, params);

    const result = rows.map((row) => ({
      ...row,

      // mysql2 normally returns JSON columns as objects,
      // but handle string JSON as well.
      packing_lists: Array.isArray(row.packing_lists)
        ? row.packing_lists
        : typeof row.packing_lists === "string"
          ? JSON.parse(row.packing_lists)
          : [],

      measurements: Array.isArray(row.measurements)
        ? row.measurements
        : typeof row.measurements === "string"
          ? JSON.parse(row.measurements)
          : [],
    }));

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Get All GDN Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving Goods Deliver Notes",
      error: error.message,
    });
  }
};

// Get Goods Deliver Receive Note By ID
exports.getGDNById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        g.id,
        g.gdn_no,

        client.name AS client_name,
        manufacture.name AS manufacture_name,
        forwarder.name AS forwarder_name,

        g.date,
        g.cartoons,
        g.actual_cartoons,
        g.gross_weight,
        g.actual_gross_weight,
        g.gross_volume,
        g.actual_gross_volume,

        g.status,
        g.gdn_grn_ref,
        g.vehicle_no,

        -- Driver details
        g.driver_id,
        driver.name AS driver_name,

        -- Wharf staff details
        g.wharf_staff_id,
        wharf.name AS wharf_staff_name,

        g.dispatch_location,
        g.transport_mode,
        g.container_no,
        g.container_size,
        g.primary_seal_no,
        g.secondary_seal_no,
        g.custom_doc_status,
        g.driver_contact_no,
        g.wharf_contact_no,

        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,

        -- Packing list details
        COALESCE(
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', p.id,
                'shipping_mode', p.shipping_mode,
                'packing_list_no', p.packing_list_no,
                'total_quantity', p.total_quantity,
                'date', p.date,
                'status', p.status,
                'total_cartons', p.total_cartons,
                'total_gross_weight_kg', p.total_gross_weight_kg,
                'total_net_weight_kg', p.total_net_weight_kg,
                'total_cbm', p.total_cbm
              )
            )
            FROM freight_tracking_app.packing_list p
            WHERE p.gdn_id = g.id
          ),
          JSON_ARRAY()
        ) AS packing_lists,

        -- GDN measurements
        COALESCE(
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', gm.id,
                'length_cm', gm.length_cm,
                'width_cm', gm.width_cm,
                'height_cm', gm.height_cm,
                'packages', gm.packages,
                'total', gm.total,
                'uom', gm.uom,
                'cbm', gm.cbm,
                'volume', gm.volume
              )
            )
            FROM freight_tracking_app.gdn_measurements gm
            WHERE gm.gdn_id = g.id
          ),
          JSON_ARRAY()
        ) AS measurements

      FROM freight_tracking_app.goods_deliver_notes g

      LEFT JOIN freight_tracking_app.clients client
        ON g.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON g.manufacture_id = manufacture.id

      LEFT JOIN freight_tracking_app.clients forwarder
        ON g.forwarder_id = forwarder.id

      LEFT JOIN freight_tracking_app.drivers driver
        ON g.driver_id = driver.id

      LEFT JOIN freight_tracking_app.wharf_staff wharf
        ON g.wharf_staff_id = wharf.id

      WHERE g.id = ?;
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Goods Deliver Note not found",
      });
    }

    const row = rows[0];

    const result = {
      ...row,

      // Handle mysql2 JSON response
      packing_lists: Array.isArray(row.packing_lists)
        ? row.packing_lists
        : typeof row.packing_lists === "string"
          ? JSON.parse(row.packing_lists)
          : [],

      measurements: Array.isArray(row.measurements)
        ? row.measurements
        : typeof row.measurements === "string"
          ? JSON.parse(row.measurements)
          : [],
    };

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get GDN By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving Goods Deliver Note",
      error: error.message,
    });
  }
};
