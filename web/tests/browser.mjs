import { chromium, expect as baseExpect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { startPreview } from "../scripts/preview.mjs";
import {
  installMock,
  makeMock,
  manifest,
  account,
  otherAccount,
} from "./mock-rpc.mjs";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = fileURLToPath(
  new URL("../../docs/frontend/evidence/", import.meta.url),
);
await mkdir(artifacts, { recursive: true });
const report = {
  mode: "Production export at /preview/; deterministic mocked RPC and injected wallet; no transactions broadcast",
  startedAt: new Date().toISOString(),
  cases: [],
  viewports: [],
  consoleErrors: [],
  resourceErrors: [],
  accessibility: [],
};
const { server, url } = await startPreview();
const executablePath =
  process.env.PULSE_CHROMIUM_PATH ||
  "/opt/imd-worker/local/imd-browser-tool/ms-playwright/chromium-1246/chrome-linux64/chrome";
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (error) => report.consoleErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400)
    report.resourceErrors.push({
      url: response.url(),
      status: response.status(),
    });
});
const mock = makeMock();
await installMock(page, mock);
const run = async (name, fn) => {
  const start = Date.now();
  try {
    await fn();
    report.cases.push({ name, result: "pass", durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (e) {
    report.cases.push({ name, result: "fail", error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
    throw e;
  }
};
const refresh = async () => {
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh data" }),
  ).toBeEnabled();
};
const clickAction = async (scope, name) => {
  const button = scope.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
};
try {
  await run(
    "relative static export, configuration, ABIs, fonts and complete public Hive reads",
    async () => {
      await page.goto(url);
      await expect(
        page.getByText("Onchain signal connected", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".stats-strip")).toContainText("3");
      assert.equal(
        mock.state.calls.filter((c) => c.functionName === "getDrones")[0]
          .args[0],
        1n,
      );
      await expect(
        page
          .getByRole("button", { name: "Connect wallet", exact: false })
          .first(),
      ).toBeEnabled();
      assert.equal(mock.state.writes.length, 0);
      await page.screenshot({
        path: `${artifacts}/desktop-disconnected.png`,
        fullPage: true,
      });
    },
  );
  await run("missing browser wallet gives a recoverable error", async () => {
    const noWallet = await context.newPage();
    const noMock = makeMock();
    await installMock(noWallet, noMock, false);
    await noWallet.goto(url);
    await noWallet
      .getByRole("button", { name: "Connect wallet", exact: false })
      .first()
      .click();
    await expect(
      noWallet
        .getByRole("alert")
        .filter({ hasText: "No browser wallet found" }),
    ).toBeVisible();
    await noWallet.close();
  });
  await run(
    "EIP-6963 discovery retains both announced wallets and connects the selected provider",
    async () => {
      const discovery = await context.newPage();
      const isolated = makeMock();
      await installMock(discovery, isolated);
      await discovery.addInitScript((other) => {
        const first = window.ethereum;
        const second = {
          ...first,
          request: async (args) =>
            ["eth_accounts", "eth_requestAccounts"].includes(args.method)
              ? [other]
              : first.request(args),
        };
        window.addEventListener("eip6963:requestProvider", () => {
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: { uuid: "first", name: "First wallet" },
                provider: first,
              },
            }),
          );
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: { uuid: "second", name: "Second wallet" },
                provider: second,
              },
            }),
          );
        });
      }, otherAccount);
      await discovery.goto(url);
      const choose = discovery.getByRole("combobox", {
        name: "Choose browser wallet",
      });
      await expect(choose).toBeVisible();
      await expect(choose.locator("option")).toHaveCount(3);
      await choose.selectOption({ label: "Second wallet" });
      await discovery
        .getByRole("button", { name: "Connect wallet", exact: false })
        .first()
        .click();
      await expect(
        discovery.locator(".wallet-control a.address"),
      ).toHaveAttribute(
        "href",
        `${manifest.network.explorer}/address/${otherAccount}`,
      );
      await discovery.close();
    },
  );
  await run(
    "connection rejection, wrong chain and exact add-chain fallback",
    async () => {
      mock.state.rejectNext = true;
      mock.state.chainId = 5;
      mock.state.needsAdd = true;
      await page
        .getByRole("button", { name: "Connect wallet", exact: false })
        .first()
        .click();
      await expect(
        page.getByText("Request declined in your wallet.", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Connect wallet", exact: false })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "Switch to Ethereum", exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Mint your Drone", exact: false }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await expect(
        page
          .locator("#my-drone")
          .getByRole("button", { name: "Mint your Drone", exact: false }),
      ).toBeEnabled();
      const add = mock.state.calls.find(
        (c) => c.method === "wallet:wallet_addEthereumChain",
      );
      assert.deepEqual(add.params, [manifest.walletAddChain]);
    },
  );
  await run(
    "mint simulates, locks through receipt, prevents duplicate clicks and reveals onchain artwork",
    async () => {
      mock.state.receiptHold = true;
      await page
        .locator("#my-drone")
        .getByRole("button", { name: "Mint your Drone", exact: false })
        .click();
      await expect(
        page
          .locator("#my-drone")
          .getByText("Mint submitted.", { exact: false }),
      ).toBeVisible();
      const pending = page
        .locator("#my-drone")
        .getByRole("button", { name: "Mint your Drone…", exact: false });
      await expect(pending).toBeDisabled();
      await pending.evaluate((button) => {
        button.click();
        button.click();
      });
      assert.equal(
        mock.state.writes.filter((c) => c.functionName === "mint").length,
        1,
      );
      assert.equal(mock.state.writes[0].value, 0n);
      mock.state.receiptHold = false;
      await expect(
        page.locator("#my-drone").getByRole("heading", { name: "DRONE-0004" }),
      ).toBeVisible();
      await expect(page.locator("#my-drone img")).toBeVisible();
      await expect(
        page
          .locator("#my-drone")
          .getByRole("button", { name: "Beat", exact: false }),
      ).toBeDisabled();
      assert.ok(
        mock.state.calls.find((c) => c.functionName === "mint" && !c.write),
      );
    },
  );
  await run(
    "heartbeat cooldown, decoded simulation revert and confirmed beat",
    async () => {
      const own = mock.state.drones.find((d) => d.tokenId === mock.state.own);
      own.lastBeatAt = BigInt(mock.state.time - 72000);
      await refresh();
      const area = page.locator("#my-drone");
      await expect(
        area.getByRole("button", { name: "Beat", exact: false }),
      ).toBeEnabled();
      mock.state.failSimulation = "beat";
      await clickAction(area, "Beat");
      await expect(
        area.getByText("Your next heartbeat is not ready yet.", {
          exact: false,
        }),
      ).toBeVisible();
      assert.equal(
        mock.state.writes.filter((c) => c.functionName === "beat").length,
        0,
      );
      mock.state.failSimulation = "";
      await clickAction(area, "Beat");
      await expect(
        area.getByText("Heartbeat confirmed.", { exact: false }),
      ).toBeVisible();
      assert.equal(own.streak, 2n);
    },
  );
  await run(
    "exact staking approval, rejection recovery, stake and instant unstake",
    async () => {
      const area = page.locator("#stake");
      await area.getByLabel("Stake amount", { exact: true }).fill("0");
      await clickAction(area, "Stake PULSE");
      await expect(
        area.getByText("Enter an amount greater than zero."),
      ).toBeVisible();
      await area.getByLabel("Stake amount", { exact: true }).fill("1000");
      mock.state.rejectNext = true;
      await clickAction(area, "Approve PULSE for staking");
      await expect(
        area.getByText("Request declined in your wallet.", { exact: false }),
      ).toBeVisible();
      await clickAction(area, "Approve PULSE for staking");
      await expect(
        area.getByRole("button", { name: "Stake PULSE", exact: true }),
      ).toBeEnabled();
      const approval = mock.state.writes.find(
        (w) =>
          w.functionName === "approve" &&
          w.args[0].toLowerCase() === mock.drone,
      );
      assert.equal(approval.address, mock.token);
      assert.equal(approval.args[1], 1000n * 10n ** 18n);
      await clickAction(area, "Stake PULSE");
      await expect(
        area.getByText("Stake confirmed.", { exact: true }),
      ).toBeVisible();
      assert.equal(
        mock.state.drones.find((d) => d.tokenId === mock.state.own).rank,
        1,
      );
      await area.getByRole("button", { name: "Unstake", exact: true }).click();
      await area.getByLabel("Unstake amount").fill("100");
      await clickAction(area, "Unstake PULSE");
      await expect(
        area.getByText("Unstake confirmed.", { exact: true }),
      ).toBeVisible();
      assert.equal(
        mock.state.drones.find((d) => d.tokenId === mock.state.own).staked,
        900n * 10n ** 18n,
      );
    },
  );
  await run(
    "six-hour warning, dormancy, revival and streak reset",
    async () => {
      const own = mock.state.drones.find((d) => d.tokenId === mock.state.own);
      own.lastBeatAt = BigInt(mock.state.time - 165000);
      await refresh();
      await expect(
        page
          .locator("#my-drone")
          .getByText("Less than 6 hours left.", { exact: false }),
      ).toBeVisible();
      own.lastBeatAt = BigInt(mock.state.time - 172801);
      await refresh();
      await expect(
        page
          .locator("#my-drone")
          .getByText("Your Drone is dormant.", { exact: false }),
      ).toBeVisible();
      await clickAction(page.locator("#my-drone"), "Beat");
      await expect(
        page
          .locator("#my-drone")
          .getByText("Heartbeat confirmed.", { exact: false }),
      ).toBeVisible();
      assert.equal(own.streak, 1n);
    },
  );
  await run(
    "buy PULSE: simulated quote, explicit Permit2/router approvals, minimum output and zero ETH",
    async () => {
      const area = page.locator("#swap");
      await area.getByLabel("You pay", { exact: true }).fill("10");
      await clickAction(area, "Get quote");
      await expect(area.getByText("20 PULSE", { exact: true })).toBeVisible();
      await clickAction(area, "Approve IMD to Permit2");
      await expect(
        area.getByRole("button", {
          name: "Approve router spending",
          exact: true,
        }),
      ).toBeEnabled();
      const approval = mock.state.writes.find(
        (w) => w.functionName === "approve" && w.address === mock.pair,
      );
      assert.equal(approval.args[0].toLowerCase(), mock.protocol.permit2);
      assert.equal(approval.args[1], 10n * 10n ** 18n);
      assert.equal(approval.value, 0n);
      await clickAction(area, "Approve router spending");
      await expect(
        area.getByRole("button", { name: "Confirm swap", exact: true }),
      ).toBeEnabled();
      const permit = mock.state.writes.find(
        (w) => w.address === mock.protocol.permit2,
      );
      assert.equal(permit.args[0].toLowerCase(), mock.pair);
      assert.equal(permit.args[1].toLowerCase(), mock.protocol.universalRouter);
      assert.equal(permit.args[2], 10n * 10n ** 18n);
      mock.state.failSimulation = "execute";
      await clickAction(area, "Confirm swap");
      await expect(
        area.getByText("The swap simulation reverted.", { exact: false }),
      ).toBeVisible();
      assert.equal(
        mock.state.writes.filter((w) => w.functionName === "execute").length,
        0,
      );
      mock.state.failSimulation = "";
      await clickAction(area, "Confirm swap");
      await expect(
        area.getByText("Swap confirmed.", { exact: true }),
      ).toBeVisible();
      const execute = mock.state.writes.find(
        (w) => w.functionName === "execute",
      );
      assert.equal(execute.address, mock.protocol.universalRouter);
      assert.equal(execute.value, 0n);
      const quote = mock.state.calls.find(
        (c) => c.functionName === "quoteExactInputSingle",
      );
      assert.equal(quote.address, mock.protocol.quoter);
      assert.equal(quote.args[0].zeroForOne, false);
      assert.equal(
        quote.args[0].poolKey.hooks.toLowerCase(),
        manifest.poolKey.hooks,
      );
    },
  );
  await run(
    "sell PULSE: direction inversion, quote invalidation, validation and both spending approvals",
    async () => {
      const area = page.locator("#swap");
      await area
        .getByRole("button", { name: "Sell PULSE", exact: true })
        .click();
      await area
        .getByLabel("You pay", { exact: true })
        .fill("1.0000000000000000001");
      await clickAction(area, "Get quote");
      await expect(
        area.getByText("Use at most 18 decimal places."),
      ).toBeVisible();
      await area.getByLabel("You pay", { exact: true }).fill("5");
      await area.getByLabel("Slippage tolerance").fill("9");
      await clickAction(area, "Get quote");
      await expect(
        area.getByText("Set slippage between", { exact: false }),
      ).toBeVisible();
      await area.getByLabel("Slippage tolerance").fill("0.5");
      await clickAction(area, "Get quote");
      await expect(area.getByText("10 IMD", { exact: true })).toBeVisible();
      await area.getByLabel("You pay", { exact: true }).fill("6");
      await expect(
        area.getByRole("button", { name: "Get quote", exact: true }),
      ).toBeVisible();
      await clickAction(area, "Get quote");
      await clickAction(area, "Approve PULSE to Permit2");
      await clickAction(area, "Approve router spending");
      await clickAction(area, "Confirm swap");
      await expect
        .poll(
          () =>
            mock.state.writes.filter((w) => w.functionName === "execute")
              .length,
        )
        .toBe(2);
      await expect(
        area.getByRole("button", { name: "Get quote", exact: true }),
      ).toBeEnabled();
      await expect(
        area.getByText("Swap confirmed.", { exact: true }),
      ).toBeVisible();
      const quotes = mock.state.calls.filter(
        (c) => c.functionName === "quoteExactInputSingle",
      );
      assert.equal(quotes.at(-1).args[0].zeroForOne, true);
      assert.equal(
        mock.state.writes.filter((w) => w.functionName === "execute").length,
        2,
      );
    },
  );
  await run(
    "existing sufficient allowances skip approvals and quotes expire after 60 seconds",
    async () => {
      const area = page.locator("#swap");
      await area
        .getByRole("button", { name: "Buy PULSE", exact: true })
        .click();
      mock.state.allowance.set(
        `${mock.pair}|${mock.protocol.permit2}`,
        100n * 10n ** 18n,
      );
      mock.state.permit.set(`${mock.pair}|${mock.protocol.universalRouter}`, [
        100n * 10n ** 18n,
        mock.state.time + 3600,
        0,
      ]);
      await area.getByLabel("You pay", { exact: true }).fill("2");
      await clickAction(area, "Get quote");
      await expect(
        area.getByRole("button", { name: "Confirm swap", exact: true }),
      ).toBeEnabled();
      await expect(
        area.getByRole("button", {
          name: "Approve IMD to Permit2",
          exact: true,
        }),
      ).toHaveCount(0);
      await page.clock.setSystemTime(Date.now() + 61000);
      await expect(
        area.getByRole("button", { name: "Refresh quote", exact: true }),
      ).toBeVisible();
      await expect(
        area.getByRole("button", { name: "Confirm swap", exact: true }),
      ).toHaveCount(0);
      await page.clock.setSystemTime(Date.now());
      await area.getByLabel("You pay", { exact: true }).fill("");
    },
  );
  await run(
    "PULSE transfer validates recipient and requires an explicit review",
    async () => {
      await page
        .getByText("Send PULSE to another wallet", { exact: true })
        .click();
      const area = page.locator(".send-panel");
      await area.getByLabel("Recipient address").fill("invalid");
      await area.getByLabel("Amount in PULSE").fill("5");
      await clickAction(area, "Review transfer");
      await expect(
        area.getByText("Enter a valid nonzero Ethereum recipient address."),
      ).toBeVisible();
      await area.getByLabel("Recipient address").fill(mock.recipient);
      await clickAction(area, "Review transfer");
      await expect(
        area.getByText("Transfers are permanent.", { exact: false }),
      ).toBeVisible();
      await clickAction(area, "Confirm PULSE transfer");
      await expect(
        area.getByText("PULSE transfer confirmed.", { exact: true }),
      ).toBeVisible();
      assert.equal(
        mock.state.writes.find((w) => w.functionName === "transfer").args[1],
        5n * 10n ** 18n,
      );
    },
  );
  await run(
    "Hive status/Caste filters, empty-state recovery and active-streak leaderboard",
    async () => {
      const area = page.locator("#hive");
      await area.getByRole("button", { name: "Dormant", exact: true }).click();
      await expect(area.locator(".drone-card")).toHaveCount(1);
      await area.getByLabel("Caste", { exact: true }).selectOption("0");
      await expect(
        area.getByText("No Drones match these filters."),
      ).toBeVisible();
      await area
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await expect(area.locator(".drone-card")).toHaveCount(4);
      await area
        .getByRole("button", { name: "Active streak", exact: true })
        .click();
      assert.ok(
        !(await area.locator("tbody").innerText()).includes("DRONE-0003"),
      );
      await area
        .getByRole("button", { name: "Staked PULSE", exact: true })
        .click();
      await expect(area.locator("tbody tr").first()).toContainText(
        "DRONE-0003",
      );
    },
  );
  await run(
    "responsive rendered export at desktop, tablet, phone and 320px with reduced motion and keyboard focus",
    async () => {
      for (const [width, height, name] of [
        [1440, 1000, "desktop-connected"],
        [768, 1024, "tablet-connected"],
        [390, 844, "mobile-connected"],
        [320, 900, "narrow-connected"],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.scrollTo(0, 0));
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          animations: document
            .getAnimations()
            .filter((a) => a.playState === "running").length,
        }));
        assert.ok(
          dimensions.scrollWidth <= width,
          `Horizontal overflow at ${width}px: ${dimensions.scrollWidth}`,
        );
        assert.equal(dimensions.animations, 0);
        const animatedArt = await page
          .locator('img[src^="data:image/svg+xml;base64,"]')
          .evaluateAll((images) =>
            images.some((image) =>
              atob(image.src.split(",")[1]).includes("<animate"),
            ),
          );
        assert.equal(
          animatedArt,
          false,
          "Reduced motion must remove embedded SVG animation too",
        );

        report.viewports.push({ width, height, ...dimensions, result: "pass" });
        await page.screenshot({
          path: `${artifacts}/${name}.png`,
          fullPage: width !== 768,
        });
        if (width === 1440) {
          await page
            .locator(".personal-grid")
            .screenshot({ path: `${artifacts}/drone-detail.png` });
          await page
            .locator(".finance-grid")
            .screenshot({ path: `${artifacts}/finance-detail.png` });
        }
        if (width === 320)
          await page
            .locator("#stake")
            .screenshot({ path: `${artifacts}/narrow-stake.png` });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const enlarged = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        enlarged.scrollWidth <= enlarged.viewport,
        "Overflow with 200% text size",
      );
      report.textEnlargement = {
        percent: 200,
        method: "root font-size (not native browser zoom)",
        ...enlarged,
        result: "pass",
      };
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.emulateMedia({ forcedColors: "active" });
      await page.keyboard.press("Tab");
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .focus();
      report.forcedColors = await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .evaluate((el) => ({
          active: matchMedia("(forced-colors: active)").matches,
          outlineStyle: getComputedStyle(el).outlineStyle,
          outlineWidth: getComputedStyle(el).outlineWidth,
        }));
      assert.equal(report.forcedColors.outlineStyle, "solid");
      await page.emulateMedia({ forcedColors: "none" });
      await page.goto(url);
      await expect(
        page.getByText("Onchain signal connected", { exact: false }),
      ).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page.screenshot({ path: `${artifacts}/keyboard-focus.png` });
      await page.keyboard.press("Enter");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "main",
      );
      await page
        .getByRole("button", { name: "Connect wallet", exact: false })
        .first()
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", { name: "Disconnect", exact: true }),
      ).toBeVisible();
    },
  );
  await run(
    "automated accessibility scan of connected production page",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      report.contrast = await page.evaluate(() => {
        const rgb = (text) =>
          text
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const luminance = (color) =>
          rgb(color)
            .map((c) => {
              const v = c / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const measure = (selector) => {
          const node = document.querySelector(selector);
          const foreground = getComputedStyle(node).color;
          let backgroundNode = node,
            background;
          while (backgroundNode) {
            background = getComputedStyle(backgroundNode).backgroundColor;
            if (
              background !== "rgba(0, 0, 0, 0)" &&
              background !== "transparent"
            )
              break;
            backgroundNode = backgroundNode.parentElement;
          }
          const f = luminance(foreground),
            b = luminance(background);
          return {
            selector,
            foreground,
            background,
            ratio:
              Math.round(
                ((Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05)) * 100,
              ) / 100,
            threshold: 4.5,
          };
        };
        return [
          ".hero-copy > .eyebrow",
          ".hero-actions .primary",
          ".card-heading > p:last-child",
          '.segmented button[aria-pressed="true"]',
          ".amount-field input",
          ".status.alive",
          ".site-header nav a",
        ].map(measure);
      });
      assert.ok(report.contrast.every((pair) => pair.ratio >= pair.threshold));
      report.accessibility = result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          failureSummary: n.failureSummary,
        })),
      }));
      assert.equal(
        result.violations.length,
        0,
        JSON.stringify(report.accessibility, null, 2),
      );
    },
  );
  await run(
    "account and chain changes clear personal state and disable writes",
    async () => {
      mock.state.account = otherAccount;
      await page.evaluate(
        (account) => window.walletTest.emit("accountsChanged", [account]),
        otherAccount,
      );
      await expect(
        page
          .locator("#my-drone")
          .getByRole("button", { name: "Mint your Drone", exact: false }),
      ).toBeEnabled();
      await expect(
        page.locator("#my-drone").getByRole("heading", { name: "DRONE-0004" }),
      ).toHaveCount(0);
      mock.state.chainId = 5;
      await page.evaluate(() => window.walletTest.emit("chainChanged", "0x5"));
      await expect(
        page.getByRole("button", { name: "Switch to Ethereum", exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator("#swap")
          .getByRole("button", { name: "Get quote", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      mock.state.account = account;
      await page.evaluate(
        (account) => window.walletTest.emit("accountsChanged", [account]),
        account,
      );
      await expect(
        page.locator("#my-drone").getByRole("heading", { name: "DRONE-0004" }),
      ).toBeVisible();
    },
  );
  await run(
    "RPC failure, explicit wallet read fallback, and failed deployment checks fail closed",
    async () => {
      mock.state.offline = true;
      await refresh();
      await expect(
        page.getByText("Live data is unavailable.", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator("#my-drone")
          .getByRole("button", { name: "Beat", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Try wallet RPC", exact: true })
        .click();
      await expect(
        page.getByText("Live data is unavailable.", { exact: true }),
      ).toHaveCount(0);
      mock.state.noCode = true;
      await refresh();
      await expect(
        page.getByText("has no deployed code on this network.", {
          exact: false,
        }),
      ).toBeVisible();
      mock.state.noCode = false;
      mock.state.wrongBinding = true;
      await refresh();
      await expect(
        page.getByText("The Drone contract is bound to a different token.", {
          exact: false,
        }),
      ).toBeVisible();
      mock.state.wrongBinding = false;
      mock.state.offline = false;
      await refresh();
    },
  );
  await run(
    "batched global counts, lazy gallery expansion and top 50 leaderboard",
    async () => {
      mock.state.populate(130);
      await refresh();
      const area = page.locator("#hive");
      const batches = mock.state.calls.filter(
        (c) => c.functionName === "getDrones",
      );
      assert.ok(batches.some((c) => c.args[0] === 129n));
      assert.ok(batches.every((c) => c.args[1] <= 256n));
      await expect(area.locator(".drone-card")).toHaveCount(12);
      await area
        .getByRole("button", { name: "Load more Drones", exact: false })
        .click();
      await expect(area.locator(".drone-card")).toHaveCount(24);
      await area
        .getByRole("button", { name: "Show all 50 leaders", exact: false })
        .click();
      await expect(area.locator("tbody tr")).toHaveCount(50);
      await area.getByLabel("Caste", { exact: true }).selectOption("3");
      assert.ok((await area.locator(".drone-card").count()) > 0);
    },
  );
  await run(
    "changing accounts while a transaction is pending never restores the previous account’s Drone",
    async () => {
      const pendingPage = await context.newPage();
      const isolated = makeMock();
      await installMock(pendingPage, isolated);
      await pendingPage.goto(url);
      await expect(
        pendingPage.getByText("Onchain signal connected", { exact: false }),
      ).toBeVisible();
      await pendingPage
        .getByRole("button", { name: "Connect wallet", exact: false })
        .first()
        .click();
      isolated.state.receiptHold = true;
      await pendingPage
        .locator("#my-drone")
        .getByRole("button", { name: "Mint your Drone", exact: false })
        .click();
      await expect(
        pendingPage
          .locator("#my-drone")
          .getByText("Mint submitted.", { exact: false }),
      ).toBeVisible();
      await expect(
        pendingPage.getByRole("button", {
          name: "Check confirmation",
          exact: true,
        }),
      ).toHaveCount(0);
      isolated.state.account = otherAccount;
      await pendingPage.evaluate(
        (account) => window.walletTest.emit("accountsChanged", [account]),
        otherAccount,
      );
      isolated.state.receiptHold = false;
      await expect(
        pendingPage
          .locator("#my-drone")
          .getByRole("button", { name: "Mint your Drone", exact: false }),
      ).toBeEnabled();
      await expect(
        pendingPage
          .locator("#my-drone")
          .getByRole("heading", { name: "DRONE-0004" }),
      ).toHaveCount(0);
      await expect(
        pendingPage
          .locator(".activity")
          .getByText("For wallet", { exact: false }),
      ).toBeVisible();
      assert.equal(
        isolated.state.writes.filter((w) => w.functionName === "mint").length,
        1,
      );
      await pendingPage.close();
    },
  );
  await run(
    "keyboard activation completes connect, mint, approve and stake",
    async () => {
      const keyboardPage = await context.newPage();
      const isolated = makeMock();
      await installMock(keyboardPage, isolated);
      await keyboardPage.goto(url);
      await expect(
        keyboardPage.getByText("Onchain signal connected", { exact: false }),
      ).toBeVisible();
      await keyboardPage.keyboard.press("Tab");
      await expect(
        keyboardPage.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      for (let i = 0; i < 6; i++) await keyboardPage.keyboard.press("Tab");
      await expect(
        keyboardPage
          .getByRole("button", { name: "Connect wallet", exact: false })
          .first(),
      ).toBeFocused();
      await keyboardPage.keyboard.press("Enter");
      const mint = keyboardPage
        .locator("#my-drone")
        .getByRole("button", { name: "Mint your Drone", exact: false });
      await expect(mint).toBeEnabled();
      await mint.focus();
      await keyboardPage.keyboard.press("Enter");
      await expect(
        keyboardPage
          .locator("#my-drone")
          .getByRole("heading", { name: "DRONE-0004" }),
      ).toBeVisible();
      const stake = keyboardPage.locator("#stake");
      await stake.getByLabel("Stake amount", { exact: true }).focus();
      await keyboardPage.keyboard.type("1000");
      await keyboardPage.keyboard.press("Tab");
      await expect(
        stake.getByRole("button", { name: "Max", exact: true }),
      ).toBeFocused();
      await keyboardPage.keyboard.press("Tab");
      await expect(
        stake.getByRole("button", {
          name: "Approve PULSE for staking",
          exact: true,
        }),
      ).toBeFocused();
      await keyboardPage.keyboard.press("Enter");
      await expect(
        stake.getByRole("button", { name: "Stake PULSE", exact: true }),
      ).toBeEnabled();
      await stake
        .getByRole("button", { name: "Stake PULSE", exact: true })
        .focus();
      await keyboardPage.keyboard.press("Enter");
      await expect(
        stake.getByText("Stake confirmed.", { exact: true }),
      ).toBeVisible();
      assert.equal(
        isolated.state.drones.find((d) => d.tokenId === isolated.state.own)
          .staked,
        1000n * 10n ** 18n,
      );
      await keyboardPage.close();
    },
  );
  await run(
    "tampered ABI is rejected before contract reads or signing",
    async () => {
      const tampered = await context.newPage();
      const isolated = makeMock();
      await installMock(tampered, isolated);
      await tampered.route("**/abi/PulseDrone.json", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        }),
      );
      await tampered.goto(url);
      await expect(
        tampered.getByText("PulseDrone interface verification failed.", {
          exact: false,
        }),
      ).toBeVisible();
      assert.equal(isolated.state.writes.length, 0);
      assert.equal(
        isolated.state.calls.filter((c) => c.method === "contract").length,
        0,
      );
      await tampered.close();
    },
  );
  await run(
    "no uncaught application exceptions or failed static resources",
    async () => {
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.resourceErrors, []);
    },
  );
  report.result = "pass";
} catch (error) {
  report.result = "fail";
  report.error = error.message;
  await page
    .screenshot({ path: `${artifacts}/failure.png`, fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.mockTransactions = mock.state.writes.map((w) => ({
    address: w.address,
    functionName: w.functionName,
    value: w.value.toString(),
  }));
  await writeFile(
    `${artifacts}/browser-validation.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
