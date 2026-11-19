const express = require('express');
const controller = require('./fraudDetectorController');

const router = express.Router();

router.post('/check', controller);

module.exports = router;