const express = require('express');
const { getFile } = require('../controllers/s3Controller');

const router = express.Router();

router.get('/get', getFile);

module.exports = router;
