#!/usr/bin/env node
// Retakes the user guide's picture of a cohort planning rule (apps/web/public/help/cohort-rule.png): opens the app in a headless
// Chrome, loads the example schedule, fills in the rule from the guide's example in the rule editor, and saves its "Groups of
// students" and "Seats in each section" boxes at double resolution in the light theme.
//
//     pnpm check:prod                     (in another terminal: the built site on http://localhost:5174)
//     pnpm help-shots                     (or: node tools/capture-help-shot.mjs [output.png])
//
// Run it again when the rule editor's look changes. CHROME may name the Chrome program (default: Google Chrome on a Mac);
// APP_URL the site (default http://localhost:5174/).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] ?? `${root}apps/web/public/help/cohort-rule.png`;
const appUrl = (process.env.APP_URL ?? "http://localhost:5174/").replace(/\/?$/, "/");
const chromePath = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = mkdtempSync(`${tmpdir()}/schedulizer-shot-`);
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`, "--window-size=1000,1400", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  // Chrome takes a moment to start listening.
  for (let i = 0; i < 50 && !target; i++) { try { target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json(); } catch { await sleep(200); } }
  if (!target) throw new Error(`Chrome did not start (${chromePath}); set CHROME to its program`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const waiting = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1400, deviceScaleFactor: 2, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: `${appUrl}#/import` });
  await sleep(2500);
  const fill = `(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const setv = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    const inp = document.querySelector('input[placeholder^="https://"]'); setv(inp, "examples/example-schedule.xlsx"); await w(200);
    [...document.querySelectorAll("button")].find((b) => /Open address/.test(b.textContent)).click(); await w(2500);
    location.hash = "#/constraints"; await w(800);
    [...document.querySelectorAll("button")].find((b) => /Add rule/.test(b.textContent)).click(); await w(400);
    setv(document.querySelector("dialog input"), "First-year engineers");
    [...document.querySelectorAll("dialog label")].find((l) => l.textContent.includes("Cohort planning.")).querySelector("input").click(); await w(300);
    const groups = [["50", ["MATH 161", "ENGR 101", "CHEM 101"]], ["25", ["MATH 162", "ENGR 101", "CHEM 101"]], ["10", ["MATH 161"]], ["5", ["ENGR 101"]]];
    for (let g = 0; g < groups.length; g++) {
      if (g > 0) { [...document.querySelectorAll("dialog button")].find((b) => b.textContent === "+ Add group of students").click(); await w(150); }
      setv(document.querySelectorAll(".cohort-element")[g].querySelector('input[aria-label="Number of students"]'), groups[g][0]); await w(50);
      for (let c = 0; c < groups[g][1].length; c++) {
        if (c > 0) { document.querySelectorAll(".cohort-element")[g].querySelector(".cohort-courses > button").click(); await w(100); }
        setv(document.querySelectorAll(".cohort-element")[g].querySelectorAll(".cohort-course input")[c], groups[g][1][c]); await w(50);
      }
    }
    await w(200);
    const seats = { "MATH 161": "32", "ENGR 101": "40", "CHEM 101": "25", "MATH 162": "30" };
    for (const tr of document.querySelectorAll(".seats-table tbody tr")) { setv(tr.querySelector("input"), seats[tr.querySelector(".seat-course").textContent]); await w(50); }
    document.activeElement.blur(); await w(300);
    const fs = [...document.querySelectorAll("dialog fieldset")].filter((f) => /Groups of students|Seats in each section/.test(f.querySelector("legend")?.textContent || ""));
    fs[0].scrollIntoView({ block: "start" }); await w(300);
    const a = fs[0].getBoundingClientRect(), b = fs[1].getBoundingClientRect();
    return { x: a.left - 12, y: a.top - 12, width: b.right - a.left + 24, height: b.bottom - a.top + 24 };
  })()`;
  const clip = await run(fill);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log(`wrote ${out}`);
  ws.close();
} finally {
  // Chrome writes to its profile as it shuts down: wait for it before removing the profile.
  await new Promise((r) => { chrome.once("exit", r); chrome.kill(); });
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
