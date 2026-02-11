const mysql2 = require("mysql2")
require("dotenv").config();

const db = mysql2.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "xm_bakery",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})

// Test connection on startup
db.getConnection((err, conn) => {
    if (err) {
        console.error('\n❌ Database connection failed:', err.code);
        console.error('   Error:', err.message);
        console.error('\nSteps to fix:');
        console.error('   1. Start MySQL service: "net start MySQL80" or check Services app');
        console.error('   2. Create the database: mysql -u root -p < schema.sql');
        console.error('   3. Update .env with correct DB_HOST, DB_USER, DB_PASS, DB_NAME\n');
        // Don't exit - allow app to start without DB for now
    } else {
        console.log('✓ Database connected successfully\n');
        conn.release();
    }
});

module.exports = db;
