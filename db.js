const mysql2 = require("mysql2")

const db = mysql2.createPool({
    host:"localhost",
    user:"root",
    password:"",
    database:"xm_bakery"
})
module.exports = db;
