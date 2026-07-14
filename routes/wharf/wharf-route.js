const express = require("express");
const router = express.Router();

const {
  createWharfStaff,
  updateWharfStaff,
  getAllWharfStaff,
  getWharfStaffById,
} = require("../../controllers/wharf/wharf-controller");

router.post("/", createWharfStaff);
router.put("/:id", updateWharfStaff);
router.get("/", getAllWharfStaff);
router.get("/:id", getWharfStaffById);

module.exports = router;
