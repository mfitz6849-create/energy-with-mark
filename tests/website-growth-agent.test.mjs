import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyGrowthBlock,
  auditStaticDiscovery,
  buildGrowthPrompt,
  chooseArticle,
  groundedFallbackProposal,
  updateSitemapLastmod,
  validateProposal,
} from "../scripts/website-growth-agent.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const safeProposal = {
  decision: "publish",
  summary: "Battery size should match the energy a home can store and is likely to use later, rather than simply choosing the largest option available.",
  whatMatters: [
    "Start with the solar energy that is normally left over during the day.",
    "Compare that surplus with the electricity the home still uses after solar production falls.",
    "Treat blackout backup as a separate design question from everyday battery use."
  ],
  faq: [
    { q: "Is a bigger battery always the better choice?", a: "No. A battery is more useful when its capacity matches the energy available to charge it and the energy the home is likely to use later." },
    { q: "Should future electricity use be considered?", a: "Yes. Changes such as an electric vehicle or additional electric appliances can alter the amount of energy the home is likely to need later." }
  ],
  reason: "Grounded summary of the existing article."
};

test("safe grounded evergreen proposal passes", () => {
  assert.deepEqual(validateProposal(safeProposal), { ok: true, reason: "Safe grounded evergreen enrichment." });
});

test("numeric or financial and time-sensitive claim language fails closed", () => {
  assert.equal(validateProposal({ ...safeProposal, summary: `${safeProposal.summary} Save 20 percent.` }).ok, false);
  assert.equal(validateProposal({ ...safeProposal, summary: `${safeProposal.summary} A government rebate may apply.` }).ok, false);
  assert.equal(validateProposal({ ...safeProposal, summary: `${safeProposal.summary} Typical payback may improve.` }).ok, false);
});

test("agent chooses only the first safe article without an enrichment marker", () => {
  const map = new Map([
    ["articles/how-big-should-home-battery-be.html", "<html><!-- EWM-GROWTH:START --></html>"],
    ["articles/do-i-need-hybrid-inverter-for-battery.html", "<html>candidate</html>"],
    ["articles/does-battery-mean-whole-home-backup.html", "<html>candidate two</html>"]
  ]);
  assert.equal(chooseArticle(map), "articles/do-i-need-hybrid-inverter-for-battery.html");
});

test("growth prompt is grounded and explicitly denies risky claim classes and file edits", () => {
  const prompt = buildGrowthPrompt("articles/example.html", "<h1>Battery guide</h1><p>Use the existing energy profile.</p>");
  assert.match(prompt, /Use ONLY the supplied page text/);
  assert.match(prompt, /Do not use outside facts/);
  assert.match(prompt, /Do not add prices, savings, payback, ROI, tariffs, rebates, grants, incentives/);
  assert.match(prompt, /do not place any digits/);
  assert.match(prompt, /do not use these words: price, cost, saving, savings/);
  assert.match(prompt, /Do not edit files and do not use tools/);
  assert.match(prompt, /Battery guide Use the existing energy profile/);
});

test("agent inserts a visible answer block and FAQ structured data", () => {
  const html = '<html><head><meta content="2026-08-08" property="article:modified_time"/><script type="application/ld+json">{"dateModified":"2026-08-08"}</script></head><body><div class="quick-answer"><span>Short answer</span><p>Existing answer.</p></div><h2>Next</h2></body></html>';
  const updated = applyGrowthBlock(html, safeProposal, "2026-09-15");
  assert.match(updated, /<!-- EWM-GROWTH:START -->/);
  assert.match(updated, /What matters most/);
  assert.match(updated, /Common questions/);
  assert.match(updated, /"@type":"FAQPage"/);
  assert.match(updated, /article:modified_time/);
  assert.match(updated, /content="2026-09-15" property="article:modified_time"/);
  assert.match(updated, /"dateModified":"2026-09-15"/);
});

