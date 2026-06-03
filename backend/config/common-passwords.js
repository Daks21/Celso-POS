// backend/config/common-passwords.js — a curated blocklist of the most common /
// breached passwords and predictable bases. Used by utils/passwordPolicy.js to
// reject guessable passwords regardless of length (NIST 800-63B: screen against
// known-weak lists instead of mandating symbol composition).
//
// Entries are LOWERCASE bases. The validator also strips a trailing run of
// digits/symbols before matching, so listing "password" here also blocks
// "password1", "Password123!", "p4ssword2024", etc. — the predictable variants
// composition rules let through. Keep this list focused, not exhaustive; it is a
// cheap offline screen, not a replacement for length.

const COMMON_PASSWORDS = [
  // classic top-of-every-breach-list
  'password', 'passwords', 'passw0rd', 'p@ssword', 'p@ssw0rd', 'pass', 'passpass',
  'qwerty', 'qwertyuiop', 'qwertyui', 'qwerty123', 'qweasd', 'qweasdzxc', 'qazwsx',
  'asdf', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'zaq12wsx', '1qaz2wsx',
  '1q2w3e4r', '1q2w3e4r5t', '123qwe', 'qwe123',
  // numeric / sequences
  '123456', '1234567', '12345678', '123456789', '1234567890', '123456789012',
  '12345', '11111', '111111', '1111111', '11111111', '000000', '00000000',
  '121212', '123123', '112233', '654321', '987654321', 'abc123', 'abcd1234', 'abcdefg',
  // affection / names / words
  'iloveyou', 'iloveu', 'loveyou', 'iloveyou1', 'letmein', 'welcome', 'welkom',
  'hello', 'helloworld', 'whatever', 'trustno1', 'sunshine', 'princess', 'flower',
  'monkey', 'dragon', 'master', 'shadow', 'ninja', 'mustang', 'superman', 'batman',
  'starwars', 'pokemon', 'naruto', 'charlie', 'michael', 'jordan', 'hunter', 'ranger',
  'cookie', 'chocolate', 'football', 'baseball', 'basketball', 'soccer', 'harley',
  'freedom', 'forever', 'secret', 'money', 'access', 'killer', 'jennifer', 'thomas',
  // tech / accounts / defaults
  'admin', 'administrator', 'adminadmin', 'root', 'toor', 'guest', 'login', 'user',
  'changeme', 'change', 'default', 'test', 'testing', 'demo', 'sample', 'computer',
  'internet', 'samsung', 'google', 'facebook', 'youtube', 'tiktok', 'gmail', 'yahoo',
  'server', 'database', 'oracle', 'mysql', 'system',
  // PH / local context (target market)
  'pilipinas', 'philippines', 'mahalkita', 'mahalko', 'tagalog', 'jollibee',
  'tindahan', 'salamat', 'kalbo', 'pinoy', 'maganda', 'pogi', 'manila', 'cebu',
  // football clubs / pop culture commonly used
  'liverpool', 'barcelona', 'realmadrid', 'chelsea', 'arsenal', 'manutd',
  'manchester', 'celtic',
];

module.exports = new Set(COMMON_PASSWORDS);
