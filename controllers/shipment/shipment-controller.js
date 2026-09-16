const db = require("../../sql-connection");

// Create Shipment

exports.createShipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      status,
      created_by,

      // Sea shipment
      vessel_name,
      voyage_number,
      origin_port,
      discharge_port,
      final_place_of_delivery,
      etd_colombo,
      eta_discharge_port,
      eta_final_delivery_place,

      // Air shipment
      flight_number,
      origin,
      destination,
      etd_origin,
      eta_destination,

      // Common shipment details
      mbl_mawb_no,
      airline_shipping_line,
      container_number,
      container_size,
      final_seal_no,

      // HBLs
      hbl_ids,
    } = req.body;

    const shipmentQuery = `
      INSERT INTO freight_tracking_app.shipments (
        vessel_name,
        status,
        voyage_number,
        origin_port,
        discharge_port,
        final_place_of_delivery,
        etd_colombo,
        eta_discharge_port,
        eta_final_delivery_place,
        flight_number,
        origin,
        destination,
        etd_origin,
        eta_destination,
        mbl_mawb_no,
        airline_shipping_line,
        container_number,
        container_size,
        final_seal_no,
        created_by,
        created_on
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
      )
    `;

    const [shipmentResult] = await connection.query(shipmentQuery, [
      vessel_name || null,
      status || null,
      voyage_number || null,
      origin_port || null,
      discharge_port || null,
      final_place_of_delivery || null,
      etd_colombo || null,
      eta_discharge_port || null,
      eta_final_delivery_place || null,
      flight_number || null,
      origin || null,
      destination || null,
      etd_origin || null,
      eta_destination || null,
      mbl_mawb_no || null,
      airline_shipping_line || null,
      container_number || null,
      container_size || null,
      final_seal_no || null,
      created_by || null,
    ]);

    const shipmentId = shipmentResult.insertId;

    // ============================================
    // Update HBLs
    // ============================================
    if (Array.isArray(hbl_ids) && hbl_ids.length > 0) {
      const updateHBLQuery = `
        UPDATE freight_tracking_app.hbl_hawb_tbl
        SET
          shipment_id = ?,
          status = ?,
          mbl_mawb_no = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
      `;

      await connection.query(updateHBLQuery, [
        shipmentId,
        "SHIPMENT_OPEN",
        mbl_mawb_no || null,
        created_by,
        hbl_ids,
      ]);

      // ============================================
      // Update Packing Lists
      // ============================================
      const updatePackingListQuery = `
        UPDATE freight_tracking_app.packing_list pl
        INNER JOIN freight_tracking_app.goods_receive_notes grn
          ON pl.grn_id = grn.id
        SET
          pl.status = ?,
          pl.updated_by = ?,
          pl.updated_on = NOW()
        WHERE grn.bill_id IN (?)
      `;

      await connection.query(updatePackingListQuery, [
        "SHIPMENT_OPEN",
        created_by,
        hbl_ids,
      ]);
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Shipment created successfully",
      data: {
        shipment_id: shipmentId,
        vessel_name,
        status,
        voyage_number,
        origin_port,
        discharge_port,
        final_place_of_delivery,
        etd_colombo,
        eta_discharge_port,
        eta_final_delivery_place,
        flight_number,
        origin,
        destination,
        etd_origin,
        eta_destination,
        mbl_mawb_no,
        airline_shipping_line,
        container_number,
        container_size,
        final_seal_no,
        hbl_ids,
      },
    });
  } catch (error) {
    await connection.rollback();

    // Log the actual database error on the server only
    console.error("Create Shipment Error:", error);

    // Do NOT expose database error details to the client
    res.status(500).json({
      success: false,
      message: "Unable to create shipment. Please try again later.",
    });
  } finally {
    connection.release();
  }
};

// Update Shipment

