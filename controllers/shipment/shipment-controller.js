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

      // GRNs
      grn_ids,
    } = req.body;

    // ============================================
    // Create Shipment
    // ============================================

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
    // Update GRNs
    // ============================================

    if (Array.isArray(grn_ids) && grn_ids.length > 0) {
      const updateGRNQuery = `
        UPDATE freight_tracking_app.goods_receive_notes
        SET
          shipment_id = ?,
          status = ?,
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (?)
      `;

      await connection.query(updateGRNQuery, [
        shipmentId,
        "SHIPMENT_OPEN",
        created_by || null,
        grn_ids,
      ]);

      // ============================================
      // Update Packing Lists related to GRNs
      // ============================================

      const updatePackingListQuery = `
        UPDATE freight_tracking_app.packing_list pl
        INNER JOIN freight_tracking_app.goods_receive_notes grn
          ON pl.grn_id = grn.id
        SET
          pl.status = ?,
          pl.updated_by = ?,
          pl.updated_on = NOW()
        WHERE grn.id IN (?)
      `;

      await connection.query(updatePackingListQuery, [
        "SHIPMENT_OPEN",
        created_by || null,
        grn_ids,
      ]);
    }

    // ============================================
    // Commit Transaction
    // ============================================

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

        grn_ids,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Create Shipment Error:", error);

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

      // GRNs
      grn_ids,
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
    // Remove shipment reference from existing GRNs
    // ============================================

    await connection.query(
      `
        UPDATE freight_tracking_app.goods_receive_notes
        SET
          shipment_id = NULL,
          updated_by = ?,
          updated_on = NOW()
        WHERE shipment_id = ?
      `,
      [updated_by || null, shipmentId],
    );

    // ============================================
    // Assign shipment to new GRNs
    // ============================================

    if (Array.isArray(grn_ids) && grn_ids.length > 0) {
      // ==========================================
      // Update GRNs
      // ==========================================

      await connection.query(
        `
          UPDATE freight_tracking_app.goods_receive_notes
          SET
            shipment_id = ?,
            status = ?,
            updated_by = ?,
            updated_on = NOW()
          WHERE id IN (?)
        `,
        [shipmentId, "SHIPMENT_OPEN", updated_by || null, grn_ids],
      );

      // ==========================================
      // Update Packing Lists
      //
      // Chain:
      //
      // GRN
      //  ↓
      // packing_list.grn_id
      // ==========================================

      await connection.query(
        `
          UPDATE freight_tracking_app.packing_list pl
          INNER JOIN freight_tracking_app.goods_receive_notes grn
            ON pl.grn_id = grn.id
          SET
            pl.status = ?,
            pl.updated_by = ?,
            pl.updated_on = NOW()
          WHERE grn.id IN (?)
        `,
        ["SHIPMENT_OPEN", updated_by || null, grn_ids],
      );
    }

    // ============================================
    // Commit Transaction
    // ============================================

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

        grn_ids,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Update Shipment Error:", error);

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
    // ============================================
    // 1. Get all shipments
    // ============================================

    const [shipmentRows] = await db.query(`
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
        s.updated_on
      FROM freight_tracking_app.shipments s
      ORDER BY s.id DESC
    `);

    if (shipmentRows.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const shipmentIds = shipmentRows.map((s) => s.id);

    // ============================================
    // 2. Get GRNs + Client/Manufacture/Forwarder
    // ============================================

    const [grnRows] = await db.query(
      `
        SELECT
          grn.*,

          -- Client
          client.id AS client_id,
          client.name AS client_name,
          client.address AS client_address,
          client.contact_no AS client_contact_no,
          client.contact_person AS client_contact_person,
          client.status AS client_status,
          client.type AS client_type,

          -- Manufacture
          manufacture.id AS manufacture_id,
          manufacture.name AS manufacture_name,
          manufacture.address AS manufacture_address,
          manufacture.contact_no AS manufacture_contact_no,
          manufacture.contact_person AS manufacture_contact_person,
          manufacture.status AS manufacture_status,
          manufacture.type AS manufacture_type,

          -- Forwarder
          forwarder.id AS forwarder_id,
          forwarder.name AS forwarder_name,
          forwarder.address AS forwarder_address,
          forwarder.contact_no AS forwarder_contact_no,
          forwarder.contact_person AS forwarder_contact_person,
          forwarder.status AS forwarder_status,
          forwarder.type AS forwarder_type

        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        LEFT JOIN freight_tracking_app.clients forwarder
          ON grn.forwarder_id = forwarder.id

        WHERE grn.shipment_id IN (?)

        ORDER BY grn.id
      `,
      [shipmentIds],
    );

    const grnIds = grnRows.map((grn) => grn.id);

    // ============================================
    // 3. Get Packing Lists linked to GRNs
    // ============================================

    const [packingListRows] = grnIds.length
      ? await db.query(
          `
            SELECT *
            FROM freight_tracking_app.packing_list
            WHERE grn_id IN (?)
          `,
          [grnIds],
        )
      : [[]];

    // ============================================
    // 4. Get GDN IDs from Packing Lists
    // ============================================

    const gdnIds = [
      ...new Set(packingListRows.map((pl) => pl.gdn_id).filter(Boolean)),
    ];

    // ============================================
    // 5. Get GDNs
    // ============================================

    const [gdnRows] = gdnIds.length
      ? await db.query(
          `
            SELECT *
            FROM freight_tracking_app.goods_deliver_notes
            WHERE id IN (?)
          `,
          [gdnIds],
        )
      : [[]];

    // ============================================
    // 6. Group Packing Lists by GDN
    // ============================================

    const packingListsByGdnId = new Map();

    for (const pl of packingListRows) {
      if (!pl.gdn_id) continue;

      if (!packingListsByGdnId.has(pl.gdn_id)) {
        packingListsByGdnId.set(pl.gdn_id, []);
      }

      packingListsByGdnId.get(pl.gdn_id).push(pl);
    }

    // ============================================
    // 7. Enrich GDNs with Packing Lists
    // ============================================

    const gdnById = new Map();

    for (const gdn of gdnRows) {
      const enrichedGdn = {
        ...gdn,
        packing_lists: packingListsByGdnId.get(gdn.id) || [],
      };

      gdnById.set(gdn.id, enrichedGdn);
    }

    // ============================================
    // 8. Enrich GRNs
    // ============================================

    const grnsByShipmentId = new Map();

    for (const grn of grnRows) {
      // --------------------------------------------
      // Get packing lists belonging to this GRN
      // --------------------------------------------

      const relatedPackingLists = packingListRows.filter(
        (pl) => pl.grn_id === grn.id,
      );

      // --------------------------------------------
      // Get unique GDN IDs
      // --------------------------------------------

      const relatedGdnIds = [
        ...new Set(relatedPackingLists.map((pl) => pl.gdn_id).filter(Boolean)),
      ];

      // --------------------------------------------
      // Get GDNs
      // --------------------------------------------

      const gdns = relatedGdnIds
        .map((gdnId) => gdnById.get(gdnId))
        .filter(Boolean);

      // --------------------------------------------
      // Build Client object
      // --------------------------------------------

      const client = grn.client_id
        ? {
            id: grn.client_id,
            name: grn.client_name,
            address: grn.client_address,
            contact_no: grn.client_contact_no,
            contact_person: grn.client_contact_person,
            status: grn.client_status,
            type: grn.client_type,
          }
        : null;

      // --------------------------------------------
      // Build Manufacture object
      // --------------------------------------------

      const manufacture = grn.manufacture_id
        ? {
            id: grn.manufacture_id,
            name: grn.manufacture_name,
            address: grn.manufacture_address,
            contact_no: grn.manufacture_contact_no,
            contact_person: grn.manufacture_contact_person,
            status: grn.manufacture_status,
            type: grn.manufacture_type,
          }
        : null;

      // --------------------------------------------
      // Build Forwarder object
      // --------------------------------------------

      const forwarder = grn.forwarder_id
        ? {
            id: grn.forwarder_id,
            name: grn.forwarder_name,
            address: grn.forwarder_address,
            contact_no: grn.forwarder_contact_no,
            contact_person: grn.forwarder_contact_person,
            status: grn.forwarder_status,
            type: grn.forwarder_type,
          }
        : null;

      // --------------------------------------------
      // Remove flat joined fields
      // --------------------------------------------

      const {
        client_id,
        client_name,
        client_address,
        client_contact_no,
        client_contact_person,
        client_status,
        client_type,

        manufacture_id,
        manufacture_name,
        manufacture_address,
        manufacture_contact_no,
        manufacture_contact_person,
        manufacture_status,
        manufacture_type,

        forwarder_id,
        forwarder_name,
        forwarder_address,
        forwarder_contact_no,
        forwarder_contact_person,
        forwarder_status,
        forwarder_type,

        ...grnData
      } = grn;

      // --------------------------------------------
      // Final enriched GRN
      // --------------------------------------------

      const enrichedGrn = {
        ...grnData,

        client,
        manufacture,
        forwarder,

        gdns,
      };

      // --------------------------------------------
      // Group GRNs by Shipment
      // --------------------------------------------

      if (!grnsByShipmentId.has(grn.shipment_id)) {
        grnsByShipmentId.set(grn.shipment_id, []);
      }

      grnsByShipmentId.get(grn.shipment_id).push(enrichedGrn);
    }

    // ============================================
    // 9. Final Shipment Hierarchy
    // ============================================

    const shipments = shipmentRows.map((shipment) => ({
      ...shipment,

      grns: grnsByShipmentId.get(shipment.id) || [],
    }));

    // ============================================
    // 10. Response
    // ============================================

    return res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (error) {
    console.error("Error fetching shipments:", error);

    return res.status(500).json({
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

    // ============================================
    // 1. Get Shipment
    // ============================================

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

    // ============================================
    // 2. Get GRNs + Client/Manufacture/Forwarder
    // ============================================

    const [grnRows] = await db.query(
      `
        SELECT
          grn.*,

          -- Client
          client.id AS client_id,
          client.name AS client_name,
          client.address AS client_address,
          client.contact_no AS client_contact_no,
          client.contact_person AS client_contact_person,
          client.status AS client_status,
          client.type AS client_type,

          -- Manufacture
          manufacture.id AS manufacture_id,
          manufacture.name AS manufacture_name,
          manufacture.address AS manufacture_address,
          manufacture.contact_no AS manufacture_contact_no,
          manufacture.contact_person AS manufacture_contact_person,
          manufacture.status AS manufacture_status,
          manufacture.type AS manufacture_type,

          -- Forwarder
          forwarder.id AS forwarder_id,
          forwarder.name AS forwarder_name,
          forwarder.address AS forwarder_address,
          forwarder.contact_no AS forwarder_contact_no,
          forwarder.contact_person AS forwarder_contact_person,
          forwarder.status AS forwarder_status,
          forwarder.type AS forwarder_type

        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        LEFT JOIN freight_tracking_app.clients forwarder
          ON grn.forwarder_id = forwarder.id

        WHERE grn.shipment_id = ?

        ORDER BY grn.id
      `,
      [shipmentId],
    );

    // ============================================
    // 3. If no GRNs
    // ============================================

    if (grnRows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ...shipmentRows[0],
          grns: [],
        },
      });
    }

    const grnIds = grnRows.map((grn) => grn.id);

    // ============================================
    // 4. Get Packing Lists linked to GRNs
    // ============================================

    const [packingListRows] = await db.query(
      `
        SELECT
          pl.*
        FROM freight_tracking_app.packing_list pl
        WHERE pl.grn_id IN (?)
        ORDER BY pl.id
      `,
      [grnIds],
    );

    // ============================================
    // 5. Get GDN IDs from Packing Lists
    // ============================================

    const gdnIds = [
      ...new Set(packingListRows.map((pl) => pl.gdn_id).filter(Boolean)),
    ];

    // ============================================
    // 6. Get GDNs
    // ============================================

    const [gdnRows] = gdnIds.length
      ? await db.query(
          `
            SELECT
              gdn.*
            FROM freight_tracking_app.goods_deliver_notes gdn
            WHERE gdn.id IN (?)
            ORDER BY gdn.id
          `,
          [gdnIds],
        )
      : [[]];

    // ============================================
    // 7. Group Packing Lists by GDN
    // ============================================

    const packingListsByGdnId = new Map();

    for (const pl of packingListRows) {
      if (!pl.gdn_id) continue;

      if (!packingListsByGdnId.has(pl.gdn_id)) {
        packingListsByGdnId.set(pl.gdn_id, []);
      }

      packingListsByGdnId.get(pl.gdn_id).push(pl);
    }

    // ============================================
    // 8. Enrich GDNs with Packing Lists
    // ============================================

    const gdnById = new Map();

    for (const gdn of gdnRows) {
      gdnById.set(gdn.id, {
        ...gdn,
        packing_lists: packingListsByGdnId.get(gdn.id) || [],
      });
    }

    // ============================================
    // 9. Group Packing Lists by GRN
    // ============================================

    const packingListsByGrnId = new Map();

    for (const pl of packingListRows) {
      if (!packingListsByGrnId.has(pl.grn_id)) {
        packingListsByGrnId.set(pl.grn_id, []);
      }

      packingListsByGrnId.get(pl.grn_id).push(pl);
    }

    // ============================================
    // 10. Enrich GRNs
    // ============================================

    const formattedGrnRows = grnRows.map((grn) => {
      const relatedPackingLists = packingListsByGrnId.get(grn.id) || [];

      // --------------------------------------------
      // Get unique GDN IDs
      // --------------------------------------------

      const relatedGdnIds = [
        ...new Set(relatedPackingLists.map((pl) => pl.gdn_id).filter(Boolean)),
      ];

      // --------------------------------------------
      // Get GDNs
      // --------------------------------------------

      const gdns = relatedGdnIds
        .map((gdnId) => gdnById.get(gdnId))
        .filter(Boolean);

      // --------------------------------------------
      // Client object
      // --------------------------------------------

      const client = grn.client_id
        ? {
            id: grn.client_id,
            name: grn.client_name,
            address: grn.client_address,
            contact_no: grn.client_contact_no,
            contact_person: grn.client_contact_person,
            status: grn.client_status,
            type: grn.client_type,
          }
        : null;

      // --------------------------------------------
      // Manufacture object
      // --------------------------------------------

      const manufacture = grn.manufacture_id
        ? {
            id: grn.manufacture_id,
            name: grn.manufacture_name,
            address: grn.manufacture_address,
            contact_no: grn.manufacture_contact_no,
            contact_person: grn.manufacture_contact_person,
            status: grn.manufacture_status,
            type: grn.manufacture_type,
          }
        : null;

      // --------------------------------------------
      // Forwarder object
      // --------------------------------------------

      const forwarder = grn.forwarder_id
        ? {
            id: grn.forwarder_id,
            name: grn.forwarder_name,
            address: grn.forwarder_address,
            contact_no: grn.forwarder_contact_no,
            contact_person: grn.forwarder_contact_person,
            status: grn.forwarder_status,
            type: grn.forwarder_type,
          }
        : null;

      // --------------------------------------------
      // Remove flat joined fields
      // --------------------------------------------

      const {
        client_id,
        client_name,
        client_address,
        client_contact_no,
        client_contact_person,
        client_status,
        client_type,

        manufacture_id,
        manufacture_name,
        manufacture_address,
        manufacture_contact_no,
        manufacture_contact_person,
        manufacture_status,
        manufacture_type,

        forwarder_id,
        forwarder_name,
        forwarder_address,
        forwarder_contact_no,
        forwarder_contact_person,
        forwarder_status,
        forwarder_type,

        ...grnData
      } = grn;

      // --------------------------------------------
      // Final GRN object
      // --------------------------------------------

      return {
        ...grnData,

        client,
        manufacture,
        forwarder,

        gdns,
      };
    });

    // ============================================
    // 11. Final Response
    // ============================================

    return res.status(200).json({
      success: true,
      data: {
        ...shipmentRows[0],
        grns: formattedGrnRows,
      },
    });
  } catch (error) {
    console.error("Error fetching shipment:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching shipment",
      error: error.message,
    });
  }
};
