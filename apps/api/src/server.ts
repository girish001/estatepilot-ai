import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000"
});

app.get("/health", async () => ({
  status: "ok",
  service: "estatepilot-api",
  timestamp: new Date().toISOString()
}));

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
