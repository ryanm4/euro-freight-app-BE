const express = require("express");
const router = express.Router();
const userController = require("../../controllers/users-management/user-management-controller");
const roleController = require("../../controllers/users-management/role-management-controller");

router.post("/register/user", userController.createUser)
    .post("/login", userController.loginUser)
    .post("/register/roles", roleController.createRole);

module.exports = router;