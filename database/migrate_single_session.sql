-- Migration: single active session per account (Phase 6.5 hardening)
-- Run ONCE against celsopos_db as a privileged user, BEFORE deploying the
-- matching backend (the new auth middleware reads users.session_id on every
-- authenticated request — without this column it would error).
--
-- Each login stores a fresh random session_id on the user and signs it into the
-- JWT. A request is only accepted when the token's session id matches the stored
-- one, so logging in on another device (last-login-wins) invalidates the prior
-- device's token. Existing sessions are invalidated by this change and must
-- re-login (their tokens carry no/!= session id).
--
-- Note: MySQL 8 has no ADD COLUMN IF NOT EXISTS — run once. If it already exists,
-- this errors harmlessly (drop the statement).

USE celsopos_db;

ALTER TABLE users
  ADD COLUMN session_id VARCHAR(64) DEFAULT NULL AFTER must_change_password;
