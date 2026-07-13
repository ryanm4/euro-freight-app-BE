const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connection = require('./sql-connection');


const clientRoutes = require('./routes/clients/client-route');
const poRoutes = require('./routes/purchase-order/po-route');
const packingListRoutes = require('./routes/packing-list/packing-list-route');
const gdnRoutes = require('./routes/goods-dispatch-notes/gdn-routes');
const grnRoutes = require('./routes/goods-receive-notes/grn-routes');
const blRoutes = require('./routes/bill-of-lading/bl-route');
const shipmentRoutes = require('./routes/shipment/shipment-routes');
const authRoutes = require('./routes/auth/auth-route');

dotenv.config({ path: './config.env' });
const port = process.env.PORT || 8000;
const app = express();

app.use(cors());
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

connection.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    } else {
        console.log('Connected to the database');
        connection.release();
    }
});


app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/purchase_orders', poRoutes);
app.use('/api/v1/packing_lists', packingListRoutes);
app.use('/api/v1/goods_dispatch_notes', gdnRoutes);
app.use('/api/v1/goods_receive_notes', grnRoutes);
app.use('/api/v1/bill_of_lading', blRoutes);
app.use('/api/v1/shipments', shipmentRoutes);
app.use('/api/v1/auth', authRoutes);