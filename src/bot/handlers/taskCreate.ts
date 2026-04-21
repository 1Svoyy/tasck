import { Composer } from "grammy";
import { Conversation, createConversation } from "@grammyjs/conversations";
import { BotContext, TaskDraft, TASK_TEMPLATES, AVAILABLE_TAGS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { taskService } from "../../services/TaskService.js";
import {
  taskTypeKeyboard,
  executorTypeKeyboard,
  priorityKeyboard,
  tagsKeyboard,
  deadlineKeyboard,
  confirmTaskKeyboard,
} from "../keyboards/index.js";
import { TASK_TYPE_LABELS, EXECUTOR_TYPE_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "../../types/index.js";
import { TaskType, ExecutorType, Priority } from "@prisma/client";
import dayjs from "dayjs";
import { escapeHtml, formatTaskDetail } from "../../utils/formatters.js";
import { activeTaskKeyboard, backToMenuKeyboard } from "../keyboards/index.js";

type MyConversation = Conversation<BotContext>;

// ─── Task Creation Conversation ────────────────────────────────────────────────

async function createTaskConversation(conversation: MyConversation, ctx: BotContext) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await conversation.external(() =>
    userService.findByTelegramId(telegramId)
  );

  if (!user || !userService.canCreateTask(user.role)) {
    await ctx.reply("⛔ У вас нет прав создавать задачи.");
    return;
  }

  const draft: Partial<TaskDraft> = { files: [], links: [], tags: [] };

  // ── Step 1: Type ─────────────────────────────────────────────────────────────
  await ctx.reply("📌 <b>Шаг 1/6</b> — Выберите тип задачи:", {
    parse_mode: "HTML",
    reply_markup: taskTypeKeyboard(),
  });

  const typeCtx = await conversation.waitForCallbackQuery(/^task:type:/);
  const type = typeCtx.callbackQuery.data.replace("task:type:", "") as TaskType;
  draft.type = type;
  await typeCtx.answerCallbackQuery();
  await typeCtx.editMessageText(`✅ Тип: <b>${TASK_TYPE_LABELS[type]}</b>`, { parse_mode: "HTML" });

  // ── Step 2: Executor Type ─────────────────────────────────────────────────────
  await ctx.reply("👷 <b>Шаг 2/6</b> — Кто будет выполнять?", {
    parse_mode: "HTML",
    reply_markup: executorTypeKeyboard(),
  });

  const execCtx = await conversation.waitForCallbackQuery(/^task:exec:/);
  const executorType = execCtx.callbackQuery.data.replace("task:exec:", "") as ExecutorType;
  draft.executorType = executorType;
  await execCtx.answerCallbackQuery();
  await execCtx.editMessageText(`✅ Исполнитель: <b>${EXECUTOR_TYPE_LABELS[executorType]}</b>`, { parse_mode: "HTML" });

  // ── Step 3: Priority ──────────────────────────────────────────────────────────
  await ctx.reply("⚡ <b>Шаг 3/6</b> — Приоритет:", {
    parse_mode: "HTML",
    reply_markup: priorityKeyboard(),
  });

  const prioCtx = await conversation.waitForCallbackQuery(/^task:prio:/);
  const priority = prioCtx.callbackQuery.data.replace("task:prio:", "") as Priority;
  draft.priority = priority;
  await prioCtx.answerCallbackQuery();
  await prioCtx.editMessageText(`✅ Приоритет: <b>${PRIORITY_LABELS[priority]}</b>`, { parse_mode: "HTML" });

  // ── Step 4: Title ─────────────────────────────────────────────────────────────
  await ctx.reply(
    `✏️ <b>Шаг 4/6</b> — Введите заголовок задачи:\n\n<i>Пример: Landing for FB — Nutra DE</i>`,
    { parse_mode: "HTML" }
  );

  const titleMsg = await conversation.waitFor("message:text");
  draft.title = titleMsg.message.text.trim();

  // ── Step 5: Description (with template) ───────────────────────────────────────
  const template = TASK_TEMPLATES[type];
  await ctx.reply(
    `📝 <b>Шаг 5/6</b> — Описание задачи:\n\n` +
      `Шаблон для <b>${TASK_TYPE_LABELS[type]}</b>:\n\n<code>${escapeHtml(template)}</code>\n\n` +
      `Скопируйте шаблон, заполните и отправьте:`,
    { parse_mode: "HTML" }
  );

  const descMsg = await conversation.waitFor("message:text");
  draft.description = descMsg.message.text.trim();

  // ── Step 6: Tags ──────────────────────────────────────────────────────────────
  let selectedTags: string[] = [];
  let tagsMsg = await ctx.reply(
    `🏷 <b>Шаг 6/6</b> — Выберите теги:`,
    { parse_mode: "HTML", reply_markup: tagsKeyboard(selectedTags) }
  );

  while (true) {
    const tagCtx = await conversation.waitForCallbackQuery(/^task:tag:|^task:tags:done/);
    const data = tagCtx.callbackQuery.data;

    if (data === "task:tags:done") {
      await tagCtx.answerCallbackQuery();
      await tagCtx.editMessageText(`✅ Теги: ${selectedTags.join(" ") || "нет"}`);
      break;
    }

    const tag = data.replace("task:tag:", "");
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter((t) => t !== tag);
    } else {
      selectedTags.push(tag);
    }

    await tagCtx.editMessageReplyMarkup({ reply_markup: tagsKeyboard(selectedTags) });
    await tagCtx.answerCallbackQuery();
  }

  draft.tags = selectedTags;

  // ── Optional: Deadline ────────────────────────────────────────────────────────
  await ctx.reply("⏰ Дедлайн:", { reply_markup: deadlineKeyboard() });

  const dlCtx = await conversation.waitForCallbackQuery(/^task:dl:/);
  const dlData = dlCtx.callbackQuery.data;
  await dlCtx.answerCallbackQuery();

  if (dlData !== "task:dl:skip") {
    let deadline: Date | undefined;

    if (dlData === "task:dl:today") deadline = dayjs().endOf("day").toDate();
    else if (dlData === "task:dl:tomorrow") deadline = dayjs().add(1, "day").endOf("day").toDate();
    else if (dlData === "task:dl:3d") deadline = dayjs().add(3, "day").endOf("day").toDate();
    else if (dlData === "task:dl:7d") deadline = dayjs().add(7, "day").endOf("day").toDate();
    else if (dlData === "task:dl:manual") {
      await dlCtx.editMessageText("✏️ Введите дедлайн в формате <code>DD.MM.YYYY HH:mm</code>\n\nПример: <code>25.12.2024 18:00</code>", { parse_mode: "HTML" });
      const dlMsg = await conversation.waitFor("message:text");
      const parsed = dayjs(dlMsg.message.text.trim(), "DD.MM.YYYY HH:mm");
      if (parsed.isValid()) {
        deadline = parsed.toDate();
      } else {
        await ctx.reply("❌ Неверный формат. Дедлайн не установлен.");
      }
    }

    if (deadline) {
      draft.deadline = deadline;
      await dlCtx.editMessageText(`✅ Дедлайн: <b>${dayjs(deadline).format("DD.MM.YYYY HH:mm")}</b>`, { parse_mode: "HTML" });
    }
  } else {
    await dlCtx.editMessageText("⏭ Дедлайн не установлен.");
  }

  // ── Preview & Confirm ─────────────────────────────────────────────────────────
  const preview = buildPreview(draft as TaskDraft);

  await ctx.reply(
    `👀 <b>Предпросмотр задачи:</b>\n\n${preview}`,
    { parse_mode: "HTML", reply_markup: confirmTaskKeyboard() }
  );

  const confirmCtx = await conversation.waitForCallbackQuery(/^task:confirm|^task:cancel/);
  await confirmCtx.answerCallbackQuery();

  if (confirmCtx.callbackQuery.data === "task:cancel") {
    await confirmCtx.editMessageText("❌ Создание задачи отменено.");
    return;
  }

  // ── Create task ───────────────────────────────────────────────────────────────
  const team = user.ledTeam || user.team;
  const task = await conversation.external(() =>
    taskService.create(user.id, draft as TaskDraft, team?.id)
  );

  await confirmCtx.editMessageText(
    `✅ <b>Задача #${task.id} создана!</b>\n\n${buildPreview(draft as TaskDraft)}`,
    { parse_mode: "HTML" }
  );
}

function buildPreview(draft: TaskDraft): string {
  const lines = [
    `📌 <b>${escapeHtml(draft.title)}</b>`,
    `Тип: ${TASK_TYPE_LABELS[draft.type]}`,
    `Исполнитель: ${EXECUTOR_TYPE_LABELS[draft.executorType]}`,
    `Приоритет: ${PRIORITY_LABELS[draft.priority]}`,
    draft.tags?.length ? `Теги: ${draft.tags.join(" ")}` : null,
    draft.deadline ? `Дедлайн: ${dayjs(draft.deadline).format("DD.MM.YYYY HH:mm")}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

// ─── Export ────────────────────────────────────────────────────────────────────

export const taskCreateConversation: any = createConversation(
  createTaskConversation,
  "createTask"
);

export const taskCreateHandler = new Composer<BotContext>();

taskCreateHandler.callbackQuery("task:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canCreateTask(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет доступа");
  }
  await ctx.conversation.enter("createTask");
});

taskCreateHandler.callbackQuery("task:cancel", async (ctx) => {
  await ctx.conversation.exit();
  await ctx.editMessageText("❌ Отменено.");
  await ctx.answerCallbackQuery();
});
