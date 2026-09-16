import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_MODEL = "control-centre-workers-ai";
const SAFE_ARTICLES = [
  "articles/how-big-should-home-battery-be.html",
  "articles/do-i-need-hybrid-inverter-for-battery.html",
  "articles/does-battery-mean-whole-home-backup.html",
  "articles/how-ev-changes-solar-sizing.html",
  "articles/what-information-needed-for-solar-assessment.html",
  "articles/what-is-solar-self-consumption.html",
  "articles/why-i-need-your-electricity-bill.html"
];
const BLOCKED_CLAIM_PATTERN = /(?:\$|%|\brebate\b|\bgrant\b|\bincentive\b|\bgovernment\b|\bpayback\b|\bROI\b|\bprice\b|\bcost\b|\bsaving(?:s)?\b|\btariff\b|\bfeed-in\b|\brate\b)/i;
const GROWTH_MARKER = "<!-- EWM-GROWTH:START -->";

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

export function chooseArticle(articleMap) {
  for (const articlePath of SAFE_ARTICLES) {
    const html = articleMap.get(articlePath);
    if (html && !html.includes(GROWTH_MARKER)) return articlePath;
  }
  return null;
}

export function buildGrowthPrompt(articlePath, articleHtml) {
  const articleText = stripHtml(articleHtml).slice(0, 18000);
  return `You are the Energy With Mark Website Growth Agent. Improve one existing Australian solar/battery educational page for conventional search and AI-powered search. You are not allowed to invent facts. Use ONLY the supplied page text below. Do not use outside facts even if you know them. Do not add prices, savings, payback, ROI, tariffs, rebates, grants, incentives, government-program details, product specifications, legal claims, customer-specific advice, testimonials or numeric claims. In summary, whatMatters, FAQ questions and FAQ answers, do not place any digits and do not use these words: price, cost, saving, savings, rate, tariff, feed-in, rebate, grant, incentive, government, payback or ROI. Keep language simple, useful and natural. Avoid keyword stuffing and avoid near-duplicate/location doorway content. Mark Fitzpatrick remains the human adviser and author. Do not edit files and do not use tools; return the answer only. Return JSON only with this exact shape: {"decision":"publish"|"no_change","summary":"...","whatMatters":["...","...","..."],"faq":[{"q":"...","a":"..."},{"q":"...","a":"..."}],"reason":"..."}. If the page cannot be safely improved from its own text, return decision no_change.\n\nPage path: ${articlePath}\n\nPublished page text:\n${articleText}`;
}

export function applyGrowthBlock(html, proposal, today) {
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
  if (!robots.includes("https://energywithmark.com.au/sitemap.xml")) issues.push("robots.txt does not reference the sitemap");
  if (!sitemap.includes(`https://energywithmark.com.au/${articlePath}`)) issues.push("changed article is absent from sitemap.xml");
  if (!llms.includes("https://energywithmark.com.au/learn.html")) issues.push("llms.txt does not expose the knowledge hub");
  return issues;
}

async function loadArticleMap() {
  const articleMap = new Map();
  for (const articlePath of SAFE_ARTICLES) {
    try {
      articleMap.set(articlePath, await fs.readFile(path.join(ROOT, articlePath), "utf8"));
    } catch {
      // Candidate may be absent in a future site revision; skip it safely.
    }
  }
  return articleMap;
}

async function preparePrompt(outputPath) {
  const articleMap = await loadArticleMap();
  const articlePath = chooseArticle(articleMap);
  if (!articlePath) {
    await fs.writeFile(outputPath, "", "utf8");
    return;
  }
  await fs.writeFile(outputPath, buildGrowthPrompt(articlePath, articleMap.get(articlePath)), "utf8");
}

async function prepareRequest(outputPath) {
  const articleMap = await loadArticleMap();
  const articlePath = chooseArticle(articleMap);
  if (!articlePath) {
    await fs.writeFile(outputPath, "", "utf8");
    return;
  }
  const sourceSha = process.env.GITHUB_SHA || "";
  if (!/^[0-9a-f]{40}$/i.test(sourceSha)) throw new Error("GITHUB_SHA is required to prepare a trusted Website Growth request.");
  const pageText = stripHtml(articleMap.get(articlePath)).slice(0, 18000);
  await fs.writeFile(outputPath, JSON.stringify({ pagePath: articlePath, pageText, sourceSha }) + "\n", "utf8");
}

async function prepareFallback(outputPath) {
  const articleMap = await loadArticleMap();
  const articlePath = chooseArticle(articleMap);
  const proposal = articlePath ? groundedFallbackProposal(articlePath, articleMap.get(articlePath)) : null;
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

  const articleMap = await loadArticleMap();
  const articlePath = chooseArticle(articleMap);
  const baseStatus = {
    agent: "Website Growth Agent",
    active: true,
    mode: "business-system-managed",
    lastRunAt: now.toISOString(),
    model,
    sourceSha,
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
    await writeStatus({ ...baseStatus, status: "healthy_no_change", lastAction: "All current low-risk evergreen articles already contain a Website Growth Agent enrichment block.", lastChangedPath: null });
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
  const sitemap = await fs.readFile(sitemapPath, "utf8");
  await fs.writeFile(sitemapPath, updateSitemapLastmod(sitemap, articlePath, today), "utf8");

  const [robots, newSitemap, llms] = await Promise.all([
    fs.readFile(path.join(ROOT, "robots.txt"), "utf8"),
    fs.readFile(sitemapPath, "utf8"),
    fs.readFile(path.join(ROOT, "llms.txt"), "utf8")
  ]);
  const issues = auditStaticDiscovery({ robots, sitemap: newSitemap, llms, articlePath });
  if (issues.length) throw new Error(`Discovery audit failed: ${issues.join("; ")}`);

  await writeStatus({
    ...baseStatus,
    status: "published_low_risk",
    lastAction: `Added grounded answer and FAQ enrichment to ${articlePath}.`,
    lastChangedPath: articlePath,
    reason: String(proposal.reason || "Grounded evergreen search-answer enrichment.").slice(0, 500)
  });

  if (outputFile) {
    await fs.writeFile(outputFile, `https://energywithmark.com.au/${articlePath}\nhttps://energywithmark.com.au/learn.html\n`, "utf8");
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const requestIndex = process.argv.indexOf("--prepare-request");
  const fallbackIndex = process.argv.indexOf("--prepare-fallback");
  const promptIndex = process.argv.indexOf("--prepare-prompt");
  if (requestIndex >= 0) {
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
