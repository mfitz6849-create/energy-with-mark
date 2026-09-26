import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_MODEL = "control-centre-workers-ai";
const REVIEW_DAYS = 45;
const RECENT_IMPROVEMENT_DAYS = 30;
const PROTECTED_ROOT_PAGES = new Set([
  "assessment.html", "book.html", "calculator.html", "contact.html", "privacy.html",
  "service-relationship.html", "upload-ack.html", "upload-bill.html"
]);
const BLOCKED_CLAIM_PATTERN = /(?:\$|%|\brebate\b|\bgrant\b|\bincentive\b|\bgovernment\b|\bpayback\b|\bROI\b|\bprice\b|\bcost\b|\bsaving(?:s)?\b|\btariff\b|\bfeed-in\b|\brate\b)/i;
const GROWTH_MARKER = "<!-- EWM-GROWTH:START -->";
const GROWTH_END_MARKER = "<!-- EWM-GROWTH:END -->";
const SOURCE_CURRENT_INFORMATION_PATTERN = /(?:\$|%|\brebate\b|\bgrant\b|\bincentive\b|\bgovernment\s+program\b|\bpayback\b|\bROI\b|\bprice\b|\bcost\b|\bsaving(?:s)?\b|\btariff\b|\bfeed-in\b|\bnetwork\s+rule\b|\bwarranty\b|\bspecification\b|\bavailability\b)/i;

export function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractJson(text) {
  const raw = String(text ?? "").trim();
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain a JSON object.");
  return JSON.parse(unfenced.slice(start, end + 1));
}

export function validateProposal(proposal) {
  if (!proposal || proposal.decision !== "publish") return { ok: false, reason: "AI did not return a publish decision." };
  if (typeof proposal.summary !== "string" || proposal.summary.length < 70 || proposal.summary.length > 650) {
    return { ok: false, reason: "Summary length is outside the allowed range." };
  }
  if (!Array.isArray(proposal.whatMatters) || proposal.whatMatters.length !== 3 || proposal.whatMatters.some((item) => typeof item !== "string" || item.length < 20 || item.length > 220)) {
    return { ok: false, reason: "Exactly three concise what-matters points are required." };
  }
  if (!Array.isArray(proposal.faq) || proposal.faq.length < 2 || proposal.faq.length > 3) {
    return { ok: false, reason: "Two or three FAQs are required." };
  }
  for (const item of proposal.faq) {
    if (!item || typeof item.q !== "string" || typeof item.a !== "string" || item.q.length < 12 || item.q.length > 140 || item.a.length < 35 || item.a.length > 420) {
      return { ok: false, reason: "FAQ question or answer length is outside the allowed range." };
    }
  }
  const combined = [proposal.summary, ...proposal.whatMatters, ...proposal.faq.flatMap((item) => [item.q, item.a])].join(" ");
  if (/\d/.test(combined)) return { ok: false, reason: "Generated visible copy contains digits; the low-risk agent does not auto-publish new numeric claims." };
  if (BLOCKED_CLAIM_PATTERN.test(combined)) return { ok: false, reason: "Generated visible copy contains financial or time-sensitive claim language that requires review." };
  return { ok: true, reason: "Safe grounded evergreen enrichment." };
}


