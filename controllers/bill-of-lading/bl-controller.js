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
      shipment_ids,
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
      total_freight_cost,
      created_by,
      ports,
    } = req.body;

    // =========================================================
    // 1. Validate shipment_ids
    // =========================================================

    if (!shipment_ids) {
      return res.status(400).json({
        success: false,
        message: "shipment_ids is required",
      });
    }

    if (typeof shipment_ids === "string") {
      shipment_ids = shipment_ids
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);
    }

    if (!Array.isArray(shipment_ids) || shipment_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "shipment_ids must contain at least one shipment ID",
      });
    }

    shipment_ids = [
      ...new Set(
        shipment_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];

    if (shipment_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid shipment_ids",
      });
    }

    // =========================================================
    // 2. Check shipments exist
    // =========================================================

    const shipmentPlaceholders = shipment_ids.map(() => "?").join(",");

    const [shipments] = await connection.query(
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
          eta_destination
        FROM freight_tracking_app.shipments
        WHERE id IN (${shipmentPlaceholders})
      `,
      shipment_ids,
    );

    if (shipments.length !== shipment_ids.length) {
      const foundIds = shipments.map((shipment) => Number(shipment.id));

      const missingIds = shipment_ids.filter(
        (id) => !foundIds.includes(Number(id)),
      );

      return res.status(400).json({
        success: false,
        message: "One or more shipments do not exist",
        missing_shipment_ids: missingIds,
      });
    }

    // =========================================================
    // 3. Create HBL
    // =========================================================

    const [hblResult] = await connection.query(
      `
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
          total_freight_cost,
          created_by,
          created_on
        )
        VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, NOW()
        )
      `,
      [
        clean(client_id),
        clean(manufacture_id),
        clean(shipper_id),
        clean(consignee_id),
        clean(notify_id),
        cleanDateTime(date),

        clean(type),
        clean(house_bl_no),

        // Legacy shipment_id
        shipment_ids[0],

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
        clean(total_freight_cost),
        clean(created_by),
      ],
    );

    const hblId = hblResult.insertId;

    // =========================================================
    // 4. HBL -> Shipments
    // =========================================================

    const hblShipmentValues = shipment_ids.map((shipmentId) => [
      hblId,
      shipmentId,
      created_by || null,
      new Date(),
    ]);

    await connection.query(
      `
        INSERT INTO freight_tracking_app.hbl_shipments (
          hbl_id,
          shipment_id,
          created_by,
          created_on
        )
        VALUES ?
      `,
      [hblShipmentValues],
    );

    // =========================================================
    // 5. Shipment -> HBL_OPEN
    // =========================================================

    await connection.query(
      `
        UPDATE freight_tracking_app.shipments
        SET
          status = 'HBL_OPEN',
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (${shipmentPlaceholders})
      `,
      [created_by, ...shipment_ids],
    );

    // =========================================================
    // 6. Get GRNs
    //
    // Shipment
    //    ↓
    // GRN.shipment_id
    // =========================================================

    const [grnRows] = await connection.query(
      `
        SELECT
          id,
          shipment_id
        FROM freight_tracking_app.goods_receive_notes
        WHERE shipment_id IN (${shipmentPlaceholders})
      `,
      shipment_ids,
    );

    const grnIds = grnRows.map((grn) => Number(grn.id));

    // =========================================================
    // 7. Update GRNs
    // =========================================================

    if (grnIds.length > 0) {
      const grnPlaceholders = grnIds.map(() => "?").join(",");

      await connection.query(
        `
          UPDATE freight_tracking_app.goods_receive_notes
          SET
            bill_id = ?,
            status = 'HBL_OPEN',
            updated_by = ?,
            updated_on = NOW()
          WHERE id IN (${grnPlaceholders})
        `,
        [hblId, created_by, ...grnIds],
      );

      // =======================================================
      // 8. Get GDNs
      //
      // GRN.id
      //    ↓
      // GDN.gdn_grn_ref
      // =======================================================

      const [gdnRows] = await connection.query(
        `
          SELECT
            id,
            gdn_no,
            gdn_grn_ref
          FROM freight_tracking_app.goods_deliver_notes
          WHERE CAST(gdn_grn_ref AS UNSIGNED)
                IN (${grnPlaceholders})
        `,
        grnIds,
      );

      const gdnIds = gdnRows.map((gdn) => Number(gdn.id));

      // =======================================================
      // 9. Update GDNs
      // =======================================================

      if (gdnIds.length > 0) {
        const gdnPlaceholders = gdnIds.map(() => "?").join(",");

        await connection.query(
          `
            UPDATE freight_tracking_app.goods_deliver_notes
            SET
              status = 'HBL_OPEN',
              updated_by = ?,
              updated_on = NOW()
            WHERE id IN (${gdnPlaceholders})
          `,
          [created_by, ...gdnIds],
        );

        // =====================================================
        // 10. Update Packing Lists
        //
        // GDN.id
        //    ↓
        // packing_list.gdn_id
        // =====================================================

        await connection.query(
          `
            UPDATE freight_tracking_app.packing_list
            SET
              status = 'HBL_OPEN',
              updated_by = ?,
              updated_on = NOW()
            WHERE gdn_id IN (${gdnPlaceholders})
          `,
          [created_by, ...gdnIds],
        );
      }
    }

    // =========================================================
    // 11. Insert Multi Ports
    // =========================================================

    if (Array.isArray(ports) && ports.length > 0) {
      const validPorts = ports.filter(
        (port) => port && typeof port === "object",
      );

      if (validPorts.length > 0) {
        const portValues = validPorts.map((port) => [
          hblId,
          clean(port.port),
          clean(port.status) || "ACTIVE",
          created_by || null,
          new Date(),
          null,
          null,
        ]);

        await connection.query(
          `
            INSERT INTO freight_tracking_app.multi_ports (
              hbl_hawb_id,
              port,
              status,
              created_by,
              created_on,
              updated_by,
              updated_on
            )
            VALUES ?
          `,
          [portValues],
        );
      }
    }

    // =========================================================
    // 12. Commit
    // =========================================================

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "HBL created successfully",
      data: {
        hbl_id: hblId,
        shipment_ids,
        shipment_count: shipment_ids.length,
        grn_count: grnIds.length,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Create HBL Error:", error);

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
      shipper_id,
      consignee_id,
      notify_id,
      date,
      type,
      house_bl_no,

      // Multiple shipments
      shipment_ids,

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
      total_freight_cost,

      updated_by,
      ports = [],
    } = req.body;

    // ============================================================
    // 1. VALIDATION
    // ============================================================

    if (!id) {
      throw new Error("HBL id is required");
    }

    if (!shipment_ids) {
      throw new Error("shipment_ids is required");
    }

    // Support comma-separated shipment IDs
    if (typeof shipment_ids === "string") {
      shipment_ids = shipment_ids
        .split(",")
        .map((x) => Number(x.trim()))
        .filter(Boolean);
    }

    if (!Array.isArray(shipment_ids)) {
      throw new Error("shipment_ids must be an array");
    }

    // Remove duplicates and invalid IDs
    shipment_ids = [
      ...new Set(
        shipment_ids
          .map((x) => Number(x))
          .filter((x) => Number.isInteger(x) && x > 0),
      ),
    ];

    if (shipment_ids.length === 0) {
      throw new Error("shipment_ids must contain at least one valid ID");
    }

    // ============================================================
    // 2. CHECK HBL EXISTS
    // ============================================================

    const [existingHBL] = await connection.execute(
      `
        SELECT id
        FROM freight_tracking_app.hbl_hawb_tbl
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    if (existingHBL.length === 0) {
      throw new Error("HBL not found");
    }

    // ============================================================
    // 3. VALIDATE SHIPMENTS
    // ============================================================

    const shipmentPlaceholders = shipment_ids.map(() => "?").join(",");

    const [shipmentRows] = await connection.execute(
      `
        SELECT
          id
        FROM freight_tracking_app.shipments
        WHERE id IN (${shipmentPlaceholders})
      `,
      shipment_ids,
    );

    if (shipmentRows.length !== shipment_ids.length) {
      const existingShipmentIds = shipmentRows.map((row) => Number(row.id));

      const missingShipmentIds = shipment_ids.filter(
        (shipmentId) => !existingShipmentIds.includes(Number(shipmentId)),
      );

      throw new Error(
        `Shipment(s) not found: ${missingShipmentIds.join(", ")}`,
      );
    }

    // ============================================================
    // 4. UPDATE HBL MAIN TABLE
    // ============================================================

    const updateHBLQuery = `
      UPDATE freight_tracking_app.hbl_hawb_tbl
      SET
        client_id = ?,
        manufacture_id = ?,
        shipper_id = ?,
        consignee_id = ?,
        notify_id = ?,
        date = ?,
        type = ?,
        house_bl_no = ?,

        -- Keep first shipment for backward compatibility
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
        total_freight_cost = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    const [hblUpdate] = await connection.execute(updateHBLQuery, [
      clean(client_id),
      clean(manufacture_id),
      clean(shipper_id),
      clean(consignee_id),
      clean(notify_id),
      cleanDateTime(date),
      clean(type),
      clean(house_bl_no),

      // First shipment retained in legacy column
      clean(shipment_ids[0]),

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
      clean(total_freight_cost),
      clean(updated_by),
      id,
    ]);

    if (hblUpdate.affectedRows === 0) {
      throw new Error("HBL not found");
    }

    // ============================================================
    // 5. UPDATE HBL <-> SHIPMENT RELATIONSHIP
    // ============================================================

    // Remove existing relationships
    await connection.execute(
      `
        DELETE FROM freight_tracking_app.hbl_shipments
        WHERE hbl_id = ?
      `,
      [id],
    );

    // Insert current relationships
    const hblShipmentValues = shipment_ids.map((shipmentId) => [
      id,
      shipmentId,
      clean(updated_by),
      new Date(),
    ]);

    await connection.query(
      `
        INSERT INTO freight_tracking_app.hbl_shipments (
          hbl_id,
          shipment_id,
          created_by,
          created_on
        )
        VALUES ?
      `,
      [hblShipmentValues],
    );

    // ============================================================
    // 6. UPDATE SHIPMENTS -> HBL_OPEN
    // ============================================================

    const [shipmentUpdate] = await connection.execute(
      `
        UPDATE freight_tracking_app.shipments
        SET
          status = 'HBL_OPEN',
          updated_by = ?,
          updated_on = NOW()
        WHERE id IN (${shipmentPlaceholders})
      `,
      [clean(updated_by), ...shipment_ids],
    );

    // ============================================================
    // 7. GET GRNs UNDER THE SELECTED SHIPMENTS
    // ============================================================

    const [grnRows] = await connection.execute(
      `
        SELECT
          id,
          shipment_id
        FROM freight_tracking_app.goods_receive_notes
        WHERE shipment_id IN (${shipmentPlaceholders})
      `,
      shipment_ids,
    );

    const grnIds = grnRows.map((grn) => Number(grn.id));

    let updatedGrns = 0;
    let updatedGdns = 0;
    let updatedPackingLists = 0;

    // ============================================================
    // 8. UPDATE GRNs -> HBL_OPEN
    // ============================================================

    if (grnIds.length > 0) {
      const grnPlaceholders = grnIds.map(() => "?").join(",");

      const [grnUpdate] = await connection.execute(
        `
          UPDATE freight_tracking_app.goods_receive_notes
          SET
            bill_id = ?,
            status = 'HBL_OPEN',
            updated_by = ?,
            updated_on = NOW()
          WHERE id IN (${grnPlaceholders})
        `,
        [id, clean(updated_by), ...grnIds],
      );

      updatedGrns = grnUpdate.affectedRows;

      // ==========================================================
      // 9. GET GDNs UNDER THOSE GRNs
      // ==========================================================

      const [gdnRows] = await connection.execute(
        `
          SELECT
            id,
            gdn_no,
            gdn_grn_ref
          FROM freight_tracking_app.goods_deliver_notes
          WHERE CAST(gdn_grn_ref AS UNSIGNED)
                IN (${grnPlaceholders})
        `,
        grnIds,
      );

      const gdnIds = gdnRows.map((gdn) => Number(gdn.id));

      // ==========================================================
      // 10. UPDATE GDNs -> HBL_OPEN
      // ==========================================================

      if (gdnIds.length > 0) {
        const gdnPlaceholders = gdnIds.map(() => "?").join(",");

        const [gdnUpdate] = await connection.execute(
          `
            UPDATE freight_tracking_app.goods_deliver_notes
            SET
              status = 'HBL_OPEN',
              updated_by = ?,
              updated_on = NOW()
            WHERE id IN (${gdnPlaceholders})
          `,
          [clean(updated_by), ...gdnIds],
        );

        updatedGdns = gdnUpdate.affectedRows;

        // ========================================================
        // 11. UPDATE PACKING LISTS -> HBL_OPEN
        // ========================================================

        const [packingListUpdate] = await connection.execute(
          `
              UPDATE freight_tracking_app.packing_list
              SET
                status = 'HBL_OPEN',
                updated_by = ?,
                updated_on = NOW()
              WHERE gdn_id IN (${gdnPlaceholders})
            `,
          [clean(updated_by), ...gdnIds],
        );

        updatedPackingLists = packingListUpdate.affectedRows;
      }
    }

    // ============================================================
    // 12. UPDATE MULTI PORTS
    // ============================================================

    // Delete existing ports
    await connection.execute(
      `
        DELETE FROM freight_tracking_app.multi_ports
        WHERE hbl_hawb_id = ?
      `,
      [id],
    );

    // Insert updated ports
    if (Array.isArray(ports) && ports.length > 0) {
      const validPorts = ports.filter(
        (p) => p && typeof p === "object" && p.port,
      );

      if (validPorts.length > 0) {
        const portValues = validPorts.map((p) => [
          id,
          clean(p.port),
          clean(p.status) || "ACTIVE",
          clean(updated_by),
          new Date(),
          null,
          null,
        ]);

        await connection.query(
          `
            INSERT INTO freight_tracking_app.multi_ports (
              hbl_hawb_id,
              port,
              status,
              created_by,
              created_on,
              updated_by,
              updated_on
            )
            VALUES ?
          `,
          [portValues],
        );
      }
    }

    // ============================================================
    // 13. COMMIT
    // ============================================================

    await connection.commit();

    // ============================================================
    // 14. RESPONSE
    // ============================================================

    return res.status(200).json({
      success: true,
      message: "HBL updated successfully",
      data: {
        hbl_id: Number(id),

        shipment_ids,
        shipment_count: shipment_ids.length,

        ports_count: Array.isArray(ports) ? ports.length : 0,

        updated_shipments: shipmentUpdate.affectedRows,

        updated_grns: updatedGrns,

        updated_gdns: updatedGdns,

        updated_packing_lists: updatedPackingLists,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Update HBL Error:", error);

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
  const { type, status } = req.query;

  try {
    let query = `
      SELECT

        -- =====================================================
        -- HBL
        -- =====================================================

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

        -- Legacy shipment field
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
        h.total_freight_cost,
        h.created_by,
        h.created_on,
        h.updated_by,
        h.updated_on,

        -- =====================================================
        -- SHIPMENTS
        -- =====================================================

        COALESCE(
          s.shipments,
          JSON_ARRAY()
        ) AS shipments,

        -- =====================================================
        -- MULTI PORTS
        -- =====================================================

        COALESCE(
          p.ports,
          JSON_ARRAY()
        ) AS ports

      FROM freight_tracking_app.hbl_hawb_tbl h

      -- =====================================================
      -- CLIENT
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients client
        ON h.client_id = client.id

      -- =====================================================
      -- MANUFACTURE
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients manufacture
        ON h.manufacture_id = manufacture.id

      -- =====================================================
      -- SHIPPER
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients shipper
        ON h.shipper_id = shipper.id

      -- =====================================================
      -- CONSIGNEE
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients consignee
        ON h.consignee_id = consignee.id

      -- =====================================================
      -- NOTIFY
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients notify
        ON h.notify_id = notify.id

      -- =====================================================
      -- HBL
      --   ↓
      -- SHIPMENTS
      --   ↓
      -- GRNs
      --   ↓
      -- GDNs
      --   ↓
      -- PACKING LISTS
      -- =====================================================

      LEFT JOIN (

        SELECT
          hs.hbl_id,

          JSON_ARRAYAGG(

            JSON_OBJECT(

              -- =================================================
              -- SHIPMENT
              -- =================================================

              'id', sh.id,
              'vessel_name', sh.vessel_name,
              'status', sh.status,
              'voyage_number', sh.voyage_number,
              'origin_port', sh.origin_port,
              'discharge_port', sh.discharge_port,
              'final_place_of_delivery',
                sh.final_place_of_delivery,
              'etd_colombo', sh.etd_colombo,
              'eta_discharge_port',
                sh.eta_discharge_port,
              'eta_final_delivery_place',
                sh.eta_final_delivery_place,
              'flight_number', sh.flight_number,
              'origin', sh.origin,
              'destination', sh.destination,
              'etd_origin', sh.etd_origin,
              'eta_destination', sh.eta_destination,
              'mbl_mawb_no', sh.mbl_mawb_no,
              'airline_shipping_line',
                sh.airline_shipping_line,
              'container_number',
                sh.container_number,
              'container_size',
                sh.container_size,
              'final_seal_no',
                sh.final_seal_no,

              -- =================================================
              -- GRNs
              -- =================================================

              'grns',

              COALESCE(

                (
                  SELECT JSON_ARRAYAGG(

                    JSON_OBJECT(

                      'id', grn.id,
                      'client_id', grn.client_id,
                      'manufacture_id',
                        grn.manufacture_id,
                      'forwarder_id',
                        grn.forwarder_id,
                      'recipient_id',
                        grn.recipient_id,
                      'recipient_contact',
                        grn.recipient_contact,
                      'date', grn.date,
                      'quantity', grn.quantity,
                      'bill_id', grn.bill_id,
                      'shipment_id',
                        grn.shipment_id,
                      'actual_carton_count',
                        grn.actual_carton_count,
                      'status', grn.status,
                      'comments', grn.comments,

                      -- =========================================
                      -- GRN CLIENT
                      -- =========================================

                      'client',

                      JSON_OBJECT(
                        'id', grnClient.id,
                        'name', grnClient.name,
                        'address', grnClient.address
                      ),

                      -- =========================================
                      -- GRN MANUFACTURE
                      -- =========================================

                      'manufacture',

                      JSON_OBJECT(
                        'id', grnManufacture.id,
                        'name', grnManufacture.name,
                        'address', grnManufacture.address
                      ),

                      -- =========================================
                      -- GDNs
                      -- =========================================

                      'gdns',

                      COALESCE(

                        (
                          SELECT JSON_ARRAYAGG(

                            JSON_OBJECT(

                              'id', gdn.id,
                              'gdn_no', gdn.gdn_no,
                              'client_id',
                                gdn.client_id,
                              'manufacture_id',
                                gdn.manufacture_id,
                              'forwarder_id',
                                gdn.forwarder_id,
                              'date', gdn.date,
                              'cartoons',
                                gdn.cartoons,
                              'actual_cartoons',
                                gdn.actual_cartoons,
                              'gross_weight',
                                gdn.gross_weight,
                              'actual_gross_weight',
                                gdn.actual_gross_weight,
                              'gross_volume',
                                gdn.gross_volume,
                              'actual_gross_volume',
                                gdn.actual_gross_volume,
                              'status', gdn.status,
                              'gdn_grn_ref',
                                gdn.gdn_grn_ref,
                              'vehicle_no',
                                gdn.vehicle_no,
                              'driver_id',
                                gdn.driver_id,
                              'wharf_staff_id',
                                gdn.wharf_staff_id,
                              'driver_contact_no',
                                gdn.driver_contact_no,
                              'wharf_contact_no',
                                gdn.wharf_contact_no,
                              'dispatch_location',
                                gdn.dispatch_location,
                              'transport_mode',
                                gdn.transport_mode,
                              'container_no',
                                gdn.container_no,
                              'container_size',
                                gdn.container_size,
                              'primary_seal_no',
                                gdn.primary_seal_no,
                              'secondary_seal_no',
                                gdn.secondary_seal_no,
                              'custom_doc_status',
                                gdn.custom_doc_status,
                              'length_cm',
                                gdn.length_cm,
                              'width_cm',
                                gdn.width_cm,
                              'height_cm',
                                gdn.height_cm,

                              -- =================================
                              -- PACKING LISTS
                              -- =================================

                              'packing_lists',

                              COALESCE(

                                (
                                  SELECT JSON_ARRAYAGG(

                                    JSON_OBJECT(

                                      'id', pl.id,
                                      'packing_list_no',
                                        pl.packing_list_no,
                                      'client_id',
                                        pl.client_id,
                                      'manufacturer_id',
                                        pl.manufacturer_id,
                                      'forwarder_id',
                                        pl.forwarder_id,
                                      'date',
                                        pl.date,
                                      'gdn_id',
                                        pl.gdn_id,
                                      'grn_id',
                                        pl.grn_id,
                                      'total_quantity',
                                        pl.total_quantity,
                                      'ship_to',
                                        pl.ship_to,
                                      'document_date',
                                        pl.document_date,
                                      'total_cartons',
                                        pl.total_cartons,
                                      'total_gross_weight_kg',
                                        pl.total_gross_weight_kg,
                                      'total_net_weight_kg',
                                        pl.total_net_weight_kg,
                                      'total_cbm',
                                        pl.total_cbm,
                                      'total_volume',
                                        pl.total_volume,
                                      'shipping_mode',
                                        pl.shipping_mode,
                                      'file_url',
                                        pl.file_url,
                                      'status',
                                        pl.status,
                                      'destination',
                                        pl.destination,
                                      'created_by',
                                        pl.created_by,
                                      'created_on',
                                        pl.created_on,
                                      'updated_by',
                                        pl.updated_by,
                                      'updated_on',
                                        pl.updated_on

                                    )

                                  )

                                  FROM freight_tracking_app.packing_list pl

                                  WHERE pl.gdn_id = gdn.id

                                ),

                                JSON_ARRAY()

                              )

                            )

                          )

                          FROM freight_tracking_app.goods_deliver_notes gdn

                          WHERE
                            CAST(gdn.gdn_grn_ref AS UNSIGNED)
                            = grn.id

                        ),

                        JSON_ARRAY()

                      )

                    )

                  )

                  FROM freight_tracking_app.goods_receive_notes grn

                  LEFT JOIN freight_tracking_app.clients grnClient
                    ON grn.client_id = grnClient.id

                  LEFT JOIN freight_tracking_app.clients grnManufacture
                    ON grn.manufacture_id =
                       grnManufacture.id

                  WHERE grn.shipment_id = sh.id

                ),

                JSON_ARRAY()

              )

            )

          ) AS shipments

        FROM freight_tracking_app.hbl_shipments hs

        INNER JOIN freight_tracking_app.shipments sh
          ON hs.shipment_id = sh.id

        GROUP BY hs.hbl_id

      ) s

        ON s.hbl_id = h.id

      -- =====================================================
      -- MULTI PORTS
      -- =====================================================

      LEFT JOIN (

        SELECT
          hbl_hawb_id,

          JSON_ARRAYAGG(

            JSON_OBJECT(
              'id', id,
              'port', port,
              'status', status,
              'created_by', created_by,
              'created_on', created_on,
              'updated_by', updated_by,
              'updated_on', updated_on
            )

          ) AS ports

        FROM freight_tracking_app.multi_ports

        GROUP BY hbl_hawb_id

      ) p

        ON p.hbl_hawb_id = h.id
    `;

    const params = [];

    // =========================================================
    // DYNAMIC FILTERS
    // =========================================================

    const filters = [];

    if (type) {
      filters.push(`h.type = ?`);
      params.push(type);
    }

    if (status) {
      filters.push(`h.status = ?`);
      params.push(status);
    }

    if (filters.length > 0) {
      query += `
        WHERE ${filters.join(" AND ")}
      `;
    }

    // =========================================================
    // ORDER
    // =========================================================

    query += `
      ORDER BY h.id DESC
    `;

    // =========================================================
    // EXECUTE QUERY
    // =========================================================

    const [rows] = await db.query(query, params);

    // =========================================================
    // FORMAT RESPONSE
    // =========================================================

    const formattedRows = rows.map((row) => ({
      ...row,

      client:
        typeof row.client === "string" ? JSON.parse(row.client) : row.client,

      manufacture:
        typeof row.manufacture === "string"
          ? JSON.parse(row.manufacture)
          : row.manufacture,

      shipper:
        typeof row.shipper === "string" ? JSON.parse(row.shipper) : row.shipper,

      consignee:
        typeof row.consignee === "string"
          ? JSON.parse(row.consignee)
          : row.consignee,

      notify:
        typeof row.notify === "string" ? JSON.parse(row.notify) : row.notify,

      shipments:
        typeof row.shipments === "string"
          ? JSON.parse(row.shipments)
          : row.shipments,

      ports: typeof row.ports === "string" ? JSON.parse(row.ports) : row.ports,
    }));

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,
      message: "HBL list fetched successfully",
      data: formattedRows,
    });
  } catch (error) {
    console.error("Get All HBL Error:", error);

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

        -- =====================================================
        -- HBL
        -- =====================================================

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

        -- Legacy field
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
        h.total_freight_cost,
        h.created_by,
        h.created_on,
        h.updated_by,
        h.updated_on,

        -- =====================================================
        -- SHIPMENTS
        -- =====================================================

        COALESCE(
          s.shipments,
          JSON_ARRAY()
        ) AS shipments,

        -- =====================================================
        -- PORTS
        -- =====================================================

        COALESCE(
          p.ports,
          JSON_ARRAY()
        ) AS ports

      FROM freight_tracking_app.hbl_hawb_tbl h

      -- =====================================================
      -- CLIENT
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients client
        ON h.client_id = client.id

      -- =====================================================
      -- MANUFACTURE
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients manufacture
        ON h.manufacture_id = manufacture.id

      -- =====================================================
      -- SHIPPER
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients shipper
        ON h.shipper_id = shipper.id

      -- =====================================================
      -- CONSIGNEE
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients consignee
        ON h.consignee_id = consignee.id

      -- =====================================================
      -- NOTIFY
      -- =====================================================

      LEFT JOIN freight_tracking_app.clients notify
        ON h.notify_id = notify.id

      -- =====================================================
      -- HBL
      --   ↓
      -- SHIPMENTS
      --   ↓
      -- GRNs
      --   ↓
      -- GDNs
      --   ↓
      -- PACKING LISTS
      -- =====================================================

      LEFT JOIN (

        SELECT
          hs.hbl_id,

          JSON_ARRAYAGG(

            JSON_OBJECT(

              -- =================================================
              -- SHIPMENT
              -- =================================================

              'id',
                shipment.id,

              'vessel_name',
                shipment.vessel_name,

              'status',
                shipment.status,

              'voyage_number',
                shipment.voyage_number,

              'origin_port',
                shipment.origin_port,

              'discharge_port',
                shipment.discharge_port,

              'final_place_of_delivery',
                shipment.final_place_of_delivery,

              'etd_colombo',
                shipment.etd_colombo,

              'eta_discharge_port',
                shipment.eta_discharge_port,

              'eta_final_delivery_place',
                shipment.eta_final_delivery_place,

              'flight_number',
                shipment.flight_number,

              'origin',
                shipment.origin,

              'destination',
                shipment.destination,

              'etd_origin',
                shipment.etd_origin,

              'eta_destination',
                shipment.eta_destination,

              'mbl_mawb_no',
                shipment.mbl_mawb_no,

              'airline_shipping_line',
                shipment.airline_shipping_line,

              'container_number',
                shipment.container_number,

              'container_size',
                shipment.container_size,

              'final_seal_no',
                shipment.final_seal_no,

              -- =================================================
              -- GRNs
              -- =================================================

              'grns',

              COALESCE(

                (
                  SELECT JSON_ARRAYAGG(

                    JSON_OBJECT(

                      'id',
                        grn.id,

                      'client_id',
                        grn.client_id,

                      'manufacture_id',
                        grn.manufacture_id,

                      'forwarder_id',
                        grn.forwarder_id,

                      'recipient_id',
                        grn.recipient_id,

                      'recipient_contact',
                        grn.recipient_contact,

                      'date',
                        grn.date,

                      'quantity',
                        grn.quantity,

                      'bill_id',
                        grn.bill_id,

                      'shipment_id',
                        grn.shipment_id,

                      'actual_carton_count',
                        grn.actual_carton_count,

                      'status',
                        grn.status,

                      'comments',
                        grn.comments,

                      -- =========================================
                      -- GRN CLIENT
                      -- =========================================

                      'client',

                      JSON_OBJECT(
                        'id',
                          grn_client.id,
                        'name',
                          grn_client.name,
                        'address',
                          grn_client.address
                      ),

                      -- =========================================
                      -- GRN MANUFACTURE
                      -- =========================================

                      'manufacture',

                      JSON_OBJECT(
                        'id',
                          grn_manufacture.id,
                        'name',
                          grn_manufacture.name,
                        'address',
                          grn_manufacture.address
                      ),

                      -- =========================================
                      -- GDNs
                      -- =========================================

                      'gdns',

                      COALESCE(

                        (
                          SELECT JSON_ARRAYAGG(

                            JSON_OBJECT(

                              'id',
                                gdn.id,

                              'gdn_no',
                                gdn.gdn_no,

                              'client',
                                gdn_client.name,

                              'manufacture',
                                gdn_manufacture.name,

                              'forwarder',
                                gdn_forwarder.name,

                              'date',
                                gdn.date,

                              'cartoons',
                                gdn.cartoons,

                              'actual_cartoons',
                                gdn.actual_cartoons,

                              'weight',
                                gdn.gross_weight,

                              'actual_gross_weight',
                                gdn.actual_gross_weight,

                              'volume',
                                gdn.gross_volume,

                              'actual_gross_volume',
                                gdn.actual_gross_volume,

                              'status',
                                gdn.status,

                              'gdn_grn_ref',
                                gdn.gdn_grn_ref,

                              'vehicle_no',
                                gdn.vehicle_no,

                              'driver_id',
                                gdn.driver_id,

                              'wharf_staff_id',
                                gdn.wharf_staff_id,

                              'driver_contact_no',
                                gdn.driver_contact_no,

                              'wharf_contact_no',
                                gdn.wharf_contact_no,

                              'dispatch_location',
                                gdn.dispatch_location,

                              'transport_mode',
                                gdn.transport_mode,

                              'container_no',
                                gdn.container_no,

                              'container_size',
                                gdn.container_size,

                              'primary_seal_no',
                                gdn.primary_seal_no,

                              'secondary_seal_no',
                                gdn.secondary_seal_no,

                              'custom_doc_status',
                                gdn.custom_doc_status,

                              'length_cm',
                                gdn.length_cm,

                              'width_cm',
                                gdn.width_cm,

                              'height_cm',
                                gdn.height_cm,

                              -- =================================
                              -- PACKING LISTS
                              -- =================================

                              'packing_lists',

                              COALESCE(

                                (
                                  SELECT JSON_ARRAYAGG(

                                    JSON_OBJECT(

                                      'id',
                                        pl.id,

                                      'packing_list_no',
                                        pl.packing_list_no,

                                      'client',
                                        pl_client.name,

                                      'manufacturer',
                                        pl_manufacturer.name,

                                      'forwarder',
                                        pl_forwarder.name,

                                      'date',
                                        pl.date,

                                      'gdn_id',
                                        pl.gdn_id,

                                      'grn_id',
                                        pl.grn_id,

                                      'total_quantity',
                                        pl.total_quantity,

                                      'ship_to',
                                        pl.ship_to,

                                      'document_date',
                                        pl.document_date,

                                      'total_cartons',
                                        pl.total_cartons,

                                      'weight_kg',
                                        pl.total_gross_weight_kg,

                                      'total_gross_weight_kg',
                                        pl.total_gross_weight_kg,

                                      'total_net_weight_kg',
                                        pl.total_net_weight_kg,

                                      'total_cbm',
                                        pl.total_cbm,

                                      'total_volume',
                                        pl.total_volume,

                                      'shipping_mode',
                                        pl.shipping_mode,

                                      'file_url',
                                        pl.file_url,

                                      'status',
                                        pl.status,

                                      'destination',
                                        pl.destination,

                                      'created_by',
                                        pl.created_by,

                                      'created_on',
                                        pl.created_on,

                                      'updated_by',
                                        pl.updated_by,

                                      'updated_on',
                                        pl.updated_on

                                    )

                                  )

                                  FROM freight_tracking_app.packing_list pl

                                  LEFT JOIN freight_tracking_app.clients pl_client
                                    ON pl.client_id = pl_client.id

                                  LEFT JOIN freight_tracking_app.clients pl_manufacturer
                                    ON pl.manufacturer_id =
                                       pl_manufacturer.id

                                  LEFT JOIN freight_tracking_app.clients pl_forwarder
                                    ON pl.forwarder_id =
                                       pl_forwarder.id

                                  WHERE pl.gdn_id = gdn.id

                                ),

                                JSON_ARRAY()

                              )

                            )

                          )

                          FROM freight_tracking_app.goods_deliver_notes gdn

                          LEFT JOIN freight_tracking_app.clients gdn_client
                            ON gdn.client_id = gdn_client.id

                          LEFT JOIN freight_tracking_app.clients gdn_manufacture
                            ON gdn.manufacture_id =
                               gdn_manufacture.id

                          LEFT JOIN freight_tracking_app.clients gdn_forwarder
                            ON gdn.forwarder_id =
                               gdn_forwarder.id

                          WHERE
                            CAST(gdn.gdn_grn_ref AS UNSIGNED) = grn.id

                        ),

                        JSON_ARRAY()

                      )

                    )

                  )

                  FROM freight_tracking_app.goods_receive_notes grn

                  LEFT JOIN freight_tracking_app.clients grn_client
                    ON grn.client_id = grn_client.id

                  LEFT JOIN freight_tracking_app.clients grn_manufacture
                    ON grn.manufacture_id =
                       grn_manufacture.id

                  WHERE grn.shipment_id = shipment.id

                ),

                JSON_ARRAY()

              )

            )

          ) AS shipments

        FROM freight_tracking_app.hbl_shipments hs

        INNER JOIN freight_tracking_app.shipments shipment
          ON hs.shipment_id = shipment.id

        GROUP BY hs.hbl_id

      ) s

        ON s.hbl_id = h.id

      -- =====================================================
      -- MULTI PORTS
      -- =====================================================

      LEFT JOIN (

        SELECT

          hbl_hawb_id,

          JSON_ARRAYAGG(

            JSON_OBJECT(

              'id',
                id,

              'port',
                port,

              'status',
                status,

              'created_by',
                created_by,

              'created_on',
                created_on,

              'updated_by',
                updated_by,

              'updated_on',
                updated_on

            )

          ) AS ports

        FROM freight_tracking_app.multi_ports

        GROUP BY hbl_hawb_id

      ) p

        ON p.hbl_hawb_id = h.id

      WHERE h.id = ?

      LIMIT 1
    `;

    const [rows] = await db.execute(query, [id]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "HBL not found",
      });
    }

    const row = rows[0];

    // =========================================================
    // PARSE JSON
    // =========================================================

    const parseJson = (value, fallback = {}) => {
      if (value === null || value === undefined) {
        return fallback;
      }

      if (typeof value === "object") {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch (error) {
        return fallback;
      }
    };

    row.client = parseJson(row.client);
    row.manufacture = parseJson(row.manufacture);
    row.shipper = parseJson(row.shipper);
    row.consignee = parseJson(row.consignee);
    row.notify = parseJson(row.notify);

    row.shipments = parseJson(row.shipments, []);

    row.ports = parseJson(row.ports, []);

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,
      message: "HBL fetched successfully",
      data: row,
    });
  } catch (error) {
    console.error("Get HBL By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching HBL",
      error: error.message,
    });
  }
};
