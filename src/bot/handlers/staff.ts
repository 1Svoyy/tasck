import { Composer, InlineKeyboard } from "grammy";
import { BotContext, ROLE_LABELS } from "../../types/index.js";
import { userService } from "../../services/UserService.js";
import { staffListKeyboard, staffActionKeyboard, backToMenuKeyboard } from "../keyboards/index.js";

export const staffHandler = new Composer<BotContext>();

// ─── Staff list ────────────────────────────────────────────────────────────────

staffHandler.callbackQuery("staff:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showStaffList(ctx, "callback");
});

export async function showStaffList(ctx: BotContext, mode: "callback" | "text" = "callback") {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.canManageStaff(user.role)) {
    if (mode === "callback") {
      await (ctx as any).answerCallbackQuery?.("⛔ Нет доступа.");
    }
    return;
  }

  const allUsers = await userService.getAll();

  // Owner sees everyone; Head sees everyone except Owner
  const visible = allUsers.filter((u) => {
    if (user.role === "OWNER") return u.id !== user.id; // hide self
    if (user.role === "HEAD") return u.role !== "OWNER" && u.id !== user.id;
    return false;
  });

  if (visible.length === 0) {
    const text = "👤 <b>Сотрудники</b>\n\nПока никого нет.";
    if (mode === "callback") {
      await (ctx as any).editMessageText(text, { parse_mode: "HTML", reply_markup: backToMenuKeyboard() });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
    return;
  }

  const text = `👤 <b>Сотрудники</b> — <b>${visible.length}</b> человек`;
  const kb = staffListKeyboard(visible);

  if (mode === "callback") {
    await (ctx as any).editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
}

// ─── View staff member ─────────────────────────────────────────────────────────

staffHandler.callbackQuery(/^staff:view:(\d+)$/, async (ctx) => {
  const targetId = parseInt(ctx.match[1]);
  const actor = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!actor || !userService.canManageStaff(actor.role)) {
    return ctx.answerCallbackQuery("⛔ Нет доступа.");
  }

  const target = await userService.findById(targetId);
  if (!target) return ctx.answerCallbackQuery("Пользователь не найден.");

  const teamName = target.team?.name || "—";
  const status = target.isActive ? "✅ Активен" : "🚫 Деактивирован";

  let text =
    `👤 <b>${target.firstName}</b>${target.lastName ? ` ${target.lastName}` : ""}\n\n` +
    `Роль: <b>${ROLE_LABELS[target.role]}</b>\n` +
    `Username: ${target.username ? `@${target.username}` : "—"}\n` +
    `Команда: <b>${teamName}</b>\n` +
    `Telegram ID: <code>${target.telegramId}</code>\n` +
    `Статус: ${status}\n` +
    `Дата регистрации: ${target.createdAt.toLocaleDateString("ru-RU")}`;

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: staffActionKeyboard(target.id, target.isActive),
  });
});

// ─── Deactivate ────────────────────────────────────────────────────────────────

staffHandler.callbackQuery(/^staff:deactivate:(\d+)$/, async (ctx) => {
  const targetId = parseInt(ctx.match[1]);
  const actor = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!actor || !userService.canManageStaff(actor.role)) {
    return ctx.answerCallbackQuery("⛔ Нет доступа.");
  }

  const target = await userService.findById(targetId);
  if (!target) return ctx.answerCallbackQuery("Не найден.");

  // Can't deactivate Owner
  if (target.role === "OWNER") return ctx.answerCallbackQuery("⛔ Нельзя деактивировать Owner.");
  // Head can't deactivate Head
  if (actor.role === "HEAD" && target.role === "HEAD") return ctx.answerCallbackQuery("⛔ Нет прав.");

  await userService.deactivate(targetId);
  await ctx.answerCallbackQuery("🚫 Пользователь деактивирован.");

  await ctx.editMessageText(
    `🚫 <b>${target.firstName}</b> (${ROLE_LABELS[target.role]}) деактивирован.\n\nОн больше не сможет пользоваться ботом.`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 К списку", "staff:list") }
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────────

staffHandler.callbackQuery(/^staff:activate:(\d+)$/, async (ctx) => {
  const targetId = parseInt(ctx.match[1]);
  const actor = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!actor || !userService.canManageStaff(actor.role)) {
    return ctx.answerCallbackQuery("⛔ Нет доступа.");
  }

  await userService.activate(targetId);

  const target = await userService.findById(targetId);
  await ctx.answerCallbackQuery("✅ Пользователь активирован.");

  await ctx.editMessageText(
    `✅ <b>${target?.firstName}</b> (${ROLE_LABELS[target!.role]}) активирован.`,
    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔙 К списку", "staff:list") }
  );
});
