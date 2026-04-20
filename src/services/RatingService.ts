import prisma from "../db/client.js";
import { ExecutorType } from "@prisma/client";
import { getCurrentPeriod, calcScore } from "../utils/formatters.js";

export class RatingService {
  async getTopExecutors(executorType: ExecutorType, period?: string) {
    const p = period || getCurrentPeriod();

    const ratings = await prisma.rating.findMany({
      where: {
        period: p,
        user: { role: executorType },
      },
      include: { user: true },
      orderBy: { score: "desc" },
      take: 10,
    });

    // Recalculate scores for display
    return ratings.map((r) => ({
      ...r,
      score: calcScore({
        completedTasks: r.completedTasks,
        cancelledTasks: r.cancelledTasks,
        revisionCount: r.revisionCount,
        overdueCount: r.overdueCount,
        avgTimeHours: r.avgTimeHours,
      }),
    }));
  }

  async getUserStats(userId: number, period?: string) {
    const p = period || getCurrentPeriod();
    return prisma.rating.findUnique({
      where: { userId_period: { userId, period: p } },
      include: { user: true },
    });
  }

  formatRatingBoard(
    title: string,
    entries: Array<{ user: { firstName: string }; score: number; completedTasks: number; avgTimeHours: number | null }>
  ): string {
    if (entries.length === 0) return `${title}\n\nДанных пока нет.`;

    const medals = ["🥇", "🥈", "🥉"];
    const lines = entries.map((e, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const avg = e.avgTimeHours ? ` | avg: ${e.avgTimeHours.toFixed(1)}h` : "";
      return `${medal} ${e.user.firstName} — ${e.completedTasks} задач | ${e.score} pts${avg}`;
    });

    return `${title}\n\n${lines.join("\n")}`;
  }

  async recalcAllScores(period?: string) {
    const p = period || getCurrentPeriod();
    const ratings = await prisma.rating.findMany({ where: { period: p } });

    for (const r of ratings) {
      const score = calcScore({
        completedTasks: r.completedTasks,
        cancelledTasks: r.cancelledTasks,
        revisionCount: r.revisionCount,
        overdueCount: r.overdueCount,
        avgTimeHours: r.avgTimeHours,
      });
      await prisma.rating.update({ where: { id: r.id }, data: { score } });
    }
  }
}

export const ratingService = new RatingService();
