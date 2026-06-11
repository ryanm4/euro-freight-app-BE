const db = require("../../sql-connection");

// Create Purchase Order
exports.createPurchaseOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            po_number,
            po_quantity,
            ex_factory_date,
            shipping_mode,
            final_destination,
            supplier_id,
            freight_forwarder,
            payment_mode,
            instructions,
            actual_delivery_date,
            PO_url,
            status,
            created_by,
            items = [],
            shipping_quantities = []
        } = req.body;

        // Validate shipping quantities
        const totalShippingQty = shipping_quantities.reduce(
            (sum, row) => sum + Number(row.quantity || 0),
            0
        );

        if (totalShippingQty > Number(po_quantity)) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: `Total shipping quantity (${totalShippingQty}) cannot exceed PO quantity (${po_quantity})`
            });
        }

        // Insert PO Header
        const poQuery = `
            INSERT INTO freight_tracking_app.purchase_order (
                po_number,
                po_quantity,
                ex_factory_date,
                shipping_mode,
                final_destination,
                supplier_id,
                freight_forwarder,
                payment_mode,
                instructions,
                actual_delivery_date,
                PO_url,
                status,
                created_by,
                created_on
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const [poResult] = await connection.query(poQuery, [
            po_number,
            po_quantity,
            ex_factory_date,
            shipping_mode,
            final_destination,
            supplier_id,
            freight_forwarder,
            payment_mode,
            instructions,
            actual_delivery_date,
            PO_url,
            status,
            created_by
        ]);

        const poId = poResult.insertId;

        // Insert shipping quantities
        if (shipping_quantities.length > 0) {

            const shippingQuery = `
                INSERT INTO freight_tracking_app.shipping_quantity
                (
                    po_id,
                    quantity,
                    type
                )
                VALUES (?, ?, ?)
            `;

            for (const row of shipping_quantities) {

                await connection.query(shippingQuery, [
                    poId,
                    row.quantity,
                    row.type
                ]);
            }
        }

        // Insert PO Items
        if (items.length > 0) {

            const itemQuery = `
                INSERT INTO freight_tracking_app.po_details (
                    po_id,
                    sku,
                    item_name,
                    color,
                    size,
                    country_of_origin,
                    unit_cost,
                    quantity,
                    cartoons,
                    gross_weight,
                    net_weight,
                    ctn_demi,
                    cbm,
                    dispatched_quantity,
                    status,
                    created_by,
                    created_on
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            for (const item of items) {

                await connection.query(itemQuery, [
                    poId,
                    item.sku,
                    item.item_name,
                    item.color,
                    item.size,
                    item.country_of_origin,
                    item.unit_cost,
                    item.quantity,
                    item.cartoons,
                    item.gross_weight,
                    item.net_weight,
                    item.ctn_demi,
                    item.cbm,
                    item.dispatched_quantity,
                    item.status,
                    created_by
                ]);
            }
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Purchase Order created successfully",
            po_id: poId
        });

    } catch (error) {

        await connection.rollback();

        res.status(500).json({
            success: false,
            message: "Failed to create Purchase Order",
            error: error.message
        });

    } finally {
        connection.release();
    }
};

