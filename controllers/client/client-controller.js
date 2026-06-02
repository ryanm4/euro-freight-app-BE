const db = require("../../sql-connection");

// Create Client
exports.createClient = async (req, res) => {
  try {
    const {
      name,
      address,
      contact_no,
      contact_person,
      status,
      type,
      created_by,
    } = req.body;

    const query = `
      INSERT INTO freight_tracking_app.clients (
        name,
        address,
        contact_no,
        contact_person,
        status,
        type,
        created_by,
        created_on
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await db.query(query, [
      name,
      address,
      contact_no,
      contact_person,
      status,
      type,
      created_by,
    ]);

    res.status(201).json({
      success: true,
      message: "Client created successfully",
      client_id: result.insertId,
    });
  } catch (error) {
    console.error("Create Client Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create client",
      error: error.message,
    });
  }
};

// Get All Clients
exports.getClients = async (req, res) => {
  try {
    const query = `
      SELECT *
      FROM freight_tracking_app.clients
      ORDER BY id DESC
    `;

    const [rows] = await db.query(query);

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get Clients Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clients",
      error: error.message,
    });
  }
};

// Get Client By ID
exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT *
      FROM freight_tracking_app.clients
      WHERE id = ?
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get Client Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch client",
      error: error.message,
    });
  }
};

// Update Client
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      address,
      contact_no,
      contact_person,
      status,
      type,
      updated_by,
    } = req.body;

    const query = `
      UPDATE freight_tracking_app.clients
      SET
        name = ?,
        address = ?,
        contact_no = ?,
        contact_person = ?,
        status = ?,
        type = ?,
        updated_by = ?,
        updated_on = NOW()
      WHERE id = ?
    `;

    const [result] = await db.query(query, [
      name,
      address,
      contact_no,
      contact_person,
      status,
      type,
      updated_by,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Client updated successfully",
    });
  } catch (error) {
    console.error("Update Client Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update client",
      error: error.message,
    });
  }
};

// Delete Client
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      DELETE FROM freight_tracking_app.clients
      WHERE id = ?
    `;

    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Client deleted successfully",
    });
  } catch (error) {
    console.error("Delete Client Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete client",
      error: error.message,
    });
  }
};