const GROUNDED_FALLBACKS = {
  "articles/what-information-needed-for-solar-assessment.html": {
    anchors: ["recent electricity bill", "property address", "existing solar details", "future changes"],
    proposal: {
      decision: "publish",
      summary: "You can begin with a recent electricity bill, the property address, details of any existing solar and a clear description of what you want help with. More detailed information can be added if the assessment shows it is needed.",
      whatMatters: [
        "A recent electricity bill is enough to begin the first review.",
        "Existing solar details help explain what is already at the property.",
        "Your goals and likely future changes guide the next questions."
      ],
      faq: [
        { q: "Do I need to know the right system size first?", a: "No. The first review starts with your electricity use, property and goals. System size comes later in the assessment." },
        { q: "What if I only have a recent electricity bill?", a: "That is enough to begin. If more detail is needed, Mark can explain exactly what information to provide next." }
      ],
      reason: "Repository-reviewed fallback grounded in the current assessment-information article."
    }
  },
  "articles/what-is-solar-self-consumption.html": {
    anchors: ["self-consumption", "exported", "battery", "load timing"],
    proposal: {
      decision: "publish",
      summary: "Solar self-consumption is the solar electricity used at the property while the panels are producing. Understanding when energy is used helps show whether solar, load shifting or a battery may fit the way the property operates.",
      whatMatters: [
        "Daytime energy use can be supplied directly by solar generation.",
        "Extra solar may be exported or stored for use later.",
        "Load timing helps explain which design may suit the property."
      ],
      faq: [
        { q: "How can a property use more of its own solar?", a: "Flexible loads can be moved into solar hours where practical, so more solar is used while the panels are producing." },
        { q: "Does every property with exports need a battery?", a: "No. A battery is one option. The later energy use and available surplus solar should be understood first." }
      ],
      reason: "Repository-reviewed fallback grounded in the current self-consumption article."
    }
  },
  "articles/why-i-need-your-electricity-bill.html": {
    anchors: ["recent electricity bill", "existing solar exports", "commercial customers", "usage information"],
    proposal: {
      decision: "publish",
      summary: "A recent electricity bill gives a factual starting point for understanding energy use, account structure and any existing solar exports. It helps identify what should be checked before equipment options are discussed.",
      whatMatters: [
        "The bill helps show how much electricity the property uses.",
        "Existing solar exports can help explain the current energy pattern.",
        "More detailed usage information may be needed for a complex project."
      ],
      faq: [
        { q: "What can you learn from one electricity bill?", a: "It can provide a starting view of electricity use, account details and existing solar exports before further information is requested." },
        { q: "Is one bill always enough for an assessment?", a: "It is enough to begin. Seasonal or complex projects may need more bills or detailed usage information before a recommendation is prepared." }
      ],
      reason: "Repository-reviewed fallback grounded in the current electricity-bill article."
    }
  }
};

export function groundedFallbackProposal(articlePath, articleHtml) {
  const fallback = GROUNDED_FALLBACKS[articlePath];
  if (!fallback) return null;
  const pageText = stripHtml(articleHtml).toLowerCase();
  if (!fallback.anchors.every((anchor) => pageText.includes(anchor))) return null;
  const validation = validateProposal(fallback.proposal);
  return validation.ok ? structuredClone(fallback.proposal) : null;
}

function isoDaysAgo(value, now = new Date()) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? Math.floor((now.getTime() - parsed) / 86400000) : Number.POSITIVE_INFINITY;
}

