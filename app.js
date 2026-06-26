const express = require('express');
const notifyRoutes = require('./routes/notify');
const extractionsRoutes = require('./routes/extractions');
const s3Routes = require('./routes/s3');

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Hello World!'));
app.use('/notify', notifyRoutes);
app.use('/extractions', extractionsRoutes);
app.use('/s3', s3Routes);


app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal server error' });
});

module.exports = app;
