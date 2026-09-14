const db = require("../../sql-connection");

exports.createRole = async (req, res) => {
  try {
    const { role_name, description } = req.body;

    // Validation
    if (!role_name) {
      return res.status(400).json({
        success: false,
        message: "role_name is required",
      });
    }

    // Check if role already exists
    const [existing] = await db.query(
      `SELECT id FROM roles WHERE role_name = ?`,
      [role_name],
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Role already exists",
      });
    }

    // Insert role
    const [result] = await db.query(
      `INSERT INTO roles (role_name, description)
       VALUES (?, ?)`,
      [role_name, description || null],
    );

    return res.status(201).json({
      success: true,
      message: "Role created successfully",
      role: {
        id: result.insertId,
        role_name,
        description: description || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating role",
      error: error.message,
    });
  }
};

// Get All Roles
exports.getAllRoles = async (req, res) => {
  try {
    const [roles] = await db.query(`
      SELECT
        id,
        role_name,
        description,
        created_at
      FROM roles
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Roles retrieved successfully",
      data: roles,
    });
  } catch (error) {
    console.error("Error getting roles:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving roles",
      error: error.message,
    });
  }
};

// Get Role By ID
exports.getRoleById = async (req, res) => {
  try {
    const { id } = req.params;

    const [roles] = await db.query(
      `
      SELECT
        id,
        role_name,
        description,
        created_at
      FROM roles
      WHERE id = ?
      `,
      [id],
    );

    if (roles.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Role retrieved successfully",
      data: roles[0],
    });
  } catch (error) {
    console.error("Error getting role:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving role",
      error: error.message,
    });
  }
};

// Update Role
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role_name, description } = req.body;

    if (!role_name || !role_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Role name is required",
      });
    }

    // Check if role exists
    const [existingRole] = await db.query(`SELECT id FROM roles WHERE id = ?`, [
      id,
    ]);

    if (existingRole.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Check duplicate role name
    const [duplicateRole] = await db.query(
      `
      SELECT id
      FROM roles
      WHERE role_name = ?
      AND id != ?
      `,
      [role_name.trim(), id],
    );

    if (duplicateRole.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Role name already exists",
      });
    }

    await db.query(
      `
      UPDATE roles
      SET
        role_name = ?,
        description = ?
      WHERE id = ?
      `,
      [role_name.trim(), description ? description.trim() : null, id],
    );

    // Get updated role
    const [updatedRole] = await db.query(
      `
      SELECT
        id,
        role_name,
        description,
        created_at
      FROM roles
      WHERE id = ?
      `,
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: updatedRole[0],
    });
  } catch (error) {
    console.error("Error updating role:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating role",
      error: error.message,
    });
  }
};
