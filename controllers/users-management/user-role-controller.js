const db = require("../../sql-connection");

// Assign a role to a user
exports.createUserRole = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { user_id, role_id } = req.body;

    // Validate required fields
    if (!user_id || !role_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and role_id are required",
      });
    }

    // Check if user exists
    const [userResult] = await connection.query(
      `SELECT id, username, full_name
       FROM users
       WHERE id = ?`,
      [user_id],
    );

    if (userResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if role exists
    const [roleResult] = await connection.query(
      `SELECT id, role_name, description
       FROM roles
       WHERE id = ?`,
      [role_id],
    );

    if (roleResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Check if role is already assigned
    const [existingRole] = await connection.query(
      `SELECT id
       FROM user_roles
       WHERE user_id = ? AND role_id = ?`,
      [user_id, role_id],
    );

    if (existingRole.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This role is already assigned to the user",
      });
    }

    // Create user-role assignment
    const [result] = await connection.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES (?, ?)`,
      [user_id, role_id],
    );

    // Return created record with user and role details
    const [createdRole] = await connection.query(
      `SELECT
          ur.id,
          ur.user_id,
          u.username,
          u.full_name,
          ur.role_id,
          r.role_name,
          r.description,
          ur.assigned_at
       FROM user_roles ur
       INNER JOIN users u ON u.id = ur.user_id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.id = ?`,
      [result.insertId],
    );

    return res.status(201).json({
      success: true,
      message: "Role assigned to user successfully",
      data: createdRole[0],
    });
  } catch (error) {
    console.error("Error creating user role:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to assign role to user",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};
