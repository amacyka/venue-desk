import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { renderMenu, renderVenue } from "./render";

if (existsSync(".env")) loadEnvFile(".env");

async function main(): Promise<void> {
  const pages = [
    ["меню", renderMenu()],
    ["binance", await renderVenue("binance", true)],
    ["bybit", await renderVenue("bybit", true)],
  ] as const;

  for (const [title, text] of pages) {
    console.log(`\n===== ${title} (${text.length} символов) =====\n`);
    console.log(text.replace(/<\/?b>/g, ""));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
