const express = require("express");
const router = express.Router();

const blController = require("../../controllers/bill-of-lading/bl-controller");

router
  .post("/", blController.createHBL)
  .put("/:id", blController.updateHBL)
  .get("/", blController.getAllHBL)
  .get("/:id", blController.getHBLById)
  .get("/hbl/po", blController.getHBL_withPO)
  .patch("/hbl/po/totals/:id", blController.updateHBLTotals)
  .post("/hbl/split_cargo", blController.createAirSplitCargo)
  .put("/hbl/split_cargo/:id", blController.updateAirSplitCargo);

module.exports = router;
