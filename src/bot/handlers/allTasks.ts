import { Composer, InlineKeyboard } from "grammy";
import { BotContext, STATUS_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { formatTaskCard } from "../../utils/formatters.js";
import { backToMenuKeyboard, activeTaskKeyboard } from "../keyboards/index.js";
import { TaskStatus } from "@prisma/client";

export const allTasksHandler = new Composer<BotContext>();

// ─── All tasks filter menu ─────────────────────────────────────────────────────

allTasksHandler.callbackQuery("all:tasks", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAllTasksFilter(ctx, "callback");
});

export async function showAllTasksFilter(ctx: BotContext, mode: "callback" | "text" = "callback") {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isAdmin(user.role)) return;

  const kb = new InlineKeyboard()
    .text("🟡 Открытые", "all:tasks:OPEN")
    .text("🔵 В работе", "all:tasks:IN_PROGRESS").row()
    .text("🟠 На проверке", "all:tasks:WAITING_APPROVAL")
    .text("🔴 Доработка", "all:tasks:REVISION").row()
    .text("🟢 Выполнено", "all:tasks:DONE")
    .text("⚫ Закрытые", "all:tasks:CLOSED").row()
    .text("📋 Все", "all:tasks:ALL").row()
    .text("🔙 Назад", "menu:main");

  const text = "📋 <b>Все задачи</b>\n\nВыберите фильтр:";

  if (mode === "callback") {
    await (ctx as any).editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

// ─── Filtered list ─────────────────────────────────────────────────────────────

allTasksHandler.callbackQuery(/^all:tasks:(OPEN|IN_PROGRESS|WAITING_APPROVAL|REVISION|DONE|CLOSED|CANCELLED|ALL)$/, async (ctx) => {
  const filterStatus = ctx.match[1];
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isAdmin(user.role)) return ctx.answerCallbackQuery("⛔");

  await ctx.answerCallbackQuery();

  const filter = filterStatus === "ALL" ? undefined : { status: filterStatus as TaskStatus };
  const { tasks, total } = await taskService.getAllTasks(filter, 0);

  const statusLabel = filterStatus === "ALL" ? "Все" : STATUS_LABELS[filterStatus as TaskStatus];
  const headerText = `📋 <b>${statusLabel}</b> — <b>${total}</b> задач`;

  await ctx.editMessageText(headerText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("🔙 Фильтры", "all:tasks")
      .text("🔙 Меню", "menu:main"),
  });

  if (tasks.length === 0) return;

  for (const task of tasks) {
    const cardText = formatTaskCard(task as any);
    const kb = new InlineKeyboard().text("🔍 Подробнее", `task:detail:${task.id}`);
    await ctx.reply(cardText, { parse_mode: "HTML", reply_markup: kb });
  }
});
