import { InlineKeyboard } from "grammy";
import {
  TaskType,
  ExecutorType,
  Priority,
  Role,
  TaskStatus,
  Task,
} from "@prisma/client";
import {
  TASK_TYPE_LABELS,
  EXECUTOR_TYPE_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  AVAILABLE_TAGS,
  STATUS_LABELS,
} from "../../types/index.js";

// ─── Main Menus ───────────────────────────────────────────────────────────────

export function mainMenuKeyboard(role: Role) {
  const kb = new InlineKeyboard();

  const isCreator = ["HEAD", "TEAM_LEAD", "BUYER", "BUYER_ASSISTANT"].includes(role);
  const isExecutor = ["DESIGNER", "TECHNICAL_SPECIALIST"].includes(role);
  const isManager = ["OWNER", "HEAD", "TEAM_LEAD"].includes(role);

  if (isCreator) {
    kb.text("➕ Создать задачу", "task:create").row();
    kb.text("📋 Мои задачи", "my:tasks").row();
  }

  if (isExecutor) {
    kb.text("📋 Очередь задач", "queue:view").row();
    kb.text("📌 Мои задачи", "my:active").text("✅ Завершённые", "my:done").row();
    kb.text("📊 Моя статистика", "my:stats").text("🏆 Рейтинг", "rating:view").row();
  }

  if (isManager) {
    kb.text("📊 Статистика", "stats:view").row();
    if (["OWNER", "HEAD", "TEAM_LEAD"].includes(role)) {
      kb.text("👥 Команды", "teams:list").row();
    }
  }

  if (["OWNER", "HEAD", "TEAM_LEAD"].includes(role)) {
    kb.text("🔗 Создать инвайт", "invite:create").row();
  }

  return kb;
}

// ─── Task Creation ─────────────────────────────────────────────────────────────

export function taskTypeKeyboard() {
  const kb = new InlineKeyboard();
  const types = Object.entries(TASK_TYPE_LABELS) as [TaskType, string][];

  types.forEach(([type, label], i) => {
    kb.text(label, `task:type:${type}`);
    if (i % 2 === 1) kb.row();
  });

  return kb.row().text("❌ Отмена", "task:cancel");
}

export function executorTypeKeyboard() {
  return new InlineKeyboard()
    .text(EXECUTOR_TYPE_LABELS.DESIGNER, "task:exec:DESIGNER").row()
    .text(EXECUTOR_TYPE_LABELS.TECHNICAL_SPECIALIST, "task:exec:TECHNICAL_SPECIALIST").row()
    .text("❌ Отмена", "task:cancel");
}

export function priorityKeyboard() {
  return new InlineKeyboard()
    .text(PRIORITY_LABELS.LOW, "task:prio:LOW")
    .text(PRIORITY_LABELS.MEDIUM, "task:prio:MEDIUM").row()
    .text(PRIORITY_LABELS.HIGH, "task:prio:HIGH")
    .text(PRIORITY_LABELS.URGENT, "task:prio:URGENT").row()
    .text("❌ Отмена", "task:cancel");
}

export function tagsKeyboard(selected: string[] = []) {
  const kb = new InlineKeyboard();

  AVAILABLE_TAGS.forEach((tag, i) => {
    const isSelected = selected.includes(tag);
    kb.text(`${isSelected ? "✅" : "◻️"} ${tag}`, `task:tag:${tag}`);
    if (i % 3 === 2) kb.row();
  });

  return kb.row()
    .text("✅ Готово", "task:tags:done")
    .text("❌ Отмена", "task:cancel");
}

export function deadlineKeyboard() {
  return new InlineKeyboard()
    .text("Сегодня", "task:dl:today")
    .text("Завтра", "task:dl:tomorrow").row()
    .text("+3 дня", "task:dl:3d")
    .text("+7 дней", "task:dl:7d").row()
    .text("✏️ Ввести вручную", "task:dl:manual").row()
    .text("⏭ Пропустить", "task:dl:skip")
    .text("❌ Отмена", "task:cancel");
}

export function confirmTaskKeyboard() {
  return new InlineKeyboard()
    .text("✅ Создать", "task:confirm")
    .text("❌ Отмена", "task:cancel");
}

// ─── Task Card Actions ─────────────────────────────────────────────────────────

export function taskCardKeyboard(taskId: number, canTake: boolean) {
  const kb = new InlineKeyboard();
  kb.text("🔍 Подробнее", `task:detail:${taskId}`);
  if (canTake) kb.text("✋ Взять", `task:take:${taskId}`);
  return kb;
}

export function taskDetailKeyboard(taskId: number, canTake: boolean) {
  const kb = new InlineKeyboard();
  if (canTake) kb.text("✋ Взять", `task:take:${taskId}`).row();
  kb.text("🔼 Свернуть", `task:collapse:${taskId}`);
  return kb;
}

