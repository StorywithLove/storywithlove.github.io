import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("build emits a GitHub Pages-ready entry document", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Red Earth Lab · 能源与 AI 项目库<\/title>/);
  assert.match(html, /id="root"/);
  assert.match(html, /src="\/assets\//);
  assert.doesNotMatch(html, /codex-preview|database password|private key/i);
});

test("build includes a bespoke social preview", async () => {
  const image = await stat(new URL("../dist/og.png", import.meta.url));
  assert.ok(image.size > 10_000);
});

test("production bundle contains the OCI primary and Solar Centre fallback", async () => {
  const assets = await import("node:fs/promises").then(({ readdir }) =>
    readdir(new URL("../dist/assets/", import.meta.url)),
  );
  const javascript = assets.filter((name) => name.endsWith(".js"));
  const bundle = (
    await Promise.all(
      javascript.map((name) => readFile(new URL(`../dist/assets/${name}`, import.meta.url), "utf8")),
    )
  ).join("\n");
  assert.match(bundle, /api\.xn--fhq9f80kj05g\.com\/api\/v1/);
  assert.match(bundle, /solarcentre\.spinifexvalley\.com\.au\/power\/average/);
});
