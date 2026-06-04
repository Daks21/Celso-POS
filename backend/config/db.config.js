const mysql = require('mysql2');

const pool = mysql.createPool({
  host:               process.env.DB_HOST                 || 'localhost',
  port:               parseInt(process.env.DB_PORT, 10)      || 3306,
  user:               process.env.DB_USER                 || 'root',
  password:           process.env.DB_PASS                 || '',
  database:           process.env.DB_NAME                 || 'celsopos_db',
  connectionLimit:    parseInt(process.env.DB_POOL_SIZE, 10) || 5,
  waitForConnections: true,
  queueLimit:         0,
  timezone:           'Z',        // mysql2 parses/serialises DATETIMEs as UTC
  // Opt-in TLS for a managed MySQL reached over a PUBLIC network (e.g. testing
  // from a laptop against a provider's public host). Inside the same private
  // network as the DB (e.g. Railway's internal host) leave DB_SSL unset/false —
  // the traffic never leaves the private network. When enabled we don't pin a CA
  // (rejectUnauthorized:false): the public proxies present certs outside the
  // default trust store, and this connection is for that test path, not prod.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Pin every pooled connection's SESSION time zone to real UTC so NOW() /
// CURRENT_TIMESTAMP are UTC — matching the `timezone:'Z'` parsing above. Without
// this, a MySQL server running in a non-UTC system zone (e.g. a dev box set to
// Asia/Manila) stores local wall-clock time in DEFAULT CURRENT_TIMESTAMP columns,
// which mysql2 then misreads as UTC — an offset-sized skew that corrupts
// day-bucketing. This is the SET that actually makes "session pinned to UTC" true.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('[DB] Connection failed:', err.message);
    return;
  }
  console.log('[DB] Connected to celsopos_db');
  connection.release();
});

module.exports = pool.promise();
