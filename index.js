const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connection = require('./sql-connection');


const clientRoutes = require('./routes/clients/client-route');
const poRoutes = require('./routes/purchase-order/po-route');

dotenv.config({ path: './config.env' });
const port = process.env.PORT || 8000;
const app = express();

app.use(cors());
app.use(express.json());

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
