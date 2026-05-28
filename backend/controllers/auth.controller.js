const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { findByEmail, createUser, getPreferences, savePreferences } = require('../models/user.model');
const settings = require('../models/settings.model');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const register = async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    if (await findByEmail(email)) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser({ fullName, email, password: hashedPassword });

    return res.status(201).json({ success: true, message: 'Account created successfully' });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = await findByEmail(email);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      // Short-lived by default: store devices are shared, so a long-lived token
      // left signed in is a risk. Tunable per-deployment via JWT_EXPIRES_IN.
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, createdAt: user.createdAt },
      timezone: settings.getTimezone()
    });
  } catch (err) {
    next(err);
  }
};

const getPreferencesHandler = async (req, res, next) => {
  try {
    const prefs = await getPreferences(req.user.id);
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
};

const savePreferencesHandler = async (req, res, next) => {
  try {
    await savePreferences(req.user.id, req.body);
    res.json({ success: true, data: req.body });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getPreferencesHandler, savePreferencesHandler };
