import cron from "node-cron";
import { Bot } from "grammy";
import prisma from "../db/client.js";
import { BotContext } from "../types/index.js";
import dayjs from "dayjs";
import { getCurrentPeriod } from "../utils/formatters.js";

/**
 * Scheduled jobs:
 * - every 15 min: scan for overdue tasks, notify + increment overdue counter
 * - every hour: soft warning for tasks due in < 2h
 */
export class DeadlineService {
  constructor(private bot: Bot<BotContext>) {}

  start() {
    // Check overdue every 15 min
    cron.schedule("*/15 * * * *", async () => {
      try {
        await this.checkOverdue();
      } catch (err) {
        console.error("[cron] overdue check failed:", err);
      }
    });

    // Check approaching every hour
    cron.schedule("0 * * * *", async () => {
      try {
        await this.checkApproaching();
      } catch (err) {
        console.error("[cron] approaching check failed:", err);
      }
    });

    console.log("⏰ Deadline cron jobs started");
  }

  /**
   * Tasks that crossed the deadline and are still active.
   * Sends one notification, marks as notified via a temporary flag in history.
   */
  async checkOverdue() {
    const tasks = await prisma.task.findMany({
      where: {
        deadline: { lt: new Date() },
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_APPROVAL", "REVISION"] },
      },
      include: { creator: true, executor: true, history: true },
    });

    for (const task of tasks) {
      // Skip if already notified
      const alreadyNotified = task.history.some((h) => h.action === "просрочено");
      if (alreadyNotified) continue;

      const msg =
        `⚠️ <b>Задача #${task.id} просрочена!</b>\n\n` +
        `<b>${task.title}</b>\n` +
        `Дедлайн был: ${dayjs(task.deadline!).format("DD.MM.YYYY HH:mm")}`;

      // Notify creator
      try {
        await this.bot.api.sendMessage(Number(task.creator.telegramId), msg, {
          parse_mode: "HTML",
        });
      } catch {}

      // Notify executor
      if (task.executor) {
        try {
          await this.bot.api.sendMessage(Number(task.executor.telegramId), msg, {
            parse_mode: "HTML",
          });
        } catch {}

        // Update rating overdue counter
        const period = getCurrentPeriod();
        await prisma.rating.upsert({
          where: { userId_period: { userId: task.executor.id, period } },
          create: { userId: task.executor.id, period, overdueCount: 1 },
          update: { overdueCount: { increment: 1 } },
        });
      }

      // Log
      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          userId: task.creator.id,
          action: "просрочено",
        },
      });
    }
  }

  /**
   * Soft reminder for tasks due in next 2 hours (only once).
   */
  async checkApproaching() {
    const in2h = dayjs().add(2, "hour").toDate();
    const now = new Date();

    const tasks = await prisma.task.findMany({
      where: {
        deadline: { gt: now, lt: in2h },
        status: { in: ["IN_PROGRESS", "REVISION"] },
      },
      include: { executor: true, history: true },
    });

    for (const task of tasks) {
      const alreadyWarned = task.history.some((h) => h.action === "дедлайн_скоро");
      if (alreadyWarned || !task.executor) continue;

      try {
        await this.bot.api.sendMessage(
          Number(task.executor.telegramId),
          `🔔 <b>Напоминание: задача #${task.id}</b>\n\n` +
            `<b>${task.title}</b>\n` +
            `⏰ Дедлайн через ${dayjs(task.deadline!).diff(dayjs(), "minute")} минут`,
          { parse_mode: "HTML" }
        );
      } catch {}

      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          userId: task.executor.id,
          action: "дедлайн_скоро",
        },
      });
    }
  }
}
