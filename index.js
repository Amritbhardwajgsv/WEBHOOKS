require('dotenv').config();
console.log('REDIS_URL loaded:', !!process.env.REDIS_URL);

const app = require('./app');
const { connect } = require('./db');
require('./services/workerService');

const port = process.env.PORT || process.env.port || 3000;

async function start() {
    await connect();
    app.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
}

start().catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
});