test("sitemap updater changes only the target article date", () => {
  const xml = '<?xml version="1.0"?><urlset><url><loc>https://energywithmark.com.au/articles/how-big-should-home-battery-be.html</loc><lastmod>2026-08-29</lastmod></url><url><loc>https://energywithmark.com.au/learn.html</loc><lastmod>2026-08-29</lastmod></url></urlset>';
  const updated = updateSitemapLastmod(xml, "articles/how-big-should-home-battery-be.html", "2026-09-15");
  assert.match(updated, /how-big-should-home-battery-be\.html<\/loc><lastmod>2026-09-15<\/lastmod>/);
  assert.match(updated, /learn\.html<\/loc><lastmod>2026-08-29<\/lastmod>/);
});

test("discovery audit requires explicit AI search crawler, sitemap and AI site guide", () => {
  const articlePath = "articles/how-big-should-home-battery-be.html";
  const configured = auditStaticDiscovery({
    robots: "User-agent: OAI-SearchBot\nAllow: /\nSitemap: https://energywithmark.com.au/sitemap.xml\n",
    sitemap: `https://energywithmark.com.au/${articlePath}`,
    llms: "https://energywithmark.com.au/learn.html",
    articlePath,
  });
  assert.deepEqual(configured, []);

  const missing = auditStaticDiscovery({ robots: "User-agent: *\nAllow: /\n", sitemap: "", llms: "", articlePath });
  assert.ok(missing.length >= 4);
});


test("repository-grounded fallback is available only for reviewed matching pages", () => {
  const page = "<html><body>A recent electricity bill. The property address. Existing solar details. Future changes.</body></html>";
  const proposal = groundedFallbackProposal("articles/what-information-needed-for-solar-assessment.html", page);
  assert.equal(proposal?.decision, "publish");
  assert.deepEqual(validateProposal(proposal), { ok: true, reason: "Safe grounded evergreen enrichment." });
  assert.equal(groundedFallbackProposal("articles/what-information-needed-for-solar-assessment.html", "<html>missing anchors</html>"), null);
  assert.equal(groundedFallbackProposal("articles/not-reviewed.html", page), null);
});

test("scheduled workflow uses private Business System AI with OIDC and bounded pull-request publishing", async () => {
  const [workflow, ci, autoMerge, script] = await Promise.all([
    read(".github/workflows/website-growth-agent.yml"),
    read(".github/workflows/website-growth-agent-ci.yml"),
    read(".github/workflows/website-growth-agent-automerge.yml"),
    read("scripts/website-growth-agent.mjs"),
  ]);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /https:\/\/control\.energywithmark\.com\.au\/api\/website-growth\/prepare/);
  assert.match(workflow, /--prepare-request/);
  assert.match(workflow, /ewm-growth\/run-/);
  assert.match(workflow, /gh workflow run website-growth-agent-ci\.yml/);
  assert.doesNotMatch(workflow, /copilot-requests: write/);
  assert.doesNotMatch(workflow, /Install GitHub Copilot CLI fallback/);
  assert.match(workflow, /Prepare repository-grounded safe fallback/);
  assert.match(workflow, /--prepare-fallback/);
  assert.match(workflow, /repository-grounded-safe-fallback/);
  assert.match(workflow, /Publish the repository-reviewed fallback/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.match(workflow, /gh workflow run indexnow\.yml/);
  assert.match(workflow, /model != 'repository-grounded-safe-fallback'/);
  assert.match(workflow, /pull-request channel is unavailable, so nothing was published/);
  assert.match(script, /DEFAULT_MODEL = "control-centre-workers-ai"/);
  assert.match(script, /mode: "business-system-managed"/);
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /Independently verify a dispatched generated article diff/);
  assert.match(autoMerge, /RUN_EVENT.*workflow_run\.event/s);
  assert.match(autoMerge, /visible-article/);
  assert.match(autoMerge, /pages\/builds/);
  assert.match(autoMerge, /gh workflow run indexnow\.yml/);
});
