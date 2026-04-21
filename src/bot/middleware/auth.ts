import { MiddlewareFn } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";

/**
 * Checks if user is registered. If not, prompts to use invite link.
 */
export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Skip for /start command — handled separately
  const text = ctx.message?.text ?? "";
  if (text.startsWith("/start")) return next();

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userService.findByTelegramId(BigInt(telegramId));

  if (!user || !user.isActive) {
    await ctx.reply(
      "❌ Вы не зарегистрированы в системе.\n\nДля доступа вам нужен инвайт-код от вашего руководителя."
    );
    return;
  }

  // Attach user to context via session or pass through
  return next();
};

/**
 * Role guard factory. Usage: requireRole("OWNER", "HEAD")
 */
export function requireRole(...roles: string[]) {
  return async (ctx: BotContext, next: () => Promise<void>) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await userService.findByTelegramId(BigInt(telegramId));
    if (!user || !roles.includes(user.role)) {
      await ctx.answerCallbackQuery("⛔ Нет доступа.");
      return;
    }

    return next();
  };
}
