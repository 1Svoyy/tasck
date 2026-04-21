import { Composer } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { inviteService } from "../../services/InviteService.js";
import { inviteRoleKeyboard, backToMenuKeyboard } from "../keyboards/index.js";
import { Role } from "@prisma/client";
import dayjs from "dayjs";

export const inviteHandler = new Composer<BotContext>();

inviteHandler.callbackQuery("invite:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canCreateInvite(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет прав.");
  }

  await ctx.editMessageText("🔗 <b>Создание инвайта</b>\n\nВыберите роль приглашаемого:", {
    parse_mode: "HTML",
    reply_markup: inviteRoleKeyboard(user.role),
  });
});

inviteHandler.callbackQuery(/^invite:role:(.+)$/, async (ctx) => {
  const role = ctx.match[1] as Role;
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canCreateInvite(user.role)) {
    return ctx.answerCallbackQuery("⛔ Нет прав.");
  }

  // Determine teamId based on inviter's role
  let teamId: number | undefined;

  if (user.role === "TEAM_LEAD") {
    // Team Lead can only invite to their own team (Buyer / Assistant)
    if (role === "BUYER" || role === "BUYER_ASSISTANT") {
      const team = await userService.getTeamByLeadId(user.id);
      if (!team) {
        return ctx.answerCallbackQuery("❌ У вас нет команды.");
      }
      teamId = team.id;
    }
  }

  const invite = await inviteService.create({
    createdById: user.id,
    role,
    teamId,
    expiresInHours: 48,
  });

  // Get bot username
  const me = await ctx.api.getMe();
  const link = `https://t.me/${me.username}?start=${invite.code}`;

  const text =
    `✅ <b>Инвайт создан!</b>\n\n` +
    `Роль: <b>${ROLE_LABELS[role]}</b>\n` +
    `Код: <code>${invite.code}</code>\n` +
    (teamId ? `Команда: <i>привязана к вашей</i>\n` : "") +
    `Истекает: <i>${dayjs(invite.expiresAt).format("DD.MM.YYYY HH:mm")}</i>\n\n` +
    `🔗 Ссылка:\n<code>${link}</code>\n\n` +
    `<i>Перешлите её приглашаемому.</i>`;

  await ctx.answerCallbackQuery("✅ Инвайт создан!");
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});

inviteHandler.callbackQuery("invite:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("❌ Отменено.", { reply_markup: backToMenuKeyboard() });
});
