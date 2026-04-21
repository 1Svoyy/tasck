import { Composer, InlineKeyboard } from "grammy";
import { BotContext, STATUS_LABELS, TASK_TYPE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { ratingService } from "../../services/RatingService.js";
import { formatTaskCard } from "../../utils/formatters.js";
import { taskCardKb, allTasksFilterKb, ratingKb, statsKb } from "../keyboards/index.js";
import { TaskStatus, ExecutorType } from "@prisma/client";

export const viewsHandler = new Composer<BotContext>();

// ─── My tasks (creator) ───────────────────────────────────────────────────────

export async function showMyTasks(ctx: BotContext) {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  const { tasks, total } = await taskService.getCreatedTasks(user.id, 0);
  if (total === 0) { await ctx.reply("📭 Нет задач."); return; }
  await ctx.reply(`📋 <b>Мои задачи</b> — ${total}`, { parse_mode: "HTML" });
  for (const t of tasks) {
    await ctx.reply(formatTaskCard(t as any), { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔍 Открыть", `t:open:${t.id}`) });
  }
}

// ─── Active tasks (executor) ──────────────────────────────────────────────────

export async function showActiveTasks(ctx: BotContext) {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  const { tasks, total } = await taskService.getMyActiveTasks(user.id, 0);
  if (total === 0) { await ctx.reply("📭 Нет активных задач."); return; }
  await ctx.reply(`📌 <b>В работе</b> — ${total}`, { parse_mode: "HTML" });
  for (const t of tasks) {
    await ctx.reply(formatTaskCard(t as any), { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔍 Открыть", `t:open:${t.id}`) });
  }
}

// ─── All tasks (admin) ────────────────────────────────────────────────────────

export async function showAllTasksMenu(ctx: BotContext) {
  await ctx.reply("📋 <b>Все задачи</b> — фильтр:", { parse_mode: "HTML", reply_markup: allTasksFilterKb() });
}

viewsHandler.callbackQuery(/^at:(OPEN|IN_PROGRESS|WAITING_APPROVAL|REVISION|DONE|CLOSED|CANCELLED|ALL)$/, async (ctx) => {
  const f = ctx.match[1];
  await ctx.answerCallbackQuery();
  const filter = f === "ALL" ? undefined : { status: f as TaskStatus };
  const { tasks, total } = await taskService.getAllTasks(filter, 0);
  const label = f === "ALL" ? "Все" : STATUS_LABELS[f as TaskStatus];
  await ctx.editMessageText(`📋 ${label} — <b>${total}</b>`, { parse_mode: "HTML", reply_markup: allTasksFilterKb() });
  for (const t of tasks) {
    await ctx.reply(formatTaskCard(t as any), { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔍 Открыть", `t:open:${t.id}`) });
  }
});

// ─── My stats (executor) ──────────────────────────────────────────────────────

export async function showMyStats(ctx: BotContext) {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  const stats = await ratingService.getUserStats(user.id);
  if (!stats) { await ctx.reply("📊 Данных пока нет."); return; }
  await ctx.reply(
    `📊 <b>Статистика</b> (${stats.period})\n\n` +
    `📋 Взято: <b>${stats.totalTasks}</b>\n✅ Выполнено: <b>${stats.completedTasks}</b>\n` +
    `❌ Отказов: <b>${stats.cancelledTasks}</b>\n🔄 Доработок: <b>${stats.revisionCount}</b>\n` +
    (stats.avgTimeHours ? `⏱ Среднее: <b>${stats.avgTimeHours.toFixed(1)} ч</b>\n` : "") +
    `🎯 Очки: <b>${stats.score}</b>`,
    { parse_mode: "HTML" }
  );
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export async function showRating(ctx: BotContext) {
  await ctx.reply("🏆 <b>Рейтинг</b>", { parse_mode: "HTML", reply_markup: ratingKb() });
}

viewsHandler.callbackQuery(/^rating:(DESIGNER|TECHNICAL_SPECIALIST)$/, async (ctx) => {
  const type = ctx.match[1] as ExecutorType;
  await ctx.answerCallbackQuery();
  const entries = await ratingService.getTopExecutors(type);
  const title = type === "DESIGNER" ? "🏆 Top Designers" : "🏆 Top Tech";
  await ctx.editMessageText(ratingService.formatRatingBoard(title, entries), { parse_mode: "HTML" });
});

// ─── Global stats ─────────────────────────────────────────────────────────────

export async function showStats(ctx: BotContext) {
  await ctx.reply("📊 <b>Статистика</b>", { parse_mode: "HTML", reply_markup: statsKb() });
}

viewsHandler.callbackQuery("stats:global", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = await taskService.getGlobalStats();
  let text = `📊 <b>Общая</b>\n\nВсего: <b>${s.total}</b>\n\n`;
  for (const r of s.byStatus) text += `${STATUS_LABELS[r.status]}: ${r._count.id}\n`;
  await ctx.editMessageText(text, { parse_mode: "HTML" });
});

viewsHandler.callbackQuery("stats:teams", async (ctx) => {
  await ctx.answerCallbackQuery();
  const teams = await userService.getAllTeams();
  let text = "👥 <b>По командам</b>\n\n";
  for (const t of teams) {
    const st = await taskService.getTeamStats(t.id);
    const total = st.reduce((s, x) => s + x._count.id, 0);
    text += `<b>${t.name}</b>: ${total} задач\n`;
  }
  await ctx.editMessageText(text, { parse_mode: "HTML" });
});

viewsHandler.callbackQuery("stats:tags", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = await taskService.getGlobalStats();
  let text = "🏷 <b>Теги</b>\n\n";
  for (const r of s.byTag.slice(0, 15)) text += `${r.tag}: <b>${r._count.id}</b>\n`;
  await ctx.editMessageText(text, { parse_mode: "HTML" });
});