export function extractSitemapEntries(xml) {
  const entries = new Map();
  const re = /<url><loc>https:\/\/energywithmark\.com\.au\/([^<]*)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g;
  for (const match of String(xml || "").matchAll(re)) {
    const raw = match[1] || "";
    const localPath = raw === "" ? "index.html" : raw.replace(/^\//, "");
    entries.set(localPath, match[2] || "");
  }
  return entries;
}

export function buildWebsiteInventory({ pageMap, sitemap, now = new Date() }) {
  const sitemapEntries = extractSitemapEntries(sitemap);
  const paths = new Set([...sitemapEntries.keys(), ...[...pageMap.keys()].filter((p) => p.startsWith("articles/"))]);
  for (const root of pageMap.keys()) {
    if (!root.includes("/") && root.endsWith(".html") && !["404.html", "upload-ack.html"].includes(root)) paths.add(root);
  }
  return [...paths].sort().map((pagePath) => {
    const html = pageMap.get(pagePath) || "";
    const pageText = stripHtml(html);
    const inSitemap = sitemapEntries.has(pagePath);
    const lastModified = sitemapEntries.get(pagePath) || "";
    const pageClass = pagePath.startsWith("articles/")
      ? "article"
      : PROTECTED_ROOT_PAGES.has(pagePath) ? "protected_workflow" : "public_page";
    const currentInformationRequired = SOURCE_CURRENT_INFORMATION_PATTERN.test(pageText);
    const riskClass = pageClass === "protected_workflow"
      ? "protected"
      : currentInformationRequired ? "current_information" : "low";
    const autoEligible = pageClass === "article" && riskClass === "low" && inSitemap && html.includes('class="quick-answer"');
    let status = "Healthy";
    let reason = "Monitored; no bounded improvement is currently due.";
    if (!html) {
      status = "Technical issue";
      reason = "Sitemap entry has no matching local HTML source.";
    } else if (!inSitemap) {
      status = "Technical issue";
      reason = "Public article exists but is missing from sitemap.xml.";
    } else if (currentInformationRequired) {
      status = "Current information verification required";
      reason = "Time-sensitive or higher-risk claim language requires current evidence before automatic rewriting.";
    } else if (autoEligible && !html.includes(GROWTH_MARKER)) {
      status = "Improvement opportunity";
      reason = "Low-risk educational article has not yet received the bounded answer/FAQ enhancement.";
    } else if (autoEligible && isoDaysAgo(lastModified, now) >= REVIEW_DAYS) {
      status = "Review due";
      reason = "Previously improved low-risk content has reached its deeper-review cadence.";
    }
    return { path: pagePath, status, pageClass, riskClass, autoEligible, lastModified, reason };
  });
}

export function chooseArticle(articleMap, inventory = []) {
  const queue = inventory.filter((item) => item.autoEligible && ["Improvement opportunity", "Review due"].includes(item.status));
  queue.sort((a, b) => {
    const priority = (v) => v.status === "Improvement opportunity" ? 0 : 1;
    return priority(a) - priority(b) || a.path.localeCompare(b.path);
  });
  const selected = queue.find((item) => articleMap.has(item.path));
  return selected?.path || null;
}

export function buildGrowthPrompt(articlePath, articleHtml) {
  const articleText = stripHtml(articleHtml).slice(0, 18000);
  return `You are the Energy With Mark Website Visibility Agent. Improve one existing Australian solar/battery educational page for conventional search and AI-powered search. You are not allowed to invent facts. Use ONLY the supplied page text below. Do not use outside facts even if you know them. Do not add prices, savings, payback, ROI, tariffs, rebates, grants, incentives, government-program details, product specifications, legal claims, customer-specific advice, testimonials or numeric claims. In summary, whatMatters, FAQ questions and FAQ answers, do not place any digits and do not use these words: price, cost, saving, savings, rate, tariff, feed-in, rebate, grant, incentive, government, payback or ROI. Keep language simple, useful and natural. Avoid keyword stuffing and avoid near-duplicate/location doorway content. Mark Fitzpatrick remains the human adviser and author. Do not edit files and do not use tools; return the answer only. Return JSON only with this exact shape: {"decision":"publish"|"no_change","summary":"...","whatMatters":["...","...","..."],"faq":[{"q":"...","a":"..."},{"q":"...","a":"..."}],"reason":"..."}. If the page cannot be safely improved from its own text, return decision no_change.\n\nPage path: ${articlePath}\n\nPublished page text:\n${articleText}`;
}

export function applyGrowthBlock(html, proposal, today) {
  let base = html;
  const existingStart = base.indexOf(GROWTH_MARKER);
  const existingEnd = existingStart >= 0 ? base.indexOf(GROWTH_END_MARKER, existingStart) : -1;
  if (existingStart >= 0 && existingEnd >= 0) {
    base = base.slice(0, existingStart) + base.slice(existingEnd + GROWTH_END_MARKER.length);
  }
  base = base.replace(/<script id="ewm-growth-faq-schema" type="application\/ld\+json">[\s\S]*?<\/script>/g, "");

  const quickAnswerStart = base.indexOf('class="quick-answer"');
  const quickAnswerClose = quickAnswerStart >= 0 ? base.indexOf("</div>", quickAnswerStart) : -1;
  if (quickAnswerClose < 0) throw new Error("Could not find the existing quick-answer block.");
  const insertionPoint = quickAnswerClose + "</div>".length;
  const matters = proposal.whatMatters.map((item) => `<li>${htmlEscape(item)}</li>`).join("");
  const faqVisible = proposal.faq.map((item) => `<h3>${htmlEscape(item.q)}</h3><p>${htmlEscape(item.a)}</p>`).join("");
  const visibleBlock = `${GROWTH_MARKER}<div class="example-box ewm-growth-answer"><h2>What matters most</h2><p>${htmlEscape(proposal.summary)}</p><ul>${matters}</ul><h2>Common questions</h2>${faqVisible}</div>${GROWTH_END_MARKER}`;

  let updated = base.slice(0, insertionPoint) + visibleBlock + base.slice(insertionPoint);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: proposal.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
  const schemaScript = `<script id="ewm-growth-faq-schema" type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
  updated = updated.replace("</head>", `${schemaScript}</head>`);
  updated = updated.replace(/(<meta content=")[^"]+(" property="article:modified_time"\/>)/i, `$1${today}$2`);
  updated = updated.replace(/("dateModified":")[^"]+("?)/i, `$1${today}$2`);
  return updated;
}

export function updateSitemapLastmod") + "[\\s\\S]*?" + GROWTH_END_MARKER.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\export function applyGrowthBlock(html, proposal, today) {
  const quickAnswerStart = html.indexOf('class="quick-answer"');
  const quickAnswerClose = quickAnswerStart >= 0 ? html.indexOf("</div>", quickAnswerStart) : -1;
  if (quickAnswerClose < 0) throw new Error("Could not find the existing quick-answer block.");
  const insertionPoint = quickAnswerClose + "</div>".length;
  const matters = proposal.whatMatters.map((item) => `<li>${htmlEscape(item)}</li>`).join("");
  const faqVisible = proposal.faq.map((item) => `<h3>${htmlEscape(item.q)}</h3><p>${htmlEscape(item.a)}</p>`).join("");
  const visibleBlock = `${GROWTH_MARKER}<div class="example-box ewm-growth-answer"><h2>What matters most</h2><p>${htmlEscape(proposal.summary)}</p><ul>${matters}</ul><h2>Common questions</h2>${faqVisible}</div><!-- EWM-GROWTH:END -->`;

  let updated = html.slice(0, insertionPoint) + visibleBlock + html.slice(insertionPoint);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: proposal.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
  const schemaScript = `<script id="ewm-growth-faq-schema" type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
  updated = updated.replace("</head>", `${schemaScript}</head>`);
  updated = updated.replace(/(<meta content=")[^"]+(" property="article:modified_time"\/>)/i, `$1${today}$2`);
  updated = updated.replace(/("dateModified":")[^"]+("?)/i, `$1${today}$2`);
  return updated;
}

export function updateSitemapLastmod"), "g"), "")
    .replace(/<script id="ewm-growth-faq-schema" type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  const quickAnswerStart = base.indexOf('class="quick-answer"');
  const quickAnswerClose = quickAnswerStart >= 0 ? base.indexOf("</div>", quickAnswerStart) : -1;
  if (quickAnswerClose < 0) throw new Error("Could not find the existing quick-answer block.");
  const insertionPoint = quickAnswerClose + "</div>".length;
  const matters = proposal.whatMatters.map((item) => `<li>${htmlEscape(item)}</li>`).join("");
  const faqVisible = proposal.faq.map((item) => `<h3>${htmlEscape(item.q)}</h3><p>${htmlEscape(item.a)}</p>`).join("");
  const visibleBlock = `${GROWTH_MARKER}<div class="example-box ewm-growth-answer"><h2>What matters most</h2><p>${htmlEscape(proposal.summary)}</p><ul>${matters}</ul><h2>Common questions</h2>${faqVisible}</div>${GROWTH_END_MARKER}`;

  let updated = base.slice(0, insertionPoint) + visibleBlock + base.slice(insertionPoint);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: proposal.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
  const schemaScript = `<script id="ewm-growth-faq-schema" type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
  updated = updated.replace("</head>", `${schemaScript}</head>`);
  updated = updated.replace(/(<meta content=")[^"]+(" property="article:modified_time"\/>)/i, `$1${today}$2`);
  updated = updated.replace(/("dateModified":")[^"]+("?)/i, `$1${today}$2`);
  return updated;
}

export function updateSitemapLastmod(xml, articlePath, today) {
  const url = `https://energywithmark.com.au/${articlePath}`;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<url><loc>${escaped}<\\/loc><lastmod>)[^<]+(<\\/lastmod><\\/url>)`);
  if (!re.test(xml)) throw new Error(`Sitemap entry not found for ${articlePath}`);
  return xml.replace(re, `$1${today}$2`);
}

export function auditStaticDiscovery({ robots, sitemap, llms, articlePath }) {
  const issues = [];
  if (!/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots)) issues.push("robots.txt does not explicitly allow OAI-SearchBot");
  if (!/User-agent:\s*\*[\s\S]*?Allow:\s*\//i.test(robots)) issues.push("robots.txt does not allow normal search crawling");
  if (!robots.includes("https://energywithmark.com.au/sitemap.xml")) issues.push("robots.txt does not reference the sitemap");
  if (!sitemap.includes(`https://energywithmark.com.au/${articlePath}`)) issues.push("changed article is absent from sitemap.xml");
  if (!llms.includes("https://energywithmark.com.au/learn.html")) issues.push("llms.txt does not expose the knowledge hub");
  return issues;
}

export function buildVisibilitySnapshot({ robots, sitemap, llms, indexHtml, articleMap }) {
  const sitemapUrls = [...String(sitemap || "").matchAll(/<loc>(https:\/\/energywithmark\.com\.au\/[^<]*)<\/loc>/g)].map((match) => match[1]);
  const articleUrls = sitemapUrls.filter((url) => url.includes("/articles/"));
  const enrichedArticles = [...articleMap.values()].filter((html) => html.includes(GROWTH_MARKER)).length;
  const checks = {
    aiSearchCrawlerAllowed: /User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots),
    normalSearchCrawlerAllowed: /User-agent:\s*\*[\s\S]*?Allow:\s*\//i.test(robots),
    sitemapDeclared: String(robots || "").includes("https://energywithmark.com.au/sitemap.xml"),
    llmsGuidePresent: String(llms || "").includes("https://energywithmark.com.au/learn.html"),
    websiteSchemaPresent: /"@type"\s*:\s*"WebSite"/i.test(indexHtml),
    personSchemaPresent: /"@type"\s*:\s*"Person"/i.test(indexHtml),
    canonicalHomePresent: /<link\s+rel="canonical"\s+href="https:\/\/energywithmark\.com\.au\/"\s*\/>/i.test(indexHtml),
    answerEnrichmentPresent: enrichedArticles > 0,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    ...checks,
    readinessPercent: Math.round((passed / Object.keys(checks).length) * 100),
    sitemapUrlCount: sitemapUrls.length,
    knowledgeArticleCount: articleUrls.length,
    enrichedArticleCount: enrichedArticles,
    measurementBoundary: "Technical discoverability readiness only. Search ranking, AI citation share and traffic are not inferred without verified analytics/source evidence.",
  };
}

async function loadPageMap() {
  const pageMap = new Map();
  const rootFiles = (await fs.readdir(ROOT)).filter((name) => name.endsWith(".html"));
  const articleDir = path.join(ROOT, "articles");
  const articleFiles = (await fs.readdir(articleDir)).filter((name) => name.endsWith(".html"));
  for (const file of rootFiles) pageMap.set(file, await fs.readFile(path.join(ROOT, file), "utf8"));
  for (const file of articleFiles) {
    const relative = "articles/" + file;
    pageMap.set(relative, await fs.readFile(path.join(ROOT, relative), "utf8"));
  }
  return pageMap;
}

async function loadSiteState(now = new Date()) {
  const [pageMap, sitemap, robots, llms, indexHtml] = await Promise.all([
    loadPageMap(),
    fs.readFile(path.join(ROOT, "sitemap.xml"), "utf8"),
    fs.readFile(path.join(ROOT, "robots.txt"), "utf8"),
    fs.readFile(path.join(ROOT, "llms.txt"), "utf8"),
    fs.readFile(path.join(ROOT, "index.html"), "utf8"),
  ]);
  const articleMap = new Map([...pageMap.entries()].filter(([key]) => key.startsWith("articles/")));
  const inventory = buildWebsiteInventory({ pageMap, sitemap, now });
  const visibility = buildVisibilitySnapshot({ robots, sitemap, llms, indexHtml, articleMap });
  return { pageMap, articleMap, inventory, sitemap, robots, llms, indexHtml, visibility };
}

async function readExistingStatus() {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, "growth-agent-status.json"), "utf8"));
  } catch {
    return {};
  }
}

