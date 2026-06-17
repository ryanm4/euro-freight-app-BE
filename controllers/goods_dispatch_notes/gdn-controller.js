const db = require("../../sql-connection");

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
            vehicle_no
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
                created_by,
                created_on,
                gdn_grn_ref,
                vehicle_no
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
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
            created_by,
            gdn_grn_ref,
            vehicle_no
        ]);

        const gdnId = result.insertId;

        // 2. Update Packing Lists → attach GDN
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
                [gdnId, created_by, packing_list_ids]
            );
        }

        // 3. Update Purchase Orders → set cargo dispatch date from GDN
        await connection.query(
            `
            UPDATE freight_tracking_app.purchase_order po
            INNER JOIN freight_tracking_app.packing_list pl
                ON po.packing_list_id = pl.id
            SET
                po.cargo_dispatch_date = ?,
                po.updated_by = ?,
                po.updated_on = NOW()
            WHERE pl.gdn_id = ?
            `,
            [date, created_by, gdnId]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Goods Deliver Note created successfully and Purchase Orders updated",
            gdn_id: gdnId
        });

    } catch (error) {
        await connection.rollback();

        console.error("GDN Creation Error:", error);

        return res.status(500).json({
            success: false,
            message: "Error creating Goods Deliver Note",
            error: error.message
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
            vehicle_no
        } = req.body || {};

        // Check whether GDN exists
        const [existing] = await connection.query(
            `SELECT id FROM freight_tracking_app.goods_deliver_notes
       WHERE id = ?`,
            [gdnId]
        );

        if (existing.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Goods Deliver Receive Note not found"
            });
        }

        // Update GDN
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
        updated_by = ?,
        updated_on = NOW(),
        gdn_grn_ref = ?,
        vehicle_no = ?
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
            updated_by,
            gdn_grn_ref,
            vehicle_no,
            gdnId
        ]);

        // Remove existing packing list mappings
        await connection.query(
            `UPDATE freight_tracking_app.packing_list
       SET
         gdn_id = NULL,
         updated_by = ?,
         updated_on = NOW()
       WHERE gdn_id = ?`,
            [updated_by, gdnId]
        );

        // Assign newly selected packing lists
        if (packing_list_ids && packing_list_ids.length > 0) {
            await connection.query(
                `UPDATE freight_tracking_app.packing_list
         SET
           gdn_id = ?,
           updated_by = ?,
           updated_on = NOW()
         WHERE id IN (?)`,
                [gdnId, updated_by, packing_list_ids]
            );
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: "Goods Deliver Receive Note updated successfully"
        });

    } catch (error) {
        await connection.rollback();

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Error updating Goods Deliver Receive Note",
            error: error.message
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
        g.client_id,
        g.manufacture_id,
        g.forwarder_id,
        g.date,
        g.cartoons,
        g.actual_cartoons,
        g.gross_weight,
        g.actual_gross_weight,
        g.gross_volume,
        g.actual_gross_volume,
        g.status,
        g.gdn_grn_ref,
        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,
        g.vehicle_no,
        GROUP_CONCAT(p.id) AS packing_list_ids
      FROM freight_tracking_app.goods_deliver_notes g
      LEFT JOIN freight_tracking_app.packing_list p
        ON p.gdn_id = g.id
      GROUP BY g.id
      ORDER BY g.id DESC
    `;

        const [rows] = await db.query(query);

        const result = rows.map(row => ({
            ...row,
            packing_list_ids: row.packing_list_ids
                ? row.packing_list_ids.split(",").map(Number)
                : []
        }));

        res.status(200).json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Error retrieving Goods Deliver Receive Notes",
            error: error.message
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
        g.client_id,
        g.manufacture_id,
        g.forwarder_id,
        g.date,
        g.cartoons,
        g.actual_cartoons,
        g.gross_weight,
        g.actual_gross_weight,
        g.gross_volume,
        g.actual_gross_volume,
        g.status,
        g.gdn_grn_ref,
        g.created_by,
        g.created_on,
        g.updated_by,
        g.updated_on,
        g.vehicle_no,
        GROUP_CONCAT(p.id) AS packing_list_ids
      FROM freight_tracking_app.goods_deliver_notes g
      LEFT JOIN freight_tracking_app.packing_list p
        ON p.gdn_id = g.id
      WHERE g.id = ?
      GROUP BY g.id
    `;

        const [rows] = await db.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Goods Deliver Receive Note not found"
            });
        }

        const result = {
            ...rows[0],
            packing_list_ids: rows[0].packing_list_ids
                ? rows[0].packing_list_ids.split(",").map(Number)
                : []
        };

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Error retrieving Goods Deliver Receive Note",
            error: error.message
        });
    }
};