const express = require("express");
const multer = require("multer");
const router = express.Router();
const poController = require("../../controllers/purchase-orders/po-controller");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router
  .post("/", poController.createPurchaseOrder)
  .get("/:id", poController.getPurchaseOrderById)
  .get("/", poController.getAllPurchaseOrders)
  .put("/:id", poController.updatePurchaseOrder)
//   .patch("/:id", poController.updateStatus)
  .post(
    "/upload",
    upload.single("purchase_order"),
    poController.uploadPurchaseOrderFile,
  );

module.exports = router;
