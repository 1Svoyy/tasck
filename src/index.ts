import { run } from "@grammyjs/runner";
import { createBot } from "./bot/index.js";
import prisma from "./db/client.js";
import { config } from "./config.js";
import { DeadlineService } from "./services/DeadlineService.js";

async function main() {
  console.log("🚀 Starting Task Manager Bot...");
  console.log(`📦 Environment: ${config.nodeEnv}`);

  // Test DB connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  // Create bot
  const bot = createBot();

  // Register commands in BotFather menu
  await bot.api.setMyCommands([
    { command: "start", description: "Начать / регистрация" },
    { command: "menu", description: "Главное меню" },
    { command: "help", description: "Справка" },
    { command: "cancel", description: "Отменить текущее действие" },
  ]);

  const me = await bot.api.getMe();
  console.log(`✅ Bot started: @${me.username}`);

  // Deadline cron
  const deadlineService = new DeadlineService(bot);
  deadlineService.start();

  // Run bot with concurrent updates
  const runner = run(bot);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    if (runner.isRunning()) await runner.stop();
    await prisma.$disconnect();
    console.log("👋 Bye!");
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
