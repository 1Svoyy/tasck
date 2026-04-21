import { TaskStatus, ExecutorType, Prisma } from "@prisma/client";
import prisma from "../db/client.js";
import { TaskDraft, TaskFilter, PAGE_SIZE } from "../types/index.js";
import { getCurrentPeriod } from "../utils/formatters.js";
import dayjs from "dayjs";

export class TaskService {
  async create(creatorId: number, draft: TaskDraft, teamId?: number) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: draft.title,
          description: draft.description || null,
          type: draft.type, executorType: draft.executorType,
          priority: draft.priority, deadline: draft.deadline || null,
          files: draft.files, links: draft.links,
          creatorId, teamId: teamId || null,
          tags: { create: draft.tags.map((tag) => ({ tag })) },
        },
        include: { tags: true, creator: { include: { team: true } }, team: true },
      });
      await tx.taskHistory.create({ data: { taskId: task.id, userId: creatorId, action: "создана" } });
      return task;
    });
  }

  async findById(id: number) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        tags: true,
        creator: { include: { team: true, ledTeam: true } },
        executor: true, team: true,
        history: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });
  }

  async getQueue(executorType: ExecutorType, page = 0) {
    const where: Prisma.TaskWhereInput = { executorType, status: "OPEN" };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where, include: { tags: true, creator: { include: { team: true } }, team: true },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip: page * PAGE_SIZE, take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);
    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) || 1 };
  }

  async getQueueCount(executorType: ExecutorType) {
    return prisma.task.count({ where: { executorType, status: "OPEN" } });
  }

  async getAllTasks(filter?: { status?: TaskStatus }, page = 0) {
    const where: Prisma.TaskWhereInput = {};
    if (filter?.status) where.status = filter.status;
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where, include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
        orderBy: { createdAt: "desc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);
    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) || 1 };
  }

  async getMyActiveTasks(executorId: number, page = 0) {
    const where: Prisma.TaskWhereInput = {
      executorId, status: { in: ["IN_PROGRESS", "WAITING_APPROVAL", "REVISION"] },
    };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where, include: { tags: true, creator: { include: { team: true } }, team: true },
        orderBy: { updatedAt: "desc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);
    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) || 1 };
  }

  async getCreatedTasks(creatorId: number, page = 0) {
    const where: Prisma.TaskWhereInput = { creatorId };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where, include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
        orderBy: { createdAt: "desc" }, skip: page * PAGE_SIZE, take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);
    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) || 1 };
  }

  // ─── State Machine ─────────────────────────────────────────────────────────

  async take(taskId: number, executorId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "OPEN") throw new Error("Задача уже занята.");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: "IN_PROGRESS", executorId },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId: executorId, action: "взята в работу" } });
      await this._incRating(executorId, "totalTasks", tx);
      return updated;
    });
  }

  async submit(taskId: number, executorId: number) {
    return this._transition(taskId, executorId, ["IN_PROGRESS"], "WAITING_APPROVAL", "отправлена на проверку");
  }

  async resubmit(taskId: number, executorId: number) {
    return this._transition(taskId, executorId, ["REVISION"], "WAITING_APPROVAL", "доработка отправлена");
  }

  /** Approve = auto-close. No separate DONE→CLOSED step. */
  async approve(taskId: number, reviewerId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "WAITING_APPROVAL") throw new Error("Неверный статус.");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: "CLOSED", closedAt: new Date() },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId: reviewerId, action: "принята и закрыта" } });
      if (updated.executorId) {
        await this._incRating(updated.executorId, "completedTasks", tx);
        await this._updateAvgTime(updated.executorId, updated, tx);
      }
      return updated;
    });
  }

  async revision(taskId: number, reviewerId: number, comment?: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "WAITING_APPROVAL") throw new Error("Неверный статус.");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: "REVISION" },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId: reviewerId, action: "на доработку", comment } });
      if (updated.executorId) await this._incRating(updated.executorId, "revisionCount", tx);
      return updated;
    });
  }

  async release(taskId: number, executorId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Не найдена.");
    if (task.executorId !== executorId) throw new Error("Вы не исполнитель.");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: "OPEN", executorId: null },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId: executorId, action: "отказ от задачи" } });
      await this._incRating(executorId, "cancelledTasks", tx);
      return updated;
    });
  }

  async cancel(taskId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: "CANCELLED" },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId, action: "удалена" } });
      return updated;
    });
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  async addMessage(taskId: number, userId: number, message: string) {
    return prisma.taskMessage.create({ data: { taskId, userId, message }, include: { user: true } });
  }

  async getMessages(taskId: number) {
    return prisma.taskMessage.findMany({ where: { taskId }, include: { user: true }, orderBy: { createdAt: "asc" } });
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  async getGlobalStats() {
    const [total, byStatus, byTag, byType] = await Promise.all([
      prisma.task.count(),
      prisma.task.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.taskTag.groupBy({ by: ["tag"], _count: { id: true }, orderBy: { _count: { id: "desc" } } }),
      prisma.task.groupBy({ by: ["type"], _count: { id: true } }),
    ]);
    return { total, byStatus, byTag, byType };
  }

  async getTeamStats(teamId: number) {
    return prisma.task.groupBy({ by: ["status"], where: { teamId }, _count: { id: true } });
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _transition(taskId: number, userId: number, from: TaskStatus[], to: TaskStatus, action: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Не найдена.");
    if (!from.includes(task.status)) throw new Error("Неверный статус.");
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId }, data: { status: to },
        include: { tags: true, creator: { include: { team: true } }, executor: true, team: true },
      });
      await tx.taskHistory.create({ data: { taskId, userId, action } });
      return updated;
    });
  }

  private async _incRating(userId: number, field: string, tx: Prisma.TransactionClient) {
    const period = getCurrentPeriod();
    await tx.rating.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }

  private async _updateAvgTime(userId: number, task: { createdAt: Date; closedAt: Date | null }, tx: Prisma.TransactionClient) {
    if (!task.closedAt) return;
    const hours = dayjs(task.closedAt).diff(dayjs(task.createdAt), "hour", true);
    const period = getCurrentPeriod();
    const rating = await tx.rating.findUnique({ where: { userId_period: { userId, period } } });
    const count = rating?.completedTasks ?? 1;
    const prev = rating?.avgTimeHours ?? hours;
    const avg = (prev * (count - 1) + hours) / count;
    await tx.rating.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, avgTimeHours: avg },
      update: { avgTimeHours: avg },
    });
  }
}

export const taskService = new TaskService();
