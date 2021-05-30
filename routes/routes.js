const express = require('express');
const router = module.exports = express.Router();

router.use('/', require('../auth/auth'));
router.use('/users', require('../auth/users'));
router.use('/boats', require('../Boats/boats'));