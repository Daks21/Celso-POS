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
  timezone:           'Z',        // Store/read all timestamps in UTC; day-bucketing & display happen in the store timezone (app_settings.timezone)
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
