import { Role, User, Team } from "@prisma/client";
import prisma from "../db/client.js";
import { CREATOR_ROLES, EXECUTOR_ROLES, MANAGER_ROLES } from "../types/index.js";

export class UserService {
  async findByTelegramId(telegramId: bigint) {
    return prisma.user.findUnique({
      where: { telegramId },
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
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    role: Role;
    teamId?: number;
  }) {
    return prisma.user.create({
      data,
      include: { team: true },
    });
  }

  async update(id: number, data: Partial<User>) {
    return prisma.user.update({ where: { id }, data });
  }

  async deactivate(id: number) {
    return prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: number) {
    return prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  async getAll() {
    return prisma.user.findMany({
      include: { team: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async getExecutors(type: "DESIGNER" | "TECHNICAL_SPECIALIST") {
    return prisma.user.findMany({
      where: { role: type, isActive: true },
    });
  }

  async getAllTeams() {
    return prisma.team.findMany({
      include: { teamLead: true, members: true },
    });
  }

  async createTeam(name: string, teamLeadId: number) {
    return prisma.team.create({
      data: { name, teamLeadId },
    });
  }

  async updateTeamName(teamId: number, name: string) {
    return prisma.team.update({ where: { id: teamId }, data: { name } });
  }

  async getTeamByLeadId(teamLeadId: number) {
    return prisma.team.findUnique({ where: { teamLeadId } });
  }

  canCreateInvite(role: Role): boolean {
    return (["OWNER", "HEAD", "TEAM_LEAD"] as Role[]).includes(role);
  }

  canCreateTask(role: Role): boolean {
    return CREATOR_ROLES.includes(role);
  }

  isExecutor(role: Role): boolean {
    return EXECUTOR_ROLES.includes(role);
  }

  isManager(role: Role): boolean {
    return MANAGER_ROLES.includes(role);
  }

  isAdmin(role: Role): boolean {
    return role === "OWNER" || role === "HEAD";
  }

  canRenameTeam(actor: User & { ledTeam?: Team | null }, teamId: number): boolean {
    if (actor.role === "OWNER" || actor.role === "HEAD") return true;
    if (actor.role === "TEAM_LEAD" && actor.ledTeam?.id === teamId) return true;
    return false;
  }

  canManageStaff(role: Role): boolean {
    return role === "OWNER" || role === "HEAD";
  }

  canViewTask(actor: User & { team?: Team | null; ledTeam?: Team | null }, task: { creatorId: number; teamId: number | null }): boolean {
    if (actor.role === "OWNER" || actor.role === "HEAD") return true;
    if (actor.role === "TEAM_LEAD") {
      if (task.creatorId === actor.id) return true;
      if (actor.ledTeam && task.teamId === actor.ledTeam.id) return true;
      return false;
    }
    if (actor.role === "BUYER") {
      return task.creatorId === actor.id;
    }
    if (actor.role === "BUYER_ASSISTANT") {
      return task.creatorId === actor.id;
    }
    if (actor.role === "DESIGNER" || actor.role === "TECHNICAL_SPECIALIST") {
      return true;
    }
    return false;
  }
}

export const userService = new UserService();
