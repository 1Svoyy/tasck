import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { formatTaskCard } from "../../utils/formatters.js";
import { ExecutorType } from "@prisma/client";
import { queueNavKb, taskCardKb } from "../keyboards/index.js";

export const queueHandler = new Composer<BotContext>();

export async function showQueue(ctx: BotContext) {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isExecutor(user.role)) return;

  const execType = user.role as ExecutorType;
  const { tasks, total, pages } = await taskService.getQueue(execType, 0);
  const header = execType === "DESIGNER" ? "🎨 Очередь дизайнеров" : "⚙️ Очередь тех. специалистов";

  if (tasks.length === 0) { await ctx.reply(`${header}\n\n📭 Пусто.`); return; }

  await ctx.reply(`${header} — <b>${total}</b> задач`, { parse_mode: "HTML" });
  for (const task of tasks) {
    await ctx.reply(formatTaskCard(task as any), {
      parse_mode: "HTML", reply_markup: taskCardKb(task.id, true),
    });
  }
  if (pages > 1) await ctx.reply("Навигация:", { reply_markup: queueNavKb(0, pages, execType) });
}

queueHandler.callbackQuery(/^q:page:(DESIGNER|TECHNICAL_SPECIALIST):(\d+)$/, async (ctx) => {
  const execType = ctx.match[1] as ExecutorType;
  const page = parseInt(ctx.match[2]);
  await ctx.answerCallbackQuery();
  const { tasks, total, pages } = await taskService.getQueue(execType, page);
  for (const task of tasks) {
    await ctx.reply(formatTaskCard(task as any), {
      parse_mode: "HTML", reply_markup: taskCardKb(task.id, true),
    });
  }
  if (pages > 1) await ctx.reply("Навигация:", { reply_markup: queueNavKb(page, pages, execType) });
});

queueHandler.callbackQuery(/^q:refresh:(DESIGNER|TECHNICAL_SPECIALIST)$/, async (ctx) => {
  await ctx.answerCallbackQuery("🔄");
  await showQueue(ctx);
});
