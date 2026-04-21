import dayjs from "dayjs";
import {
  Role,
  Task,
  TaskTag,
  User,
  Team,
  TaskHistory,
  Priority,
  ExecutorType,
  TaskStatus,
} from "@prisma/client";
import {
  STATUS_LABELS,
  TASK_TYPE_LABELS,
  PRIORITY_LABELS,
  EXECUTOR_TYPE_LABELS,
  ROLE_LABELS,
} from "../types/index.js";

type TaskWithRelations = Task & {
  tags: TaskTag[];
  creator: User & { ledTeam?: Team | null; team?: Team | null };
  executor?: User | null;
  team?: Team | null;
};

type TaskHistoryWithUser = TaskHistory & { user: User };

export function formatTaskCard(task: TaskWithRelations): string {
  const status = STATUS_LABELS[task.status];
  const type = TASK_TYPE_LABELS[task.type];
  const priority = PRIORITY_LABELS[task.priority];
  const executor = EXECUTOR_TYPE_LABELS[task.executorType];
  const tags = task.tags.map((t) => t.tag).join(" ");

  const creatorRole = ROLE_LABELS[task.creator.role];
  const creatorName = task.creator.firstName;
  const teamName = task.team?.name || task.creator.team?.name || "—";

  const isAssistant = task.creator.role === "BUYER_ASSISTANT";
  const parentInfo = isAssistant
    ? `👤 Assistant (${creatorName}) | Team: ${teamName}`
    : `👤 ${creatorRole} | ${creatorName} | Team: ${teamName}`;

  let text =
    `${status}\n` +
    `${executor}\n\n` +
    `<b>${escapeHtml(task.title)}</b>\n` +
    (tags ? `${tags}\n` : "") +
    `\n${parentInfo}\n` +
    `Приоритет: ${priority}\n`;

  if (task.deadline) {
    const dl = dayjs(task.deadline);
    const isOverdue = dl.isBefore(dayjs()) && task.status !== "DONE" && task.status !== "CLOSED";
    text += `⏰ Дедлайн: ${dl.format("DD.MM.YYYY HH:mm")}${isOverdue ? " ⚠️ ПРОСРОЧЕНО" : ""}\n`;
  }

  if (task.executor) {
    text += `\n👨‍💻 Исполнитель: ${task.executor.firstName}`;
  }

  return text;
}

export function formatTaskDetail(task: TaskWithRelations): string {
  let text = formatTaskCard(task);

  if (task.description) {
    text += `\n\n📝 <b>Описание:</b>\n${escapeHtml(task.description)}`;
  }

  if (task.links.length > 0) {
    text += `\n\n🔗 <b>Ссылки:</b>\n${task.links.map((l) => `• ${l}`).join("\n")}`;
  }

  if (task.files.length > 0) {
    text += `\n\n📎 Файлов: ${task.files.length}`;
  }

  text += `\n\n🆔 #task${task.id}`;

  return text;
}

export function formatTaskHistory(history: TaskHistoryWithUser[]): string {
  if (history.length === 0) return "История пуста.";

  const lines = history.map((h) => {
    const time = dayjs(h.createdAt).format("HH:mm DD.MM");
    const name = h.user.firstName;
    const comment = h.comment ? ` — ${h.comment}` : "";
    return `${time} ${h.action} <i>${name}</i>${comment}`;
  });

  return `📋 <b>История задачи:</b>\n\n${lines.join("\n")}`;
}

export function formatUserInfo(user: User & { team?: Team | null }): string {
  const role = ROLE_LABELS[user.role];
  const team = user.team?.name ? ` | Team: ${user.team.name}` : "";
  return `${role} | ${user.firstName}${team}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDeadline(date: Date): string {
  return dayjs(date).format("DD.MM.YYYY HH:mm");
}

export function getCurrentPeriod(): string {
  return dayjs().format("YYYY-MM");
}

export function calcScore(params: {
  completedTasks: number;
  cancelledTasks: number;
  revisionCount: number;
  overdueCount: number;
  avgTimeHours: number | null;
}): number {
  const { completedTasks, cancelledTasks, revisionCount, overdueCount, avgTimeHours } = params;
  let score = completedTasks * 10;
  score -= cancelledTasks * 5;
  score -= revisionCount * 2;
  score -= overdueCount * 3;
  if (avgTimeHours && avgTimeHours < 24) score += 5;
  return Math.max(0, score);
}
