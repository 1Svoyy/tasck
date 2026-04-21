import { Role, TaskStatus, TaskType, ExecutorType, Priority } from "@prisma/client";
import { Context, SessionFlavor } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";

// ─── Session Data ────────────────────────────────────────────────────────────

export interface SessionData {
  step?: string;
  taskDraft?: Partial<TaskDraft>;
  inviteDraft?: Partial<InviteDraft>;
  currentTaskId?: number;
  page?: number;
  filter?: TaskFilter;
}

export interface TaskDraft {
  type: TaskType;
  executorType: ExecutorType;
  priority: Priority;
  title: string;
  description: string;
  tags: string[];
  deadline?: Date;
  files: string[];
  links: string[];
}

export interface InviteDraft {
  role: Role;
  teamId?: number;
}

export interface TaskFilter {
  status?: TaskStatus;
  executorType?: ExecutorType;
  tags?: string[];
  priority?: Priority;
}

// ─── Bot Context ─────────────────────────────────────────────────────────────

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor;

// ─── Constants ───────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "👑 Owner",
  HEAD: "🔝 Head",
  TEAM_LEAD: "🎯 Team Lead",
  BUYER: "💰 Buyer",
  BUYER_ASSISTANT: "🤝 Assistant",
  DESIGNER: "🎨 Designer",
  TECHNICAL_SPECIALIST: "⚙️ Tech Specialist",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "🟡 Открыта",
  IN_PROGRESS: "🔵 В работе",
  WAITING_APPROVAL: "🟠 На проверке",
  REVISION: "🔴 Доработка",
  DONE: "🟢 Выполнена",
  CLOSED: "⚫ Закрыта",
  CANCELLED: "❌ Отменена",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  LANDING: "🌐 Landing",
  PRELANDING: "📄 Prelanding",
  CREATIVES: "🖼 Creatives",
  BANNER: "🎌 Banner",
  VIDEO: "🎥 Video",
  PIXEL_SETUP: "📍 Pixel Setup",
  CLOAKING: "🔒 Cloaking",
  DOMAIN_SETUP: "🌍 Domain Setup",
  HOSTING_SETUP: "🖥 Hosting Setup",
  OTHER: "📦 Other",
};

export const EXECUTOR_TYPE_LABELS: Record<ExecutorType, string> = {
  DESIGNER: "🎨 Designer",
  TECHNICAL_SPECIALIST: "⚙️ Tech Specialist",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "🟢 Low",
  MEDIUM: "🟡 Medium",
  HIGH: "🟠 High",
  URGENT: "🔴 Urgent",
};

export const TASK_TEMPLATES: Record<TaskType, string> = {
  LANDING: "ГЕО:\nВертикаль:\nИсточник:\nОффер:\nРеференс:\nКомментарий:",
  PRELANDING: "ГЕО:\nВертикаль:\nОффер:\nРеференс:\nКомментарий:",
  CREATIVES: "ГЕО:\nВертикаль:\nФормат:\nРазмеры:\nКоличество:\nКомментарий:",
  BANNER: "ГЕО:\nРазмеры:\nТекст:\nКомментарий:",
  VIDEO: "ГЕО:\nФормат:\nДлительность:\nКомментарий:",
  PIXEL_SETUP: "Платформа:\nОффер:\nURL:\nКомментарий:",
  CLOAKING: "Домен:\nТрафик:\nКомментарий:",
  DOMAIN_SETUP: "Домен:\nРегистратор:\nКомментарий:",
  HOSTING_SETUP: "Хостинг:\nДомен:\nКомментарий:",
  OTHER: "Описание:\nКомментарий:",
};

export const AVAILABLE_TAGS = [
  "#landing",
  "#prelanding",
  "#creo",
  "#pixel",
  "#cloak",
  "#hosting",
  "#domain",
  "#fix",
  "#urgent",
];

// ─── Creator Roles ────────────────────────────────────────────────────────────

export const CREATOR_ROLES: Role[] = [
  "HEAD",
  "TEAM_LEAD",
  "BUYER",
  "BUYER_ASSISTANT",
];

export const EXECUTOR_ROLES: Role[] = ["DESIGNER", "TECHNICAL_SPECIALIST"];

export const MANAGER_ROLES: Role[] = ["OWNER", "HEAD", "TEAM_LEAD"];

export const INVITE_CREATOR_ROLES: Role[] = ["OWNER", "HEAD", "TEAM_LEAD"];

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGE_SIZE = 5;
