import { Composer } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { inviteService } from "../../services/InviteService.js";
import { persistentMenu } from "../keyboards/index.js";
import { config } from "../../config.js";

export const startHandler = new Composer<BotContext>();

startHandler.command("start", async (ctx) => {
  const tgId = BigInt(ctx.from!.id);
  const args = ctx.match?.trim();

  const existing = await userService.findByTelegramId(tgId);
  if (existing) {
    await ctx.reply(
      `👋 <b>${existing.firstName}</b> | ${ROLE_LABELS[existing.role]}`,
      { parse_mode: "HTML", reply_markup: persistentMenu(existing.role) }
    );
    return;
  }

  // Owner bootstrap
  if (tgId === config.ownerTelegramId) {
    await userService.create({ telegramId: tgId, username: ctx.from!.username, firstName: ctx.from!.first_name, lastName: ctx.from!.last_name, role: "OWNER" });
    await ctx.reply("👑 Вы Owner. Меню активировано.", { reply_markup: persistentMenu("OWNER") });
    return;
  }

  if (!args) {
    await ctx.reply("Для доступа нужен инвайт от руководителя.");
    return;
  }

  try {
    const invite = await inviteService.findByCode(args.toUpperCase());
    if (!invite) { await ctx.reply("❌ Инвайт не найден."); return; }
    if (invite.usedById) { await ctx.reply("❌ Инвайт использован."); return; }
    if (invite.expiresAt && new Date() > invite.expiresAt) { await ctx.reply("❌ Инвайт истёк."); return; }

    const user = await userService.create({
      telegramId: tgId, username: ctx.from!.username,
      firstName: ctx.from!.first_name, lastName: ctx.from!.last_name,
      role: invite.role, teamId: invite.teamId ?? undefined,
    });
    await inviteService.use(args.toUpperCase(), user.id);

    if (invite.role === "TEAM_LEAD") {
      ctx.session.step = "create_team_name";
      await ctx.reply(`✅ Вы ${ROLE_LABELS[invite.role]}.\n\nВведите название команды:`);
      return;
    }

    await ctx.reply(`✅ ${ROLE_LABELS[invite.role]}. Добро пожаловать!`, { reply_markup: persistentMenu(invite.role) });
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message}`);
  }
});

startHandler.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "create_team_name") return next();
  const name = ctx.message.text.trim();
  if (name.length < 2 || name.length > 32) { await ctx.reply("2–32 символа. Ещё раз:"); return; }
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  await userService.createTeam(name, user.id);
  ctx.session.step = undefined;
  await ctx.reply(`✅ Команда «${name}» создана.`, { reply_markup: persistentMenu(user.role) });
});

startHandler.command("menu", async (ctx) => {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;
  await ctx.reply("Меню обновлено ↓", { reply_markup: persistentMenu(user.role) });
});
