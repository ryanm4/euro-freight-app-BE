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
        } = req.body;

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
            created_by,
        ]);

        const poId = poResult.insertId;

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
                    created_by,
                ]);
            }
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Purchase Order created successfully",
            po_id: poId,
        });
    } catch (error) {
        await connection.rollback();

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to create Purchase Order",
            error: error.message,
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
        } = req.body;

        // 1. Update PO Header
        const updatePOQuery = `
      UPDATE freight_tracking_app.purchase_order
      SET
        po_number = ?,
        po_quantity = ?,
        ex_factory_date = ?,
        shipping_mode = ?,
        final_destination = ?,
        supplier_id = ?,
        freight_forwarder = ?,
        payment_mode = ?,
        instructions = ?,
        actual_delivery_date = ?,
        PO_url = ?,
        status = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

        await connection.query(updatePOQuery, [
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
            poId,
        ]);

        // 2. Delete existing items (replace-all strategy)
        await connection.query(
            `DELETE FROM freight_tracking_app.po_details WHERE po_id = ?`,
            [poId]
        );

        // 3. Insert new items
        if (items.length > 0) {
            const insertItemQuery = `
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
                await connection.query(insertItemQuery, [
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
                    updated_by,
                ]);
            }
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: "Purchase Order updated successfully",
            po_id: poId,
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to update Purchase Order",
            error: error.message,
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

    // Group items by po_id
    const itemsMap = itemRows.reduce((acc, item) => {
      if (!acc[item.po_id]) acc[item.po_id] = [];
      acc[item.po_id].push(item);
      return acc;
    }, {});

    // Merge
    const result = poRows.map(po => ({
      ...po,
      items: itemsMap[po.id] || []
    }));

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(error);

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

    // Get PO header
    const [poRows] = await connection.query(
      `SELECT * FROM freight_tracking_app.purchase_order WHERE id = ?`,
      [poId]
    );

    if (poRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Purchase Order not found"
      });
    }

    // Get items
    const [items] = await connection.query(
      `SELECT * FROM freight_tracking_app.po_details WHERE po_id = ?`,
      [poId]
    );

    const result = {
      ...poRows[0],
      items
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch purchase order",
      error: error.message
    });

  } finally {
    connection.release();
  }
};