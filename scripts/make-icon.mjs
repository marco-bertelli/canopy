import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CANOPY_BROWSER || "/opt/brave.com/brave/brave",
});
try {
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
  });
  const svg = (await readFile("public/favicon.svg", "utf8")).replace(
    'width="64" height="64"',
    'width="512" height="512"',
  );
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
  );
  await page.screenshot({ path: "resources/icon.png", omitBackground: true });
} finally {
  await browser.close();
}