exports.updateShipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const shipmentId = req.params.id;

    const {
      // Common
      status,
      updated_by,

      // Sea shipment
      vessel_name,
      voyage_number,
      origin_port,
      discharge_port,
      final_place_of_delivery,
      etd_colombo,
      eta_discharge_port,
      eta_final_delivery_place,

      // Air shipment
      flight_number,
      origin,
      destination,
      etd_origin,
      eta_destination,

      // Common shipment details
      mbl_mawb_no,
      airline_shipping_line,
      container_number,
      container_size,
      final_seal_no,

      // HBLs
      hbl_ids,
    } = req.body;

    // ============================================
    // Check whether shipment exists
    // ============================================
    const [existingShipment] = await connection.query(
      `
        SELECT id
        FROM freight_tracking_app.shipments
        WHERE id = ?
      `,
      [shipmentId],
    );

    if (existingShipment.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // ============================================
    // Update Shipment
    // ============================================
    const updateShipmentQuery = `
      UPDATE freight_tracking_app.shipments
      SET
        vessel_name = ?,
        status = ?,
        voyage_number = ?,
        origin_port = ?,
        discharge_port = ?,
        final_place_of_delivery = ?,
        etd_colombo = ?,
        eta_discharge_port = ?,
        eta_final_delivery_place = ?,
        flight_number = ?,
        origin = ?,
        destination = ?,
        etd_origin = ?,
        eta_destination = ?,
        mbl_mawb_no = ?,
        airline_shipping_line = ?,
        container_number = ?,
        container_size = ?,
        final_seal_no = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    await connection.query(updateShipmentQuery, [
      vessel_name || null,
      status || null,
      voyage_number || null,
      origin_port || null,
      discharge_port || null,
      final_place_of_delivery || null,
      etd_colombo || null,
      eta_discharge_port || null,
      eta_final_delivery_place || null,
      flight_number || null,
      origin || null,
      destination || null,
      etd_origin || null,
      eta_destination || null,
      mbl_mawb_no || null,
      airline_shipping_line || null,
      container_number || null,
      container_size || null,
      final_seal_no || null,
      updated_by || null,
      shipmentId,
    ]);

    // ============================================
    // Remove shipment reference from existing HBLs
    // ============================================
    await connection.query(
      `
        UPDATE freight_tracking_app.hbl_hawb_tbl
        SET
          shipment_id = NULL,
          updated_by = ?,
          updated_on = NOW()
        WHERE shipment_id = ?
      `,
      [updated_by, shipmentId],
    );

    // ============================================
    // Assign shipment to new HBLs
    // ============================================
    if (Array.isArray(hbl_ids) && hbl_ids.length > 0) {
      await connection.query(
        `
          UPDATE freight_tracking_app.hbl_hawb_tbl
          SET
            shipment_id = ?,
            status = ?,
            updated_by = ?,
            updated_on = NOW()
          WHERE id IN (?)
        `,
        [shipmentId, "SHIPMENT_OPEN", updated_by, hbl_ids],
      );

      // ============================================
      // Update Packing Lists
      //
      // Chain:
      // hbl_hawb_tbl
      //      ↓
      // goods_receive_notes.bill_id
      //      ↓
      // packing_list.grn_id
      // ============================================
      await connection.query(
        `
          UPDATE freight_tracking_app.packing_list pl
          INNER JOIN freight_tracking_app.goods_receive_notes grn
            ON pl.grn_id = grn.id
          SET
            pl.status = ?,
            pl.updated_by = ?,
            pl.updated_on = NOW()
          WHERE grn.bill_id IN (?)
        `,
        ["SHIPMENT_OPEN", updated_by, hbl_ids],
      );
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Shipment updated successfully",
      data: {
        shipment_id: shipmentId,

        vessel_name,
        status,
        voyage_number,
        origin_port,
        discharge_port,
        final_place_of_delivery,
        etd_colombo,
        eta_discharge_port,
        eta_final_delivery_place,

        flight_number,
        origin,
        destination,
        etd_origin,
        eta_destination,

        mbl_mawb_no,
        airline_shipping_line,
        container_number,
        container_size,
        final_seal_no,

        hbl_ids,
      },
    });
  } catch (error) {
    await connection.rollback();

    // Log full database error on the server only
    console.error("Update Shipment Error:", error);

    // Do not expose database details to the client
    res.status(500).json({
      success: false,
      message: "Unable to update shipment. Please try again later.",
    });
  } finally {
    connection.release();
  }
};

// Get All Shipments
exports.getAllShipments = async (req, res) => {
  try {
    const query = `
      SELECT
        s.id,
        s.vessel_name,
        s.status,
        s.voyage_number,
        s.origin_port,
        s.discharge_port,
        s.final_place_of_delivery,
        s.etd_colombo,
        s.eta_discharge_port,
        s.eta_final_delivery_place,
        s.flight_number,
        s.origin,
        s.destination,
        s.etd_origin,
        s.eta_destination,
        s.mbl_mawb_no,
        s.airline_shipping_line,
        s.container_number,
        s.container_size,
        s.final_seal_no,
        s.created_by,
        s.created_on,
        s.updated_by,
        s.updated_on,
        GROUP_CONCAT(h.id) AS hbl_ids
      FROM freight_tracking_app.shipments s
      LEFT JOIN freight_tracking_app.hbl_hawb_tbl h
        ON s.id = h.shipment_id
      GROUP BY
        s.id,
        s.vessel_name,
        s.status,
        s.created_by,
        s.created_on,
        s.updated_by,
        s.updated_on
      ORDER BY s.id DESC
    `;

    const [rows] = await db.query(query);

    const shipments = rows.map((row) => ({
      ...row,
      hbl_ids: row.hbl_ids ? row.hbl_ids.split(",").map(Number) : [],
    }));

    res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching shipments",
      error: error.message,
    });
  }
};

// Get Shipment By ID
exports.getShipmentById = async (req, res) => {
  try {
    const shipmentId = req.params.id;

    // Get shipment
    const [shipmentRows] = await db.query(
      `
      SELECT
        id,
        vessel_name,
        status,
        voyage_number,
        origin_port,
        discharge_port,
        final_place_of_delivery,
        etd_colombo,
        eta_discharge_port,
        eta_final_delivery_place,
        flight_number,
        origin,
        destination,
        etd_origin,
        eta_destination,
        mbl_mawb_no,
        airline_shipping_line,
        container_number,
        container_size,
        final_seal_no,
        created_by,
        created_on,
        updated_by,
        updated_on
      FROM freight_tracking_app.shipments
      WHERE id = ?
      `,
      [shipmentId],
    );

    if (shipmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found",
      });
    }

    // Get associated HBL/HAWB records (WITH CLIENT NAMES)
    const [hblRows] = await db.query(
      `
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
        h.updated_on

      FROM freight_tracking_app.hbl_hawb_tbl h

      LEFT JOIN freight_tracking_app.clients client
        ON h.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON h.manufacture_id = manufacture.id

      WHERE h.shipment_id = ?
      ORDER BY h.id
      `,
      [shipmentId],
    );

    res.status(200).json({
      success: true,
      data: {
        ...shipmentRows[0],
        hbl_hawb_details: hblRows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching shipment",
      error: error.message,
    });
  }
};
