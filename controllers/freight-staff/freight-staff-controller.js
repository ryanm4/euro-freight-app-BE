const db = require("../../sql-connection");
// ============================================
// CREATE Freight Staff
// ============================================
exports.createFreightStaff = async (req, res) => {
    try {
        const { name, contact_no } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Name is required"
            });
        }

        const [result] = await db.query(
            `
            INSERT INTO freight_tracking_app.freight_staff
                (name, contact_no)
            VALUES (?, ?)
            `,
            [name, contact_no || null]
        );

        // Get created record
        const [rows] = await db.query(
            `
            SELECT
                id,
                name,
                contact_no
            FROM freight_tracking_app.freight_staff
            WHERE id = ?
            `,
            [result.insertId]
        );

        return res.status(201).json({
            success: true,
            message: "Freight staff created successfully",
            data: rows[0]
        });

    } catch (error) {
        console.error("Error creating freight staff:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create freight staff",
            error: error.message
        });
    }
};


// ============================================
// GET All Freight Staff
// ============================================
exports.getAllFreightStaff = async (req, res) => {
    try {
        const [rows] = await db.query(
            `
            SELECT
                id,
                name,
                contact_no
            FROM freight_tracking_app.freight_staff
            ORDER BY id DESC
            `
        );

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("Error fetching freight staff:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch freight staff",
            error: error.message
        });
    }
};


// ============================================
// GET Freight Staff By ID
// ============================================
exports.getFreightStaffById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Freight staff ID is required"
            });
        }

        const [rows] = await db.query(
            `
            SELECT
                id,
                name,
                contact_no
            FROM freight_tracking_app.freight_staff
            WHERE id = ?
            `,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Freight staff not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: rows[0]
        });

    } catch (error) {
        console.error("Error fetching freight staff:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch freight staff",
            error: error.message
        });
    }
};


// ============================================
// UPDATE Freight Staff
// ============================================
exports.updateFreightStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contact_no } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Freight staff ID is required"
            });
        }

        // Check if record exists
        const [existing] = await db.query(
            `
            SELECT id
            FROM freight_tracking_app.freight_staff
            WHERE id = ?
            `,
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Freight staff not found"
            });
        }

        // Validate
        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Name is required"
            });
        }

        await db.query(
            `
            UPDATE freight_tracking_app.freight_staff
            SET
                name = ?,
                contact_no = ?
            WHERE id = ?
            `,
            [name, contact_no || null, id]
        );

        // Return updated record
        const [rows] = await db.query(
            `
            SELECT
                id,
                name,
                contact_no
            FROM freight_tracking_app.freight_staff
            WHERE id = ?
            `,
            [id]
        );

        return res.status(200).json({
            success: true,
            message: "Freight staff updated successfully",
            data: rows[0]
        });

    } catch (error) {
        console.error("Error updating freight staff:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update freight staff",
            error: error.message
        });
    }
};