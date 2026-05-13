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
