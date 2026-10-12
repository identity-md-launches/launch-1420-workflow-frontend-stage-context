// Focused reproduction/recheck for the reopened findings, against the static export.
import { chromium, expect as baseExpect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { startPreview } from "../scripts/preview.mjs";
import { installMock, makeMock, account } from "./mock-rpc.mjs";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = fileURLToPath(
  new URL("../../docs/frontend/evidence/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  mode: "Production export, mocked wallet/RPC, accelerated browser clock; no broadcasts",
  startedAt: new Date().toISOString(),
  viewports: [],
  polling: [],
  errors: [],
};
const { server, url } = await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.PULSE_CHROMIUM_PATH || chromium.executablePath(),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const mock = makeMock();
  mock.state.populate(0);
  let reorg = false;
  const rpc = mock.rpc;
  mock.rpc = async (request) => {
    const result = await rpc(request);
    return reorg && request.method === "eth_getBlockByNumber"
      ? { ...result, hash: `0x${"ab".repeat(32)}` }
      : result;
  };
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push(`${response.status()} ${response.url()}`);
  });
  await installMock(page, mock);
  await page.clock.install();
  await page.goto(url);
  await expect(
    page.getByText("Onchain signal connected", { exact: false }),
  ).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      scrollTo(0, 0);
    });
    const result = await page.evaluate(() => {
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top + scrollY,
          bottom: r.bottom + scrollY,
          width: r.width,
          height: r.height,
        };
      };
      const sizes = new Set(),
        weights = new Set();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const n = walker.currentNode,
          el = n.parentElement;
        if (
          !n.textContent.trim() ||
          !el.checkVisibility() ||
          el.closest('svg,style,script,[aria-hidden="true"]')
        )
          continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        if (!r.getBoundingClientRect().width) continue;
        sizes.add(getComputedStyle(el).fontSize);
        weights.add(getComputedStyle(el).fontWeight);
      }
      const rank = getComputedStyle(document.querySelector(".rank-summary"));
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sizes: [...sizes],
        weights: [...weights],
        h1Weight: getComputedStyle(document.querySelector("h1")).fontWeight,
        stats: rect(document.querySelector(".stats-strip")),
        counters: [...document.querySelectorAll(".stats-strip > div")].map(
          (el) => ({
            label: el.querySelector(".eyebrow").innerText,
            labelStyle: {
              transform: getComputedStyle(el.querySelector(".eyebrow"))
                .textTransform,
              tracking: getComputedStyle(el.querySelector(".eyebrow"))
                .letterSpacing,
            },
            value: rect(el.querySelector("strong")),
          }),
        ),
        heroVisualVisible: document
          .querySelector(".hero-visual")
          .checkVisibility(),
        headingKickers:
          document.querySelectorAll("h1,h2,h3").length &&
          [...document.querySelectorAll("h1,h2,h3")].filter((el) =>
            el.previousElementSibling?.classList.contains("eyebrow"),
          ).length,
        internalArrows: [
          ...document.querySelectorAll('a[href^="#"],button'),
        ].filter((el) => el.innerText.includes("↗")).length,
        externalArrows: [
          ...document.querySelectorAll('a[target="_blank"]'),
        ].filter((el) => el.innerText.includes("↗")).length,
        heroCopy: document.querySelector(".hero-copy").innerText,
        nestedRankSurface: {
          background: rank.backgroundColor,
          radius: rank.borderRadius,
          padding: rank.padding,
        },
        title: document.title,
        ogImage: document.querySelector('meta[property="og:image"]').content,
        twitterCard: document.querySelector('meta[name="twitter:card"]')
          .content,
      };
    });
    assert.equal(result.scrollWidth, width);
    assert.ok(result.sizes.length <= 6, `${width}: ${result.sizes}`);
    assert.ok(result.weights.length <= 3);
    assert.equal(
      Number(result.h1Weight),
      Math.max(...result.weights.map(Number)),
    );
    assert.equal(result.headingKickers, 0);
    assert.equal(result.internalArrows, 0);
    assert.ok(result.externalArrows > 0);
    assert.equal(result.nestedRankSurface.background, "rgba(0, 0, 0, 0)");
    assert.equal(result.nestedRankSurface.padding, "0px");
    assert.equal(result.title, "PULSE: Keep the Swarm Alive");
    assert.equal(result.twitterCard, "summary_large_image");
    assert.ok(
      !/Human heartbeat|One small signal|A permanent connection/.test(
        result.heroCopy,
      ),
    );
    const tops = result.counters.map((c) => c.value.top);
    assert.ok(
      Math.max(...tops) - Math.min(...tops) < 1,
      "Counter values must align despite wrapped labels",
    );
    for (const c of result.counters) {
      assert.equal(c.labelStyle.transform, "none");
      assert.equal(c.labelStyle.tracking, "normal");
    }
    if (width <= 390) assert.equal(result.heroVisualVisible, false);
    if (width === 390)
      assert.ok(
        result.stats.bottom <= 844,
        "Mobile counters must be on the first screen",
      );
    report.viewports.push(result);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `${artifacts}/revision-${width}-hero.png`,
      });
  }
  const image = await page.request.get(new URL("og.png", url).href);
  assert.equal(image.status(), 200);
  const png = await image.body();
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  report.shareImage = {
    width: 1200,
    height: 630,
    bytes: png.length,
    status: image.status(),
  };

  const counts = (since) => {
    const calls = mock.state.calls.slice(since);
    return {
      batches: calls.filter((c) => c.functionName === "getDrones").length,
      rpcRequests: calls.filter(
        (c) => c.method !== "contract" && !c.method.startsWith("wallet:"),
      ).length,
      functions: calls
        .filter((c) => c.method === "contract")
        .map((c) => c.functionName),
    };
  };
  const manual = async () => {
    await page
      .getByRole("button", { name: "Refresh data", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh data", exact: true }),
    ).toBeEnabled();
  };
  const poll = async (name, expected) => {
    const before = mock.state.calls.length;
    await page.clock.fastForward(31000);
    await expect
      .poll(() => counts(before).functions.includes("totalMinted"))
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Refresh data", exact: true }),
    ).toBeEnabled();
    const result = counts(before);
    assert.equal(result.batches, expected, name);
    report.polling.push({ name, ...result });
    return result;
  };
  mock.state.populate(4096);
  let before = mock.state.calls.length;
  await manual();
  assert.equal(counts(before).batches, 32);
  const publicPoll = await poll("unchanged full-supply public poll", 0);
  // The snapshot takes three RPCs; the existing swap panel also refreshes
  // the paired token's symbol and decimals after receiving that snapshot.
  assert.ok(publicPoll.rpcRequests >= 3 && publicPoll.rpcRequests <= 5);
  before = mock.state.calls.length;
  await manual();
  assert.equal(counts(before).batches, 32);
  report.polling.push({
    name: "manual full-supply refresh",
    ...counts(before),
  });
  mock.state.own = 1n;
  mock.state.drones[0].owner = account;
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(page.locator(".drone-title")).toHaveText("DRONE-0001");
  await expect(
    page.getByRole("button", { name: "Refresh data", exact: true }),
  ).toBeEnabled();
  const personal = await poll("unchanged connected full-supply poll", 0);
  for (const name of ["stateOf", "balanceOf", "allowance"])
    assert.ok(personal.functions.includes(name));
  mock.state.block++;
  await poll("new block requires a full scan", 32);
  reorg = true;
  await poll("same-height reorg requires a full scan", 32);
  mock.state.noCode = true;
  await manual();
  await expect(
    page.getByText("Live data is unavailable.", { exact: false }),
  ).toBeVisible();
  mock.state.noCode = false;
  await poll(
    "failed verification invalidates the cache; timer recovery scans again",
    32,
  );
  await expect(
    page.getByText("Live data is unavailable.", { exact: false }),
  ).toHaveCount(0);
  before = mock.state.calls.length;
  await page
    .locator("#my-drone")
    .getByRole("button", { name: "Beat", exact: true })
    .click();
  await page.clock.fastForward(5000);
  await expect(
    page
      .locator("#my-drone")
      .getByText("Heartbeat confirmed.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    counts(before).batches,
    32,
    "Confirmed transactions must perform a full scan",
  );
  report.polling.push({
    name: "confirmed heartbeat refresh",
    ...counts(before),
  });
  assert.deepEqual(report.errors, []);
  report.result = "pass";
  console.log(
    "PASS revised typography, hero, counter alignment, link semantics, share image, and timer/manual/transaction refresh paths",
  );
} catch (error) {
  report.result = "fail";
  report.failure = error.stack;
  throw error;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(
    `${artifacts}/revision-validation.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  server.close();
}
