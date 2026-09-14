const db = require("../../sql-connection");

exports.createGroup = async (req, res) => {
  try {
    const { group_name, description } = req.body;

    // Validate required fields
    if (!group_name || !group_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    // Check if group already exists
    const [existingGroup] = await db.query(
      `SELECT id FROM \`groups\` WHERE group_name = ?`,
      [group_name.trim()],
    );

    if (existingGroup.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Group name already exists",
      });
    }

    // Create group
    const [result] = await db.query(
      `INSERT INTO \`groups\` (group_name, description)
       VALUES (?, ?)`,
      [group_name.trim(), description ? description.trim() : null],
    );

    return res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: {
        id: result.insertId,
        group_name: group_name.trim(),
        description: description ? description.trim() : null,
      },
    });
  } catch (error) {
    console.error("Error creating group:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating group",
      error: error.message,
    });
  }
};

// Get all groups
exports.getAllGroups = async (req, res) => {
  try {
    const [groups] = await db.query(`
      SELECT
        id,
        group_name,
        description,
        created_at
      FROM \`groups\`\
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Groups retrieved successfully",
      data: groups,
    });
  } catch (error) {
    console.error("Error getting groups:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving groups",
      error: error.message,
    });
  }
};

// Get group by ID
exports.getGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    const [groups] = await db.query(
      `
      SELECT
        id,
        group_name,
        description,
        created_at
      FROM \`groups\`\
      WHERE id = ?
      `,
      [id],
    );

    if (groups.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Group retrieved successfully",
      data: groups[0],
    });
  } catch (error) {
    console.error("Error getting group:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving group",
      error: error.message,
    });
  }
};

// Update group
exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, description } = req.body;

    if (!group_name || !group_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group name is required",
      });
    }

    // Check if group exists
    const [existingGroup] = await db.query(
      `SELECT id FROM \`groups\`\ WHERE id = ?`,
      [id],
    );

    if (existingGroup.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Group not found",
      });
    }

    // Check duplicate group name
    const [duplicateGroup] = await db.query(
      `
      SELECT id
      FROM \`groups\`\
      WHERE group_name = ?
      AND id != ?
      `,
      [group_name.trim(), id],
    );

    if (duplicateGroup.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Group name already exists",
      });
    }

    // Update group
    await db.query(
      `
      UPDATE \`groups\`\
      SET
        group_name = ?,
        description = ?
      WHERE id = ?
      `,
      [group_name.trim(), description ? description.trim() : null, id],
    );

    // Get updated group
    const [updatedGroup] = await db.query(
      `
      SELECT
        id,
        group_name,
        description,
        created_at
      FROM \`groups\`\
      WHERE id = ?
      `,
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Group updated successfully",
      data: updatedGroup[0],
    });
  } catch (error) {
    console.error("Error updating group:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating group",
      error: error.message,
    });
  }
};