function inventorySummary(inventory, visibility, now = new Date()) {
  const recentlyImproved = inventory.filter((item) => item.pageClass === "article" && item.lastModified && isoDaysAgo(item.lastModified, now) <= RECENT_IMPROVEMENT_DAYS).length;
  const queuedForImprovement = inventory.filter((item) => ["Improvement opportunity", "Review due"].includes(item.status)).length;
  const currentInformationChecks = inventory.filter((item) => item.status === "Current information verification required").length;
  const technicalIssues = inventory.filter((item) => item.status === "Technical issue").length;
  return {
    pagesMonitored: inventory.length,
    knowledgeArticles: inventory.filter((item) => item.pageClass === "article").length,
    recentlyImproved,
    queuedForImprovement,
    currentInformationChecks,
    needsMark: 0,
    technicalIssues,
    technicalReadinessPercent: visibility.readinessPercent,
  };
}

async function prepareCheckin(outputPath) {
  const now = new Date();
  const state = await loadSiteState(now);
  const existing = await readExistingStatus();
  const candidatePath = chooseArticle(state.articleMap, state.inventory);
  const summary = inventorySummary(state.inventory, state.visibility, now);
  const sourceSha = process.env.GITHUB_SHA || "";
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error("GITHUB_SHA is required to prepare a trusted Website Visibility check-in.");
  const runId = process.env.GITHUB_RUN_ID || "local";
  const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  const payload = {
    runKey: "github-website-visibility:" + runId + ":" + attempt,
    sourceSha,
    checkedAt: now.toISOString(),
    state: summary.technicalIssues ? "technical_issue" : candidatePath ? "improvement_queued" : "healthy_no_change",
    candidatePath: candidatePath || "",
    lastImprovementAt: existing.lastImprovementAt || existing.lastRunAt || null,
    ...summary,
    inventory: state.inventory,
    detail: candidatePath
      ? "Whole-site inventory checked; one bounded low-risk article is queued for guarded improvement."
      : "Whole-site inventory checked successfully; no bounded low-risk article currently requires a visible change."
  };
  await fs.writeFile(outputPath, JSON.stringify(payload) + "\n", "utf8");
}

