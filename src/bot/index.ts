import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Bot, InlineKeyboard } from "grammy";
import { webAppUrl } from "./messages";
import { isVenueId, renderMenu, renderVenue, type VenueId } from "./render";

if (existsSync(".env")) loadEnvFile(".env");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("В venue-desk/.env нет TELEGRAM_BOT_TOKEN. Создай бота у @BotFather командой /newbot и вставь токен.");
  process.exit(1);
}

const bot = new Bot(token);

const html = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
const appUrl = webAppUrl(process.env.WEBAPP_URL);

function menuKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (appUrl) keyboard.webApp("Открыть терминал", appUrl).row();
  return keyboard.text("Binance", "v:binance").row().text("Bybit", "v:bybit");
}

function venueKeyboard(id: VenueId): InlineKeyboard {
  return new InlineKeyboard().text("Обновить", `r:${id}`).row().text("Назад", "v:menu");
}

const titles: Record<VenueId, string> = {
  binance: "Binance",
  bybit: "Bybit",
};

async function venueText(id: VenueId, fresh: boolean): Promise<string> {
  try {
    return await renderVenue(id, fresh);
  } catch (error) {
    return error instanceof Error ? error.message : "Срез не собрался";
  }
}

async function editOrIgnore(edit: () => Promise<unknown>): Promise<void> {
  try {
    await edit();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("message is not modified")) return;
    throw error;
  }
}

bot.command("start", async (ctx) => {
  await ctx.reply(renderMenu(Boolean(appUrl)), { ...html, reply_markup: menuKeyboard() });
});

for (const id of ["binance", "bybit"] as const) {
  bot.command(id, async (ctx) => {
    await ctx.reply(await venueText(id, true), { ...html, reply_markup: venueKeyboard(id) });
  });
}

bot.callbackQuery(/^v:(menu|binance|bybit)$/, async (ctx) => {
  const id = ctx.match[1] ?? "";
  await ctx.answerCallbackQuery(id === "menu" ? undefined : { text: `Смотрю ${titles[id as VenueId]}` });
  if (id === "menu") {
    await editOrIgnore(() => ctx.editMessageText(renderMenu(Boolean(appUrl)), { ...html, reply_markup: menuKeyboard() }));
    return;
  }
  if (!isVenueId(id)) return;
  await editOrIgnore(async () => {
    await ctx.editMessageText(await venueText(id, false), { ...html, reply_markup: venueKeyboard(id) });
  });
});

bot.callbackQuery(/^r:(binance|bybit)$/, async (ctx) => {
  const id = ctx.match[1] ?? "";
  if (!isVenueId(id)) return;
  await ctx.answerCallbackQuery({ text: `Обновляю ${titles[id]}` });
  await editOrIgnore(async () => {
    await ctx.editMessageText(await venueText(id, true), { ...html, reply_markup: venueKeyboard(id) });
  });
});

bot.catch((error) => {
  console.error(error.message);
});

async function publishProfile(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "профиль не обновился";
    console.error(message);
  }
}

bot.start({
  onStart: async (me) => {
    if (appUrl) {
      await publishProfile(() =>
        bot.api.setChatMenuButton({
          menu_button: { type: "web_app", text: "Терминал", web_app: { url: appUrl } },
        }),
      );
    }
    console.log(`Бот @${me.username} запущен. В Telegram отправь ему /start.`);
  },
});
