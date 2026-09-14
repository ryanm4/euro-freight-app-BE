const db = require("../../sql-connection");

exports.createGroupRole = async (req, res) => {
  try {
    const { group_id, role_id } = req.body;

    // Validate required fields
    if (!group_id || !role_id) {
      return res.status(400).json({
        success: false,
        message: "group_id and role_id are required",
      });
    }

    // Check if group exists
    const [group] = await db.query(`SELECT id FROM \`groups\` WHERE id = ?`, [
      group_id,
    ]);

    if (group.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check if role exists
    const [role] = await db.query(`SELECT id FROM roles WHERE id = ?`, [
      role_id,
    ]);

    if (role.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Check if role is already assigned to the group
    const [existingGroupRole] = await db.query(
      `SELECT id
       FROM group_roles
       WHERE group_id = ? AND role_id = ?`,
      [group_id, role_id],
    );

    if (existingGroupRole.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Role is already assigned to this group",
      });
    }

    // Create group-role relationship
    const [result] = await db.query(
      `INSERT INTO group_roles (group_id, role_id)
       VALUES (?, ?)`,
      [group_id, role_id],
    );

    return res.status(201).json({
      success: true,
      message: "Role assigned to group successfully",
      data: {
        id: result.insertId,
        group_id,
        role_id,
      },
    });
  } catch (error) {
    console.error("Error creating group role:", error);

    return res.status(500).json({
      success: false,
      message: "Error assigning role to group",
      error: error.message,
    });
  }
};
