const express = require("express");
const router = express.Router();

const blController = require("../../controllers/bill-of-lading/bl-controller");

router.post("/", blController.createHBL)
    .put("/:id", blController.updateHBL)
    .get("/", blController.getAllHBL)
    .get("/:id", blController.getHBLById);

module.exports = router;