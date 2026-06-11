const loadEnv = require("./load-env");

loadEnv();

function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

function getDatabaseName() {
  if (process.env.DB_NAME) {
    return process.env.DB_NAME;
  }

  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return "asalsi_webgis";
  }

  const parsedUrl = new URL(databaseUrl);
  return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, "")) || "asalsi_webgis";
}

function getDatabaseConfig() {
  const databaseUrl = getDatabaseUrl();

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: getDatabaseName(),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  };
}

function getAdminDatabaseConfig() {
  const databaseUrl = getDatabaseUrl();
  const adminDatabase = process.env.PG_ADMIN_DB || "postgres";

  if (databaseUrl) {
    const parsedUrl = new URL(databaseUrl);
    parsedUrl.pathname = `/${adminDatabase}`;

    return {
      connectionString: parsedUrl.toString(),
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: adminDatabase,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  };
}

module.exports = {
  getAdminDatabaseConfig,
  getDatabaseConfig,
  getDatabaseName,
};
