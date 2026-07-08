const db = require("../../sql-connection");

// Create Shipment
exports.createShipment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      vessel_name,
      status,
      created_by,
      hbl_ids
    } = req.body;

    // Insert shipment
    const shipmentQuery = `
      INSERT INTO freight_tracking_app.shipments (
        vessel_name,
        status,
        created_by,
        created_on
      )
      VALUES (?, ?, ?, NOW())
    `;

    const [shipmentResult] = await connection.query(
      shipmentQuery,
      [
        vessel_name,
        status,
        created_by
      ]
    );

    const shipmentId = shipmentResult.insertId;

    // Update shipment_id in hbl_hawb_tbl
    if (Array.isArray(hbl_ids) && hbl_ids.length > 0) {
      const updateQuery = `
        UPDATE freight_tracking_app.hbl_hawb_tbl
        SET
          shipment_id = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
      `;

      await connection.query(
        updateQuery,
        [
          shipmentId,
          created_by,
          hbl_ids
        ]
      );
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Shipment created successfully",
      data: {
        shipment_id: shipmentId,
        vessel_name,
        status,
        hbl_ids
      }
    });

  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      success: false,
      message: "Error creating shipment",
      error: error.message
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
      vessel_name,
      status,
      updated_by,
      hbl_ids
    } = req.body;

    // Check whether shipment exists
    const [existingShipment] = await connection.query(
      `SELECT * FROM freight_tracking_app.shipments
       WHERE id = ?`,
      [shipmentId]
    );

    if (existingShipment.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Shipment not found"
      });
    }

    // Update shipment
    await connection.query(
      `
      UPDATE freight_tracking_app.shipments
      SET
        vessel_name = ?,
        status = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
      `,
      [
        vessel_name,
        status,
        updated_by,
        shipmentId
      ]
    );

    // Remove shipment reference from previously linked HBLs
    await connection.query(
      `
      UPDATE freight_tracking_app.hbl_hawb_tbl
      SET
        shipment_id = NULL,
        updated_by = ?,
        updated_on = NOW()
      WHERE shipment_id = ?
      `,
      [
        updated_by,
        shipmentId
      ]
    );

    // Assign shipment to the new HBL list
    if (Array.isArray(hbl_ids) && hbl_ids.length > 0) {
      await connection.query(
        `
        UPDATE freight_tracking_app.hbl_hawb_tbl
        SET
          shipment_id = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
        `,
        [
          shipmentId,
          updated_by,
          hbl_ids
        ]
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
        hbl_ids
      }
    });

  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      success: false,
      message: "Error updating shipment",
      error: error.message
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

    const shipments = rows.map(row => ({
      ...row,
      hbl_ids: row.hbl_ids
        ? row.hbl_ids.split(",").map(Number)
        : []
    }));

    res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching shipments",
      error: error.message
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
        created_by,
        created_on,
        updated_by,
        updated_on
      FROM freight_tracking_app.shipments
      WHERE id = ?
      `,
      [shipmentId]
    );

    if (shipmentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shipment not found"
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
      [shipmentId]
    );

    res.status(200).json({
      success: true,
      data: {
        ...shipmentRows[0],
        hbl_hawb_details: hblRows
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching shipment",
      error: error.message
    });
  }
};