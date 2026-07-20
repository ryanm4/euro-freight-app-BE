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
      wharf_contact_no
    } = req.body;

    // 1. Insert GDN
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
    ]);

    const gdnId = result.insertId;

    // 2. Generate GDN No => YYYYMMDD/ID
    const gdnNo = `GDN/${formatDateYYYYMMDD(date)}/${gdnId}`;

    // 3. Update generated GDN number
    await connection.query(
      `
      UPDATE freight_tracking_app.goods_deliver_notes
      SET gdn_no = ?
      WHERE id = ?
      `,
      [gdnNo, gdnId],
    );

    // 4. Update Packing Lists → attach GDN & Close them
    if (packing_list_ids && packing_list_ids.length > 0) {
      await connection.query(
        `
        UPDATE freight_tracking_app.packing_list
        SET
          gdn_id = ?,
          status = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
        `,
        [
          gdnId,
          "Closed", // Change to "closed" if that's what your system uses
          created_by,
          packing_list_ids,
        ],
      );
    }

    // 5. Update Purchase Orders → set cargo dispatch date & status
    await connection.query(
      `
      UPDATE freight_tracking_app.purchase_order po
      INNER JOIN freight_tracking_app.packing_list pl
        ON po.packing_list_id = pl.id
      SET
        po.cargo_dispatch_date = ?,
        po.status = ?,
        po.updated_by = ?,
        po.updated_on = NOW()
      WHERE pl.gdn_id = ?
      `,
      [date, "GDN Created", created_by, gdnId],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message:
        "Goods Deliver Note created successfully and Purchase Orders updated",
      gdn_id: gdnId,
      gdn_no: gdnNo,
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
    } = req.body || {};

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

        updated_by = ?,
        updated_on = NOW()

      WHERE id = ?
    `;

    await connection.query(updateQuery, [
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

      dispatch_location,
      transport_mode,
      container_no,
      container_size,
      primary_seal_no,
      secondary_seal_no,
      custom_doc_status,
      wharf_staff_id,

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
  try {
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

        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,

        -- Packing list details
        COALESCE(
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', p.id,
              'shipping_mode', p.shipping_mode,
              'packing_list_no', p.packing_list_no
            )
          ),
          JSON_ARRAY()
        ) AS packing_lists


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

      LEFT JOIN freight_tracking_app.packing_list p
        ON p.gdn_id = g.id

      GROUP BY g.id

      ORDER BY g.id DESC;
    `;

    const [rows] = await db.query(query);

    const result = rows.map((row) => ({
      ...row,

      // mysql2 already returns JSON as object
      packing_lists: Array.isArray(row.packing_lists)
        ? row.packing_lists.filter((item) => item.id !== null)
        : [],
    }));

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Get All GDN Error:", error);

    res.status(500).json({
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

        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,

        -- Packing list details
        COALESCE(
          JSON_ARRAYAGG(
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
          ),
          JSON_ARRAY()
        ) AS packing_lists


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

      LEFT JOIN freight_tracking_app.packing_list p
        ON p.gdn_id = g.id

      WHERE g.id = ?

      GROUP BY g.id;
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Goods Deliver Note not found",
      });
    }

    const result = {
      ...rows[0],

      // mysql2 returns JSON_ARRAYAGG as object array
      packing_lists: Array.isArray(rows[0].packing_lists)
        ? rows[0].packing_lists.filter((item) => item.id !== null)
        : [],
    };

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get GDN By ID Error:", error);

    res.status(500).json({
      success: false,
      message: "Error retrieving Goods Deliver Note",
      error: error.message,
    });
  }
};
