const mysql = require('mysql2');

const pool = mysql.createPool({
  host:               process.env.DB_HOST      || 'localhost',
  port:               process.env.DB_PORT      || 3306,
  user:               process.env.DB_USER      || 'root',
  password:           process.env.DB_PASS      || '',
  database:           process.env.DB_NAME      || 'celsopos_db',
  connectionLimit:    process.env.DB_POOL_SIZE || 5,
  waitForConnections: true,
  queueLimit:         0,
  timezone:           '+08:00',   // Driver-side: interpret DATETIME values as Manila when (de)serializing to JS Date
});

// Server-side: mysql2's `timezone` option above does NOT set @@session.time_zone —
// it only affects JS<->DATETIME conversion. SQL functions (CURDATE, NOW, DATE,
// DAYOFWEEK) use the server's session timezone, which defaults to SYSTEM (host
// clock). Without this, deploying to a UTC host would shift "today" by 8 hours.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+08:00'");
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
