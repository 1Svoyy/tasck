import { Composer } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import prisma from "../../db/client.js";

export const taskFilesHandler = new Composer<BotContext>();

taskFilesHandler.callbackQuery(/^t:attach:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  ctx.session.step = `attach:${taskId}`;
  await ctx.answerCallbackQuery();
  await ctx.reply(`📎 Отправьте файл для задачи #${taskId}. /cancel для отмены.`);
});

taskFilesHandler.on(["message:document", "message:photo", "message:video"], async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("attach:")) return next();
  const taskId = parseInt(step.replace("attach:", ""));
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  let fileId: string | undefined, kind = "doc";
  if (ctx.message.document) { fileId = ctx.message.document.file_id; kind = `doc:${ctx.message.document.file_name || "file"}`; }
  else if (ctx.message.photo) { fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; kind = "photo"; }
  else if (ctx.message.video) { fileId = ctx.message.video.file_id; kind = "video"; }
  if (!fileId) return;

  await prisma.task.update({ where: { id: taskId }, data: { files: { push: `${kind}|${fileId}` } } });
  ctx.session.step = undefined;
  await ctx.reply(`✅ Файл добавлен к #${taskId}.`);
});

taskFilesHandler.callbackQuery(/^t:files:(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const task = await taskService.findById(taskId);
  if (!task) return ctx.answerCallbackQuery("Не найдена.");
  if (task.files.length === 0) return ctx.answerCallbackQuery("📭 Файлов нет.");

  await ctx.answerCallbackQuery();
  await ctx.reply(`📎 Файлы #${taskId} (${task.files.length}):`);
  for (const entry of task.files) {
    const [kind, fileId] = entry.split("|");
    try {
      if (kind === "photo") await ctx.replyWithPhoto(fileId);
      else if (kind === "video") await ctx.replyWithVideo(fileId);
      else await ctx.replyWithDocument(fileId);
    } catch { await ctx.reply(`❌ Не удалось: ${kind}`); }
  }
});

taskFilesHandler.command("cancel", async (ctx, next) => {
  if (ctx.session.step?.startsWith("attach:")) { ctx.session.step = undefined; await ctx.reply("❌ Отменено."); return; }
  return next();
});
