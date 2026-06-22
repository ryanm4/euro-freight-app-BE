const express = require("express");
const router = express.Router();
const poController = require("../../controllers/purchase-orders/po-controller");

router.post("/", poController.createPurchaseOrder)
    .get("/:id", poController.getPurchaseOrderById)
    .get("/", poController.getAllPurchaseOrders)
    .put("/:id", poController.updatePurchaseOrder)
    .patch("/:id", poController.updateStatus)

module.exports = router;