const db = require("../../sql-connection");

exports.createGoodsReceiveNote = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      client_id,
      manufacture_id,
      forwarder_id,
      recipient_id,
      recipient_contact,
      date,
      quantity,
      status,
      comments,
      created_by,
      gdn_id,
      measurements,
    } = req.body;

    // =========================================================
    // 1. Validate GDN ID
    // =========================================================

    const gdnId = Number(gdn_id);

    if (!gdn_id || isNaN(gdnId)) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "gdn_id is required and must be a valid number",
      });
    }

    // =========================================================
    // 2. Validate Quantity
    // =========================================================

    const quantityNum = Number(quantity);

    if (isNaN(quantityNum)) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "quantity must be a valid number",
      });
    }

    // =========================================================
    // 3. Validate Measurements
    // =========================================================

    if (measurements !== undefined && !Array.isArray(measurements)) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "measurements must be an array",
      });
    }

    const measurementList = Array.isArray(measurements) ? measurements : [];

    // Validate each measurement before creating the GRN
    for (let i = 0; i < measurementList.length; i++) {
      const measurement = measurementList[i];

      if (!measurement || typeof measurement !== "object") {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: `Invalid measurement at index ${i}`,
        });
      }

      const {
        length_cm,
        width_cm,
        height_cm,
        packages,
        total,
        uom,
        cbm,
        volume,
      } = measurement;

      // Validate numeric fields only when provided
      const numericFields = {
        length_cm,
        width_cm,
        height_cm,
        packages,
        total,
        cbm,
        volume,
      };

      for (const [field, value] of Object.entries(numericFields)) {
        if (
          value !== null &&
          value !== undefined &&
          value !== "" &&
          isNaN(Number(value))
        ) {
          await connection.rollback();

          return res.status(400).json({
            success: false,
            message: `measurements[${i}].${field} must be a valid number`,
          });
        }
      }
    }

    // =========================================================
    // 4. Get GDN
    // =========================================================

    const [gdnRows] = await connection.query(
      `
      SELECT
        id,
        gdn_no,
        gdn_grn_ref,
        status
      FROM freight_tracking_app.goods_deliver_notes
      WHERE id = ?
      FOR UPDATE
      `,
      [gdnId],
    );

    // =========================================================
    // 5. Check GDN Exists
    // =========================================================

    if (gdnRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "GDN not found",
        gdn_id: gdnId,
      });
    }

    const gdn = gdnRows[0];

    // =========================================================
    // 6. Check if GDN Already Has a GRN
    // =========================================================

    if (
      gdn.gdn_grn_ref !== null &&
      gdn.gdn_grn_ref !== undefined &&
      String(gdn.gdn_grn_ref).trim() !== ""
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This GDN is already assigned to a GRN",
        data: {
          gdn_id: gdn.id,
          gdn_no: gdn.gdn_no,
          grn_id: gdn.gdn_grn_ref,
        },
      });
    }

    // =========================================================
    // 7. Get ALL Packing Lists for This GDN
    // =========================================================

    const [packingLists] = await connection.query(
      `
      SELECT
        id,
        packing_list_no,
        total_quantity,
        gdn_id,
        grn_id,
        status
      FROM freight_tracking_app.packing_list
      WHERE gdn_id = ?
      FOR UPDATE
      `,
      [gdnId],
    );

    // =========================================================
    // 8. Check Packing Lists Exist
    // =========================================================

    if (packingLists.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "No packing lists found for this GDN",
        gdn_id: gdnId,
        gdn_no: gdn.gdn_no,
      });
    }

    // =========================================================
    // 9. Check if Any Packing List Already Has GRN
    // =========================================================

    const alreadyAssignedPackingLists = packingLists.filter(
      (pl) =>
        pl.grn_id !== null &&
        pl.grn_id !== undefined &&
        String(pl.grn_id).trim() !== "",
    );

    if (alreadyAssignedPackingLists.length > 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "One or more packing lists for this GDN are already assigned to a GRN",

        packing_lists: alreadyAssignedPackingLists.map((pl) => ({
          packing_list_id: pl.id,
          packing_list_no: pl.packing_list_no,
          grn_id: pl.grn_id,
        })),
      });
    }

    // =========================================================
    // 10. Calculate Total Quantity from Packing Lists
    // =========================================================

    const totalPackingQty = packingLists.reduce((sum, pl) => {
      return sum + (Number(pl.total_quantity) || 0);
    }, 0);

    // =========================================================
    // 11. Validate GRN Quantity
    // =========================================================

    if (quantityNum !== totalPackingQty) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "GRN quantity must equal the total quantity of all packing lists for this GDN",

        gdn_id: gdnId,
        gdn_no: gdn.gdn_no,

        requested_quantity: quantityNum,
        packing_list_quantity: totalPackingQty,

        packing_lists: packingLists.map((pl) => ({
          packing_list_id: pl.id,
          packing_list_no: pl.packing_list_no,
          quantity: Number(pl.total_quantity) || 0,
        })),
      });
    }

    // =========================================================
    // 12. Create GRN
    // =========================================================

    const [grnResult] = await connection.query(
      `
      INSERT INTO freight_tracking_app.goods_receive_notes
      (
        client_id,
        manufacture_id,
        forwarder_id,
        recipient_id,
        recipient_contact,
        date,
        quantity,
        status,
        comments,
        created_by,
        created_on
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        client_id,
        manufacture_id,
        forwarder_id,
        recipient_id,
        recipient_contact,
        date,
        quantityNum,
        status,
        comments,
        created_by,
      ],
    );

    const grnId = grnResult.insertId;

    // =========================================================
    // 13. GRN Reference
    // =========================================================

    const grnRef = String(grnId);

    // =========================================================
    // 14. Insert GRN Measurements
    // =========================================================

    if (measurementList.length > 0) {
      for (const measurement of measurementList) {
        const {
          length_cm,
          width_cm,
          height_cm,
          packages,
          total,
          uom,
          cbm,
          volume,
        } = measurement;

        await connection.query(
          `
          INSERT INTO freight_tracking_app.grn_measurements
          (
            grn_id,
            length_cm,
            width_cm,
            height_cm,
            packages,
            total,
            uom,
            cbm,
            volume
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            grnId,
            length_cm !== undefined && length_cm !== ""
              ? Number(length_cm)
              : null,

            width_cm !== undefined && width_cm !== "" ? Number(width_cm) : null,

            height_cm !== undefined && height_cm !== ""
              ? Number(height_cm)
              : null,

            packages !== undefined && packages !== "" ? Number(packages) : null,

            total !== undefined && total !== "" ? Number(total) : null,

            uom || null,

            cbm !== undefined && cbm !== "" ? Number(cbm) : null,

            volume !== undefined && volume !== "" ? Number(volume) : null,
          ],
        );
      }
    }

    // =========================================================
    // 15. Get Packing List IDs
    // =========================================================

    const packingListIds = packingLists.map((pl) => pl.id);

    // =========================================================
    // 16. Update ALL Packing Lists
    // =========================================================

    await connection.query(
      `
      UPDATE freight_tracking_app.packing_list
      SET
        grn_id = ?,
        status = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE gdn_id = ?
      `,
      [grnId, "GRN_OPEN", created_by, gdnId],
    );

    // =========================================================
    // 17. Update GDN
    // =========================================================

    await connection.query(
      `
      UPDATE freight_tracking_app.goods_deliver_notes
      SET
        gdn_grn_ref = ?,
        status = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
      `,
      [grnRef, "GRN_OPEN", created_by, gdnId],
    );

    // =========================================================
    // 18. Commit Transaction
    // =========================================================

    await connection.commit();

    // =========================================================
    // 19. Response
    // =========================================================

    return res.status(201).json({
      success: true,
      message: "GRN created successfully",

      data: {
        grn_id: grnId,
        grn_ref: grnRef,

        gdn_id: gdnId,
        gdn_no: gdn.gdn_no,

        quantity: quantityNum,

        packing_list_ids: packingListIds,

        measurements: measurementList.map((measurement) => ({
          grn_id: grnId,
          length_cm:
            measurement.length_cm !== undefined && measurement.length_cm !== ""
              ? Number(measurement.length_cm)
              : null,

          width_cm:
            measurement.width_cm !== undefined && measurement.width_cm !== ""
              ? Number(measurement.width_cm)
              : null,

          height_cm:
            measurement.height_cm !== undefined && measurement.height_cm !== ""
              ? Number(measurement.height_cm)
              : null,

          packages:
            measurement.packages !== undefined && measurement.packages !== ""
              ? Number(measurement.packages)
              : null,

          total:
            measurement.total !== undefined && measurement.total !== ""
              ? Number(measurement.total)
              : null,

          uom: measurement.uom || null,

          cbm:
            measurement.cbm !== undefined && measurement.cbm !== ""
              ? Number(measurement.cbm)
              : null,

          volume:
            measurement.volume !== undefined && measurement.volume !== ""
              ? Number(measurement.volume)
              : null,
        })),

        packing_lists: packingLists.map((pl) => ({
          packing_list_id: pl.id,
          packing_list_no: pl.packing_list_no,
          quantity: Number(pl.total_quantity) || 0,

          gdn_id: gdnId,
          grn_id: grnId,
          grn_ref: grnRef,
        })),
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Error creating Goods Receive Note:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating GRN",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.updateGoodsReceiveNote = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const grnId = req.params.id;

    const {
      client_id,
      manufacture_id,
      forwarder_id,
      recipient_id,
      recipient_contact,
      date,
      quantity,
      status,
      comments,
      updated_by,
      packing_list_ids,
    } = req.body;

    if (!grnId) {
      return res.status(400).json({
        success: false,
        message: "GRN ID is required",
      });
    }

    if (
      !packing_list_ids ||
      !Array.isArray(packing_list_ids) ||
      packing_list_ids.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "packing_list_ids is required",
      });
    }

    const quantityNum = Number(quantity);

    if (isNaN(quantityNum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GRN quantity",
      });
    }

    // Check GRN exists
    const [existingGrn] = await connection.query(
      `SELECT * FROM freight_tracking_app.goods_receive_notes WHERE id = ?`,
      [grnId],
    );

    if (existingGrn.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "GRN not found",
      });
    }

    // Get selected packing lists
    const [packingLists] = await connection.query(
      `
      SELECT id, total_quantity, grn_id
      FROM freight_tracking_app.packing_list
      WHERE id IN (?)
      `,
      [packing_list_ids],
    );

    if (packingLists.length !== packing_list_ids.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "One or more packing lists not found",
      });
    }

    // Check already assigned packing lists (excluding current GRN)
    const alreadyAssigned = packingLists.filter(
      (pl) => pl.grn_id !== null && pl.grn_id !== Number(grnId),
    );

    if (alreadyAssigned.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Some packing lists are already assigned to another GRN",
        data: alreadyAssigned.map((i) => i.id),
      });
    }

    // Validate quantity match
    const totalPackingQty = packingLists.reduce((sum, item) => {
      return sum + (Number(item.total_quantity) || 0);
    }, 0);

    if (quantityNum !== totalPackingQty) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "GRN quantity must equal total packing list quantity",
        grnQuantity: quantityNum,
        totalPackingListQuantity: totalPackingQty,
      });
    }

    // 🔥 STEP 1: Clear old packing list links
    await connection.query(
      `
      UPDATE freight_tracking_app.packing_list
      SET grn_id = NULL, updated_by = ?, updated_on = NOW()
      WHERE grn_id = ?
      `,
      [updated_by, grnId],
    );

    // 🔥 STEP 2: Update GRN
    await connection.query(
      `
      UPDATE freight_tracking_app.goods_receive_notes
      SET
        client_id = ?,
        manufacture_id = ?,
        forwarder_id = ?,
        recipient_id = ?,
        recipient_contact = ?,
        date = ?,
        quantity = ?,
        status = ?,
        comments = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
      `,
      [
        client_id,
        manufacture_id,
        forwarder_id,
        recipient_id,
        recipient_contact,
        date,
        quantityNum,
        status,
        comments,
        updated_by,
        grnId,
      ],
    );

    // 🔥 STEP 3: Assign new packing lists
    await connection.query(
      `
      UPDATE freight_tracking_app.packing_list
      SET grn_id = ?, updated_by = ?, updated_on = NOW()
      WHERE id IN (?)
      `,
      [grnId, updated_by, packing_list_ids],
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "GRN updated successfully",
      data: {
        grn_id: grnId,
        quantity: quantityNum,
        packing_list_ids,
      },
    });
  } catch (error) {
    await connection.rollback();

    return res.status(500).json({
      success: false,
      message: "Error updating GRN",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.getAllGoodsReceiveNotes = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { shipping_mode, status } = req.query;

    let query = `
      SELECT
        grn.id,

        -- GDN details
        JSON_ARRAYAGG(
          CASE
            WHEN gdn.id IS NOT NULL THEN
              JSON_OBJECT(
                'id', gdn.id,
                'gdn_no', gdn.gdn_no,
                'weight', gdn.gross_weight,
                'volume', gdn.gross_volume
              )
          END
        ) AS gdns,

        client.name AS client_id,
        manufacture.name AS manufacture_id,
        forwarder.name AS forwarder_id,

        -- Recipient details
        recipient.name AS recipient_name,
        recipient.contact_no AS recipient_contact_no,

        grn.date,
        grn.quantity,
        grn.status,
        grn.bill_id,
        grn.comments,
        grn.created_by,
        grn.created_on,
        grn.updated_by,
        grn.updated_on,
        grn.recipient_contact

      FROM freight_tracking_app.goods_receive_notes grn

      LEFT JOIN freight_tracking_app.goods_deliver_notes gdn
        ON gdn.gdn_grn_ref = CAST(grn.id AS CHAR)

      LEFT JOIN freight_tracking_app.clients client
        ON grn.client_id = client.id

      LEFT JOIN freight_tracking_app.clients manufacture
        ON grn.manufacture_id = manufacture.id

      LEFT JOIN freight_tracking_app.clients forwarder
        ON grn.forwarder_id = forwarder.id

      LEFT JOIN freight_tracking_app.freight_staff recipient
        ON grn.recipient_id = recipient.id
    `;

    const params = [];
    const conditions = [];

    // ---------------------------------------
    // Filter by shipping mode
    // ---------------------------------------
    if (shipping_mode) {
      if (shipping_mode.toLowerCase() === "sea") {
        // SEA should include both LCL and FCL
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM freight_tracking_app.packing_list pl
            WHERE pl.grn_id = grn.id
              AND UPPER(pl.shipping_mode) IN ('LCL', 'FCL')
          )
        `);
      } else {
        // AIR / other modes must match exactly
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM freight_tracking_app.packing_list pl
            WHERE pl.grn_id = grn.id
              AND UPPER(pl.shipping_mode) = UPPER(?)
          )
        `);

        params.push(shipping_mode);
      }
    }

    // ---------------------------------------
    // Filter by GRN status
    // ---------------------------------------
    if (status) {
      conditions.push(`grn.status = ?`);
      params.push(status);
    }

    // ---------------------------------------
    // WHERE conditions
    // ---------------------------------------
    if (conditions.length > 0) {
      query += `
        WHERE ${conditions.join(" AND ")}
      `;
    }

    query += `
      GROUP BY
        grn.id,
        client.name,
        manufacture.name,
        forwarder.name,
        recipient.name,
        recipient.contact_no,
        grn.date,
        grn.quantity,
        grn.status,
        grn.bill_id,
        grn.comments,
        grn.created_by,
        grn.created_on,
        grn.updated_by,
        grn.updated_on,
        grn.recipient_contact

      ORDER BY grn.id DESC
    `;

    const [grns] = await connection.query(query, params);

    // ---------------------------------------
    // Attach packing lists
    // ---------------------------------------
    for (const grn of grns) {
      let packingListQuery = `
        SELECT
          id,
          packing_list_no,
          client_id,
          manufacturer_id,
          date,
          gdn_id,
          grn_id,
          total_quantity,
          ship_to,
          shipping_mode,
          status,
          total_cartons,
          created_by,
          created_on,
          updated_by,
          updated_on

        FROM freight_tracking_app.packing_list

        WHERE grn_id = ?
      `;

      const packingParams = [grn.id];

      // ---------------------------------------
      // Packing list shipping mode filter
      // ---------------------------------------
      if (shipping_mode) {
        if (shipping_mode.toLowerCase() === "sea") {
          // SEA = LCL + FCL
          packingListQuery += `
            AND UPPER(shipping_mode) IN ('LCL', 'FCL')
          `;
        } else {
          // AIR = AIR only
          packingListQuery += `
            AND UPPER(shipping_mode) = UPPER(?)
          `;

          packingParams.push(shipping_mode);
        }
      }

      const [packingLists] = await connection.query(
        packingListQuery,
        packingParams,
      );

      grn.packing_lists = packingLists;

      // Convert JSON string to array if necessary
      if (typeof grn.gdns === "string") {
        grn.gdns = JSON.parse(grn.gdns);
      }

      // Remove null GDN entries
      grn.gdns = (grn.gdns || []).filter((gdn) => gdn !== null);
    }

    return res.status(200).json({
      success: true,
      message: "GRNs fetched successfully",
      data: grns,
    });
  } catch (error) {
    console.error("Error fetching GRNs:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching GRNs",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.getGoodsReceiveNoteById = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const grnId = req.params.id;

    // ---------------------------------------------------------
    // 1. Get GRN details
    // ---------------------------------------------------------
    const [grnResult] = await connection.query(
      `
        SELECT 
          grn.id,

          client.name AS client_id,
          manufacture.name AS manufacture_id,
          forwarder.name AS forwarder_id,

          -- Recipient details
          recipient.name AS recipient_name,
          recipient.contact_no AS recipient_contact_no,

          grn.date,
          grn.quantity,
          grn.status,
          grn.bill_id,
          grn.comments,
          grn.created_by,
          grn.created_on,
          grn.updated_by,
          grn.updated_on,
          grn.recipient_contact

        FROM freight_tracking_app.goods_receive_notes grn

        LEFT JOIN freight_tracking_app.clients client
          ON grn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON grn.manufacture_id = manufacture.id

        LEFT JOIN freight_tracking_app.clients forwarder
          ON grn.forwarder_id = forwarder.id

        LEFT JOIN freight_tracking_app.freight_staff recipient
          ON grn.recipient_id = recipient.id

        WHERE grn.id = ?
      `,
      [grnId],
    );

    if (grnResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "GRN not found",
      });
    }

    const grn = grnResult[0];

    // ---------------------------------------------------------
    // 2. Get Packing Lists
    // ---------------------------------------------------------
    const [packingLists] = await connection.query(
      `
        SELECT 
          id,
          packing_list_no,
          client_id,
          manufacturer_id,
          date,
          gdn_id,
          grn_id,
          total_quantity,
          ship_to,
          shipping_mode,
          status,
          created_by,
          created_on,
          updated_by,
          updated_on

        FROM freight_tracking_app.packing_list

        WHERE grn_id = ?
      `,
      [grnId],
    );

    // ---------------------------------------------------------
    // 3. Get GRN Measurements
    // ---------------------------------------------------------
    const [measurements] = await connection.query(
      `
        SELECT
          id,
          grn_id,
          length_cm,
          width_cm,
          height_cm,
          packages,
          total,
          uom,
          cbm,
          volume

        FROM freight_tracking_app.grn_measurements

        WHERE grn_id = ?

        ORDER BY id ASC
      `,
      [grnId],
    );

    // ---------------------------------------------------------
    // 4. Get GDN details
    // ---------------------------------------------------------
    const [gdnResult] = await connection.query(
      `
        SELECT
          gdn.id,
          gdn.gdn_no,

          client.name AS client_id,
          manufacture.name AS manufacture_id,
          forwarder.name AS forwarder_id,

          gdn.date,
          gdn.cartoons,
          gdn.actual_cartoons,
          gdn.gross_weight,
          gdn.actual_gross_weight,
          gdn.gross_volume,
          gdn.actual_gross_volume,

          gdn.status,
          gdn.gdn_grn_ref,
          gdn.vehicle_no,

          gdn.driver_id,
          driver.name AS driver_name,

          gdn.created_by,
          gdn.created_on,
          gdn.updated_by,
          gdn.updated_on,

          gdn.dispatch_location,
          gdn.transport_mode,

          gdn.container_no,
          gdn.container_size,
          gdn.primary_seal_no,
          gdn.secondary_seal_no,

          gdn.custom_doc_status,

          gdn.wharf_staff_id,
          wharf_staff.name AS wharf_staff_name,

          gdn.driver_contact_no,
          gdn.wharf_contact_no,

          gdn.length_cm,
          gdn.width_cm,
          gdn.height_cm

        FROM freight_tracking_app.goods_deliver_notes gdn

        LEFT JOIN freight_tracking_app.clients client
          ON gdn.client_id = client.id

        LEFT JOIN freight_tracking_app.clients manufacture
          ON gdn.manufacture_id = manufacture.id

        LEFT JOIN freight_tracking_app.clients forwarder
          ON gdn.forwarder_id = forwarder.id

        LEFT JOIN freight_tracking_app.freight_staff driver
          ON gdn.driver_id = driver.id

        LEFT JOIN freight_tracking_app.freight_staff wharf_staff
          ON gdn.wharf_staff_id = wharf_staff.id

        WHERE gdn.gdn_grn_ref = ?

        ORDER BY gdn.id ASC
      `,
      [grnId],
    );

    // ---------------------------------------------------------
    // 5. Get GDN measurements
    // ---------------------------------------------------------
    let gdnMeasurements = [];

    if (gdnResult.length > 0) {
      const gdnIds = gdnResult.map((gdn) => gdn.id);

      const placeholders = gdnIds.map(() => "?").join(",");

      const [measurementResult] = await connection.query(
        `
          SELECT
            id,
            gdn_id,
            length_cm,
            width_cm,
            height_cm,
            packages,
            total,
            uom,
            cbm,
            volume

          FROM freight_tracking_app.gdn_measurements

          WHERE gdn_id IN (${placeholders})

          ORDER BY id ASC
        `,
        gdnIds,
      );

      gdnMeasurements = measurementResult;
    }

    // ---------------------------------------------------------
    // 6. Attach GDN measurements to each GDN
    // ---------------------------------------------------------
    const gdns = gdnResult.map((gdn) => {
      return {
        ...gdn,
        measurements: gdnMeasurements.filter(
          (measurement) => measurement.gdn_id === gdn.id,
        ),
      };
    });

    // ---------------------------------------------------------
    // 7. Attach related data to GRN
    // ---------------------------------------------------------
    grn.packing_lists = packingLists;
    grn.measurements = measurements;
    grn.gdns = gdns;

    // ---------------------------------------------------------
    // 8. Response
    // ---------------------------------------------------------
    return res.status(200).json({
      success: true,
      message: "GRN fetched successfully",
      data: grn,
    });
  } catch (error) {
    console.error("Error fetching GRN:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching GRN",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};
