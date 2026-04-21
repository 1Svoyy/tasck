import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { escapeHtml } from "../../utils/formatters.js";
import dayjs from "dayjs";

export const taskChatHandler = new Composer<BotContext>();

taskChatHandler.callbackQuery(/^t:chat:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (task.status === "CLOSED" || task.status === "CANCELLED") return ctx.answerCallbackQuery("🔒 Чат закрыт.");

  // Both creator and executor (and admins) can use chat
  const hasAccess = task.creatorId === user.id || task.executorId === user.id || userService.isAdmin(user.role);
  if (!hasAccess) return ctx.answerCallbackQuery("⛔");

  const messages = await taskService.getMessages(taskId);
  const last = messages.slice(-15);

  let text = `💬 <b>Чат задачи #${taskId}</b>\n\n`;
  if (last.length === 0) text += "<i>Пока нет сообщений.</i>\n";
  else for (const m of last) {
    text += `<b>${m.user.firstName}</b> <i>${dayjs(m.createdAt).format("HH:mm")}</i>\n${escapeHtml(m.message)}\n\n`;
  }
  text += `\n✏️ Напишите сообщение в ответ.\nОтправьте /exit чтобы выйти из чата.`;

  ctx.session.step = `chat:${taskId}`;
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("🔄 Обновить", `t:chat:${taskId}`)
      .text("🔙 К задаче", `t:open:${taskId}`),
  });
  await ctx.answerCallbackQuery();
});

taskChatHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("chat:")) return next();

  const taskId = parseInt(step.replace("chat:", ""));
  const text = ctx.message.text;

  if (text === "/exit") {
    ctx.session.step = undefined;
    await ctx.reply("✅ Вышли из чата.");
    return;
  }

  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const task = await taskService.findById(taskId);
  if (!task || task.status === "CLOSED" || task.status === "CANCELLED") {
    ctx.session.step = undefined;
    await ctx.reply("🔒 Чат закрыт.");
    return;
  }

  await taskService.addMessage(taskId, user.id, text);
  await ctx.reply("✅");

  // Notify other party
  const otherTgId = task.creatorId === user.id
    ? task.executor?.telegramId
    : task.creator.telegramId;

  if (otherTgId) {
    try {
      await ctx.api.sendMessage(Number(otherTgId),
        `💬 <b>Задача #${taskId}</b>\n<b>${user.firstName}:</b> ${escapeHtml(text)}`,
        { parse_mode: "HTML" });
    } catch {}
  }
});

taskChatHandler.command("exit", async (ctx) => {
  if (ctx.session.step?.startsWith("chat:")) {
    ctx.session.step = undefined;
    await ctx.reply("✅ Вышли из чата.");
  }
});
