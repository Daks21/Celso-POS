// backend/controllers/support.controller.js — Phase 6.7
//
// Owner/cashier side of the one-way support inbox. A logged-in user submits a
// free-text issue from Account Settings; it is AUTO-TAGGED with their user_id +
// store_id taken from the session (never the request body), so the operator always
// knows who reported it. The super-admin reads/closes tickets in admin.html.

const ticketModel = require('../models/ticket.model');

const ALLOWED_CATEGORIES = ['bug', 'question', 'billing', 'other'];
const MAX_MESSAGE_LEN     = 2000;
const MAX_OPEN_PER_STORE  = 5;   // anti-spam: don't let one store pile up open tickets

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
