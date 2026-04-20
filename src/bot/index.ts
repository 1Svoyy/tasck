import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { BotContext, SessionData } from "../types/index.js";
import { config } from "../config.js";

// Handlers
import { startHandler } from "./handlers/start.js";
import { taskCreateHandler, taskCreateConversation } from "./handlers/taskCreate.js";
import { taskActionsHandler } from "./handlers/taskActions.js";
import { queueHandler } from "./handlers/queue.js";
import { myTasksHandler } from "./handlers/myTasks.js";
import { ratingHandler } from "./handlers/rating.js";
import { statsHandler } from "./handlers/stats.js";
import { inviteHandler } from "./handlers/invite.js";
import { teamsHandler } from "./handlers/teams.js";
import { taskChatHandler } from "./handlers/taskChat.js";
import { taskFilesHandler } from "./handlers/taskFiles.js";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // ─── Session ─────────────────────────────────────────────────────────────────
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // ─── Conversations ───────────────────────────────────────────────────────────
  bot.use(conversations());
  bot.use(taskCreateConversation);

  // ─── Commands ────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "🤖 <b>Task Manager Bot</b>\n\n" +
        "Доступные команды:\n" +
        "/start — начать / главное меню\n" +
        "/menu — главное меню\n" +
        "/help — эта справка\n\n" +
        "Регистрация только по инвайт-ссылке.",
      { parse_mode: "HTML" }
    );
  });

  // ─── Handlers (order matters!) ───────────────────────────────────────────────
  bot.use(startHandler);
  bot.use(taskCreateHandler);
  bot.use(taskActionsHandler);
  bot.use(queueHandler);
  bot.use(myTasksHandler);
  bot.use(ratingHandler);
  bot.use(statsHandler);
  bot.use(inviteHandler);
  bot.use(teamsHandler);
  bot.use(taskChatHandler);
  bot.use(taskFilesHandler);

  // ─── No-op callback ─────────────────────────────────────────────────────────
  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ─── Fallback ────────────────────────────────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    console.warn("Unhandled callback:", ctx.callbackQuery.data);
    await ctx.answerCallbackQuery();
  });

  // ─── Error handler ───────────────────────────────────────────────────────────
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
  });

  return bot;
}
