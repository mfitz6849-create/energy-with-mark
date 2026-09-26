import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyGrowthBlock,
  auditStaticDiscovery,
  buildGrowthPrompt,
  buildVisibilitySnapshot,
  buildWebsiteInventory,
  chooseArticle,
  extractSitemapEntries,
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

test("whole-site inventory automatically admits a new low-risk educational article", () => {
  const pageMap = new Map([
    ["index.html", "<html><body>Home</body></html>"],
    ["articles/new-useful-guide.html", '<html><body><div class="quick-answer">Answer</div><p>Evergreen solar education.</p></body></html>'],
  ]);
  const sitemap = '<urlset><url><loc>https://energywithmark.com.au/</loc><lastmod>2026-09-20</lastmod></url><url><loc>https://energywithmark.com.au/articles/new-useful-guide.html</loc><lastmod>2026-09-20</lastmod></url></urlset>';
  const inventory = buildWebsiteInventory({ pageMap, sitemap, now: new Date("2026-09-26T00:00:00Z") });
  const candidate = inventory.find((item) => item.path === "articles/new-useful-guide.html");
  assert.equal(candidate?.status, "Improvement opportunity");
  assert.equal(candidate?.riskClass, "low");
  assert.equal(chooseArticle(new Map([["articles/new-useful-guide.html", pageMap.get("articles/new-useful-guide.html")]]), inventory), "articles/new-useful-guide.html");
});

test("previously improved content returns for review after its cadence", () => {
  const html = '<html><body><div class="quick-answer">Answer</div><!-- EWM-GROWTH:START -->old<!-- EWM-GROWTH:END --></body></html>';
  const pageMap = new Map([["articles/old-guide.html", html]]);
  const sitemap = '<urlset><url><loc>https://energywithmark.com.au/articles/old-guide.html</loc><lastmod>2026-07-01</lastmod></url></urlset>';
  const inventory = buildWebsiteInventory({ pageMap, sitemap, now: new Date("2026-09-26T00:00:00Z") });
  assert.equal(inventory[0].status, "Review due");
});

test("time-sensitive claim language cannot enter low-risk auto publication", () => {
  const pageMap = new Map([["articles/rebate-guide.html", '<html><body><div class="quick-answer">Answer</div><p>A government rebate is available.</p></body></html>']]);
  const sitemap = '<urlset><url><loc>https://energywithmark.com.au/articles/rebate-guide.html</loc><lastmod>2026-09-20</lastmod></url></urlset>';
  const inventory = buildWebsiteInventory({ pageMap, sitemap, now: new Date("2026-09-26T00:00:00Z") });
  assert.equal(inventory[0].status, "Current information verification required");
  assert.equal(inventory[0].autoEligible, false);
  assert.equal(chooseArticle(pageMap, inventory), null);
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

test("agent inserts or replaces one visible answer block and FAQ structured data", () => {
  const html = '<html><head><meta content="2026-08-08" property="article:modified_time"/><script type="application/ld+json">{"dateModified":"2026-08-08"}</script></head><body><div class="quick-answer"><span>Short answer</span><p>Existing answer.</p></div><h2>Next</h2></body></html>';
  const updated = applyGrowthBlock(html, safeProposal, "2026-09-15");
  assert.match(updated, /<!-- EWM-GROWTH:START -->/);
  assert.match(updated, /What matters most/);
  assert.match(updated, /Common questions/);
  assert.match(updated, /"@type":"FAQPage"/);
  assert.match(updated, /article:modified_time/);
  assert.match(updated, /content="2026-09-15" property="article:modified_time"/);
  assert.match(updated, /"dateModified":"2026-09-15"/);
  const refreshed = applyGrowthBlock(updated, { ...safeProposal, summary: safeProposal.summary + " It should be reviewed again when the page meaning changes." }, "2026-09-26");
  assert.equal((refreshed.match(/<!-- EWM-GROWTH:START -->/g) || []).length, 1);
  assert.equal((refreshed.match(/id="ewm-growth-faq-schema"/g) || []).length, 1);
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
    robots: "User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://energywithmark.com.au/sitemap.xml\n",
    sitemap: `https://energywithmark.com.au/${articlePath}`,
    llms: "https://energywithmark.com.au/learn.html",
    articlePath,
  });
  assert.deepEqual(configured, []);

  const missing = auditStaticDiscovery({ robots: "User-agent: *\nAllow: /\n", sitemap: "", llms: "", articlePath });
  assert.ok(missing.length >= 4);
});