async function preparePrompt(outputPath) {
  const state = await loadSiteState();
  const articlePath = chooseArticle(state.articleMap, state.inventory);
  if (!articlePath) {
    await fs.writeFile(outputPath, "", "utf8");
    return;
  }
  await fs.writeFile(outputPath, buildGrowthPrompt(articlePath, state.articleMap.get(articlePath)), "utf8");
}

async function prepareRequest(outputPath) {
  const state = await loadSiteState();
  const articlePath = chooseArticle(state.articleMap, state.inventory);
  if (!articlePath) {
    await fs.writeFile(outputPath, "", "utf8");
    return;
  }
  const sourceSha = process.env.GITHUB_SHA || "";
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error("GITHUB_SHA is required to prepare a trusted Website Growth request.");
  const selected = state.inventory.find((item) => item.path === articlePath);
  if (!selected || selected.riskClass !== "low" || !selected.autoEligible) throw new Error("Selected Website Visibility candidate is not low risk.");
  const pageText = stripHtml(state.articleMap.get(articlePath)).slice(0, 18000);
  await fs.writeFile(outputPath, JSON.stringify({
    pagePath: articlePath,
    pageText,
    sourceSha,
    pageClass: selected.pageClass,
    riskClass: selected.riskClass,
    reviewReason: selected.reason,
  }) + "\n", "utf8");
}

