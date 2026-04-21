import { Composer } from "grammy";
import { BotContext } from "../../types/index.js";
import { ratingService } from "../../services/RatingService.js";
import { ratingKeyboard, backToMenuKeyboard } from "../keyboards/index.js";
import { ExecutorType } from "@prisma/client";

export const ratingHandler = new Composer<BotContext>();

ratingHandler.callbackQuery("rating:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "🏆 <b>Рейтинг исполнителей</b>\n\nВыберите категорию:",
    { parse_mode: "HTML", reply_markup: ratingKeyboard() }
  );
});

ratingHandler.callbackQuery(/^rating:(DESIGNER|TECHNICAL_SPECIALIST)$/, async (ctx) => {
  const execType = ctx.match[1] as ExecutorType;
  await ctx.answerCallbackQuery();

  const entries = await ratingService.getTopExecutors(execType);
  const title =
    execType === "DESIGNER" ? "🏆 <b>Top Designers</b>" : "🏆 <b>Top Technical</b>";

  const text = ratingService.formatRatingBoard(title, entries);

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    reply_markup: backToMenuKeyboard(),
  });
});
