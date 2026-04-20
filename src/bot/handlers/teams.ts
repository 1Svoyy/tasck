import { Composer } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import {
  teamsKeyboard,
  teamActionsKeyboard,
  backToMenuKeyboard,
} from "../keyboards/index.js";

export const teamsHandler = new Composer<BotContext>();

teamsHandler.callbackQuery("teams:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  let teams = await userService.getAllTeams();

  // Team Lead sees only their team
  if (user.role === "TEAM_LEAD") {
    teams = teams.filter((t) => t.teamLeadId === user.id);
  }

  if (teams.length === 0) {
    await ctx.editMessageText("📭 Команд пока нет.", { reply_markup: backToMenuKeyboard() });
    return;
  }

  await ctx.editMessageText("👥 <b>Команды:</b>", {
    parse_mode: "HTML",
    reply_markup: teamsKeyboard(teams),
  });
});

teamsHandler.callbackQuery(/^team:view:(\d+)$/, async (ctx) => {
  const teamId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  const teams = await userService.getAllTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;

  let text = `👥 <b>${team.name}</b>\n\n`;
  text += `Team Lead: <b>${team.teamLead.firstName}</b>\n\n`;
  text += `<b>Участники (${team.members.length}):</b>\n`;

  for (const m of team.members) {
    text += `${ROLE_LABELS[m.role]} ${m.firstName}\n`;
  }

  const canRename = userService.canRenameTeam(user as any, teamId);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: teamActionsKeyboard(teamId, canRename),
  });
});

teamsHandler.callbackQuery(/^team:rename:(\d+)$/, async (ctx) => {
  const teamId = parseInt(ctx.match[1]);
  await ctx.answerCallbackQuery();

  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canRenameTeam(user as any, teamId)) {
    return ctx.answerCallbackQuery("⛔ Нет прав.");
  }

  ctx.session.step = `rename_team:${teamId}`;
  await ctx.editMessageText("✏️ Введите новое название команды (2–32 символа):");
});

teamsHandler.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step?.startsWith("rename_team:")) return next();

  const teamId = parseInt(step.replace("rename_team:", ""));
  const newName = ctx.message.text.trim();

  if (newName.length < 2 || newName.length > 32) {
    await ctx.reply("❌ Название должно быть от 2 до 32 символов.");
    return;
  }

  await userService.updateTeamName(teamId, newName);
  ctx.session.step = undefined;

  await ctx.reply(`✅ Команда переименована в <b>${newName}</b>.`, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});
