const db = require("../../sql-connection");

// CREATE Wharf Staff
// CREATE Wharf Staff
exports.createWharfStaff = async (req, res) => {
  try {
    const { name, contact_no } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    const query = `
      INSERT INTO wharf_staff
      (
        name,
        contact_no
      )
      VALUES (?, ?)
    `;

    const [result] = await db.query(query, [name, contact_no || null]);

    res.status(201).json({
      success: true,
      message: "Wharf staff created successfully",
      data: {
        id: result.insertId,
        name,
        contact_no,
      },
    });
  } catch (error) {
    console.error("Create Wharf Staff Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create wharf staff",
      error: error.message,
    });
  }
};

// UPDATE Wharf Staff
exports.updateWharfStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_no } = req.body;

    const query = `
      UPDATE wharf_staff
      SET
        name = ?,
        contact_no = ?
      WHERE id = ?
    `;

    const [result] = await db.query(query, [name, contact_no || null, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Wharf staff not found",
      });
    }

    res.json({
      success: true,
      message: "Wharf staff updated successfully",
    });
  } catch (error) {
    console.error("Update Wharf Staff Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update wharf staff",
      error: error.message,
    });
  }
};

// GET ALL Wharf Staff
exports.getAllWharfStaff = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        name,
        contact_no
      FROM wharf_staff
      ORDER BY id DESC
    `;

    const [rows] = await db.query(query);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get All Wharf Staff Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch wharf staff",
      error: error.message,
    });
  }
};

// GET Wharf Staff By ID
exports.getWharfStaffById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        id,
        name,
        contact_no
      FROM wharf_staff
      WHERE id = ?
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Wharf staff not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get Wharf Staff By ID Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch wharf staff",
      error: error.message,
    });
  }
};
