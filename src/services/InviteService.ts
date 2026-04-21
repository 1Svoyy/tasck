import { Role } from "@prisma/client";
import { customAlphabet } from "nanoid";
import prisma from "../db/client.js";
import dayjs from "dayjs";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export class InviteService {
  async create(params: {
    createdById: number;
    role: Role;
    teamId?: number;
    expiresInHours?: number;
  }) {
    const code = nanoid();
    const expiresAt = params.expiresInHours
      ? dayjs().add(params.expiresInHours, "hour").toDate()
      : dayjs().add(48, "hour").toDate();

    return prisma.invite.create({
      data: {
        code,
        role: params.role,
        teamId: params.teamId,
        createdById: params.createdById,
        expiresAt,
      },
    });
  }

  async findByCode(code: string) {
    return prisma.invite.findUnique({ where: { code } });
  }

  async use(code: string, userId: number) {
    const invite = await this.findByCode(code);

    if (!invite) throw new Error("Инвайт не найден.");
    if (invite.usedById) throw new Error("Инвайт уже использован.");
    if (invite.expiresAt && dayjs().isAfter(invite.expiresAt)) {
      throw new Error("Инвайт истёк.");
    }

    await prisma.invite.update({
      where: { code },
      data: { usedById: userId, usedAt: new Date() },
    });

    return invite;
  }

  async listByCreator(createdById: number) {
    return prisma.invite.findMany({
      where: { createdById },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  formatInviteLink(code: string): string {
    return `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?start=${code}`;
  }
}

export const inviteService = new InviteService();
