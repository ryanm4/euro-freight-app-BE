const express = require("express");
const router = express.Router();
const multer = require("multer");

const packingListController = require("../../controllers/packing-list/packing-list-controller");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router
  .post("/", packingListController.createPackingList)
  .get("/", packingListController.getAllPackingLists)
  .get("/:id", packingListController.getPackingListById)
  .put("/:id", packingListController.updatePackingList)
  .post(
    "/upload",
    upload.single("packing_list"),
    packingListController.uploadPackingListFile,
  )
  .patch("/:id/:status", packingListController.updatePackingListStatus);

module.exports = router;
