const express = require("express");
const router = express.Router();

const grnController = require("../../controllers/goods-receive-notes/grn-controller");

router.post("/", grnController.createGoodsReceiveNote)
    .put("/:id", grnController.updateGoodsReceiveNote)
    .get("/", grnController.getAllGoodsReceiveNotes)
    .get("/:id", grnController.getGoodsReceiveNoteById);

module.exports = router;