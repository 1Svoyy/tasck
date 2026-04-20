import { Composer } from "grammy";
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

    const isExecutor = task.executorId === user.id;
    const isCreator = task.creatorId === user.id;
    const text = formatTaskDetail(task as any);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, isExecutor, isCreator),
    });

    // Notify creator
    try {
      await ctx.api.sendMessage(
        Number(task.creator.telegramId),
        `🔵 <b>Задача #${taskId} взята в работу</b>\n\n` +
          `👤 Исполнитель: <b>${user.firstName}</b>`,
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

  const isExecutor = task.executorId === user.id;
  const isCreator = task.creatorId === user.id;
  const canTake =
    userService.isExecutor(user.role) &&
    task.status === "OPEN" &&
    task.executorType === user.role;

  await ctx.editMessageText(formatTaskDetail(task as any), {
    parse_mode: "HTML",
    reply_markup: task.executorId
      ? activeTaskKeyboard(taskId, task.status, isExecutor, isCreator)
      : canTake
      ? new (await import("grammy")).InlineKeyboard()
          .text("✋ Взять", `task:take:${taskId}`)
          .row()
          .text("🔼 Свернуть", `task:collapse:${taskId}`)
      : new (await import("grammy")).InlineKeyboard().text("🔼 Свернуть", `task:collapse:${taskId}`),
  });
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

  const { InlineKeyboard } = await import("grammy");
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

    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, task.executorId === user.id, task.creatorId === user.id),
    });

    try {
      await ctx.api.sendMessage(
        Number(task.creator.telegramId),
        `🟠 <b>Задача #${taskId} ожидает проверки</b>\n\n` +
          `👨‍💻 Исполнитель: ${user.firstName} отправил(а) на проверку.`,
        { parse_mode: "HTML" }
      );
    } catch {}
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Approve ───────────────────────────────────────────────────────────────────

taskActionsHandler.callbackQuery(/^task:approve:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  try {
    const task = await taskService.approve(taskId, user.id);
    await ctx.answerCallbackQuery("✅ Задача одобрена!");

    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, false, true),
    });

    if (task.executor) {
      try {
        await ctx.api.sendMessage(
          Number(task.executor.telegramId),
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

    await ctx.editMessageText(formatTaskDetail(task as any), {
      parse_mode: "HTML",
      reply_markup: activeTaskKeyboard(taskId, task.status, true, false),
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
    const task = await taskService.cancelByExecutor(taskId, user.id);
    await ctx.answerCallbackQuery("↩️ Задача возвращена в очередь.");

    await ctx.editMessageText(
      `↩️ Задача #${taskId} возвращена в очередь.`,
      { reply_markup: backToMenuKeyboard() }
    );
  } catch (err: any) {
    await ctx.answerCallbackQuery(`❌ ${err.message}`);
  }
});

// ─── Close task ────────────────────────────────────────────────────────────────

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

// ─── Delete task ───────────────────────────────────────────────────────────────

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
  const { InlineKeyboard } = await import("grammy");

  await ctx.editMessageText(historyText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🔙 Назад", `task:detail:${taskId}`),
  });
  await ctx.answerCallbackQuery();
});
