const { Pool } = require("pg");
const { getDatabaseConfig } = require("./db-config");

const pool = new Pool({
  ...getDatabaseConfig(),
  max: 10,
});

module.exports = pool;
