import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { formatTaskCard } from "../../utils/formatters.js";
import { ExecutorType } from "@prisma/client";
import { backToMenuKeyboard, queueNavKeyboard } from "../keyboards/index.js";

export const queueHandler = new Composer<BotContext>();

queueHandler.callbackQuery("queue:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isExecutor(user.role)) return;

  const executorType = user.role as ExecutorType;
  await showQueue(ctx, executorType, 0);
});

queueHandler.callbackQuery(/^queue:page:(DESIGNER|TECHNICAL_SPECIALIST):(\d+)$/, async (ctx) => {
  const executorType = ctx.match[1] as ExecutorType;
  const page = parseInt(ctx.match[2]);
  await ctx.answerCallbackQuery();
  await showQueue(ctx, executorType, page);
});

queueHandler.callbackQuery(/^queue:refresh:(DESIGNER|TECHNICAL_SPECIALIST)$/, async (ctx) => {
  const executorType = ctx.match[1] as ExecutorType;
  await ctx.answerCallbackQuery("🔄 Обновлено");
  await showQueue(ctx, executorType, 0);
});

async function showQueue(ctx: BotContext, executorType: ExecutorType, page: number) {
  const { tasks, total, pages } = await taskService.getQueue(executorType, undefined, page);

  const header =
    executorType === "DESIGNER" ? "🎨 <b>Очередь дизайнеров</b>" : "⚙️ <b>Очередь тех. специалистов</b>";

  if (tasks.length === 0) {
    await ctx.editMessageText(
      `${header}\n\n📭 Очередь пуста.`,
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
    );
    return;
  }

  // Send header, then each task as a separate message would be ideal,
  // but for editing we'll show the list compactly.
  const text = `${header}\n\nВсего в очереди: <b>${total}</b>\nСтраница ${page + 1} из ${pages}`;

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Меню", "menu:main"),
  });

  // Send each task as a separate card for individual actions
  for (const task of tasks) {
    const cardText = formatTaskCard(task as any);
    const kb = new InlineKeyboard()
      .text("🔍 Подробнее", `task:detail:${task.id}`)
      .text("✋ Взять", `task:take:${task.id}`);

    await ctx.reply(cardText, { parse_mode: "HTML", reply_markup: kb });
  }

  // Navigation footer
  if (pages > 1) {
    await ctx.reply("Навигация:", {
      reply_markup: queueNavKeyboard(page, pages, executorType),
    });
  }
}