async function prepareFallback(outputPath) {
  const state = await loadSiteState();
  const articlePath = chooseArticle(state.articleMap, state.inventory);
  const proposal = articlePath ? groundedFallbackProposal(articlePath, state.articleMap.get(articlePath)) : null;
  await fs.writeFile(outputPath, proposal ? JSON.stringify(proposal) + "\n" : "", "utf8");
}

async function writeStatus(status) {
  await fs.writeFile(path.join(ROOT, "growth-agent-status.json"), JSON.stringify(status, null, 2) + "\n", "utf8");
}

async function main() {
  const model = process.env.EWM_GROWTH_MODEL || DEFAULT_MODEL;
  const responseFile = process.env.EWM_GROWTH_AI_RESPONSE_FILE || null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sourceSha = process.env.GITHUB_SHA || null;
  const outputFile = process.env.EWM_GROWTH_OUTPUT_FILE || null;

  const site = await loadSiteState(now);
  const { articleMap, inventory, sitemap, robots, llms, visibility } = site;
  const articlePath = chooseArticle(articleMap, inventory);
  const previousStatus = await readExistingStatus();
  const summary = inventorySummary(inventory, visibility, now);
  const baseStatus = {
    agent: "Website Visibility Agent",
    active: true,
    mode: "business-system-managed",
    lastRunAt: now.toISOString(),
    lastCheckedAt: now.toISOString(),
    lastImprovementAt: previousStatus.lastImprovementAt || previousStatus.lastRunAt || null,
    lastRunState: summary.technicalIssues ? "technical_issue" : articlePath ? "improvement_queued" : "healthy_no_change",
    queue: summary,
    model,
    sourceSha,
    visibility,
    safety: {
      financialClaimsAutoPublish: false,
      incentiveClaimsAutoPublish: false,
      legalClaimsAutoPublish: false,
      customerWorkflowWrites: false,
      maxVisiblePagesPerRun: 1,
      reviewedPullRequestRequired: true
    }
  };

  if (!articlePath) {
    await writeStatus({ ...baseStatus, status: "healthy_no_change", lastRunState: "healthy_no_change", lastAction: "Whole-site review completed successfully; no bounded low-risk page currently needs a visible change.", lastChangedPath: null });
    if (outputFile) await fs.writeFile(outputFile, "", "utf8");
    return;
  }

  let proposal;
  try {
    if (!responseFile) throw new Error("No bounded AI response file was provided.");
    const responseText = await fs.readFile(responseFile, "utf8");
    proposal = extractJson(responseText);
  } catch (error) {
    await writeStatus({ ...baseStatus, status: "model_error", lastAction: error instanceof Error ? error.message : "Unknown AI response error", lastChangedPath: null });
    if (outputFile) await fs.writeFile(outputFile, "", "utf8");
    throw error;
  }

  if (proposal?.decision === "no_change") {
    await writeStatus({ ...baseStatus, status: "healthy_no_change", lastAction: String(proposal.reason || "No safe grounded change was proposed.").slice(0, 500), lastChangedPath: null });
    if (outputFile) await fs.writeFile(outputFile, "", "utf8");
    return;
  }

  const validation = validateProposal(proposal);
  if (!validation.ok) {
    await writeStatus({ ...baseStatus, status: "blocked_safe", lastAction: validation.reason, lastChangedPath: null });
    if (outputFile) await fs.writeFile(outputFile, "", "utf8");
    return;
  }

  const original = articleMap.get(articlePath);
  const updated = applyGrowthBlock(original, proposal, today);
  await fs.writeFile(path.join(ROOT, articlePath), updated, "utf8");

  const sitemapPath = path.join(ROOT, "sitemap.xml");
  await fs.writeFile(sitemapPath, updateSitemapLastmod(sitemap, articlePath, today), "utf8");

  const newSitemap = await fs.readFile(sitemapPath, "utf8");
  const issues = auditStaticDiscovery({ robots, sitemap: newSitemap, llms, articlePath });
  if (issues.length) throw new Error(`Discovery audit failed: ${issues.join("; ")}`);

  await writeStatus({
    ...baseStatus,
    status: "published_low_risk",
    lastRunState: "published_low_risk",
    lastImprovementAt: now.toISOString(),
    lastAction: `Added or refreshed grounded answer and FAQ enrichment on ${articlePath}.`,
    lastChangedPath: articlePath,
    reason: String(proposal.reason || "Grounded evergreen search-answer enrichment.").slice(0, 500)
  });

  if (outputFile) {
    await fs.writeFile(outputFile, `https://energywithmark.com.au/${articlePath}\nhttps://energywithmark.com.au/learn.html\n`, "utf8");
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const checkinIndex = process.argv.indexOf("--prepare-checkin");
  const requestIndex = process.argv.indexOf("--prepare-request");
  const fallbackIndex = process.argv.indexOf("--prepare-fallback");
  const promptIndex = process.argv.indexOf("--prepare-prompt");
  if (checkinIndex >= 0) {
    const outputPath = process.argv[checkinIndex + 1];
    if (!outputPath) {
      console.error("--prepare-checkin requires an output path");
      process.exitCode = 1;
    } else {
      prepareCheckin(outputPath).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  } else if (requestIndex >= 0) {
    const outputPath = process.argv[requestIndex + 1];
    if (!outputPath) {
      console.error("--prepare-request requires an output path");
      process.exitCode = 1;
    } else {
      prepareRequest(outputPath).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  } else if (fallbackIndex >= 0) {
    const outputPath = process.argv[fallbackIndex + 1];
    if (!outputPath) {
      console.error("--prepare-fallback requires an output path");
      process.exitCode = 1;
    } else {
      prepareFallback(outputPath).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  } else if (promptIndex >= 0) {
    const outputPath = process.argv[promptIndex + 1];
    if (!outputPath) {
      console.error("--prepare-prompt requires an output path");
      process.exitCode = 1;
    } else {
      preparePrompt(outputPath).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }
  } else {
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
