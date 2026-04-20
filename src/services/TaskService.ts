import {
  TaskStatus,
  TaskType,
  ExecutorType,
  Priority,
  Prisma,
} from "@prisma/client";
import prisma from "../db/client.js";
import { TaskDraft, TaskFilter, PAGE_SIZE } from "../types/index.js";
import { getCurrentPeriod, calcScore } from "../utils/formatters.js";
import dayjs from "dayjs";

export class TaskService {
  // ─── Create ────────────────────────────────────────────────────────────────

  async create(creatorId: number, draft: TaskDraft, teamId?: number) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: draft.title,
          description: draft.description || null,
          type: draft.type,
          executorType: draft.executorType,
          priority: draft.priority,
          deadline: draft.deadline || null,
          files: draft.files,
          links: draft.links,
          creatorId,
          teamId: teamId || null,
          tags: {
            create: draft.tags.map((tag) => ({ tag })),
          },
        },
        include: {
          tags: true,
          creator: { include: { team: true, ledTeam: true } },
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: {
          taskId: task.id,
          userId: creatorId,
          action: "создана",
        },
      });

      return task;
    });
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async findById(id: number) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        tags: true,
        creator: { include: { team: true, ledTeam: true } },
        executor: true,
        team: true,
        history: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });
  }

  async getQueue(executorType: ExecutorType, filter?: TaskFilter, page = 0) {
    const where: Prisma.TaskWhereInput = {
      executorType,
      status: "OPEN",
    };

    if (filter?.priority) where.priority = filter.priority;
    if (filter?.tags?.length) {
      where.tags = { some: { tag: { in: filter.tags } } };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          tags: true,
          creator: { include: { team: true } },
          team: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async getMyActiveTasks(executorId: number, page = 0) {
    const where: Prisma.TaskWhereInput = {
      executorId,
      status: { in: ["IN_PROGRESS", "WAITING_APPROVAL", "REVISION"] },
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          tags: true,
          creator: { include: { team: true } },
          team: true,
        },
        orderBy: { updatedAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async getMyCompletedTasks(executorId: number, page = 0) {
    const where: Prisma.TaskWhereInput = {
      executorId,
      status: { in: ["DONE", "CLOSED"] },
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: { tags: true, creator: { include: { team: true } }, team: true },
        orderBy: { closedAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async getCreatedTasks(
    creatorId: number,
    filter?: { status?: TaskStatus },
    page = 0
  ) {
    const where: Prisma.TaskWhereInput = { creatorId };
    if (filter?.status) where.status = filter.status;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
        orderBy: { createdAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  async getTeamTasks(teamId: number, filter?: { status?: TaskStatus }, page = 0) {
    const where: Prisma.TaskWhereInput = { teamId };
    if (filter?.status) where.status = filter.status;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
        orderBy: { createdAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, pages: Math.ceil(total / PAGE_SIZE) };
  }

  // ─── Status Transitions ────────────────────────────────────────────────────

  async take(taskId: number, executorId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "OPEN") throw new Error("Задача уже занята.");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS", executorId },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId: executorId, action: "взята в работу" },
      });

      await this._updateRating(executorId, "totalTasks", 1, tx);

      return updated;
    });
  }

  async submitForApproval(taskId: number, executorId: number) {
    return this._transition(taskId, executorId, "IN_PROGRESS", "WAITING_APPROVAL", "отправлена на проверку");
  }

  async approve(taskId: number, reviewerId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "WAITING_APPROVAL") throw new Error("Неверный статус.");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: "DONE", closedAt: new Date() },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId: reviewerId, action: "одобрена" },
      });

      if (updated.executorId) {
        await this._updateRating(updated.executorId, "completedTasks", 1, tx);
        await this._updateAvgTime(updated.executorId, updated, tx);
      }

      return updated;
    });
  }

  async requestRevision(taskId: number, reviewerId: number, comment?: string) {
    return this._transition(taskId, reviewerId, "WAITING_APPROVAL", "REVISION", "отправлена на доработку", comment);
  }

  async submitRevision(taskId: number, executorId: number) {
    return this._transition(taskId, executorId, "REVISION", "WAITING_APPROVAL", "доработка отправлена на проверку");
  }

  async close(taskId: number, closerId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== "DONE") throw new Error("Задача должна быть в статусе DONE.");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: "CLOSED", closedAt: new Date() },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId: closerId, action: "закрыта" },
      });

      return updated;
    });
  }

  async cancelByExecutor(taskId: number, executorId: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.executorId !== executorId) throw new Error("Вы не исполнитель.");

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: "OPEN", executorId: null },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId: executorId, action: "отменена исполнителем" },
      });

      await this._updateRating(executorId, "cancelledTasks", 1, tx);

      return updated;
    });
  }

  async cancelByCreator(taskId: number, creatorId: number) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: "CANCELLED" },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId: creatorId, action: "удалена заказчиком" },
      });

      return updated;
    });
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  async addMessage(taskId: number, userId: number, message: string, fileUrl?: string) {
    return prisma.taskMessage.create({
      data: { taskId, userId, message, fileUrl },
      include: { user: true },
    });
  }

  async getMessages(taskId: number) {
    return prisma.taskMessage.findMany({
      where: { taskId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
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
    return prisma.task.groupBy({
      by: ["status"],
      where: { teamId },
      _count: { id: true },
    });
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _transition(
    taskId: number,
    userId: number,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
    action: string,
    comment?: string
  ) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Задача не найдена.");
    if (task.status !== fromStatus) throw new Error(`Ожидается статус ${fromStatus}.`);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status: toStatus },
        include: {
          tags: true,
          creator: { include: { team: true } },
          executor: true,
          team: true,
        },
      });

      await tx.taskHistory.create({
        data: { taskId, userId, action, comment },
      });

      return updated;
    });
  }

  private async _updateRating(
    userId: number,
    field: "totalTasks" | "completedTasks" | "cancelledTasks" | "revisionCount" | "overdueCount",
    increment: number,
    tx: Prisma.TransactionClient
  ) {
    const period = getCurrentPeriod();
    await tx.rating.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, [field]: increment },
      update: { [field]: { increment } },
    });
  }

  private async _updateAvgTime(
    userId: number,
    task: { createdAt: Date; closedAt: Date | null },
    tx: Prisma.TransactionClient
  ) {
    if (!task.closedAt) return;
    const hours = dayjs(task.closedAt).diff(dayjs(task.createdAt), "hour", true);
    const period = getCurrentPeriod();

    const rating = await tx.rating.findUnique({
      where: { userId_period: { userId, period } },
    });

    const prevAvg = rating?.avgTimeHours ?? hours;
    const count = rating?.completedTasks ?? 1;
    const newAvg = (prevAvg * (count - 1) + hours) / count;

    await tx.rating.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, avgTimeHours: newAvg },
      update: { avgTimeHours: newAvg },
    });
  }
}

export const taskService = new TaskService();
