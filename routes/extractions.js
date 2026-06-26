const express = require('express');
const { list, byEntity, byObjectKey } = require('../controllers/extractionsController');

const router = express.Router();

router.get('/', list);
router.get('/by-entity', byEntity);
router.get('/by-object-key', byObjectKey);

module.exports = router;
