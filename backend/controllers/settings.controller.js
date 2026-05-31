const storeModel = require('../models/store.model');
const { isValidTz } = require('../utils/tz');

// GET /api/settings — current store settings. Timezone is now per-store
// (stores.timezone), surfaced via loadStore as req.store.
const getSettings = async (req, res, next) => {
  try {
    res.json({ success: true, data: { timezone: req.store.timezone } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings/timezone — change THIS store's timezone (admin only).
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
    const store = await storeModel.updateTimezone(req.user.storeId, timezone);
    res.json({ success: true, data: { timezone: store.timezone } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSettings, updateTimezone };
