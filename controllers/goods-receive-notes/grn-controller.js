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
      packing_list_ids,
    } = req.body;

    // Validate input
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

    // Fetch packing lists
    const [packingLists] = await connection.query(
      `
                SELECT
                    id,
                    total_quantity,
                    grn_id
                FROM freight_tracking_app.packing_list
                WHERE id IN (?)
      `,
      [packing_list_ids],
    );

    // Validate existence
    if (packingLists.length !== packing_list_ids.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "One or more packing lists not found",
      });
    }

    // Prevent already assigned packing lists
    const alreadyAssigned = packingLists.filter((pl) => pl.grn_id !== null);

    if (alreadyAssigned.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Some packing lists already assigned to a GRN",
        data: alreadyAssigned.map((i) => i.id),
      });
    }

    // Calculate total quantity
    const totalPackingQty = packingLists.reduce((sum, item) => {
      return sum + (Number(item.total_quantity) || 0);
    }, 0);

    // STRICT EQUALITY CHECK
    if (quantityNum !== totalPackingQty) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "GRN quantity must equal total packing list quantity",
        grnQuantity: quantityNum,
        totalPackingListQuantity: totalPackingQty,
      });
    }

    // Insert GRN
    const [result] = await connection.query(
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

    const grnId = result.insertId;

    // Update packing lists
    await connection.query(
      `
      UPDATE freight_tracking_app.packing_list
      SET
        grn_id = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id IN (?)
      `,
      [grnId, created_by, packing_list_ids],
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "GRN created successfully",
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
                                'gdn_no', gdn.gdn_no
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

    // Filter by shipping mode
    if (shipping_mode) {
      query += `
                INNER JOIN freight_tracking_app.packing_list pl
                    ON pl.grn_id = grn.id
                    AND pl.shipping_mode = ?
            `;

      params.push(shipping_mode);
    }

    // Filter by GRN status
    if (status) {
      conditions.push(`grn.status = ?`);
      params.push(status);
    }

    // Add WHERE conditions
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
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

    // Attach packing lists
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
                    created_by,
                    created_on,
                    updated_by,
                    updated_on
                FROM freight_tracking_app.packing_list
                WHERE grn_id = ?
            `;

      const packingParams = [grn.id];

      // Filter packing lists by shipping mode
      if (shipping_mode) {
        packingListQuery += `
                    AND shipping_mode = ?
                `;

        packingParams.push(shipping_mode);
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

    const [grnResult] = await connection.query(
      `
            SELECT 
                grn.id,

                client.name AS client_id,
                manufacture.name AS manufacture_id,
                forwarder.name AS forwarder_id,

                -- Recipient details from freight_staff
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

    grn.packing_lists = packingLists;

    return res.status(200).json({
      success: true,
      message: "GRN fetched successfully",
      data: grn,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching GRN",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};
