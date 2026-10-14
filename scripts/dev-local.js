/**
 * Arranque local sin MongoDB instalado:
 * levanta MongoDB en memoria y luego inicia el servidor.
 */
const { MongoMemoryServer } = require("mongodb-memory-server");

async function start() {
  console.log("Iniciando MongoDB en memoria (primera vez puede tardar)...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri("lottify");

  process.env.MONGO_URI = uri;
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || "lottify-dev-secret-local";
  process.env.PORT = process.env.PORT || "5000";
  process.env.BASE_URL = process.env.BASE_URL || "http://localhost:5000";
  process.env.NODE_ENV = process.env.NODE_ENV || "development";

  console.log("MongoDB listo:", uri);

  require("../index.js");

  const shutdown = async () => {
    console.log("\nCerrando MongoDB en memoria...");
    await mongod.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("No se pudo iniciar el entorno local:", err);
  process.exit(1);
});
