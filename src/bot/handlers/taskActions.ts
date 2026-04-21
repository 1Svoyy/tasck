import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { formatTaskCard, formatTaskDetail, formatTaskHistory, escapeHtml } from "../../utils/formatters.js";
import { taskActionsKb, approveNotifyKb, backKb, confirmKb, taskCardKb } from "../keyboards/index.js";

export const taskActionsHandler = new Composer<BotContext>();

// ─── Open task detail ──────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:open:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  const task = await taskService.findById(id);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");

  const isExec = task.executorId === user.id;
  const canManage = userService.canManageTask(user.role, user.id, task);
  await ctx.editMessageText(formatTaskDetail(task as any), {
    parse_mode: "HTML",
    reply_markup: taskActionsKb(id, task.status, isExec, canManage),
  });
  await ctx.answerCallbackQuery();
});

// ─── Take ──────────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:take:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isExecutor(user.role)) return ctx.answerCallbackQuery("⛔");

  try {
    const task = await taskService.take(id, user.id);
    await ctx.answerCallbackQuery("✅ Взята!");
    const canManage = userService.canManageTask(user.role, user.id, task);
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML", reply_markup: taskActionsKb(id, task.status, true, canManage),
    });
    try {
      await ctx.api.sendMessage(Number(task.creator.telegramId),
        `🔵 Задача #${id} взята — <b>${user.firstName}</b>`, { parse_mode: "HTML" });
    } catch {}
  } catch (e: any) { await ctx.answerCallbackQuery(`❌ ${e.message}`); }
});

// ─── Submit for review → send approve buttons to creator ─────────────────────

taskActionsHandler.callbackQuery(/^t:submit:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  try {
    const task = await taskService.submit(id, user.id);
    await ctx.answerCallbackQuery("📤 Отправлено!");
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML", reply_markup: taskActionsKb(id, task.status, true, false),
    });
    // Notify creator WITH approve buttons
    try {
      await ctx.api.sendMessage(Number(task.creator.telegramId),
        `🟠 <b>Задача #${id} на проверке</b>\n${escapeHtml(task.title)}\nИсполнитель: ${user.firstName}`,
        { parse_mode: "HTML", reply_markup: approveNotifyKb(id) });
    } catch {}
  } catch (e: any) { await ctx.answerCallbackQuery(`❌ ${e.message}`); }
});

taskActionsHandler.callbackQuery(/^t:resubmit:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  try {
    const task = await taskService.resubmit(id, user.id);
    await ctx.answerCallbackQuery("📤 Отправлено!");
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML", reply_markup: taskActionsKb(id, task.status, true, false),
    });
    try {
      await ctx.api.sendMessage(Number(task.creator.telegramId),
        `🟠 <b>Доработка задачи #${id} на проверке</b>`,
        { parse_mode: "HTML", reply_markup: approveNotifyKb(id) });
    } catch {}
  } catch (e: any) { await ctx.answerCallbackQuery(`❌ ${e.message}`); }
});

// ─── Approve (auto-close) ──────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:approve:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  const task = await taskService.findById(id);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (!userService.canManageTask(user.role, user.id, task)) return ctx.answerCallbackQuery("⛔");

  try {
    const updated = await taskService.approve(id, user.id);
    await ctx.answerCallbackQuery("✅ Принята и закрыта!");
    await ctx.editMessageText(`✅ Задача #${id} принята и закрыта.`);
    if (updated.executor) {
      try {
        await ctx.api.sendMessage(Number(updated.executor.telegramId),
          `✅ <b>Задача #${id} принята!</b> Отличная работа.`, { parse_mode: "HTML" });
      } catch {}
    }
  } catch (e: any) { await ctx.answerCallbackQuery(`❌ ${e.message}`); }
});

// ─── Revision ──────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:revision:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  ctx.session.step = `rev:${id}`;
  await ctx.answerCallbackQuery();
  await ctx.reply("✏️ Причина доработки (или «-» чтобы пропустить):");
});

// ─── Release ───────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:release:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  try {
    await taskService.release(id, user.id);
    await ctx.answerCallbackQuery("↩️ Возвращена в очередь.");
    await ctx.editMessageText(`↩️ Задача #${id} возвращена в очередь.`);
  } catch (e: any) { await ctx.answerCallbackQuery(`❌ ${e.message}`); }
});

// ─── Delete ────────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:delete:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`⚠️ Удалить задачу #${ctx.match[1]}?`, { reply_markup: confirmKb(`t:del:yes:${ctx.match[1]}`) });
});

taskActionsHandler.callbackQuery(/^t:del:yes:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();
  const task = await taskService.findById(id);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (!userService.canManageTask(user.role, user.id, task)) return ctx.answerCallbackQuery("⛔");
  await taskService.cancel(id, user.id);
  await ctx.answerCallbackQuery("🗑 Удалена.");
  await ctx.editMessageText(`❌ Задача #${id} удалена.`);
});

// ─── History ───────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^t:history:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const task = await taskService.findById(id);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  await ctx.editMessageText(formatTaskHistory(task.history as any), {
    parse_mode: "HTML", reply_markup: backKb(`t:open:${id}`),
  });
  await ctx.answerCallbackQuery();
});

// ─── Revision text handler ─────────────────────────────────────────────────────

taskActionsHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("rev:")) return next();
  const id = parseInt(step.replace("rev:", ""));
  const comment = ctx.message.text === "-" ? undefined : ctx.message.text;
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  ctx.session.step = undefined;
  try {
    const task = await taskService.revision(id, user.id, comment);
    await ctx.reply(`🔄 Задача #${id} на доработку.`);
    if (task.executor) {
      try {
        await ctx.api.sendMessage(Number(task.executor.telegramId),
          `🔴 <b>Задача #${id} — доработка</b>\n${comment || ""}`, { parse_mode: "HTML" });
      } catch {}
    }
  } catch (e: any) { await ctx.reply(`❌ ${e.message}`); }
});

// ─── Noop ──────────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); });
taskActionsHandler.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); });
