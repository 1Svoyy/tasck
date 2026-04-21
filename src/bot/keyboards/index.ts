import { InlineKeyboard, Keyboard } from "grammy";
import {
  TaskType, ExecutorType, Priority, Role, TaskStatus,
} from "@prisma/client";
import {
  TASK_TYPE_LABELS, EXECUTOR_TYPE_LABELS, PRIORITY_LABELS,
  ROLE_LABELS, AVAILABLE_TAGS,
} from "../../types/index.js";

// ─── Persistent Bottom Menu ──────────────────────────────────────────────────

export function persistentMenu(role: Role): Keyboard {
  const kb = new Keyboard();
  const isCreator = ["HEAD", "TEAM_LEAD", "BUYER", "BUYER_ASSISTANT"].includes(role);
  const isExecutor = ["DESIGNER", "TECHNICAL_SPECIALIST"].includes(role);
  const isAdmin = ["OWNER", "HEAD"].includes(role);
  const isManager = ["OWNER", "HEAD", "TEAM_LEAD"].includes(role);

  if (isCreator) {
    kb.text("➕ Новая задача").text("📋 Мои задачи").row();
  }
  if (isExecutor) {
    kb.text("📋 Очередь").text("📌 В работе").row();
    kb.text("📊 Статистика").text("🏆 Рейтинг").row();
  }
  if (isAdmin) {
    kb.text("📋 Все задачи").text("📊 Статистика").row();
  }
  if (isManager) {
    kb.text("👥 Команда").text("🔗 Инвайт").row();
  }
  if (isAdmin) {
    kb.text("📢 Рассылка").row();
  }
  return kb.resized().persistent();
}

// ─── Task Creation ─────────────────────────────────────────────────────────────

