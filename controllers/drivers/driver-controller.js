const db = require("../../sql-connection");

// ============================
// CREATE DRIVER
// ============================
exports.createDriver = async (req, res) => {
  try {
    const { name, nic_no, manufacturer_id, contact_no } = req.body;

    if (!name || !manufacturer_id) {
      return res.status(400).json({
        success: false,
        message: "Name and manufacturer_id are required",
      });
    }

    // Check manufacturer exists
    const [client] = await db.query("SELECT id FROM clients WHERE id = ?", [
      manufacturer_id,
    ]);

    if (client.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Manufacturer/Client not found",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO drivers
      (
        name,
        nic_no,
        manufacturer_id,
        contact_no
      )
      VALUES (?, ?, ?, ?)
      `,
      [name, nic_no || null, manufacturer_id, contact_no || null],
    );

    res.status(201).json({
      success: true,
      message: "Driver created successfully",
      data: {
        id: result.insertId,
        name,
        nic_no,
        manufacturer_id,
        contact_no,
      },
    });
  } catch (error) {
    console.error("Create Driver Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create driver",
      error: error.message,
    });
  }
};

// ============================
// UPDATE DRIVER
// ============================
exports.updateDriver = async (req, res) => {
  try {
    const { id } = req.params;

    const { name, nic_no, manufacturer_id, contact_no } = req.body;

    // Check driver exists
    const [existing] = await db.query("SELECT id FROM drivers WHERE id = ?", [
      id,
    ]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // If manufacturer changed validate
    if (manufacturer_id) {
      const [client] = await db.query("SELECT id FROM clients WHERE id = ?", [
        manufacturer_id,
      ]);

      if (client.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Manufacturer/Client not found",
        });
      }
    }

    await db.query(
      `
      UPDATE drivers
      SET
        name = COALESCE(?, name),
        nic_no = COALESCE(?, nic_no),
        manufacturer_id = COALESCE(?, manufacturer_id),
        contact_no = COALESCE(?, contact_no)
      WHERE id = ?
      `,
      [name, nic_no, manufacturer_id, contact_no, id],
    );

    res.json({
      success: true,
      message: "Driver updated successfully",
    });
  } catch (error) {
    console.error("Update Driver Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update driver",
      error: error.message,
    });
  }
};

// ============================
// GET ALL DRIVERS
// ============================
exports.getAllDrivers = async (req, res) => {
  try {
    const [drivers] = await db.query(
      `
      SELECT 
        d.id,
        d.name,
        d.nic_no,
        d.manufacturer_id,
        c.name AS manufacturer_name,
        d.contact_no

      FROM drivers d

      LEFT JOIN clients c
      ON c.id = d.manufacturer_id

      ORDER BY d.id DESC
      `,
    );

    res.json({
      success: true,
      count: drivers.length,
      data: drivers,
    });
  } catch (error) {
    console.error("Get Drivers Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch drivers",
      error: error.message,
    });
  }
};

// ============================
// GET DRIVER BY ID
// ============================
exports.getDriverById = async (req, res) => {
  try {
    const { id } = req.params;

    const [drivers] = await db.query(
      `
      SELECT 
        d.id,
        d.name,
        d.nic_no,
        d.manufacturer_id,
        c.name AS manufacturer_name,
        d.contact_no

      FROM drivers d

      LEFT JOIN clients c
      ON c.id = d.manufacturer_id

      WHERE d.id = ?
      `,
      [id],
    );

    if (drivers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    res.json({
      success: true,
      data: drivers[0],
    });
  } catch (error) {
    console.error("Get Driver By ID Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch driver",
      error: error.message,
    });
  }
};
