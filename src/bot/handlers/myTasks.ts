import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { formatTaskCard } from "../../utils/formatters.js";
import { backToMenuKeyboard } from "../keyboards/index.js";

export const myTasksHandler = new Composer<BotContext>();

// ─── Created by me (for creators) ──────────────────────────────────────────────

myTasksHandler.callbackQuery("my:tasks", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const { tasks, total } = await taskService.getCreatedTasks(user.id, undefined, 0);

  if (tasks.length === 0) {
    await ctx.editMessageText("📭 У вас пока нет созданных задач.", {
      reply_markup: backToMenuKeyboard(),
    });
    return;
  }

  await ctx.editMessageText(
    `📋 <b>Мои задачи</b> — всего: <b>${total}</b>`,
    { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
  );

  for (const task of tasks) {
    const kb = new InlineKeyboard().text("🔍 Подробнее", `task:detail:${task.id}`);
    await ctx.reply(formatTaskCard(task as any), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }
});

// ─── Active (for executors) ────────────────────────────────────────────────────

myTasksHandler.callbackQuery("my:active", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const { tasks, total } = await taskService.getMyActiveTasks(user.id, 0);

  if (tasks.length === 0) {
    await ctx.editMessageText("📭 У вас нет активных задач.", {
      reply_markup: backToMenuKeyboard(),
    });
    return;
  }

  await ctx.editMessageText(
    `📌 <b>Мои активные задачи</b> — <b>${total}</b>`,
    { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
  );

  for (const task of tasks) {
    const kb = new InlineKeyboard().text("🔍 Открыть", `task:detail:${task.id}`);
    await ctx.reply(formatTaskCard(task as any), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }
});

// ─── Completed (for executors) ─────────────────────────────────────────────────

myTasksHandler.callbackQuery("my:done", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const { tasks, total } = await taskService.getMyCompletedTasks(user.id, 0);

  if (tasks.length === 0) {
    await ctx.editMessageText("📭 У вас нет завершённых задач.", {
      reply_markup: backToMenuKeyboard(),
    });
    return;
  }

  await ctx.editMessageText(
    `✅ <b>Завершённые задачи</b> — <b>${total}</b>`,
    { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
  );

  for (const task of tasks.slice(0, 10)) {
    const kb = new InlineKeyboard().text("🔍 Открыть", `task:detail:${task.id}`);
    await ctx.reply(formatTaskCard(task as any), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }
});

// ─── My stats ──────────────────────────────────────────────────────────────────

myTasksHandler.callbackQuery("my:stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const { ratingService } = await import("../../services/RatingService.js");
  const stats = await ratingService.getUserStats(user.id);

  if (!stats) {
    await ctx.editMessageText(
      "📊 <b>Моя статистика</b>\n\nДанных за текущий период ещё нет.",
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
    );
    return;
  }

  const text =
    `📊 <b>Моя статистика</b>\n\n` +
    `Период: ${stats.period}\n\n` +
    `📋 Всего взято: <b>${stats.totalTasks}</b>\n` +
    `✅ Выполнено: <b>${stats.completedTasks}</b>\n` +
    `❌ Отменено: <b>${stats.cancelledTasks}</b>\n` +
    `🔄 Доработок: <b>${stats.revisionCount}</b>\n` +
    `⏰ Просрочек: <b>${stats.overdueCount}</b>\n` +
    (stats.avgTimeHours ? `⏱ Среднее время: <b>${stats.avgTimeHours.toFixed(1)} ч</b>\n` : "") +
    `🎯 Рейтинг: <b>${stats.score}</b>`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});