test("visibility snapshot measures AI-search readiness without inventing ranking", () => {
  const snapshot = buildVisibilitySnapshot({
    robots: "User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://energywithmark.com.au/sitemap.xml\n",
    sitemap: "<urlset><url><loc>https://energywithmark.com.au/</loc></url><url><loc>https://energywithmark.com.au/articles/example.html</loc></url></urlset>",
    llms: "# Energy With Mark\n- Knowledge hub: https://energywithmark.com.au/learn.html",
    indexHtml: '<link rel="canonical" href="https://energywithmark.com.au/"/><script type="application/ld+json">{"@graph":[{"@type":"Person"},{"@type":"WebSite"}]}</script>',
    articleMap: new Map([["articles/example.html", "<!-- EWM-GROWTH:START -->"]]),
  });
  assert.equal(snapshot.readinessPercent, 100);
  assert.equal(snapshot.sitemapUrlCount, 2);
  assert.equal(snapshot.knowledgeArticleCount, 1);
  assert.equal(snapshot.enrichedArticleCount, 1);
  assert.match(snapshot.measurementBoundary, /Search ranking, AI citation share and traffic are not inferred/);
});

test("repository-grounded fallback is available only for reviewed matching pages", () => {
  const page = "<html><body>A recent electricity bill. The property address. Existing solar details. Future changes.</body></html>";
  const proposal = groundedFallbackProposal("articles/what-information-needed-for-solar-assessment.html", page);
  assert.equal(proposal?.decision, "publish");
  assert.deepEqual(validateProposal(proposal), { ok: true, reason: "Safe grounded evergreen enrichment." });
  assert.equal(groundedFallbackProposal("articles/what-information-needed-for-solar-assessment.html", "<html>missing anchors</html>"), null);
  assert.equal(groundedFallbackProposal("articles/not-reviewed.html", page), null);
});

test("scheduled workflow records every check and sends every visible change through guarded PR CI", async () => {
  const [workflow, ci, autoMerge, script] = await Promise.all([
    read(".github/workflows/website-growth-agent.yml"),
    read(".github/workflows/website-growth-agent-ci.yml"),
    read(".github/workflows/website-growth-agent-automerge.yml"),
    read("scripts/website-growth-agent.mjs"),
  ]);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron: "17 1 \* \* \*"/);
  assert.match(workflow, /--prepare-checkin/);
  assert.match(workflow, /https:\/\/intake\.energywithmark\.com\.au\/api\/website-growth\/checkin/);
  assert.match(workflow, /https:\/\/intake\.energywithmark\.com\.au\/api\/website-growth\/prepare/);
  assert.doesNotMatch(workflow, /control\.energywithmark\.com\.au\/api\/website-growth/);
  assert.match(workflow, /--prepare-request/);
  assert.match(workflow, /ewm-growth\/run-/);
  assert.match(workflow, /gh workflow run website-growth-agent-ci\.yml/);
  assert.match(workflow, /repository-grounded-safe-fallback/);
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
  assert.doesNotMatch(workflow, /how-big-should-home-battery-be\.html\|/);
  assert.match(script, /buildWebsiteInventory/);
  assert.match(script, /REVIEW_DAYS/);
  assert.doesNotMatch(script, /SAFE_ARTICLES/);
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /Independently verify a dispatched generated article diff/);
  assert.match(autoMerge, /RUN_EVENT.*workflow_run\.event/s);
  assert.match(autoMerge, /visible-article/);
  assert.match(autoMerge, /pages\/builds/);
});


test("sitemap extraction keeps canonical public page inventory separate from performance claims", () => {
  const entries = extractSitemapEntries('<urlset><url><loc>https://energywithmark.com.au/</loc><lastmod>2026-09-26</lastmod></url><url><loc>https://energywithmark.com.au/articles/example.html</loc><lastmod>2026-09-20</lastmod></url></urlset>');
  assert.equal(entries.get("index.html"), "2026-09-26");
  assert.equal(entries.get("articles/example.html"), "2026-09-20");
});
