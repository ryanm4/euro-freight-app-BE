const db = require("../../sql-connection");

exports.createUserGroup = async (req, res) => {
  try {
    const { user_id, group_id } = req.body;

    // Validate required fields
    if (!user_id || !group_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and group_id are required",
      });
    }

    // Check if user exists
    const [user] = await db.query(`SELECT id FROM users WHERE id = ?`, [
      user_id,
    ]);

    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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

    // Check if user is already assigned to this group
    const [existingUserGroup] = await db.query(
      `SELECT id
       FROM user_groups
       WHERE user_id = ? AND group_id = ?`,
      [user_id, group_id],
    );

    if (existingUserGroup.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User is already assigned to this group",
      });
    }

    // Create user-group relationship
    const [result] = await db.query(
      `INSERT INTO user_groups (user_id, group_id)
       VALUES (?, ?)`,
      [user_id, group_id],
    );

    return res.status(201).json({
      success: true,
      message: "User added to group successfully",
      data: {
        id: result.insertId,
        user_id,
        group_id,
      },
    });
  } catch (error) {
    console.error("Error creating user group:", error);

    return res.status(500).json({
      success: false,
      message: "Error adding user to group",
      error: error.message,
    });
  }
};
