const settings = require('../models/settings.model');
const { isValidTz } = require('../utils/tz');

// GET /api/settings — current store-wide settings.
const getSettings = async (req, res, next) => {
  try {
    res.json({ success: true, data: { timezone: settings.getTimezone() } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings/timezone — change the store timezone (admin only).
// Past records are NOT rewritten: timestamps are absolute UTC moments. Only
// how days are bucketed and displayed changes from here forward.
const updateTimezone = async (req, res, next) => {
  try {
    const { timezone } = req.body;
    if (!isValidTz(timezone)) {
      return res.status(400).json({
        success: false,
        message: 'timezone must be a valid IANA timezone (e.g. Asia/Manila)',
      });
    }
    await settings.setTimezone(timezone);
    res.json({ success: true, data: { timezone: settings.getTimezone() } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSettings, updateTimezone };
