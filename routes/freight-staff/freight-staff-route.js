const express = require("express");
const router = express.Router();

const freightStaffController = require("../../controllers/freight-staff/freight-staff-controller");

router.post("/", freightStaffController.createFreightStaff)
    .get("/", freightStaffController.getAllFreightStaff)
    .get("/:id", freightStaffController.getFreightStaffById)
    .put("/:id", freightStaffController.updateFreightStaff);

module.exports = router;