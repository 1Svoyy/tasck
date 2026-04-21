import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import {
  formatTaskCard,
  formatTaskDetail,
  formatTaskHistory,
} from "../../utils/formatters.js";
import {
  activeTaskKeyboard,
  backToMenuKeyboard,
  confirmKeyboard,
} from "../keyboards/index.js";

export const taskActionsHandler = new Composer<BotContext>();

// ─── Helper: compute permission flags ──────────────────────────────────────────

function getFlags(user: { id: number; role: string }, task: { creatorId: number; executorId: number | null }) {
  const isExecutor = task.executorId === user.id;
  const isCreator = task.creatorId === user.id;
  const isAdmin = user.role === "OWNER" || user.role === "HEAD";
  return { isExecutor, isCreator, isAdmin };
}

// ─── Take task ─────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:take:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));

  if (!user || !userService.isExecutor(user.role)) {
    return ctx.answerCallbackQuery("⛔ Только исполнители могут брать задачи.");
  }

  try {
    const task = await taskService.take(taskId, user.id);
    await ctx.answerCallbackQuery("✅ Задача взята!");

    const { isExecutor, isCreator, isAdmin } = getFlags(user, task);
    const text = formatTaskDetail(task as any);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, isExecutor, isCreator, isAdmin),
    });

    // Notify creator
    try {
      await ctx.api.sendMessage(
        Number(task.creator.telegramId),
        `🔵 <b>Задача #${taskId} взята в работу</b>\n\n👤 Исполнитель: <b>${user.firstName}</b>`,
        { parse_mode: "HTML" }
      );
    } catch {}
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── View task detail ──────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:detail:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Задача не найдена.");

  const { isExecutor, isCreator, isAdmin } = getFlags(user, task);
  const canTake =
    userService.isExecutor(user.role) &&
    task.status === "OPEN" &&
    task.executorType === user.role;

  // If task has an executor or admin has access, show full action buttons
  if (task.executorId || isCreator || isAdmin) {
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, isExecutor, isCreator, isAdmin),
    });
  } else if (canTake) {
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("✋ Взять", `task:take:${taskId}`).row()
        .text("🔼 Свернуть", `task:collapse:${taskId}`),
    });
  } else {
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🔼 Свернуть", `task:collapse:${taskId}`),
    });
  }
  await ctx.answerCallbackQuery();
});

// ─── Collapse detail ───────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:collapse:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery();

  const canTake =
    userService.isExecutor(user.role) &&
    task.status === "OPEN" &&
    task.executorType === user.role;

  const kb = new InlineKeyboard()
    .text("🔍 Подробнее", `task:detail:${taskId}`);
  if (canTake) kb.text("✋ Взять", `task:take:${taskId}`);

  await ctx.editMessageText(formatTaskCard(task as any), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
  await ctx.answerCallbackQuery();
});

// ─── Submit for approval ───────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:submit:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  try {
    const task = await taskService.submitForApproval(taskId, user.id);
    await ctx.answerCallbackQuery("📤 Отправлено на проверку!");

    const { isExecutor, isCreator, isAdmin } = getFlags(user, task);
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, isExecutor, isCreator, isAdmin),
    });

    try {
      await ctx.api.sendMessage(
        Number(task.creator.telegramId),
        `🟠 <b>Задача #${taskId} ожидает проверки</b>\n\n👨‍💻 Исполнитель: ${user.firstName} отправил(а) на проверку.`,
        { parse_mode: "HTML" }
      );
    } catch {}
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Approve (creator OR admin) ────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:approve:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  // Check permission: creator or admin
  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (task.creatorId !== user.id && !userService.isAdmin(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет прав.");
  }

  try {
    const updated = await taskService.approve(taskId, user.id);
    await ctx.answerCallbackQuery("✅ Задача одобрена!");

    const flags = getFlags(user, updated);
    await ctx.editMessageText(formatTaskDetail(updated as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, updated.status, flags.isExecutor, flags.isCreator, flags.isAdmin),
    });

    if (updated.executor) {
      try {
        await ctx.api.sendMessage(
          Number(updated.executor.telegramId),
          `✅ <b>Задача #${taskId} одобрена!</b>\n\nОтличная работа!`,
          { parse_mode: "HTML" }
        );
      } catch {}
    }
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Request revision ──────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:revision:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  ctx.session.step = `revision_comment:${taskId}`;
  await ctx.answerCallbackQuery();
  await ctx.reply("✏️ Укажите причину доработки (или отправьте «-» чтобы пропустить):");
});

taskActionsHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("revision_comment:")) return next();

  const taskId = parseInt(step.replace("revision_comment:", ""));
  const comment = ctx.message.text === "-" ? undefined : ctx.message.text;
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  ctx.session.step = undefined;

  try {
    const task = await taskService.requestRevision(taskId, user.id, comment);

    await ctx.reply(
      `🔄 <b>Задача #${taskId} отправлена на доработку.</b>`,
      { parse_mode: "HTML" }
    );

    if (task.executor) {
      try {
        await ctx.api.sendMessage(
          Number(task.executor.telegramId),
          `🔴 <b>Задача #${taskId} возвращена на доработку</b>\n\n` +
            (comment ? `Комментарий: ${comment}` : ""),
          { parse_mode: "HTML" }
        );
      } catch {}
    }
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message}`);
  }
});

// ─── Submit revision ───────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:resubmit:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  try {
    const task = await taskService.submitRevision(taskId, user.id);
    await ctx.answerCallbackQuery("📤 Доработка отправлена!");

    const flags = getFlags(user, task);
    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, flags.isExecutor, flags.isCreator, flags.isAdmin),
    });
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Release task (executor cancel) ───────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:release:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  try {
    await taskService.cancelByExecutor(taskId, user.id);
    await ctx.answerCallbackQuery("↩️ Задача возвращена в очередь.");

    await ctx.editMessageText(
      `↩️ Задача #${taskId} возвращена в очередь.`,
      { reply_markup: backToMenuKeyboard() }
    );
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Close task (creator OR admin) ─────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:close:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  try {
    const task = await taskService.close(taskId, user.id);
    await ctx.answerCallbackQuery("🔒 Задача закрыта.");

    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: backToMenuKeyboard(),
    });
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Delete task (creator OR admin) ────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:delete:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⚠️ Удалить задачу #${taskId}?\n\nЭто действие необратимо.`,
    { reply_markup: confirmKeyboard(`task:delete:confirm:${taskId}`) }
  );
});

taskActionsHandler.callbackQuery(/^task:delete:confirm:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  // Check permission
  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (task.creatorId !== user.id && !userService.isAdmin(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет прав.");
  }

  try {
    await taskService.cancelByCreator(taskId, user.id);
    await ctx.answerCallbackQuery("🗑 Задача удалена.");
    await ctx.editMessageText(`❌ Задача #${taskId} удалена.`, { reply_markup: backToMenuKeyboard() });
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Task history ──────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:history:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Задача не найдена.");

  const historyText = formatTaskHistory(task.history as any);

  await ctx.editMessageText(historyText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Назад", `task:detail:${taskId}`),
  });
  await ctx.answerCallbackQuery();
});
