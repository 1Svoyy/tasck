import { Composer } from "grammy";
import { BotContext } from "../../types/index.js";
import { userService } from "../../services/UserService.js";

export const broadcastHandler = new Composer<BotContext>();

export async function startBroadcast(ctx: BotContext) {
  const user = await userService.findByTelegramId(BigInt(ctx.from!.id));
  if (!user || !userService.isAdmin(user.role)) return;
  ctx.session.step = "broadcast";
  await ctx.reply("📢 Введите сообщение для рассылки всем сотрудникам.\n\nОтправьте /cancel для отмены.");
}

broadcastHandler.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "broadcast") return next();
  const text = ctx.message.text;
  if (text === "/cancel") { ctx.session.step = undefined; await ctx.reply("❌ Отменено."); return; }

  ctx.session.step = undefined;
  const allUsers = await userService.getAll(true);
  let sent = 0;

  for (const u of allUsers) {
    if (u.telegramId === BigInt(ctx.from!.id)) continue;
    try {
      await ctx.api.sendMessage(Number(u.telegramId), `📢 <b>Рассылка</b>\n\n${text}`, { parse_mode: "HTML" });
      sent++;
    } catch {}
  }

  await ctx.reply(`✅ Отправлено ${sent} из ${allUsers.length - 1} сотрудникам.`);
});
