const express = require('express');
const router = express.Router();
const shipmentController = require('../../controllers/shipment/shipment-controller');

// Create Shipment
router.post('/', shipmentController.createShipment)
    .put('/:id', shipmentController.updateShipment)
    .get('/:id', shipmentController.getShipmentById)
    .get('/', shipmentController.getAllShipments);

module.exports = router;