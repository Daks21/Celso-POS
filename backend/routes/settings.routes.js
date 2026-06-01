const express = require('express');
const router  = express.Router();
const { getSettings, updateTimezone, updateStoreInfo } = require('../controllers/settings.controller');
const { authMiddleware: auth, adminMiddleware: admin } = require('../middleware/auth.middleware');
const { loadStore } = require('../middleware/tenant.middleware');

// Store-wide settings: auth + loadStore (req.store available to the controller).
// Timezone change stays admin-only. (The app_settings->stores timezone switch
// lands with the Step 4 tz threading.)
router.use(auth, loadStore);

router.get('/',           getSettings);
router.put('/timezone',   admin, updateTimezone);
router.put('/store-info', admin, updateStoreInfo);

module.exports = router;
