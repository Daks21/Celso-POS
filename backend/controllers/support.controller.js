// backend/controllers/support.controller.js — Phase 6.7
//
// Owner/cashier side of the one-way support inbox. A logged-in user submits a
// free-text issue from Account Settings; it is AUTO-TAGGED with their user_id +
// store_id taken from the session (never the request body), so the operator always
// knows who reported it. The super-admin reads/closes tickets in admin.html.

const ticketModel = require('../models/ticket.model');

const ALLOWED_CATEGORIES = ['bug', 'question', 'billing', 'other'];
const MAX_MESSAGE_LEN     = 2000;
const MAX_OPEN_PER_STORE  = 5;           // don't let one store pile up open tickets
const MAX_PER_DAY         = 10;          // total/store/day — bounds close→reopen churn
const DUP_WINDOW_MS       = 2 * 60 * 1000; // identical text within 2 min = a duplicate

// POST /api/support/tickets   { category?, message }
const submit = async (req, res, next) => {
  try {
    const message  = String((req.body && req.body.message) || '').trim();
    const category = ALLOWED_CATEGORIES.includes(req.body && req.body.category)
      ? req.body.category : 'other';

    if (!message) {
      return res.status(400).json({ success: false, message: 'Please describe the issue.' });
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LEN} characters).` });
    }

    const open = await ticketModel.countOpenByStore(req.user.storeId);
    if (open >= MAX_OPEN_PER_STORE) {
      return res.status(429).json({
        success: false,
        message: "You have several open tickets already — we'll get back to you soon.",
      });
    }

    // Per-store/day total cap — the open cap bounds the standing queue, this bounds
    // churn from repeatedly closing and re-opening to flood the operator.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (await ticketModel.countByStoreSince(req.user.storeId, since24h) >= MAX_PER_DAY) {
      return res.status(429).json({
        success: false,
        message: "You've reached today's limit for messages — we'll get back to you soon.",
      });
    }

    // Duplicate suppression: identical text from this store within a short window
    // (accidental double-tap / rapid spam) is dropped without creating a new ticket.
    const dupSince = new Date(Date.now() - DUP_WINDOW_MS);
    if (await ticketModel.existsRecentDuplicate(req.user.storeId, message, dupSince)) {
      return res.status(429).json({
        success: false,
        message: 'You just sent this — please give us a moment to read it.',
      });
    }

    await ticketModel.create({
      store_id: req.user.storeId,
      user_id:  req.user.id,
      category,
      message,
    });

    res.status(201).json({ success: true, message: 'Thanks — your message was sent.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { submit };
