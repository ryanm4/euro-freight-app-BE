const db = require("../../sql-connection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, full_name, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required"
      });
    }

    const [existingUser] = await db.query(
      `SELECT id FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists"
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [username, email, password_hash, full_name || null, phone || null]
    );

    const token = jwt.sign(
      {
        id: result.insertId,
        username,
        email
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      token
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error.message
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const [users] = await db.query(
      `SELECT * FROM users WHERE email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message
    });
  }
};