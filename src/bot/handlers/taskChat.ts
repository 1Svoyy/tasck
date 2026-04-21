import { Composer } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { backToMenuKeyboard } from "../keyboards/index.js";
import dayjs from "dayjs";
import { escapeHtml } from "../../utils/formatters.js";

export const taskChatHandler = new Composer<BotContext>();

// ─── Open task chat ────────────────────────────────────────────────────────────

taskChatHandler.callbackQuery(/^task:chat:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Задача не найдена.");

  // Only creator and executor
  if (task.creatorId !== user.id && task.executorId !== user.id) {
    return ctx.answerCallbackQuery("⛔ Вы не участник чата.");
  }

  if (task.status === "CLOSED" || task.status === "CANCELLED") {
    return ctx.answerCallbackQuery("🔒 Чат закрыт.");
  }

  // Load last 20 messages
  const messages = await taskService.getMessages(taskId);
  const last = messages.slice(-20);

  let text = `💬 <b>Чат задачи #${taskId}</b>\n\n`;

  if (last.length === 0) {
    text += "<i>Пока нет сообщений.</i>\n\n";
  } else {
    for (const m of last) {
      const time = dayjs(m.createdAt).format("HH:mm");
      text += `<b>${m.user.firstName}</b> [${time}]\n${escapeHtml(m.message)}\n\n`;
    }
  }

  text += `\n✏️ <i>Чтобы написать в чат, ответьте на это сообщение текстом.</i>`;

  ctx.session.step = `chat:${taskId}`;

  const { InlineKeyboard } = await import("grammy");
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("🔙 К задаче", `task:detail:${taskId}`)
      .text("🔄 Обновить", `task:chat:${taskId}`),
  });
  await ctx.answerCallbackQuery();
});

// ─── Send chat message ─────────────────────────────────────────────────────────

taskChatHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("chat:")) return next();

  const taskId = parseInt(step.replace("chat:", ""));
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const task = await taskService.findById(taskId);
  if (!task) return;

  if (task.creatorId !== user.id && task.executorId !== user.id) return;
  if (task.status === "CLOSED" || task.status === "CANCELLED") {
    await ctx.reply("🔒 Чат закрыт.");
    ctx.session.step = undefined;
    return;
  }

  const text = ctx.message.text;

  // Special command to exit chat mode
  if (text === "/exit" || text === "Выйти") {
    ctx.session.step = undefined;
    await ctx.reply("✅ Вы вышли из чата.", { reply_markup: backToMenuKeyboard() });
    return;
  }

  await taskService.addMessage(taskId, user.id, text);

  // Notify the other participant
  const otherUserId =
    task.creatorId === user.id ? task.executor?.telegramId : task.creator.telegramId;

  if (otherUserId) {
    try {
      await ctx.api.sendMessage(
        Number(otherUserId),
        `💬 <b>Новое сообщение в задаче #${taskId}</b>\n\n` +
          `<b>${user.firstName}:</b>\n${escapeHtml(text)}`,
        { parse_mode: "HTML" }
      );
    } catch {}
  }

  await ctx.reply("✅ Отправлено.");
});
