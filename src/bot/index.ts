import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { BotContext, SessionData } from "../types/index.js";
import { config } from "../config.js";
import { userService } from "../services/UserService.js";

import { startHandler } from "./handlers/start.js";
import { taskCreateHandler, taskCreateConversation } from "./handlers/taskCreate.js";
import { taskActionsHandler } from "./handlers/taskActions.js";
import { queueHandler, showQueue } from "./handlers/queue.js";
import { viewsHandler, showMyTasks, showActiveTasks, showAllTasksMenu, showMyStats, showRating, showStats } from "./handlers/views.js";
import { teamHandler, showTeamMenu } from "./handlers/team.js";
import { taskChatHandler } from "./handlers/taskChat.js";
import { taskFilesHandler } from "./handlers/taskFiles.js";
import { broadcastHandler, startBroadcast } from "./handlers/broadcast.js";

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());
  bot.use(taskCreateConversation);

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "🤖 <b>Task Manager</b>\n\n/start — меню\n/menu — обновить меню\n/help — справка",
      { parse_mode: "HTML" }
    );
  });

  // Handlers
  bot.use(startHandler);
  bot.use(taskCreateHandler);
  bot.use(taskActionsHandler);
  bot.use(queueHandler);
  bot.use(viewsHandler);
  bot.use(teamHandler);
  bot.use(taskChatHandler);
  bot.use(taskFilesHandler);
  bot.use(broadcastHandler);

  // ─── Persistent keyboard text routing ─────────────────────────────────────

  bot.hears("➕ Новая задача", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.canCreateTask(user.role)) return;
    await ctx.conversation.enter("createTask");
  });

  bot.hears("📋 Мои задачи", async (ctx) => showMyTasks(ctx));
  bot.hears("📋 Очередь", async (ctx) => showQueue(ctx));
  bot.hears("📌 В работе", async (ctx) => showActiveTasks(ctx));
  bot.hears("📋 Все задачи", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (user && userService.isAdmin(user.role)) await showAllTasksMenu(ctx);
  });
  bot.hears("📊 Статистика", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user) return;
    if (userService.isExecutor(user.role)) await showMyStats(ctx);
    else if (userService.isManager(user.role)) await showStats(ctx);
  });
  bot.hears("🏆 Рейтинг", async (ctx) => showRating(ctx));
  bot.hears("👥 Команда", async (ctx) => showTeamMenu(ctx, "text"));
  bot.hears("🔗 Инвайт", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.canInvite(user.role)) return;
    const { inviteRoleKb } = await import("./keyboards/index.js");
    await ctx.reply("🔗 Роль:", { reply_markup: inviteRoleKb(user.role) });
  });
  bot.hears("📢 Рассылка", async (ctx) => startBroadcast(ctx));

  // Fallbacks
  bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); });
  bot.on("callback_query:data", async (ctx) => {
    console.warn("Unhandled:", ctx.callbackQuery.data);
    await ctx.answerCallbackQuery();
  });

  bot.catch((err) => {
    console.error(`Error ${err.ctx.update.update_id}:`, err.error);
  });

  return bot;
}