export function taskTypeKb() {
  const kb = new InlineKeyboard();
  const types = Object.entries(TASK_TYPE_LABELS) as [TaskType, string][];
  types.forEach(([t, label], i) => {
    kb.text(label, `tc:type:${t}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text("❌ Отмена", "tc:cancel");
}

export function executorTypeKb() {
  return new InlineKeyboard()
    .text("🎨 Designer", "tc:exec:DESIGNER")
    .text("⚙️ Tech", "tc:exec:TECHNICAL_SPECIALIST").row()
    .text("❌ Отмена", "tc:cancel");
}

export function priorityKb() {
  return new InlineKeyboard()
    .text("🟢 Low", "tc:prio:LOW").text("🟡 Medium", "tc:prio:MEDIUM").row()
    .text("🟠 High", "tc:prio:HIGH").text("🔴 Urgent", "tc:prio:URGENT").row()
    .text("❌ Отмена", "tc:cancel");
}

export function tagsKb(selected: string[] = []) {
  const kb = new InlineKeyboard();
  AVAILABLE_TAGS.forEach((tag, i) => {
    kb.text(`${selected.includes(tag) ? "✅" : "◻️"} ${tag}`, `tc:tag:${tag}`);
    if (i % 3 === 2) kb.row();
  });
  return kb.row().text("✅ Готово", "tc:tags:done").text("❌ Отмена", "tc:cancel");
}

export function deadlineKb() {
  return new InlineKeyboard()
    .text("Сегодня", "tc:dl:today").text("Завтра", "tc:dl:tomorrow").row()
    .text("+3 дня", "tc:dl:3d").text("+7 дней", "tc:dl:7d").row()
    .text("⏭ Без дедлайна", "tc:dl:skip").text("❌ Отмена", "tc:cancel");
}

export function confirmCreateKb() {
  return new InlineKeyboard()
    .text("✅ Создать", "tc:confirm")
    .text("❌ Отмена", "tc:cancel");
}

// ─── Task Actions ──────────────────────────────────────────────────────────────

export function taskCardKb(taskId: number, canTake: boolean) {
  const kb = new InlineKeyboard().text("🔍 Открыть", `t:open:${taskId}`);
  if (canTake) kb.text("✋ Взять", `t:take:${taskId}`);
  return kb;
}

export function taskActionsKb(
  taskId: number,
  status: TaskStatus,
  isExecutor: boolean,
  canManage: boolean,
) {
  const kb = new InlineKeyboard();

  if (isExecutor && status === "IN_PROGRESS") {
    kb.text("📤 Готово — на проверку", `t:submit:${taskId}`).row();
  }
  if (isExecutor && status === "REVISION") {
    kb.text("📤 Исправлено — на проверку", `t:resubmit:${taskId}`).row();
  }
  if (isExecutor && (status === "IN_PROGRESS" || status === "REVISION")) {
    kb.text("↩️ Отказаться", `t:release:${taskId}`).row();
  }
  if (canManage && status === "WAITING_APPROVAL") {
    kb.text("✅ Принять", `t:approve:${taskId}`)
      .text("🔄 Доработать", `t:revision:${taskId}`).row();
  }
  if (canManage && status !== "CLOSED" && status !== "CANCELLED" && status !== "DONE") {
    kb.text("🗑 Удалить", `t:delete:${taskId}`).row();
  }

  // Always show
  kb.text("💬 Чат", `t:chat:${taskId}`)
    .text("📎 Файлы", `t:files:${taskId}`).row();
  kb.text("📜 История", `t:history:${taskId}`);

  return kb;
}

// Inline approve buttons sent in notification
export function approveNotifyKb(taskId: number) {
  return new InlineKeyboard()
    .text("✅ Принять", `t:approve:${taskId}`)
    .text("🔄 Доработать", `t:revision:${taskId}`);
}

// ─── Team & Staff ──────────────────────────────────────────────────────────────

export function teamMenuKb(
  teams: { id: number; name: string }[],
  showInvite: boolean,
) {
  const kb = new InlineKeyboard();
  teams.forEach((t) => kb.text(`📁 ${t.name}`, `team:expand:${t.id}`).row());

  // Staff without team
  kb.text("👤 Без команды", "team:noteam").row();
  if (showInvite) kb.text("🔗 Создать инвайт", "invite:create").row();
  return kb;
}

export function memberKb(userId: number, isActive: boolean, teams: { id: number; name: string }[]) {
  const kb = new InlineKeyboard();
  if (isActive) {
    kb.text("🚫 Деактивировать", `staff:off:${userId}`).row();
  } else {
    kb.text("✅ Активировать", `staff:on:${userId}`).row();
  }
  if (teams.length > 0) {
    kb.text("🔀 Переместить", `staff:move:${userId}`).row();
  }
  kb.text("🔙 Назад", "team:back");
  return kb;
}

export function moveTeamKb(userId: number, teams: { id: number; name: string }[]) {
  const kb = new InlineKeyboard();
  teams.forEach((t) => kb.text(t.name, `staff:moveto:${userId}:${t.id}`).row());
  kb.text("➖ Убрать из команды", `staff:moveto:${userId}:0`).row();
  kb.text("🔙 Отмена", `staff:view:${userId}`);
  return kb;
}

// ─── Invite ────────────────────────────────────────────────────────────────────

export function inviteRoleKb(actorRole: Role) {
  const kb = new InlineKeyboard();
  const allowed: Role[] = [];
  if (actorRole === "OWNER")
    allowed.push("HEAD", "TEAM_LEAD", "BUYER", "BUYER_ASSISTANT", "DESIGNER", "TECHNICAL_SPECIALIST");
  else if (actorRole === "HEAD")
    allowed.push("TEAM_LEAD", "BUYER", "BUYER_ASSISTANT", "DESIGNER", "TECHNICAL_SPECIALIST");
  else if (actorRole === "TEAM_LEAD")
    allowed.push("BUYER", "BUYER_ASSISTANT");

  allowed.forEach((r, i) => {
    kb.text(ROLE_LABELS[r], `invite:role:${r}`);
    if (i % 2 === 1) kb.row();
  });
  return kb.row().text("❌ Отмена", "team:back");
}

// ─── Queue ─────────────────────────────────────────────────────────────────────

export function queueNavKb(page: number, totalPages: number, executorType: ExecutorType) {
  const kb = new InlineKeyboard();
  if (page > 0) kb.text("◀️", `q:page:${executorType}:${page - 1}`);
  kb.text(`${page + 1}/${totalPages}`, "noop");
  if (page < totalPages - 1) kb.text("▶️", `q:page:${executorType}:${page + 1}`);
  kb.row().text("🔄 Обновить", `q:refresh:${executorType}`);
  return kb;
}

// ─── Rating ────────────────────────────────────────────────────────────────────

export function ratingKb() {
  return new InlineKeyboard()
    .text("🎨 Designers", "rating:DESIGNER")
    .text("⚙️ Tech", "rating:TECHNICAL_SPECIALIST");
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export function statsKb() {
  return new InlineKeyboard()
    .text("📊 Общая", "stats:global").text("👥 Команды", "stats:teams").row()
    .text("🏷 Теги", "stats:tags");
}

// ─── All Tasks Filter ──────────────────────────────────────────────────────────

export function allTasksFilterKb() {
  return new InlineKeyboard()
    .text("🟡 Открытые", "at:OPEN").text("🔵 В работе", "at:IN_PROGRESS").row()
    .text("🟠 На проверке", "at:WAITING_APPROVAL").text("🔴 Доработка", "at:REVISION").row()
    .text("🟢 Выполнено", "at:DONE").text("📋 Все", "at:ALL").row();
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function backKb(callback = "menu:main") {
  return new InlineKeyboard().text("🔙 Назад", callback);
}

export function confirmKb(yesCallback: string) {
  return new InlineKeyboard().text("✅ Да", yesCallback).text("❌ Нет", "menu:main");
}
