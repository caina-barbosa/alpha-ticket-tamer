// db.js
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  connectionLimit: 10,
  host: 'prod.survey.mysql.aureacentral.com', 
  user: 'prod_cssurvey', 
  password: process.env.DB_PASSWORD,
  database: 'prod_cssurvey'
});

// No need to manually connect
console.log("Database pool created. Connections will be managed automatically.");

module.exports = pool;
