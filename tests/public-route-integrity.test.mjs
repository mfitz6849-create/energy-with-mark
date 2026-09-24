import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ownHost = "energywithmark.com.au";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function htmlIds(source) {
  return new Set([...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
}

function refs(source) {
  return [...source.matchAll(/\b(href|src|action)\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => ({ attr: m[1].toLowerCase(), raw: m[2].trim() }));
}

function normalizeTarget(fromFile, raw) {
  if (!raw) return null;
  if (/^(?:mailto:|tel:|javascript:|data:|blob:|\/\/)/i.test(raw)) return null;

  let value = raw;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== ownHost && url.hostname !== `www.${ownHost}`) return null;
    value = `${url.pathname}${url.search}${url.hash}`;
  }

  if (value === "#") return { target: fromFile, hash: "", emptyHash: true };

  const [beforeHash, hash = ""] = value.split("#", 2);
  const clean = (beforeHash || "").split("?", 1)[0];

  let target;
  if (!clean) {
    target = fromFile;
  } else if (clean.startsWith("/")) {
    const rootPath = decodeURIComponent(clean.slice(1)).replace(/\/$/, "");
    target = rootPath || "index.html";
  } else {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decodeURIComponent(clean)));
  }

  return { target, hash, emptyHash: false };
}

async function exists(file) {
  try {
    return (await stat(path.join(root, file))).isFile();
  } catch {
    return false;
  }
}

async function resolveExisting(target) {
  const candidates = [target];
  if (!path.posix.extname(target)) candidates.push(`${target}.html`, path.posix.join(target, "index.html"));
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

test("every public page link, asset and form destination resolves", async () => {
  const files = await walk(root);
  const pages = files.filter((file) => file.endsWith(".html"));
  const failures = [];

  for (const file of pages) {
    const from = rel(file);
    const source = await readFile(file, "utf8");
    const localIds = htmlIds(source);

    for (const ref of refs(source)) {
      const parsed = normalizeTarget(from, ref.raw);
      if (!parsed) continue;

      if (parsed.emptyHash) {
        if (!/onclick\s*=\s*["'][^"']*(?:return\s+false|preventDefault|window\.print)/i.test(source)) {
          failures.push(`${from}: bare # destination without an explicit client-side action`);
        }
        continue;
      }

      const resolved = await resolveExisting(parsed.target);
      if (!resolved) {
        failures.push(`${from}: ${ref.attr}="${ref.raw}" -> missing ${parsed.target}`);
        continue;
      }

      if (parsed.hash) {
        const targetSource = resolved === from ? source : await readFile(path.join(root, resolved), "utf8");
        const targetIds = resolved === from ? localIds : htmlIds(targetSource);
        if (!targetIds.has(parsed.hash)) {
          failures.push(`${from}: ${ref.raw} -> missing #${parsed.hash} in ${resolved}`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `Broken public destinations:\n${failures.join("\n")}`);
});

test("public customer forms and calculators keep the canonical native intake", async () => {
  const required = ["index.html", "calculator.html", "contact.html", "book.html", "upload-bill.html"];
  for (const page of required) {
    assert.equal(await exists(page), true, `${page} must exist`);
  }

  const scripts = await Promise.all([
    readFile(path.join(root, "conversion-v1.js"), "utf8"),
    readFile(path.join(root, "quick-solar-check.js"), "utf8"),
    readFile(path.join(root, "calculator-v2.js"), "utf8"),
  ]);
  const joined = scripts.join("\n");
  assert.match(joined, /https:\/\/api\.energywithmark\.com\.au\/api\/public\/website-intake\/v1/);

  const bill = await readFile(path.join(root, "upload-bill.html"), "utf8");
  const book = await readFile(path.join(root, "book.html"), "utf8");
  const contact = await readFile(path.join(root, "contact.html"), "utf8");
  const home = await readFile(path.join(root, "index.html"), "utf8");
  const calculator = await readFile(path.join(root, "calculator.html"), "utf8");

  for (const [name, source] of [["bill", bill], ["booking", book], ["contact", contact]]) {
    assert.match(source, /name=["']phone["']|id=["'][^"']*Phone["']/i, `${name} must collect phone`);
    assert.match(source, /name=["']address["']|id=["'][^"']*Address["']/i, `${name} must collect property address`);
  }
  assert.match(home, /What type of property is this\?/);
  assert.match(calculator, /What type of property are we checking\?/);
  assert.match(home, /href=["']\/example-assessment\.html["']/);
  assert.match(bill, /href=["']\/example-assessment\.html["']/);
});
