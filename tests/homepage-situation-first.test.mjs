import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("homepage leads with the customer decision rather than a product or internal funnel", async()=>{
  const home=await read("index.html");
  assert.match(home,/Understand your energy situation <em>before you buy anything\.<\/em>/);
  assert.match(home,/Start Free Energy Check/);
  assert.match(home,/I Already Have a Bill/);
  assert.match(home,/full Energy Assessment/);
  assert.match(home,/Solar, battery, tariff change, waiting — or no change/);
  assert.doesNotMatch(home,/Find out if solar can help you in less than/);
});

test("homepage uses situation-first pathways instead of a mandatory four-step funnel", async()=>{
  const home=await read("index.html");
  assert.match(home,/id="who-i-help"/);
  assert.match(home,/href="home\.html" class="journey-card"/);
  assert.match(home,/href="business\.html" class="journey-card"/);
  assert.match(home,/href="existing-solar\.html" class="journey-card"/);
  assert.match(home,/href="community\.html" class="journey-card"/);
  assert.match(home,/Your situation/);
  assert.match(home,/Real evidence/);
  assert.match(home,/Energy Assessment/);
  assert.match(home,/Act, wait, compare or make no change/);
  assert.doesNotMatch(home,/Step 4 · Book a call/);
});

test("full calculator is optional while bill assessment has primary post-check priority", async()=>{
  const home=await read("index.html");
  assert.match(home,/Want a deeper estimate first\? Use the Full Calculator/);
  assert.match(home,/For a more useful next decision, send a recent bill/);
  const success=home.slice(home.indexOf('id="quickSuccess"'),home.indexOf('</div></div></section>',home.indexOf('id="quickSuccess"')));
  assert.ok(success.indexOf("Start My Energy Assessment") < success.indexOf("Use Full Calculator"));
});

test("public navigation is small and consistent at runtime", async()=>{
  const script=await read("script.js");
  assert.match(script,/\['index\.html#who-i-help', 'Who I Help'\]/);
  assert.match(script,/\['index\.html#how-it-works', 'How It Works'\]/);
  assert.match(script,/\['learn\.html', 'Learn'\]/);
  assert.match(script,/\['how-i-help\.html', 'About Mark'\]/);
  assert.match(script,/\['contact\.html', 'Ask Mark'\]/);
  assert.match(script,/headerAction\.textContent = 'Start Free Check'/);
});

test("quick check and full calculator have distinct analytics semantics", async()=>{
  const script=await read("script.js");
  assert.match(script,/sendAnalyticsEvent\('quick_check_start'\)/);
  assert.match(script,/sendAnalyticsEvent\('calculator_start'\)/);
});
