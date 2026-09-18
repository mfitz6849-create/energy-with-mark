import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../conversion-v1.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
const booking = readFileSync(new URL('../book.html', import.meta.url), 'utf8');
const billPage = readFileSync(new URL('../upload-bill.html', import.meta.url), 'utf8');

function functionBody(name, nextName) {
  const start = runtime.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? runtime.indexOf(`const ${nextName} =`, start + 1) : runtime.length;
  assert.ok(end > start, `${name} body must be bounded`);
  return runtime.slice(start, end);
}

test('core runtime always loads the verified conversion layer', () => {
  assert.match(core, /conversionScript\.src\s*=\s*siteUrl\('conversion-v1\.js'\)/);
  assert.match(core, /document\.body\.appendChild\(conversionScript\)/);
});

test('verified iframe acknowledgement fails closed on origin, source, request id and backend result', () => {
  const body = functionBody('verifiedIframeSubmit', 'assessmentPayload');
  assert.match(body, /event\.origin === 'https:\/\/script\.google\.com'/);
  assert.match(body, /event\.origin\.endsWith\('\.googleusercontent\.com'\)/);
  assert.match(body, /message\.source !== expectedSource/);
  assert.match(body, /result\.requestId !== payload\?\.fields\?\.clientRequestId/);
  assert.match(body, /if \(!result\.ok\)/);
  assert.match(body, /setTimeout\(\(\) => fail\(/);
});

test('quick-check success is shown only after verified assessment acknowledgement', () => {
  const body = functionBody('hardenQuickLead', 'hardenFullCalculatorLead');
  const verification = body.indexOf('await verifiedIframeSubmit');
  const success = body.indexOf("document.getElementById('quickSuccess')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'quick check must await verified intake');
  assert.ok(success > verification, 'quick success must occur after acknowledgement');
  assert.match(body, /replaceButton\('quickLeadButton'\)/);
  assert.match(body, /expectedSource: 'energy-with-mark-assessment-submit'/);
});

test('full-calculator success is shown only after verified assessment acknowledgement', () => {
  const body = functionBody('hardenFullCalculatorLead', 'addBillExistingSolarFields');
  const verification = body.indexOf('await verifiedIframeSubmit');
  const success = body.indexOf("document.getElementById('savedPanel')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'full calculator must await verified intake');
  assert.ok(success > verification, 'calculator success must occur after acknowledgement');
  assert.match(body, /replaceButton\('saveResult'\)/);
  assert.match(body, /expectedSource: 'energy-with-mark-assessment-submit'/);
});

test('bill upload replaces the legacy submit handler and confirms receipt before showing the receipt panel', () => {
  const body = functionBody('hardenBillUpload', 'init');
  const clone = body.indexOf('const form = oldForm.cloneNode(true)');
  const verification = body.indexOf('await verifiedIframeSubmit');
  const receipt = body.indexOf("receiptPanel.style.display = 'block'");
  assert.ok(clone >= 0, 'bill upload must replace the legacy form listeners');
  assert.ok(verification > clone, 'bill upload must use verified acknowledgement');
  assert.ok(receipt > verification, 'receipt must only display after acknowledgement');
  assert.match(body, /expectedSource: 'energy-with-mark-bill-upload-submit'/);
});


test('general enquiry uses the verified assessment transport and waits for acknowledgement', () => {
  const body = functionBody('hardenGeneralEnquiry', 'init');
  const verification = body.indexOf('await verifiedIframeSubmit');
  const success = body.indexOf("successBox.style.display = 'block'");
  assert.ok(verification >= 0, 'general enquiry must await verified intake');
  assert.ok(success > verification, 'enquiry success must occur after acknowledgement');
  assert.match(body, /sourcePage: '\/contact\.html'/);
  assert.match(body, /expectedSource: 'energy-with-mark-assessment-submit'/);
  assert.match(body, /website: clean\(fd\.get\('website'\)\)/);
  assert.match(runtime, /hardenGeneralEnquiry\(\)/);
});

test('public intake journeys collect enough site and consent context for V3', () => {
  assert.match(contact, /data-form-type="enquiry"/);
  assert.match(contact, /name="postcode"[^>]*required/);
  assert.match(contact, /name="privacyAcknowledged"[^>]*required/);
  assert.match(booking, /name="postcode"[^>]*required/);
  assert.match(booking, /sourcePage:'\/book\.html'/);
  assert.match(booking, /energy-with-mark-booking-submit/);
  assert.match(billPage, /name="postcode"[^>]*required/);
  assert.doesNotMatch(billPage, /Postcode[^<]*<span[^>]*>\(optional\)/i);
  assert.doesNotMatch(runtime + contact + booking + billPage, /intake\.energywithmark\.com\.au/);
});

test('existing-solar context is collected and carried across the customer journey', () => {
  assert.match(runtime, /const CONTEXT_KEY = 'ewmExistingSolarContext'/);
  assert.match(runtime, /Current solar size \(kW\)/);
  assert.match(runtime, /existingSystemAge/);
  assert.match(runtime, /existingInverter/);
  assert.match(runtime, /existingBattery/);
  assert.match(runtime, /addQuickExistingSolarFields\(\)/);
  assert.match(runtime, /addFullCalculatorExistingSolarFields\(\)/);
  assert.match(runtime, /addBillExistingSolarFields\(form\)/);
});
