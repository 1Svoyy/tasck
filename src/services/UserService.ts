import { Role, User, Team } from "@prisma/client";
import prisma from "../db/client.js";

export class UserService {
  async findByTelegramId(tgId: bigint) {
    return prisma.user.findUnique({
      where: { telegramId: tgId },
      include: { team: true, ledTeam: true },
    });
  }

  async findById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: { team: true, ledTeam: true },
    });
  }

  async create(data: {
    telegramId: bigint; username?: string; firstName: string;
    lastName?: string; role: Role; teamId?: number;
  }) {
    return prisma.user.create({ data, include: { team: true } });
  }

  async deactivate(id: number) {
    return prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: number) {
    return prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  async moveToTeam(userId: number, teamId: number | null) {
    return prisma.user.update({
      where: { id: userId },
      data: { teamId },
    });
  }

  async getAll(activeOnly = false) {
    return prisma.user.findMany({
      where: activeOnly ? { isActive: true } : {},
      include: { team: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async getActiveExecutors(type: "DESIGNER" | "TECHNICAL_SPECIALIST") {
    return prisma.user.findMany({
      where: { role: type, isActive: true },
    });
  }

  async getAllTeams() {
    return prisma.team.findMany({
      include: { teamLead: true, members: { where: { isActive: true } } },
    });
  }

  async createTeam(name: string, teamLeadId: number) {
    return prisma.team.create({ data: { name, teamLeadId } });
  }

  async updateTeamName(teamId: number, name: string) {
    return prisma.team.update({ where: { id: teamId }, data: { name } });
  }

  async getTeamByLeadId(leadId: number) {
    return prisma.team.findUnique({ where: { teamLeadId: leadId } });
  }

  // ─── Permission helpers ──────────────────────────────────────────────────────

  isAdmin(role: Role) { return role === "OWNER" || role === "HEAD"; }
  isManager(role: Role) { return ["OWNER", "HEAD", "TEAM_LEAD"].includes(role); }
  isExecutor(role: Role) { return role === "DESIGNER" || role === "TECHNICAL_SPECIALIST"; }
  canCreateTask(role: Role) { return ["HEAD", "TEAM_LEAD", "BUYER", "BUYER_ASSISTANT"].includes(role); }
  canInvite(role: Role) { return ["OWNER", "HEAD", "TEAM_LEAD"].includes(role); }

  canManageTask(userRole: Role, userId: number, task: { creatorId: number }) {
    if (this.isAdmin(userRole)) return true;
    return task.creatorId === userId;
  }
}

export const userService = new UserService();
