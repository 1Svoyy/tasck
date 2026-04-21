import { Composer, InlineKeyboard } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { teamMenuKb, memberKb, moveTeamKb, inviteRoleKb } from "../keyboards/index.js";
import { inviteService } from "../../services/InviteService.js";
import dayjs from "dayjs";

export const teamHandler = new Composer<BotContext>();

// ─── Team menu ─────────────────────────────────────────────────────────────────

export async function showTeamMenu(ctx: BotContext, mode: "text" | "cb" = "cb") {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isManager(user.role)) return;

  let teams = await userService.getAllTeams();
  if (user.role === "TEAM_LEAD") teams = teams.filter(t => t.teamLeadId === user.id);

  const text = "👥 <b>Команда</b>";
  const kb = teamMenuKb(teams, userService.canInvite(user.role));

  if (mode === "cb") await (ctx as any).editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  else await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

teamHandler.callbackQuery("team:back", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showTeamMenu(ctx, "cb");
});

// ─── Expand team ───────────────────────────────────────────────────────────────

teamHandler.callbackQuery(/^team:expand:(\d+)$/, async (ctx) => {
  const teamId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const teams = await userService.getAllTeams();
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  let text = `📁 <b>${team.name}</b>\nLead: ${team.teamLead.firstName}\n\n`;
  if (team.members.length === 0) text += "<i>Нет участников</i>";
  else team.members.forEach(m => {
    text += `${ROLE_LABELS[m.role]} ${m.firstName}\n`;
  });

  const kb = new InlineKeyboard();
  team.members.forEach(m => kb.text(`👤 ${m.firstName}`, `staff:view:${m.id}`).row());
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (user && (userService.isAdmin(user.role) || (user.ledTeam && user.ledTeam.id === teamId))) {
    kb.text("✏️ Переименовать", `team:rename:${teamId}`).row();
  }
  kb.text("🔙 Назад", "team:back");

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});

// ─── Users without team ────────────────────────────────────────────────────────

teamHandler.callbackQuery("team:noteam", async (ctx) => {
  await ctx.answerCallbackQuery();
  const all = await userService.getAll(true);
  const noTeam = all.filter(u => !u.teamId && u.role !== "OWNER");

  if (noTeam.length === 0) {
    await ctx.editMessageText("Все сотрудники распределены.", {
      reply_markup: new InlineKeyboard().text("🔙 Назад", "team:back"),
    });
    return;
  }

  let text = "👤 <b>Без команды:</b>\n\n";
  const kb = new InlineKeyboard();
  noTeam.forEach(u => {
    text += `${ROLE_LABELS[u.role]} ${u.firstName}\n`;
    kb.text(`👤 ${u.firstName}`, `staff:view:${u.id}`).row();
  });
  kb.text("🔙 Назад", "team:back");
  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
});

// ─── View member ───────────────────────────────────────────────────────────────

teamHandler.callbackQuery(/^staff:view:(\d+)$/, async (ctx) => {
  const target = await userService.findById(parseInt(ctx.match[1]));
  if (!target) return ctx.answerCallbackQuery("Не найден.");
  await ctx.answerCallbackQuery();

  const teams = await userService.getAllTeams();
  const text =
    `👤 <b>${target.firstName}</b>${target.lastName ? ` ${target.lastName}` : ""}\n\n` +
    `Роль: ${ROLE_LABELS[target.role]}\n` +
    `Команда: ${target.team?.name || "—"}\n` +
    `Username: ${target.username ? `@${target.username}` : "—"}\n` +
    `Статус: ${target.isActive ? "✅" : "🚫"}\n` +
    `С: ${dayjs(target.createdAt).format("DD.MM.YYYY")}`;

  await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: memberKb(target.id, target.isActive, teams) });
});

// ─── Deactivate / Activate ─────────────────────────────────────────────────────

teamHandler.callbackQuery(/^staff:off:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  const actor = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!actor || !userService.isAdmin(actor.role)) return ctx.answerCallbackQuery("⛔");
  await userService.deactivate(id);
  await ctx.answerCallbackQuery("🚫 Деактивирован.");
  // Re-show
  const target = await userService.findById(id);
  const teams = await userService.getAllTeams();
  await ctx.editMessageText(`🚫 ${target?.firstName} деактивирован.`, { reply_markup: memberKb(id, false, teams) });
});

teamHandler.callbackQuery(/^staff:on:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  await userService.activate(id);
  await ctx.answerCallbackQuery("✅ Активирован.");
  const target = await userService.findById(id);
  const teams = await userService.getAllTeams();
  await ctx.editMessageText(`✅ ${target?.firstName} активирован.`, { reply_markup: memberKb(id, true, teams) });
});

// ─── Move to team ──────────────────────────────────────────────────────────────

teamHandler.callbackQuery(/^staff:move:(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const teams = await userService.getAllTeams();
  await ctx.editMessageText("🔀 Выберите команду:", { reply_markup: moveTeamKb(id, teams) });
});

teamHandler.callbackQuery(/^staff:moveto:(\d+):(\d+)$/, async (ctx) => {
  const userId = parseInt(ctx.match[1]);
  const teamId = parseInt(ctx.match[2]);
  await userService.moveToTeam(userId, teamId === 0 ? null : teamId);
  await ctx.answerCallbackQuery("✅ Перемещён.");
  await showTeamMenu(ctx, "cb");
});

// ─── Rename team ───────────────────────────────────────────────────────────────

teamHandler.callbackQuery(/^team:rename:(\d+)$/, async (ctx) => {
  ctx.session.step = `rename:${ctx.match[1]}`;
  await ctx.answerCallbackQuery();
  await ctx.reply("✏️ Новое название (2–32):");
});

teamHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("rename:")) return next();
  const teamId = parseInt(step.replace("rename:", ""));
  const name = ctx.message.text.trim();
  if (name.length < 2 || name.length > 32) { await ctx.reply("2–32 символа."); return; }
  await userService.updateTeamName(teamId, name);
  ctx.session.step = undefined;
  await ctx.reply(`✅ Переименовано: <b>${name}</b>`, { parse_mode: "HTML" });
});

// ─── Invite (embedded in team menu) ────────────────────────────────────────────

teamHandler.callbackQuery("invite:create", async (ctx) => {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canInvite(user.role)) return ctx.answerCallbackQuery("⛔");
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🔗 Роль приглашаемого:", { reply_markup: inviteRoleKb(user.role) });
});

teamHandler.callbackQuery(/^invite:role:(.+)$/, async (ctx) => {
  const role = ctx.match[1] as any;
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  let teamId: number | undefined;
  if (user.role === "TEAM_LEAD" && (role === "BUYER" || role === "BUYER_ASSISTANT")) {
    const team = await userService.getTeamByLeadId(user.id);
    if (team) teamId = team.id;
  }

  const invite = await inviteService.create({ createdById: user.id, role, teamId, expiresInHours: 48 });
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=${invite.code}`;

  await ctx.answerCallbackQuery("✅");
  await ctx.editMessageText(
    `✅ <b>Инвайт</b>\n\nРоль: ${ROLE_LABELS[role as keyof typeof ROLE_LABELS]}\nКод: <code>${invite.code}</code>\nИстекает: ${dayjs(invite.expiresAt).format("DD.MM HH:mm")}\n\n🔗 <code>${link}</code>`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 Назад", "team:back") }
  );
});
