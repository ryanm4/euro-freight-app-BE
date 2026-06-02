const express = require('express');
const clientController = require('../../controllers/client/client-controller');
const clientRouter = express.Router();


clientRouter.post('/', clientController.createClient)
    .get('/', clientController.getClients)
    .put('/:id', clientController.updateClient)
    .delete('/:id', clientController.deleteClient);

module.exports = clientRouter;