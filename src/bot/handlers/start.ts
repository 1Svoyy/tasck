import { Composer } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { inviteService } from "../../services/InviteService.js";
import { mainMenuKeyboard } from "../keyboards/index.js";
import { config } from "../../config.js";

export const startHandler = new Composer<BotContext>();

startHandler.command("start", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const args = ctx.match?.trim();

  // Check if already registered
  const existing = await userService.findByTelegramId(telegramId);
  if (existing) {
    await ctx.reply(
      `👋 С возвращением, <b>${existing.firstName}</b>!\n\n${ROLE_LABELS[existing.role]}`,
      {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(existing.role),
      }
    );
    return;
  }

  // ─── Owner bootstrap ───────────────────────────────────────────────────────
  if (telegramId === config.ownerTelegramId) {
    const owner = await userService.create({
      telegramId,
      username: ctx.from!.username,
      firstName: ctx.from!.first_name,
      lastName: ctx.from!.last_name,
      role: "OWNER",
    });

    await ctx.reply(
      `👑 Добро пожаловать, Owner!\n\nВаш аккаунт создан автоматически.`,
      { reply_markup: mainMenuKeyboard("OWNER") }
    );
    return;
  }

  // ─── Invite registration ───────────────────────────────────────────────────
  if (!args) {
    await ctx.reply(
      "👋 Добро пожаловать!\n\nДля регистрации вам нужен инвайт-код от вашего руководителя.\n\n" +
        "Попросите прислать вам ссылку-приглашение."
    );
    return;
  }

  const code = args.toUpperCase();

  try {
    const invite = await inviteService.findByCode(code);

    if (!invite) {
      await ctx.reply("❌ Инвайт-код не найден.");
      return;
    }
    if (invite.usedById) {
      await ctx.reply("❌ Этот инвайт уже был использован.");
      return;
    }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      await ctx.reply("❌ Инвайт-код истёк.");
      return;
    }

    // Create user
    const user = await userService.create({
      telegramId,
      username: ctx.from!.username,
      firstName: ctx.from!.first_name,
      lastName: ctx.from!.last_name,
      role: invite.role,
      teamId: invite.teamId ?? undefined,
    });

    // Mark invite as used
    await inviteService.use(code, user.id);

    // If Team Lead, create team
    if (invite.role === "TEAM_LEAD") {
      await ctx.reply(
        `✅ Регистрация прошла успешно!\n\n${ROLE_LABELS[invite.role]}\n\n` +
          `✏️ Введите название вашей команды:`
      );

      // Store step in session
      ctx.session.step = "create_team_name";
      return;
    }

    await ctx.reply(
      `✅ Регистрация прошла успешно!\n\n${ROLE_LABELS[invite.role]}\n\n` +
        `Добро пожаловать в систему!`,
      { reply_markup: mainMenuKeyboard(invite.role) }
    );
  } catch (err: any) {
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

// ─── Team name input step ──────────────────────────────────────────────────────

startHandler.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "create_team_name") return next();

  const teamName = ctx.message.text.trim();
  if (teamName.length < 2 || teamName.length > 32) {
    await ctx.reply("❌ Название команды должно быть от 2 до 32 символов. Попробуйте ещё раз:");
    return;
  }

  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  await userService.createTeam(teamName, user.id);
  ctx.session.step = undefined;

  await ctx.reply(
    `✅ Команда <b>${teamName}</b> создана!\n\nДобро пожаловать!`,
    {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(user.role),
    }
  );
});

// ─── Main menu callback ────────────────────────────────────────────────────────

startHandler.callbackQuery("menu:main", async (ctx) => {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return ctx.answerCallbackQuery();

  await ctx.editMessageText(
    `👋 Главное меню\n\n${ROLE_LABELS[user.role]} | ${user.firstName}`,
    {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(user.role),
    }
  );
  await ctx.answerCallbackQuery();
});

startHandler.command("menu", async (ctx) => {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user) return;

  await ctx.reply(
    `👋 Главное меню\n\n${ROLE_LABELS[user.role]} | ${user.firstName}`,
    {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(user.role),
    }
  );
});
