const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { success } = require('../utils/response');

const login = asyncHandler(async (req, res) => success(res, await authService.login(req.body)));

module.exports = { login };
