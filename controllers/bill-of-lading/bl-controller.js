const db = require("../../sql-connection");

// Helper to convert undefined → null
const clean = (val) => (val === undefined ? null : val);

const cleanDateTime = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return value;
};

// Create HBL + update multiple GRNs
exports.createHBL = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    let {
      client_id,
      manufacture_id,
      shipper_id,
      consignee_id,
      notify_id,
      date,
      type,
      house_bl_no,
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
      ports = [],
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
        .map((id) => parseInt(id.trim()))
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
          shipper_id,
          consignee_id,
          notify_id,
          date,
          type,
          house_bl_no,
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
        VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?,?,?,
          ?,?,?,NOW()
        )
      `;

    const [result] = await connection.execute(insertQuery, [
      clean(client_id),
      clean(manufacture_id),
      clean(shipper_id),
      clean(consignee_id),
      clean(notify_id),
      clean(date),
      clean(type),
      clean(house_bl_no),
      clean(shipment_id),
      clean(planned_vessel_name),
      clean(voyage_no),
      cleanDateTime(etd),
      cleanDateTime(eta),
      cleanDateTime(actual_etd),
      cleanDateTime(actual_eta),
      clean(arrival_port),
      clean(inland_location),
      clean(mbl_mawb_no),
      clean(status),
      clean(no_pieces),
      clean(gross_weight),
      clean(chargeable_weight),
      clean(cbm),
      clean(container_seal_no),
      cleanDateTime(onboard_date),
      clean(created_by),
    ]);

    const hblId = result.insertId;

    // =====================
    // Insert Multiple Ports
    // =====================
    if (Array.isArray(ports) && ports.length > 0) {
      const portValues = ports.map((p) => [
        hblId,
        clean(p.port),
        clean(p.status),
        clean(created_by),
        new Date(),
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
        [portValues],
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
        status = 'HBL_OPEN',
        updated_by = ?,
        updated_on = NOW()
      WHERE id IN (${placeholders})
    `;

    const [updateResult] = await connection.execute(updateGRNQuery, [
      hblId,
      created_by || null,
      ...grn_ids,
    ]);

    if (updateResult.affectedRows === 0) {
      throw new Error("No GRNs updated. Check grn_ids");
    }

    // =====================
    // Update Packing Lists (status -> HBL open)
    // =====================
    const updatePackingListQuery = `
      UPDATE freight_tracking_app.packing_list
      SET
        status = 'HBL_OPEN',
        updated_by = ?,
        updated_on = NOW()
      WHERE grn_id IN (${placeholders})
    `;

    const [plUpdateResult] = await connection.execute(updatePackingListQuery, [
      created_by || null,
      ...grn_ids,
    ]);

    // =====================
    // Update Purchase Orders
    // purchase_order -> packing_list -> goods_receive_notes
    // =====================
    const updatePOQuery = `
      UPDATE freight_tracking_app.purchase_order po
      INNER JOIN freight_tracking_app.packing_list pl
        ON po.packing_list_id = pl.id
      SET
        po.hbl_nos = ?,
        po.updated_by = ?,
        po.updated_on = NOW()
      WHERE pl.grn_id IN (${placeholders})
    `;

    const [poUpdateResult] = await connection.execute(updatePOQuery, [
      clean(mbl_mawb_no),
      created_by || null,
      ...grn_ids,
    ]);

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "HBL created successfully",
      data: {
        hbl_id: hblId,
        updated_grns: grn_ids,
        ports_count: ports.length,
        grn_updated_count: updateResult.affectedRows,
        po_updated_count: poUpdateResult.affectedRows,
      },
    });
  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error creating HBL",
      error: error.message,
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
      house_bl_no,
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
      ports = [], // NEW: multi ports
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
        house_bl_no = ?,
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
      clean(house_bl_no),
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
      id,
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
      [id],
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
        [id, updated_by || null, ...grn_ids],
      );
    }

    // =========================
    // 4. UPDATE MULTI PORTS
    // =========================

    // delete old ports
    await connection.execute(
      `DELETE FROM freight_tracking_app.multi_ports WHERE hbl_hawb_id = ?`,
      [id],
    );

    // insert new ports
    if (Array.isArray(ports) && ports.length > 0) {
      const values = ports.map((p) => [
        id,
        p.port,
        p.status || null,
        updated_by || null,
        new Date(),
      ]);

      await connection.query(
        `
        INSERT INTO freight_tracking_app.multi_ports
        (hbl_hawb_id, port, status, created_by, created_on)
        VALUES ?
        `,
        [values],
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "HBL updated successfully",
      data: {
        hbl_id: id,
        linked_grns: grn_ids,
        ports_count: ports.length,
      },
    });
  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error updating HBL",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// Get all HBLs with linked GRNs
