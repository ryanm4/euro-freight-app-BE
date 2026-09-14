const express = require("express");
const router = express.Router();
const userController = require("../../controllers/users-management/user-management-controller");
const roleController = require("../../controllers/users-management/role-management-controller");
const userRoleController = require("../../controllers/users-management/user-role-controller");
const groupController = require("../../controllers/users-management/group-management-controller");
const userGroupController = require("../../controllers/users-management/user-group-controller");
const groupRoleController = require("../../controllers/users-management/group-roles-controller");

//User Management Routes
router
  .post("/register/user", userController.createUser)
  .get("/users", userController.getAllUsers)
  .put("/users/:id", userController.updateUser)
  .get("/users/:id", userController.getUserById)
  .post("/login", userController.loginUser);

// Role Management Routes
router
  .post("/register/roles", roleController.createRole)
  .get("/roles", roleController.getAllRoles)
  .put("/roles/:id", roleController.updateRole)
  .get("/roles/:id", roleController.getRoleById);

// User Role & Group Management Routes
router
  .post("/register/user-role", userRoleController.createUserRole)
  .post("/register/user-group", userGroupController.createUserGroup)
  .post("/register/group-role", groupRoleController.createGroupRole);

// Group Management Routes
router
  .post("/register/group", groupController.createGroup)
  .get("/groups", groupController.getAllGroups)
  .put("/groups/:id", groupController.updateGroup)
  .get("/groups/:id", groupController.getGroupById);

module.exports = router;
