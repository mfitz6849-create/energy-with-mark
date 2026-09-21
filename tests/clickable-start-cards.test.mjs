import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("audience start cards are whole-card navigation choices", async()=>{
  const [script,css]=await Promise.all([read("script.js"),read("homepage-v2.css")]);
  assert.match(script,/enhanceAudienceStartCards/);
  assert.match(script,/HOME.*Residential guidance.*home\.html/s);
  assert.match(script,/SMALL BUSINESS.*Commercial guidance.*business\.html/s);
  assert.match(script,/SPORTS CLUB.*Sports club guidance.*community\.html/s);
  assert.match(script,/OTHER.*Flexible start point.*how-i-help\.html/s);
  assert.match(script,/setAttribute\('role', 'link'\)/);
  assert.match(script,/setAttribute\('tabindex', '0'\)/);
  assert.match(script,/event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(css,/\.ewm-clickable-start-card/);
  assert.match(css,/cursor: pointer/);
  assert.match(css,/:focus-visible/);
});
