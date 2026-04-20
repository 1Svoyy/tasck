import { Composer } from "grammy";
import { BotContext, STATUS_LABELS, TASK_TYPE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { statsKeyboard, backToMenuKeyboard } from "../keyboards/index.js";

export const statsHandler = new Composer<BotContext>();

statsHandler.callbackQuery("stats:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isManager(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет доступа.");
  }

  await ctx.editMessageText("📊 <b>Статистика</b>\n\nВыберите раздел:", {
    parse_mode: "HTML",
    reply_markup: statsKeyboard(),
  });
});

statsHandler.callbackQuery("stats:global", async (ctx) => {
  await ctx.answerCallbackQuery();
  const stats = await taskService.getGlobalStats();

  let text = `📊 <b>Общая статистика</b>\n\n`;
  text += `📋 Всего задач: <b>${stats.total}</b>\n\n`;
  text += `<b>По статусам:</b>\n`;

  for (const row of stats.byStatus) {
    text += `${STATUS_LABELS[row.status]}: ${row._count.id}\n`;
  }

  text += `\n<b>По типам (топ 5):</b>\n`;
  const topTypes = stats.byType
    .sort((a, b) => b._count.id - a._count.id)
    .slice(0, 5);
  for (const row of topTypes) {
    text += `${TASK_TYPE_LABELS[row.type]}: ${row._count.id}\n`;
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});

statsHandler.callbackQuery("stats:tags", async (ctx) => {
  await ctx.answerCallbackQuery();
  const stats = await taskService.getGlobalStats();

  let text = `🏷 <b>Топ тегов</b>\n\n`;
  const topTags = stats.byTag.slice(0, 15);

  if (topTags.length === 0) {
    text += "Тегов ещё нет.";
  } else {
    for (const row of topTags) {
      text += `${row.tag}: <b>${row._count.id}</b>\n`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});

statsHandler.callbackQuery("stats:teams", async (ctx) => {
  await ctx.answerCallbackQuery();
  const teams = await userService.getAllTeams();

  let text = `👥 <b>Статистика по командам</b>\n\n`;

  if (teams.length === 0) {
    text += "Команд пока нет.";
  } else {
    for (const team of teams) {
      const stats = await taskService.getTeamStats(team.id);
      const total = stats.reduce((sum, s) => sum + s._count.id, 0);
      text += `<b>${team.name}</b>: ${total} задач | ${team.members.length} чел.\n`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});

statsHandler.callbackQuery(/^stats:team:(\d+)$/, async (ctx) => {
  const teamId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const stats = await taskService.getTeamStats(teamId);
  const teams = await userService.getAllTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;

  let text = `📊 <b>Статистика команды ${team.name}</b>\n\n`;
  if (stats.length === 0) {
    text += "Задач пока нет.";
  } else {
    for (const row of stats) {
      text += `${STATUS_LABELS[row.status]}: ${row._count.id}\n`;
    }
  }

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});
