import { Composer } from "grammy";
import { Conversation, createConversation } from "@grammyjs/conversations";
import { BotContext, TaskDraft, TASK_TEMPLATES, TASK_TYPE_LABELS, EXECUTOR_TYPE_LABELS, PRIORITY_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import { taskTypeKb, executorTypeKb, priorityKb, tagsKb, deadlineKb, confirmCreateKb } from "../keyboards/index.js";
import { TaskType, ExecutorType, Priority } from "@prisma/client";
import dayjs from "dayjs";
import { escapeHtml } from "../../utils/formatters.js";

type Conv = Conversation<BotContext>;

async function createTaskFlow(conversation: Conv, ctx: BotContext) {
  const user = await conversation.external(() => userService.findByTelegramId(BigInt(ctx.from!.id)));
  if (!user || !userService.canCreateTask(user.role)) { await ctx.reply("⛔ Нет прав."); return; }

  const draft: Partial<TaskDraft> = { files: [], links: [], tags: [] };

  // 1. Type
  await ctx.reply("📌 Тип задачи:", { reply_markup: taskTypeKb() });
  const t1 = await conversation.waitForCallbackQuery(/^tc:type:/);
  draft.type = t1.callbackQuery.data.replace("tc:type:", "") as TaskType;
  await t1.answerCallbackQuery();
  await t1.editMessageText(`✅ ${TASK_TYPE_LABELS[draft.type!]}`);

  // 2. Executor type
  await ctx.reply("👷 Исполнитель:", { reply_markup: executorTypeKb() });
  const t2 = await conversation.waitForCallbackQuery(/^tc:exec:/);
  draft.executorType = t2.callbackQuery.data.replace("tc:exec:", "") as ExecutorType;
  await t2.answerCallbackQuery();
  await t2.editMessageText(`✅ ${EXECUTOR_TYPE_LABELS[draft.executorType!]}`);

  // 3. Priority
  await ctx.reply("⚡ Приоритет:", { reply_markup: priorityKb() });
  const t3 = await conversation.waitForCallbackQuery(/^tc:prio:/);
  draft.priority = t3.callbackQuery.data.replace("tc:prio:", "") as Priority;
  await t3.answerCallbackQuery();
  await t3.editMessageText(`✅ ${PRIORITY_LABELS[draft.priority!]}`);

  // 4. Title
  const template = TASK_TEMPLATES[draft.type!];
  await ctx.reply(`✏️ Заголовок + описание.\n\nШаблон:\n<code>${escapeHtml(template)}</code>\n\nОтправьте одним сообщением: первая строка = заголовок, остальное = описание.`, { parse_mode: "HTML" });
  const t4 = await conversation.waitFor("message:text");
  const lines = t4.message.text.split("\n");
  draft.title = lines[0].trim();
  draft.description = lines.slice(1).join("\n").trim() || undefined;

  // 5. Tags
  let selectedTags: string[] = [];
  await ctx.reply("🏷 Теги:", { reply_markup: tagsKb(selectedTags) });
  while (true) {
    const t5 = await conversation.waitForCallbackQuery(/^tc:tag:|^tc:tags:done/);
    if (t5.callbackQuery.data === "tc:tags:done") {
      await t5.answerCallbackQuery();
      await t5.editMessageText(`✅ Теги: ${selectedTags.join(" ") || "—"}`);
      break;
    }
    const tag = t5.callbackQuery.data.replace("tc:tag:", "");
    selectedTags = selectedTags.includes(tag) ? selectedTags.filter(x => x !== tag) : [...selectedTags, tag];
    await t5.editMessageReplyMarkup({ reply_markup: tagsKb(selectedTags) });
    await t5.answerCallbackQuery();
  }
  draft.tags = selectedTags;

  // 6. Deadline
  await ctx.reply("⏰ Дедлайн:", { reply_markup: deadlineKb() });
  const t6 = await conversation.waitForCallbackQuery(/^tc:dl:/);
  await t6.answerCallbackQuery();
  const dl = t6.callbackQuery.data.replace("tc:dl:", "");
  if (dl !== "skip") {
    const map: Record<string, Date> = {
      today: dayjs().endOf("day").toDate(),
      tomorrow: dayjs().add(1, "day").endOf("day").toDate(),
      "3d": dayjs().add(3, "day").endOf("day").toDate(),
      "7d": dayjs().add(7, "day").endOf("day").toDate(),
    };
    draft.deadline = map[dl];
    await t6.editMessageText(`✅ Дедлайн: ${dayjs(draft.deadline).format("DD.MM.YYYY")}`);
  } else {
    await t6.editMessageText("⏭ Без дедлайна");
  }

  // Confirm
  const preview = `📌 <b>${escapeHtml(draft.title!)}</b>\n${TASK_TYPE_LABELS[draft.type!]} → ${EXECUTOR_TYPE_LABELS[draft.executorType!]}\n${PRIORITY_LABELS[draft.priority!]}\n${draft.tags?.join(" ") || ""}`;
  await ctx.reply(preview, { parse_mode: "HTML", reply_markup: confirmCreateKb() });
  const t7 = await conversation.waitForCallbackQuery(/^tc:confirm|^tc:cancel/);
  await t7.answerCallbackQuery();
  if (t7.callbackQuery.data === "tc:cancel") { await t7.editMessageText("❌ Отменено."); return; }

  const team = user.ledTeam || user.team;
  const task = await conversation.external(() => taskService.create(user.id, draft as TaskDraft, team?.id));
  await t7.editMessageText(`✅ Задача #${task.id} создана.`);

  // Notify executors
  const executors = await conversation.external(() => userService.getActiveExecutors(draft.executorType!));
  const queueCount = await conversation.external(() => taskService.getQueueCount(draft.executorType!));
  for (const exec of executors) {
    try {
      await ctx.api.sendMessage(
        Number(exec.telegramId),
        `🆕 Новая задача #${task.id}\n<b>${escapeHtml(draft.title!)}</b>\n${PRIORITY_LABELS[draft.priority!]}\n\n📋 В очереди: <b>${queueCount}</b>`,
        { parse_mode: "HTML" }
      );
    } catch {}
  }
}

export const taskCreateConversation: any = createConversation(createTaskFlow, "createTask");

export const taskCreateHandler = new Composer<BotContext>();
taskCreateHandler.callbackQuery("tc:cancel", async (ctx) => {
  await ctx.conversation.exit();
  await ctx.editMessageText("❌ Отменено.");
  await ctx.answerCallbackQuery();
});