export function activeTaskKeyboard(
  taskId: number,
  status: TaskStatus,
  isExecutor: boolean,
  isCreator: boolean
) {
  const kb = new InlineKeyboard();

  if (isExecutor) {
    if (status === "IN_PROGRESS") {
      kb.text("📤 На проверку", `task:submit:${taskId}`).row();
    }
    if (status === "REVISION") {
      kb.text("📤 Отправить доработку", `task:resubmit:${taskId}`).row();
    }
    if (status === "IN_PROGRESS" || status === "REVISION") {
      kb.text("❌ Отказаться", `task:release:${taskId}`).row();
    }
  }

  if (isCreator) {
    if (status === "WAITING_APPROVAL") {
      kb.text("✅ Одобрить", `task:approve:${taskId}`)
        .text("🔄 Доработка", `task:revision:${taskId}`).row();
    }
    if (status === "DONE") {
      kb.text("🔒 Закрыть", `task:close:${taskId}`).row();
    }
    if (status !== "DONE" && status !== "CLOSED" && status !== "CANCELLED") {
      kb.text("🗑 Удалить задачу", `task:delete:${taskId}`).row();
    }
  }

  kb.text("📜 История", `task:history:${taskId}`);
  if (status !== "CLOSED" && status !== "CANCELLED") {
    kb.text("💬 Чат", `task:chat:${taskId}`);
  }
  kb.row();
  kb.text("📎 Файлы", `task:files:${taskId}`);
  if (status !== "CLOSED" && status !== "CANCELLED") {
    kb.text("➕ Прикрепить", `task:attach:${taskId}`);
  }

  return kb;
}

// ─── Queue Navigation ──────────────────────────────────────────────────────────

export function queueNavKeyboard(page: number, totalPages: number, executorType: ExecutorType) {
  const kb = new InlineKeyboard();

  if (page > 0) kb.text("◀️", `queue:page:${executorType}:${page - 1}`);
  kb.text(`${page + 1}/${totalPages}`, "noop");
  if (page < totalPages - 1) kb.text("▶️", `queue:page:${executorType}:${page + 1}`);

  kb.row().text("🔄 Обновить", `queue:refresh:${executorType}`);
  return kb;
}

// ─── Invite Creation ───────────────────────────────────────────────────────────

export function inviteRoleKeyboard(actorRole: Role) {
  const kb = new InlineKeyboard();

  const allowed: Role[] = [];
  if (actorRole === "OWNER") {
    allowed.push("HEAD", "TEAM_LEAD", "BUYER", "BUYER_ASSISTANT", "DESIGNER", "TECHNICAL_SPECIALIST");
  } else if (actorRole === "HEAD") {
    allowed.push("TEAM_LEAD", "BUYER", "BUYER_ASSISTANT", "DESIGNER", "TECHNICAL_SPECIALIST");
  } else if (actorRole === "TEAM_LEAD") {
    allowed.push("BUYER", "BUYER_ASSISTANT");
  }

  allowed.forEach((role, i) => {
    kb.text(ROLE_LABELS[role], `invite:role:${role}`);
    if (i % 2 === 1) kb.row();
  });

  return kb.row().text("❌ Отмена", "invite:cancel");
}

// ─── Rating ────────────────────────────────────────────────────────────────────

export function ratingKeyboard() {
  return new InlineKeyboard()
    .text("🎨 Top Designers", "rating:DESIGNER")
    .text("⚙️ Top Tech", "rating:TECHNICAL_SPECIALIST").row()
    .text("🔙 Назад", "menu:main");
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export function statsKeyboard() {
  return new InlineKeyboard()
    .text("📊 Общая статистика", "stats:global").row()
    .text("👥 По командам", "stats:teams").row()
    .text("🏷 По тегам", "stats:tags").row()
    .text("🔙 Назад", "menu:main");
}

// ─── Teams ─────────────────────────────────────────────────────────────────────

export function teamsKeyboard(teams: { id: number; name: string }[]) {
  const kb = new InlineKeyboard();
  teams.forEach((t) => {
    kb.text(`👥 ${t.name}`, `team:view:${t.id}`).row();
  });
  kb.text("🔙 Назад", "menu:main");
  return kb;
}

export function teamActionsKeyboard(teamId: number, canRename: boolean) {
  const kb = new InlineKeyboard();
  if (canRename) kb.text("✏️ Переименовать", `team:rename:${teamId}`).row();
  kb.text("📊 Статистика команды", `stats:team:${teamId}`).row();
  kb.text("🔙 Назад", "teams:list");
  return kb;
}

// ─── Back ──────────────────────────────────────────────────────────────────────

export function backToMenuKeyboard() {
  return new InlineKeyboard().text("🔙 Главное меню", "menu:main");
}

export function confirmKeyboard(yesCallback: string) {
  return new InlineKeyboard()
    .text("✅ Да", yesCallback)
    .text("❌ Нет", "menu:main");
}