// Update Purchase Order
exports.updatePurchaseOrder = async (req, res) => {

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const poId = req.params.id;

        const {
            po_number,
            po_quantity,
            ex_factory_date,
            shipping_mode,
            final_destination,
            supplier_id,
            freight_forwarder,
            payment_mode,
            instructions,
            actual_delivery_date,
            PO_url,
            status,
            updated_by,
            items = [],
            shipping_quantities = []
        } = req.body;

        // Validate shipping quantity total
        const totalShippingQty = shipping_quantities.reduce(
            (sum, row) => sum + Number(row.quantity || 0),
            0
        );

        if (totalShippingQty > Number(po_quantity)) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: `Total shipping quantity (${totalShippingQty}) cannot exceed PO quantity (${po_quantity})`
            });
        }

        // Update PO
        await connection.query(
            `
            UPDATE freight_tracking_app.purchase_order
            SET
                po_number=?,
                po_quantity=?,
                ex_factory_date=?,
                shipping_mode=?,
                final_destination=?,
                supplier_id=?,
                freight_forwarder=?,
                payment_mode=?,
                instructions=?,
                actual_delivery_date=?,
                PO_url=?,
                status=?,
                updated_by=?,
                updated_on=NOW()
            WHERE id=?
        `,
            [
                po_number,
                po_quantity,
                ex_factory_date,
                shipping_mode,
                final_destination,
                supplier_id,
                freight_forwarder,
                payment_mode,
                instructions,
                actual_delivery_date,
                PO_url,
                status,
                updated_by,
                poId
            ]
        );

        // Replace shipping quantities
        await connection.query(
            `DELETE FROM freight_tracking_app.shipping_quantity WHERE po_id=?`,
            [poId]
        );

        if (shipping_quantities.length > 0) {

            const shippingQuery = `
                INSERT INTO freight_tracking_app.shipping_quantity
                (
                    po_id,
                    quantity,
                    type
                )
                VALUES (?, ?, ?)
            `;

            for (const row of shipping_quantities) {

                await connection.query(shippingQuery, [
                    poId,
                    row.quantity,
                    row.type
                ]);
            }
        }

        // Replace items
        await connection.query(
            `DELETE FROM freight_tracking_app.po_details WHERE po_id=?`,
            [poId]
        );

        if (items.length > 0) {

            const itemQuery = `
                INSERT INTO freight_tracking_app.po_details (
                    po_id,
                    sku,
                    item_name,
                    color,
                    size,
                    country_of_origin,
                    unit_cost,
                    quantity,
                    cartoons,
                    gross_weight,
                    net_weight,
                    ctn_demi,
                    cbm,
                    dispatched_quantity,
                    status,
                    updated_by,
                    updated_on
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            for (const item of items) {

                await connection.query(itemQuery, [
                    poId,
                    item.sku,
                    item.item_name,
                    item.color,
                    item.size,
                    item.country_of_origin,
                    item.unit_cost,
                    item.quantity,
                    item.cartoons,
                    item.gross_weight,
                    item.net_weight,
                    item.ctn_demi,
                    item.cbm,
                    item.dispatched_quantity,
                    item.status,
                    updated_by
                ]);
            }
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: "Purchase Order updated successfully",
            po_id: poId
        });

    } catch (error) {

        await connection.rollback();

        res.status(500).json({
            success: false,
            message: "Failed to update Purchase Order",
            error: error.message
        });

    } finally {
        connection.release();
    }
};


exports.getAllPurchaseOrders = async (req, res) => {

    const connection = await db.getConnection();

    try {

        const [poRows] = await connection.query(`
            SELECT *
            FROM freight_tracking_app.purchase_order
            ORDER BY id DESC
        `);

        const [itemRows] = await connection.query(`
            SELECT *
            FROM freight_tracking_app.po_details
        `);

        const [shippingRows] = await connection.query(`
            SELECT *
            FROM freight_tracking_app.shipping_quantity
        `);

        const itemsMap = itemRows.reduce((acc, item) => {

            if (!acc[item.po_id]) {
                acc[item.po_id] = [];
            }

            acc[item.po_id].push(item);

            return acc;

        }, {});

        const shippingMap = shippingRows.reduce((acc, row) => {

            if (!acc[row.po_id]) {
                acc[row.po_id] = [];
            }

            acc[row.po_id].push(row);

            return acc;

        }, {});

        const result = poRows.map(po => ({
            ...po,
            shipping_quantities: shippingMap[po.id] || [],
            items: itemsMap[po.id] || []
        }));

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Failed to fetch purchase orders",
            error: error.message
        });

    } finally {

        connection.release();

    }
};

exports.getPurchaseOrderById = async (req, res) => {

    const connection = await db.getConnection();

    try {

        const poId = req.params.id;

        const [poRows] = await connection.query(
            `SELECT * FROM freight_tracking_app.purchase_order WHERE id=?`,
            [poId]
        );

        if (poRows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "Purchase Order not found"
            });

        }

        const [items] = await connection.query(
            `
            SELECT *
            FROM freight_tracking_app.po_details
            WHERE po_id=?
        `,
            [poId]
        );

        const [shipping_quantities] = await connection.query(
            `
            SELECT *
            FROM freight_tracking_app.shipping_quantity
            WHERE po_id=?
        `,
            [poId]
        );

        res.status(200).json({
            success: true,
            data: {
                ...poRows[0],
                shipping_quantities,
                items
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Failed to fetch purchase order",
            error: error.message
        });

    } finally {

        connection.release();

    }
};