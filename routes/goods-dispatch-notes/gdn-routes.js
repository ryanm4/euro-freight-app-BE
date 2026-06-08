const express = require("express");
const router = express.Router();

const grnController = require("../../controllers/goods_dispatch_notes/gdn-controller");

router.post("/", grnController.createGDN)
    .put("/:id", grnController.updateGDN)
    .get("/", grnController.getAllGDN)
    .get("/:id", grnController.getGDNById);

module.exports = router;