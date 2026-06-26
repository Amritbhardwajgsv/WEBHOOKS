const express = require('express');
const { notify } = require('../controllers/notifyController');

const router = express.Router();

router.post('/', notify);

module.exports = router;
