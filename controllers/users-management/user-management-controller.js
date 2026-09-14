const db = require("../../sql-connection");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.createUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      username,
      email,
      password,
      full_name,
      phone,
      group_ids = [],
      role_ids = [],
    } = req.body;

    // -----------------------------------
    // Validate required fields
    // -----------------------------------
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    // Make sure group_ids and role_ids are arrays
    if (!Array.isArray(group_ids)) {
      return res.status(400).json({
        success: false,
        message: "group_ids must be an array",
      });
    }

    if (!Array.isArray(role_ids)) {
      return res.status(400).json({
        success: false,
        message: "role_ids must be an array",
      });
    }

    // Remove duplicate IDs
    const uniqueGroupIds = [...new Set(group_ids.map(Number))];
    const uniqueRoleIds = [...new Set(role_ids.map(Number))];

    // -----------------------------------
    // Start transaction
    // -----------------------------------
    await connection.beginTransaction();

    // -----------------------------------
    // Check existing username/email
    // -----------------------------------
    const [existingUser] = await connection.query(
      `SELECT id, username, email
       FROM users
       WHERE username = ? OR email = ?`,
      [username.trim(), email.trim()],
    );

    if (existingUser.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // -----------------------------------
    // Validate groups
    // -----------------------------------
    if (uniqueGroupIds.length > 0) {
      const placeholders = uniqueGroupIds.map(() => "?").join(",");

      const [groups] = await connection.query(
        `SELECT id, group_name
         FROM \`groups\`
         WHERE id IN (${placeholders})`,
        uniqueGroupIds,
      );

      const foundGroupIds = groups.map((group) => group.id);

      const invalidGroupIds = uniqueGroupIds.filter(
        (id) => !foundGroupIds.includes(id),
      );

      if (invalidGroupIds.length > 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "One or more groups were not found",
          invalid_group_ids: invalidGroupIds,
        });
      }
    }

    // -----------------------------------
    // Validate roles
    // -----------------------------------
    if (uniqueRoleIds.length > 0) {
      const placeholders = uniqueRoleIds.map(() => "?").join(",");

      const [roles] = await connection.query(
        `SELECT id, role_name
         FROM roles
         WHERE id IN (${placeholders})`,
        uniqueRoleIds,
      );

      const foundRoleIds = roles.map((role) => role.id);

      const invalidRoleIds = uniqueRoleIds.filter(
        (id) => !foundRoleIds.includes(id),
      );

      if (invalidRoleIds.length > 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "One or more roles were not found",
          invalid_role_ids: invalidRoleIds,
        });
      }
    }

    // -----------------------------------
    // Hash password
    // -----------------------------------
    const password_hash = await bcrypt.hash(password, 10);

    // -----------------------------------
    // Create user
    // -----------------------------------
    const [userResult] = await connection.query(
      `INSERT INTO users
        (username, email, password_hash, full_name, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [
        username.trim(),
        email.trim(),
        password_hash,
        full_name ? full_name.trim() : null,
        phone ? phone.trim() : null,
      ],
    );

    const userId = userResult.insertId;

    // -----------------------------------
    // Assign groups
    // -----------------------------------
    if (uniqueGroupIds.length > 0) {
      const groupValues = uniqueGroupIds.map((groupId) => [userId, groupId]);

      await connection.query(
        `INSERT INTO user_groups
          (user_id, group_id)
         VALUES ?`,
        [groupValues],
      );
    }

    // -----------------------------------
    // Assign direct roles
    // -----------------------------------
    if (uniqueRoleIds.length > 0) {
      const roleValues = uniqueRoleIds.map((roleId) => [userId, roleId]);

      await connection.query(
        `INSERT INTO user_roles
          (user_id, role_id)
         VALUES ?`,
        [roleValues],
      );
    }

    // -----------------------------------
    // Commit transaction
    // -----------------------------------
    await connection.commit();

    // -----------------------------------
    // Generate JWT
    // -----------------------------------
    const token = jwt.sign(
      {
        id: userId,
        username: username.trim(),
        email: email.trim(),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    // -----------------------------------
    // Get created groups
    // -----------------------------------
    let createdGroups = [];

    if (uniqueGroupIds.length > 0) {
      const placeholders = uniqueGroupIds.map(() => "?").join(",");

      const [groups] = await db.query(
        `SELECT
          g.id,
          g.group_name,
          g.description
         FROM user_groups ug
         INNER JOIN \`groups\` g
           ON g.id = ug.group_id
         WHERE ug.user_id = ?
         AND g.id IN (${placeholders})
         ORDER BY g.group_name`,
        [userId, ...uniqueGroupIds],
      );

      createdGroups = groups;
    }

    // -----------------------------------
    // Get created direct roles
    // -----------------------------------
    let createdRoles = [];

    if (uniqueRoleIds.length > 0) {
      const placeholders = uniqueRoleIds.map(() => "?").join(",");

      const [roles] = await db.query(
        `SELECT
          r.id,
          r.role_name,
          r.description
         FROM user_roles ur
         INNER JOIN roles r
           ON r.id = ur.role_id
         WHERE ur.user_id = ?
         AND r.id IN (${placeholders})
         ORDER BY r.role_name`,
        [userId, ...uniqueRoleIds],
      );

      createdRoles = roles;
    }

    // -----------------------------------
    // Response
    // -----------------------------------
    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        id: userId,
        username: username.trim(),
        email: email.trim(),
        full_name: full_name ? full_name.trim() : null,
        phone: phone ? phone.trim() : null,
        groups: createdGroups,
        direct_roles: createdRoles,
      },
      token,
    });
  } catch (error) {
    // Rollback if anything fails
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError);
    }

    console.error("Error creating user:", error);

    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: error.message,
    });
  } finally {
    // Always release connection
    connection.release();
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Get user
    const [users] = await db.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.full_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE u.email = ?
      `,
      [email.trim()],
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact the administrator.",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // --------------------------------------------------
    // Get user's groups
    // --------------------------------------------------
    const [groups] = await db.query(
      `
      SELECT
        g.id,
        g.group_name,
        g.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      WHERE ug.user_id = ?
      ORDER BY g.group_name
      `,
      [user.id],
    );

    // --------------------------------------------------
    // Get roles directly assigned to user
    // --------------------------------------------------
    const [directRoles] = await db.query(
      `
      SELECT
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_roles ur
      INNER JOIN roles r
        ON r.id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [user.id],
    );

    // --------------------------------------------------
    // Get roles inherited through groups
    // --------------------------------------------------
    const [groupRoles] = await db.query(
      `
      SELECT
        g.id AS group_id,
        g.group_name,
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      INNER JOIN group_roles gr
        ON gr.group_id = g.id
      INNER JOIN roles r
        ON r.id = gr.role_id
      WHERE ug.user_id = ?
      `,
      [user.id],
    );

    // --------------------------------------------------
    // Combine roles
    // --------------------------------------------------
    const rolesMap = new Map();

    // Direct roles
    directRoles.forEach((role) => {
      rolesMap.set(role.role_id, {
        id: role.role_id,
        role_name: role.role_name,
        description: role.description,
        access_type: "direct",
      });
    });

    // Group roles
    groupRoles.forEach((role) => {
      if (rolesMap.has(role.role_id)) {
        // Same role exists directly and through a group
        const existingRole = rolesMap.get(role.role_id);

        existingRole.access_type = "direct_and_group";
      } else {
        rolesMap.set(role.role_id, {
          id: role.role_id,
          role_name: role.role_name,
          description: role.description,
          access_type: "group",
        });
      }
    });

    // --------------------------------------------------
    // Generate JWT
    // --------------------------------------------------
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    // --------------------------------------------------
    // Full user response
    // --------------------------------------------------
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      groups,
      roles: Array.from(rolesMap.values()),
    };

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: userData,
    });
  } catch (error) {
    console.error("Error logging in:", error);

    return res.status(500).json({
      success: false,
      message: "Error logging in",
      error: error.message,
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      ORDER BY u.id DESC
    `);

    // Get all groups assigned to users
    const [userGroups] = await db.query(`
      SELECT
        ug.user_id,
        g.id AS group_id,
        g.group_name,
        g.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      ORDER BY g.group_name
    `);

    // Get roles assigned directly to users
    const [directRoles] = await db.query(`
      SELECT
        ur.user_id,
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_roles ur
      INNER JOIN roles r
        ON r.id = ur.role_id
    `);

    // Get roles inherited through groups
    const [groupRoles] = await db.query(`
      SELECT
        ug.user_id,
        g.id AS group_id,
        g.group_name,
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      INNER JOIN group_roles gr
        ON gr.group_id = g.id
      INNER JOIN roles r
        ON r.id = gr.role_id
    `);

    // Build response
    const result = users.map((user) => {
      // Groups for this user
      const groups = userGroups
        .filter((item) => item.user_id === user.id)
        .map((item) => ({
          id: item.group_id,
          group_name: item.group_name,
          description: item.description,
        }));

      // Roles
      const rolesMap = new Map();

      // Direct roles
      directRoles
        .filter((item) => item.user_id === user.id)
        .forEach((item) => {
          rolesMap.set(item.role_id, {
            id: item.role_id,
            role_name: item.role_name,
            description: item.description,
            access_type: "direct",
          });
        });

      // Group roles
      groupRoles
        .filter((item) => item.user_id === user.id)
        .forEach((item) => {
          if (rolesMap.has(item.role_id)) {
            // Role already exists as direct role.
            // Keep it as both direct + group access.
            const existingRole = rolesMap.get(item.role_id);

            existingRole.access_type = "direct_and_group";
          } else {
            rolesMap.set(item.role_id, {
              id: item.role_id,
              role_name: item.role_name,
              description: item.description,
              access_type: "group",
            });
          }
        });

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        groups,
        roles: Array.from(rolesMap.values()),
      };
    });

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching users:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    const {
      username,
      email,
      password,
      full_name,
      phone,
      is_active,
      group_ids = [],
      role_ids = [],
    } = req.body;

    // -----------------------------------
    // Validate user ID
    // -----------------------------------
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    // -----------------------------------
    // Validate required fields
    // -----------------------------------
    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: "Username and email are required",
      });
    }

    if (!Array.isArray(group_ids)) {
      return res.status(400).json({
        success: false,
        message: "group_ids must be an array",
      });
    }

    if (!Array.isArray(role_ids)) {
      return res.status(400).json({
        success: false,
        message: "role_ids must be an array",
      });
    }

    const userId = Number(id);

    // Remove duplicate IDs
    const uniqueGroupIds = [...new Set(group_ids.map(Number))];
    const uniqueRoleIds = [...new Set(role_ids.map(Number))];

    // -----------------------------------
    // Start transaction
    // -----------------------------------
    await connection.beginTransaction();

    // -----------------------------------
    // Check user exists
    // -----------------------------------
    const [existingUser] = await connection.query(
      `SELECT id
       FROM users
       WHERE id = ?`,
      [userId],
    );

    if (existingUser.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // -----------------------------------
    // Check duplicate username/email
    // -----------------------------------
    const [duplicateUser] = await connection.query(
      `SELECT id
       FROM users
       WHERE (username = ? OR email = ?)
       AND id != ?`,
      [username.trim(), email.trim(), userId],
    );

    if (duplicateUser.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    // -----------------------------------
    // Validate groups
    // -----------------------------------
    if (uniqueGroupIds.length > 0) {
      const placeholders = uniqueGroupIds.map(() => "?").join(",");

      const [groups] = await connection.query(
        `SELECT id
         FROM \`groups\`
         WHERE id IN (${placeholders})`,
        uniqueGroupIds,
      );

      const foundGroupIds = groups.map((group) => group.id);

      const invalidGroupIds = uniqueGroupIds.filter(
        (groupId) => !foundGroupIds.includes(groupId),
      );

      if (invalidGroupIds.length > 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "One or more groups were not found",
          invalid_group_ids: invalidGroupIds,
        });
      }
    }

    // -----------------------------------
    // Validate roles
    // -----------------------------------
    if (uniqueRoleIds.length > 0) {
      const placeholders = uniqueRoleIds.map(() => "?").join(",");

      const [roles] = await connection.query(
        `SELECT id
         FROM roles
         WHERE id IN (${placeholders})`,
        uniqueRoleIds,
      );

      const foundRoleIds = roles.map((role) => role.id);

      const invalidRoleIds = uniqueRoleIds.filter(
        (roleId) => !foundRoleIds.includes(roleId),
      );

      if (invalidRoleIds.length > 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "One or more roles were not found",
          invalid_role_ids: invalidRoleIds,
        });
      }
    }

    // -----------------------------------
    // Update user
    // -----------------------------------

    let updateQuery;
    let updateValues;

    if (password && password.trim()) {
      const password_hash = await bcrypt.hash(password, 10);

      updateQuery = `
        UPDATE users
        SET
          username = ?,
          email = ?,
          password_hash = ?,
          full_name = ?,
          phone = ?,
          is_active = ?
        WHERE id = ?
      `;

      updateValues = [
        username.trim(),
        email.trim(),
        password_hash,
        full_name ? full_name.trim() : null,
        phone ? phone.trim() : null,
        is_active !== undefined ? is_active : true,
        userId,
      ];
    } else {
      updateQuery = `
        UPDATE users
        SET
          username = ?,
          email = ?,
          full_name = ?,
          phone = ?,
          is_active = ?
        WHERE id = ?
      `;

      updateValues = [
        username.trim(),
        email.trim(),
        full_name ? full_name.trim() : null,
        phone ? phone.trim() : null,
        is_active !== undefined ? is_active : true,
        userId,
      ];
    }

    await connection.query(updateQuery, updateValues);

    // -----------------------------------
    // Remove existing groups
    // -----------------------------------

    await connection.query(
      `DELETE FROM user_groups
       WHERE user_id = ?`,
      [userId],
    );

    // -----------------------------------
    // Add new groups
    // -----------------------------------

    if (uniqueGroupIds.length > 0) {
      const groupValues = uniqueGroupIds.map((groupId) => [userId, groupId]);

      await connection.query(
        `INSERT INTO user_groups
         (user_id, group_id)
         VALUES ?`,
        [groupValues],
      );
    }

    // -----------------------------------
    // Remove existing direct roles
    // -----------------------------------

    await connection.query(
      `DELETE FROM user_roles
       WHERE user_id = ?`,
      [userId],
    );

    // -----------------------------------
    // Add new direct roles
    // -----------------------------------

    if (uniqueRoleIds.length > 0) {
      const roleValues = uniqueRoleIds.map((roleId) => [userId, roleId]);

      await connection.query(
        `INSERT INTO user_roles
         (user_id, role_id)
         VALUES ?`,
        [roleValues],
      );
    }

    // -----------------------------------
    // Commit transaction
    // -----------------------------------

    await connection.commit();

    // -----------------------------------
    // Generate new JWT
    // -----------------------------------

    const token = jwt.sign(
      {
        id: userId,
        username: username.trim(),
        email: email.trim(),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    // -----------------------------------
    // Get updated groups
    // -----------------------------------

    const [updatedGroups] = await db.query(
      `SELECT
        g.id,
        g.group_name,
        g.description
       FROM user_groups ug
       INNER JOIN \`groups\` g
         ON g.id = ug.group_id
       WHERE ug.user_id = ?
       ORDER BY g.group_name`,
      [userId],
    );

    // -----------------------------------
    // Get updated direct roles
    // -----------------------------------

    const [updatedRoles] = await db.query(
      `SELECT
        r.id,
        r.role_name,
        r.description
       FROM user_roles ur
       INNER JOIN roles r
         ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.role_name`,
      [userId],
    );

    // -----------------------------------
    // Response
    // -----------------------------------

    return res.status(200).json({
      success: true,
      message: "User updated successfully",

      data: {
        id: userId,
        username: username.trim(),
        email: email.trim(),
        full_name: full_name ? full_name.trim() : null,
        phone: phone ? phone.trim() : null,
        is_active: is_active !== undefined ? is_active : true,

        groups: updatedGroups,

        direct_roles: updatedRoles,
      },

      token,
    });
  } catch (error) {
    // -----------------------------------
    // Rollback
    // -----------------------------------

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError);
    }

    console.error("Error updating user:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating user",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get user
    const [users] = await db.query(
      `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE u.id = ?
      `,
      [id],
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // Get groups assigned to user
    const [groups] = await db.query(
      `
      SELECT
        g.id,
        g.group_name,
        g.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      WHERE ug.user_id = ?
      ORDER BY g.group_name
      `,
      [id],
    );

    // Get roles directly assigned to user
    const [directRoles] = await db.query(
      `
      SELECT
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_roles ur
      INNER JOIN roles r
        ON r.id = ur.role_id
      WHERE ur.user_id = ?
      `,
      [id],
    );

    // Get roles inherited through user's groups
    const [groupRoles] = await db.query(
      `
      SELECT
        g.id AS group_id,
        g.group_name,
        r.id AS role_id,
        r.role_name,
        r.description
      FROM user_groups ug
      INNER JOIN \`groups\` g
        ON g.id = ug.group_id
      INNER JOIN group_roles gr
        ON gr.group_id = g.id
      INNER JOIN roles r
        ON r.id = gr.role_id
      WHERE ug.user_id = ?
      `,
      [id],
    );

    // Build roles map to avoid duplicate roles
    const rolesMap = new Map();

    // Direct roles
    directRoles.forEach((role) => {
      rolesMap.set(role.role_id, {
        id: role.role_id,
        role_name: role.role_name,
        description: role.description,
        access_type: "direct",
      });
    });

    // Group roles
    groupRoles.forEach((role) => {
      if (rolesMap.has(role.role_id)) {
        // Role exists directly and through a group
        const existingRole = rolesMap.get(role.role_id);

        existingRole.access_type = "direct_and_group";
      } else {
        rolesMap.set(role.role_id, {
          id: role.role_id,
          role_name: role.role_name,
          description: role.description,
          access_type: "group",
        });
      }
    });

    // Final response
    const result = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      groups,
      roles: Array.from(rolesMap.values()),
    };

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching user by ID:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};
