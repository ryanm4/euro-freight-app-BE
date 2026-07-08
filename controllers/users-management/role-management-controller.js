const db = require("../../sql-connection");

exports.createRole = async (req, res) => {
    try {
        const { role_name, description } = req.body;

        // Validation
        if (!role_name) {
            return res.status(400).json({
                success: false,
                message: "role_name is required"
            });
        }

        // Check if role already exists
        const [existing] = await db.query(
            `SELECT id FROM roles WHERE role_name = ?`,
            [role_name]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Role already exists"
            });
        }

        // Insert role
        const [result] = await db.query(
            `INSERT INTO roles (role_name, description)
       VALUES (?, ?)`,
            [role_name, description || null]
        );

        return res.status(201).json({
            success: true,
            message: "Role created successfully",
            role: {
                id: result.insertId,
                role_name,
                description: description || null
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error creating role",
            error: error.message
        });
    }
};