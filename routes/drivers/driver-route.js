const express = require("express");
const router = express.Router();

const {
  createDriver,
  updateDriver,
  getAllDrivers,
  getDriverById,
} = require("../../controllers/drivers/driver-controller");

router.post("/", createDriver);

router.put("/:id", updateDriver);

router.get("/", getAllDrivers);

router.get("/:id", getDriverById);

module.exports = router;
