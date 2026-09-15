import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGrowthBlock,
  auditStaticDiscovery,
  chooseArticle,
  updateSitemapLastmod,
  validateProposal,
} from "../scripts/website-growth-agent.mjs";

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
