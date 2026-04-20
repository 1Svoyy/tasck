import { Composer, InlineKeyboard } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import prisma from "../../db/client.js";

export const taskFilesHandler = new Composer<BotContext>();

/**
 * Flow:
 * - User clicks "Прикрепить файл" on a task → session.step = `attach_file:{taskId}`
 * - User sends document/photo/video → we save file_id to task.files
 * - Later, anyone with access can request files → we resend by file_id
 */

taskFilesHandler.callbackQuery(/^task:attach:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Задача не найдена.");

  // Only creator or executor can attach
  if (task.creatorId !== user.id && task.executorId !== user.id) {
    return ctx.answerCallbackQuery("⛔ Нет доступа.");
  }

  ctx.session.step = `attach_file:${taskId}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `📎 Отправьте файл (документ, фото или видео) для задачи #${taskId}.\n\n` +
      `Отправьте /cancel чтобы отменить.`
  );
});

// ─── File upload (document / photo / video) ────────────────────────────────────

taskFilesHandler.on(["message:document", "message:photo", "message:video"], async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("attach_file:")) return next();

  const taskId = parseInt(step.replace("attach_file:", ""));
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  let fileId: string | undefined;
  let fileKind: string = "document";

  if (ctx.message.document) {
    fileId = ctx.message.document.file_id;
    fileKind = `doc:${ctx.message.document.file_name || "file"}`;
  } else if (ctx.message.photo) {
    // pick the largest
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    fileId = photo.file_id;
    fileKind = "photo";
  } else if (ctx.message.video) {
    fileId = ctx.message.video.file_id;
    fileKind = "video";
  }

  if (!fileId) return;

  // Store as `kind|file_id`
  const entry = `${fileKind}|${fileId}`;
  await prisma.task.update({
    where: { id: taskId },
    data: { files: { push: entry } },
  });

  await prisma.taskHistory.create({
    data: {
      taskId,
      userId: user.id,
      action: "добавлен файл",
      comment: fileKind,
    },
  });

  ctx.session.step = undefined;

  await ctx.reply(`✅ Файл прикреплён к задаче #${taskId}.`);

  // Notify other participant
  const task = await taskService.findById(taskId);
  if (task) {
    const otherId =
      task.creatorId === user.id ? task.executor?.telegramId : task.creator.telegramId;
    if (otherId) {
      try {
        await ctx.api.sendMessage(
          Number(otherId),
          `📎 ${user.firstName} прикрепил(а) файл к задаче #${taskId}.`
        );
      } catch {}
    }
  }
});

// ─── Show/download files ───────────────────────────────────────────────────────

taskFilesHandler.callbackQuery(/^task:files:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Задача не найдена.");

  // Access: creator, executor, or manager
  const hasAccess =
    task.creatorId === user.id ||
    task.executorId === user.id ||
    userService.isManager(user.role);

  if (!hasAccess) return ctx.answerCallbackQuery("⛔ Нет доступа.");

  if (task.files.length === 0) {
    return ctx.answerCallbackQuery("📭 Файлов нет.");
  }

  await ctx.answerCallbackQuery();
  await ctx.reply(`📎 Файлы задачи #${taskId} (${task.files.length}):`);

  for (const entry of task.files) {
    const [kind, fileId] = entry.split("|");
    try {
      if (kind === "photo") {
        await ctx.replyWithPhoto(fileId);
      } else if (kind === "video") {
        await ctx.replyWithVideo(fileId);
      } else {
        await ctx.replyWithDocument(fileId);
      }
    } catch (err) {
      console.error("[files] send failed:", err);
      await ctx.reply(`❌ Не удалось отправить: ${kind}`);
    }
  }
});

// ─── Cancel ────────────────────────────────────────────────────────────────────

taskFilesHandler.command("cancel", async (ctx, next) => {
  if (ctx.session.step?.startsWith("attach_file:")) {
    ctx.session.step = undefined;
    await ctx.reply("❌ Прикрепление файла отменено.");
    return;
  }
  return next();
});
