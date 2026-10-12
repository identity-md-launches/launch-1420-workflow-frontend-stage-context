// Render the existing vector component into a static sharing image. No AI or remote assets.
// Run from web/: PULSE_CHROMIUM_PATH=/path/to/chrome npm run social-card
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DroneIllustration, PulseMark } from "../src/components.tsx";
const font = await readFile(
  new URL(
    "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
    import.meta.url,
  ),
);
const browser = await chromium.launch({
  executablePath: process.env.PULSE_CHROMIUM_PATH || chromium.executablePath(),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    @font-face { font-family: Manrope; font-weight: 200 800; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; padding: 56px 64px; background: #10110e; color: #eeeee5; font-family: Manrope, sans-serif; }
    header { display: flex; align-items: center; gap: 14px; font-size: 24px; font-weight: 600; }
    .pulse-mark { width: 34px; height: 38px; color: #e7b85a; }
    main { display: grid; grid-template-columns: 620px 1fr; align-items: center; height: 400px; }
    h1 { margin: 0; font-size: 56px; font-weight: 600; letter-spacing: -.055em; line-height: 1.15; }
    h1 span { display: block; color: #e7b85a; }
    .hero-drone { width: 440px; height: 440px; }
    footer { margin-top: 26px; color: #a6ad9b; font-size: 16px; }
  </style></head><body><header>${renderToStaticMarkup(createElement(PulseMark))}PULSE</header>
  <main><h1>The swarm never sleeps.<span>Neither does<br>your Drone.</span></h1>${renderToStaticMarkup(createElement(DroneIllustration))}</main>
  <footer>4,096 Drones · Free mint · Fully onchain</footer></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL("../public/og.png", import.meta.url)),
  });
  console.log(
    "Rendered web/public/og.png (1200 × 630) from DroneIllustration and the local Manrope font.",
  );
} finally {
  await browser.close();
}
