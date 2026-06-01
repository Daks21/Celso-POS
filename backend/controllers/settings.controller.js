const storeModel = require('../models/store.model');
const { isValidTz } = require('../utils/tz');

// Server caps for store identity. Kept generous but bounded by the stores
// column width (VARCHAR(120)); the Account UI hints at 21/80 for receipt
// layout, but the server only guards against runaway/overflowing input.
const MAX_STORE_NAME = 60;
const MAX_STORE_ADDR  = 120;

// GET /api/settings — current store settings. Timezone, name, and address are
// per-store (on the stores row), surfaced via loadStore as req.store — shared by
// every user of the store (owner + cashiers) so receipts render consistently.
const getSettings = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        timezone: req.store.timezone,
        storeName: req.store.name || '',
        storeAddress: req.store.address || '',
      },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings/store-info — set THIS store's name + address (admin only).
// These print on receipts and drive the sidebar brand. Stored on the stores row
// (not per-user preferences) so a cashier's receipts carry the same identity as
// the owner's. Both fields are optional; an empty string clears one.
const updateStoreInfo = async (req, res, next) => {
  try {
    let { storeName, storeAddress } = req.body;
    storeName    = (storeName == null ? '' : String(storeName)).trim();
    storeAddress = (storeAddress == null ? '' : String(storeAddress)).trim();

    if (storeName.length > MAX_STORE_NAME) {
      return res.status(400).json({ success: false, message: `Store name must be ${MAX_STORE_NAME} characters or fewer` });
    }
    if (storeAddress.length > MAX_STORE_ADDR) {
      return res.status(400).json({ success: false, message: `Store address must be ${MAX_STORE_ADDR} characters or fewer` });
    }

    const store = await storeModel.updateInfo(req.user.storeId, { name: storeName, address: storeAddress });
    res.json({ success: true, data: { storeName: store.name || '', storeAddress: store.address || '' } });
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

module.exports = { getSettings, updateTimezone, updateStoreInfo };
