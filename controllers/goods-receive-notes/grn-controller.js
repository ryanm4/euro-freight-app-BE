const db = require("../../sql-connection");

exports.createGoodsReceiveNote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            client_id,
            manufacture_id,
            forwarder_id,
            date,
            quantity,
            status,
            comments,
            created_by,
            packing_list_ids
        } = req.body;

        // Validate input
        if (!packing_list_ids || !Array.isArray(packing_list_ids) || packing_list_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "packing_list_ids is required"
            });
        }

        const quantityNum = Number(quantity);

        if (isNaN(quantityNum)) {
            return res.status(400).json({
                success: false,
                message: "Invalid GRN quantity"
            });
        }

        // Fetch packing lists
        const [packingLists] = await connection.query(
            `
      SELECT id, quantity, grn_id
      FROM freight_tracking_app.packing_list
      WHERE id IN (?)
      `,
            [packing_list_ids]
        );

        // Validate existence
        if (packingLists.length !== packing_list_ids.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "One or more packing lists not found"
            });
        }

        // Prevent already assigned packing lists
        const alreadyAssigned = packingLists.filter(pl => pl.grn_id !== null);

        if (alreadyAssigned.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Some packing lists already assigned to a GRN",
                data: alreadyAssigned.map(i => i.id)
            });
        }

        // Calculate total quantity
        const totalPackingQty = packingLists.reduce((sum, item) => {
            return sum + (Number(item.quantity) || 0);
        }, 0);

        // STRICT EQUALITY CHECK
        if (quantityNum !== totalPackingQty) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "GRN quantity must equal total packing list quantity",
                grnQuantity: quantityNum,
                totalPackingListQuantity: totalPackingQty
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
        date,
        quantity,
        status,
        comments,
        created_by,
        created_on
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
            [
                client_id,
                manufacture_id,
                forwarder_id,
                date,
                quantityNum,
                status,
                comments,
                created_by
            ]
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
            [grnId, created_by, packing_list_ids]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "GRN created successfully",
            data: {
                grn_id: grnId,
                quantity: quantityNum,
                packing_list_ids
            }
        });

    } catch (error) {
        await connection.rollback();

        return res.status(500).json({
            success: false,
            message: "Error creating GRN",
            error: error.message
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
            date,
            quantity,
            status,
            comments,
            updated_by,
            packing_list_ids
        } = req.body;

        if (!grnId) {
            return res.status(400).json({
                success: false,
                message: "GRN ID is required"
            });
        }

        if (!packing_list_ids || !Array.isArray(packing_list_ids) || packing_list_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: "packing_list_ids is required"
            });
        }

        const quantityNum = Number(quantity);

        if (isNaN(quantityNum)) {
            return res.status(400).json({
                success: false,
                message: "Invalid GRN quantity"
            });
        }

        // Check GRN exists
        const [existingGrn] = await connection.query(
            `SELECT * FROM freight_tracking_app.goods_receive_notes WHERE id = ?`,
            [grnId]
        );

        if (existingGrn.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "GRN not found"
            });
        }

        // Get selected packing lists
        const [packingLists] = await connection.query(
            `
      SELECT id, quantity, grn_id
      FROM freight_tracking_app.packing_list
      WHERE id IN (?)
      `,
            [packing_list_ids]
        );

        if (packingLists.length !== packing_list_ids.length) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "One or more packing lists not found"
            });
        }

        // Check already assigned packing lists (excluding current GRN)
        const alreadyAssigned = packingLists.filter(
            pl => pl.grn_id !== null && pl.grn_id !== Number(grnId)
        );

        if (alreadyAssigned.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Some packing lists are already assigned to another GRN",
                data: alreadyAssigned.map(i => i.id)
            });
        }

        // Validate quantity match
        const totalPackingQty = packingLists.reduce((sum, item) => {
            return sum + (Number(item.quantity) || 0);
        }, 0);

        if (quantityNum !== totalPackingQty) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "GRN quantity must equal total packing list quantity",
                grnQuantity: quantityNum,
                totalPackingListQuantity: totalPackingQty
            });
        }

        // 🔥 STEP 1: Clear old packing list links
        await connection.query(
            `
      UPDATE freight_tracking_app.packing_list
      SET grn_id = NULL, updated_by = ?, updated_on = NOW()
      WHERE grn_id = ?
      `,
            [updated_by, grnId]
        );

        // 🔥 STEP 2: Update GRN
        await connection.query(
            `
      UPDATE freight_tracking_app.goods_receive_notes
      SET
        client_id = ?,
        manufacture_id = ?,
        forwarder_id = ?,
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
                date,
                quantityNum,
                status,
                comments,
                updated_by,
                grnId
            ]
        );

        // 🔥 STEP 3: Assign new packing lists
        await connection.query(
            `
      UPDATE freight_tracking_app.packing_list
      SET grn_id = ?, updated_by = ?, updated_on = NOW()
      WHERE id IN (?)
      `,
            [grnId, updated_by, packing_list_ids]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: "GRN updated successfully",
            data: {
                grn_id: grnId,
                quantity: quantityNum,
                packing_list_ids
            }
        });

    } catch (error) {
        await connection.rollback();

        return res.status(500).json({
            success: false,
            message: "Error updating GRN",
            error: error.message
        });

    } finally {
        connection.release();
    }
};


exports.getAllGoodsReceiveNotes = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const [grns] = await connection.query(`
      SELECT 
        grn.id,
        grn.client_id,
        grn.manufacture_id,
        grn.forwarder_id,
        grn.date,
        grn.quantity,
        grn.status,
        grn.bill_id,
        grn.comments,
        grn.created_by,
        grn.created_on,
        grn.updated_by,
        grn.updated_on
      FROM freight_tracking_app.goods_receive_notes grn
      ORDER BY grn.id DESC
    `);

        // Attach packing lists for each GRN
        for (let grn of grns) {
            const [packingLists] = await connection.query(
                `
        SELECT 
          id,
          client_id,
          date,
          gdn_id,
          grn_id,
          quantity,
          created_by,
          created_on,
          updated_by,
          updated_on
        FROM freight_tracking_app.packing_list
        WHERE grn_id = ?
        `,
                [grn.id]
            );

            grn.packing_lists = packingLists;
        }

        return res.status(200).json({
            success: true,
            message: "GRNs fetched successfully",
            data: grns
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching GRNs",
            error: error.message
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
        id,
        client_id,
        manufacture_id,
        forwarder_id,
        date,
        quantity,
        status,
        bill_id,
        comments,
        created_by,
        created_on,
        updated_by,
        updated_on
      FROM freight_tracking_app.goods_receive_notes
      WHERE id = ?
      `,
            [grnId]
        );

        if (grnResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: "GRN not found"
            });
        }

        const grn = grnResult[0];

        const [packingLists] = await connection.query(
            `
      SELECT 
        id,
        client_id,
        date,
        gdn_id,
        grn_id,
        quantity,
        created_by,
        created_on,
        updated_by,
        updated_on
      FROM freight_tracking_app.packing_list
      WHERE grn_id = ?
      `,
            [grnId]
        );

        grn.packing_lists = packingLists;

        return res.status(200).json({
            success: true,
            message: "GRN fetched successfully",
            data: grn
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching GRN",
            error: error.message
        });

    } finally {
        connection.release();
    }
};