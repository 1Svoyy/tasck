import { Bot, session } from "grammy";
import { conversations } from "@grammyjs/conversations";
import { BotContext, SessionData } from "../types/index.js";
import { config } from "../config.js";
import { userService } from "../services/UserService.js";

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
import { staffHandler, showStaffList } from "./handlers/staff.js";
import { allTasksHandler, showAllTasksFilter } from "./handlers/allTasks.js";

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
  bot.use(allTasksHandler);
  bot.use(ratingHandler);
  bot.use(statsHandler);
  bot.use(inviteHandler);
  bot.use(teamsHandler);
  bot.use(staffHandler);
  bot.use(taskChatHandler);
  bot.use(taskFilesHandler);

  // ─── Persistent keyboard text routing ─────────────────────────────────────────
  // This catches text messages from the bottom keyboard and routes them
  // to the same logic as inline button callbacks.

  bot.hears("➕ Создать задачу", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.canCreateTask(user.role)) return;
    await ctx.conversation.enter("createTask");
  });

  bot.hears("📋 Мои задачи", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user) return;

    if (userService.canCreateTask(user.role)) {
      // Creator view
      const { taskService } = await import("../services/TaskService.js");
      const { tasks, total } = await taskService.getCreatedTasks(user.id, undefined, 0);

      if (tasks.length === 0) {
        await ctx.reply("📭 У вас пока нет созданных задач.");
        return;
      }

      await ctx.reply(`📋 <b>Мои задачи</b> — всего: <b>${total}</b>`, { parse_mode: "HTML" });

      const { InlineKeyboard } = await import("grammy");
      for (const task of tasks) {
        const { formatTaskCard } = await import("../utils/formatters.js");
        const kb = new InlineKeyboard().text("🔍 Подробнее", `task:detail:${task.id}`);
        await ctx.reply(formatTaskCard(task as any), { parse_mode: "HTML", reply_markup: kb });
      }
    }
  });

  bot.hears("📋 Очередь задач", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.isExecutor(user.role)) return;

    const { taskService } = await import("../services/TaskService.js");
    const { formatTaskCard } = await import("../utils/formatters.js");
    const { InlineKeyboard } = await import("grammy");
    const { ExecutorType } = await import("@prisma/client");

    const executorType = user.role as any;
    const { tasks, total, pages } = await taskService.getQueue(executorType, undefined, 0);
    const header = executorType === "DESIGNER" ? "🎨 Очередь дизайнеров" : "⚙️ Очередь тех. специалистов";

    if (tasks.length === 0) {
      await ctx.reply(`${header}\n\n📭 Очередь пуста.`);
      return;
    }

    await ctx.reply(`${header}\n\nВсего: <b>${total}</b>`, { parse_mode: "HTML" });

    for (const task of tasks) {
      const kb = new InlineKeyboard()
        .text("🔍 Подробнее", `task:detail:${task.id}`)
        .text("✋ Взять", `task:take:${task.id}`);
      await ctx.reply(formatTaskCard(task as any), { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.hears("📌 Мои задачи", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user) return;

    const { taskService } = await import("../services/TaskService.js");
    const { formatTaskCard } = await import("../utils/formatters.js");
    const { InlineKeyboard } = await import("grammy");

    const { tasks, total } = await taskService.getMyActiveTasks(user.id, 0);

    if (tasks.length === 0) {
      await ctx.reply("📭 У вас нет активных задач.");
      return;
    }

    await ctx.reply(`📌 <b>Мои активные задачи</b> — <b>${total}</b>`, { parse_mode: "HTML" });
    for (const task of tasks) {
      const kb = new InlineKeyboard().text("🔍 Открыть", `task:detail:${task.id}`);
      await ctx.reply(formatTaskCard(task as any), { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.hears("✅ Завершённые", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user) return;

    const { taskService } = await import("../services/TaskService.js");
    const { formatTaskCard } = await import("../utils/formatters.js");
    const { InlineKeyboard } = await import("grammy");

    const { tasks, total } = await taskService.getMyCompletedTasks(user.id, 0);

    if (tasks.length === 0) {
      await ctx.reply("📭 У вас нет завершённых задач.");
      return;
    }

    await ctx.reply(`✅ <b>Завершённые</b> — <b>${total}</b>`, { parse_mode: "HTML" });
    for (const task of tasks.slice(0, 10)) {
      const kb = new InlineKeyboard().text("🔍 Открыть", `task:detail:${task.id}`);
      await ctx.reply(formatTaskCard(task as any), { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.hears("📊 Моя статистика", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user) return;

    const { ratingService } = await import("../services/RatingService.js");
    const stats = await ratingService.getUserStats(user.id);

    if (!stats) {
      await ctx.reply("📊 <b>Моя статистика</b>\n\nДанных за текущий период ещё нет.", { parse_mode: "HTML" });
      return;
    }

    const text =
      `📊 <b>Моя статистика</b>\n\nПериод: ${stats.period}\n\n` +
      `📋 Всего взято: <b>${stats.totalTasks}</b>\n` +
      `✅ Выполнено: <b>${stats.completedTasks}</b>\n` +
      `❌ Отменено: <b>${stats.cancelledTasks}</b>\n` +
      `🔄 Доработок: <b>${stats.revisionCount}</b>\n` +
      `⏰ Просрочек: <b>${stats.overdueCount}</b>\n` +
      (stats.avgTimeHours ? `⏱ Среднее время: <b>${stats.avgTimeHours.toFixed(1)} ч</b>\n` : "") +
      `🎯 Рейтинг: <b>${stats.score}</b>`;

    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.hears("🏆 Рейтинг", async (ctx) => {
    const { ratingKeyboard } = await import("./keyboards/index.js");
    await ctx.reply("🏆 <b>Рейтинг исполнителей</b>\n\nВыберите категорию:", {
      parse_mode: "HTML",
      reply_markup: ratingKeyboard(),
    });
  });

  bot.hears("📊 Статистика", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.isManager(user.role)) return;

    const { statsKeyboard } = await import("./keyboards/index.js");
    await ctx.reply("📊 <b>Статистика</b>\n\nВыберите раздел:", {
      parse_mode: "HTML",
      reply_markup: statsKeyboard(),
    });
  });

  bot.hears("📋 Все задачи", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.isAdmin(user.role)) return;
    await showAllTasksFilter(ctx, "text");
  });

  bot.hears("👥 Команды", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.isManager(user.role)) return;

    const teams = await userService.getAllTeams();
    const { teamsKeyboard } = await import("./keyboards/index.js");

    let filtered = teams;
    if (user.role === "TEAM_LEAD") {
      filtered = teams.filter((t) => t.teamLeadId === user.id);
    }

    if (filtered.length === 0) {
      await ctx.reply("📭 Команд пока нет.");
      return;
    }

    await ctx.reply("👥 <b>Команды:</b>", { parse_mode: "HTML", reply_markup: teamsKeyboard(filtered) });
  });

  bot.hears("👤 Сотрудники", async (ctx) => {
    await showStaffList(ctx, "text");
  });

  bot.hears("🔗 Создать инвайт", async (ctx) => {
    const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
    if (!user || !userService.canCreateInvite(user.role)) return;

    const { inviteRoleKeyboard } = await import("./keyboards/index.js");
    await ctx.reply("🔗 <b>Создание инвайта</b>\n\nВыберите роль приглашаемого:", {
      parse_mode: "HTML",
      reply_markup: inviteRoleKeyboard(user.role),
    });
  });

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
