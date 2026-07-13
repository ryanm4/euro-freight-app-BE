const express = require("express");
const router = express.Router();
const multer = require("multer");

const packingListController = require("../../controllers/packing-list/packing-list-controller");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

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
  );

module.exports = router;