exports.getAllHBL = async (req, res) => {
  const { status } = req.query;

  try {
    let query = `
      SELECT 
        h.id,

        JSON_OBJECT(
          'id', client.id,
          'name', client.name,
          'address', client.address
        ) AS client,

        JSON_OBJECT(
          'id', manufacture.id,
          'name', manufacture.name,
          'address', manufacture.address
        ) AS manufacture,

        JSON_OBJECT(
          'id', shipper.id,
          'name', shipper.name,
          'address', shipper.address
        ) AS shipper,

        JSON_OBJECT(
          'id', consignee.id,
          'name', consignee.name,
          'address', consignee.address
        ) AS consignee,

        JSON_OBJECT(
          'id', notify.id,
          'name', notify.name,
          'address', notify.address
        ) AS notify,

        h.date,
        h.type,
        h.house_bl_no,
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

      LEFT JOIN freight_tracking_app.clients shipper
        ON h.shipper_id = shipper.id

      LEFT JOIN freight_tracking_app.clients consignee
        ON h.consignee_id = consignee.id

      LEFT JOIN freight_tracking_app.clients notify
        ON h.notify_id = notify.id

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
      ) g 
        ON g.bill_id = h.id

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
      ) p 
        ON p.hbl_hawb_id = h.id
    `;

    const params = [];

    if (status) {
      query += ` WHERE h.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY h.id DESC;`;

    const [rows] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      message: "HBL list fetched successfully",
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching HBL list",
      error: error.message,
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

        JSON_OBJECT(
          'id', client.id,
          'name', client.name,
          'address', client.address
        ) AS client,

        JSON_OBJECT(
          'id', manufacture.id,
          'name', manufacture.name,
          'address', manufacture.address
        ) AS manufacture,

        JSON_OBJECT(
          'id', shipper.id,
          'name', shipper.name,
          'address', shipper.address
        ) AS shipper,

        JSON_OBJECT(
          'id', consignee.id,
          'name', consignee.name,
          'address', consignee.address
        ) AS consignee,

        JSON_OBJECT(
          'id', notify.id,
          'name', notify.name,
          'address', notify.address
        ) AS notify,

        JSON_OBJECT(
          'id', shipment.id,
          'vessel_name', shipment.vessel_name,
          'voyage_number', shipment.voyage_number,
          'origin_port', shipment.origin_port,
          'discharge_port', shipment.discharge_port,
          'final_place_of_delivery', shipment.final_place_of_delivery,
          'etd_colombo', shipment.etd_colombo,
          'eta_discharge_port', shipment.eta_discharge_port,
          'eta_final_delivery_place', shipment.eta_final_delivery_place,
          'flight_number', shipment.flight_number,
          'origin', shipment.origin,
          'destination', shipment.destination,
          'etd_origin', shipment.etd_origin,
          'eta_destination', shipment.eta_destination
        ) AS shipment,

        h.date,
        h.type,
        h.house_bl_no,
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

      LEFT JOIN freight_tracking_app.clients shipper
        ON h.shipper_id = shipper.id

      LEFT JOIN freight_tracking_app.clients consignee
        ON h.consignee_id = consignee.id

      LEFT JOIN freight_tracking_app.clients notify
        ON h.notify_id = notify.id

      LEFT JOIN freight_tracking_app.shipments shipment
        ON h.shipment_id = shipment.id

      -- GRNs, each carrying its own nested gdns[] and packing_lists[]
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
              'status', grn.status,
              'gdns', COALESCE(gd.gdns, JSON_ARRAY()),
              'packing_lists', COALESCE(pl.packing_lists, JSON_ARRAY())
            )
          ) AS grns

        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        -- GDNs nested per GRN
        LEFT JOIN (
          SELECT 
            gdn.gdn_grn_ref AS grn_id,
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', gdn.id,
                'gdn_no', gdn.gdn_no,
                'client', client.name,
                'manufacture', manufacture.name,
                'forwarder', forwarder.name,
                'date', gdn.date,
                'cartoons', gdn.cartoons,
                'actual_cartoons', gdn.actual_cartoons,
                'weight', gdn.gross_weight,
                'actual_gross_weight', gdn.actual_gross_weight,
                'volume', gdn.gross_volume,
                'actual_gross_volume', gdn.actual_gross_volume,
                'status', gdn.status,
                'vehicle_no', gdn.vehicle_no,
                'dispatch_location', gdn.dispatch_location,
                'transport_mode', gdn.transport_mode,
                'container_no', gdn.container_no,
                'container_size', gdn.container_size,
                'primary_seal_no', gdn.primary_seal_no,
                'secondary_seal_no', gdn.secondary_seal_no,
                'custom_doc_status', gdn.custom_doc_status
              )
            ) AS gdns

          FROM freight_tracking_app.goods_deliver_notes gdn

          LEFT JOIN freight_tracking_app.clients client
            ON gdn.client_id = client.id

          LEFT JOIN freight_tracking_app.clients manufacture
            ON gdn.manufacture_id = manufacture.id

          LEFT JOIN freight_tracking_app.clients forwarder
            ON gdn.forwarder_id = forwarder.id

          WHERE gdn.gdn_grn_ref IS NOT NULL
          GROUP BY gdn.gdn_grn_ref
        ) gd
          ON gd.grn_id = grn.id

        -- Packing lists nested per GRN (freight_tracking_app.packing_list.grn_id -> goods_receive_notes.id)
        LEFT JOIN (
          SELECT 
            pl.grn_id,
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', pl.id,
                'packing_list_no', pl.packing_list_no,
                'client', pl_client.name,
                'manufacturer', pl_manufacturer.name,
                'forwarder', pl_forwarder.name,
                'date', pl.date,
                'gdn_id', pl.gdn_id,
                'grn_id', pl.grn_id,
                'total_quantity', pl.total_quantity,
                'ship_to', pl.ship_to,
                'document_date', pl.document_date,
                'total_cartons', pl.total_cartons,
                'weight_kg', pl.total_gross_weight_kg,
                'total_net_weight_kg', pl.total_net_weight_kg,
                'total_cbm', pl.total_cbm,
                'total_volume', pl.total_volume,
                'shipping_mode', pl.shipping_mode,
                'file_url', pl.file_url,
                'status', pl.status,
                'created_by', pl.created_by,
                'created_on', pl.created_on,
                'updated_by', pl.updated_by,
                'updated_on', pl.updated_on
              )
            ) AS packing_lists

          FROM freight_tracking_app.packing_list pl

          LEFT JOIN freight_tracking_app.clients pl_client
            ON pl.client_id = pl_client.id

          LEFT JOIN freight_tracking_app.clients pl_manufacturer
            ON pl.manufacturer_id = pl_manufacturer.id

          LEFT JOIN freight_tracking_app.clients pl_forwarder
            ON pl.forwarder_id = pl_forwarder.id

          WHERE pl.grn_id IS NOT NULL
          GROUP BY pl.grn_id
        ) pl
          ON pl.grn_id = grn.id

        GROUP BY grn.bill_id
      ) g 
        ON g.bill_id = h.id

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
      ) p 
        ON p.hbl_hawb_id = h.id

      WHERE h.id = ?
    `;

    const [rows] = await db.execute(query, [id]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "HBL not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "HBL fetched successfully",
      data: rows[0],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching HBL",
      error: error.message,
    });
  }
};
