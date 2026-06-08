const express = require("express");
const router = express.Router();

const packingListController = require("../../controllers/packing-list/packing-list-controller");

router.post("/", packingListController.createPackingList)
    .get("/", packingListController.getAllPackingLists)
    .get("/:id", packingListController.getPackingListById)
    .put("/:id", packingListController.updatePackingList);

module.exports = router;