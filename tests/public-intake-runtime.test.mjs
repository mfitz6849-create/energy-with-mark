import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../conversion-v1.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const booking = readFileSync(new URL('../book.html', import.meta.url), 'utf8');

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

test('native V3 transport is CORS, idempotency and acknowledgement guarded', () => {
  assert.match(runtime, /https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-intake\/v1/);
  const body = functionBody('directV3Submit', 'assessmentToV3');
  assert.match(body, /fetch\(V3_INTAKE_ENDPOINT/);
  assert.match(body, /mode: 'cors'/);
  assert.match(body, /'Idempotency-Key': requestId/);
  assert.match(body, /AbortController/);
  assert.match(body, /!response\.ok \|\| !body\?\.ok/);
});

test('legacy iframe acknowledgement remains restricted to the bill-file transport', () => {
  const body = functionBody('verifiedIframeSubmit', 'directV3Submit');
  assert.match(body, /LEGACY_BILL_ENDPOINT/);
  assert.match(body, /event\.origin === 'https:\/\/script\.google\.com'/);
  assert.match(body, /event\.origin\.endsWith\('\.googleusercontent\.com'\)/);
  assert.match(body, /message\.source !== expectedSource/);
  assert.match(body, /result\.requestId !== payload\?\.fields\?\.clientRequestId/);
  assert.match(body, /if \(!result\.ok\)/);
});

test('quick-check success is shown only after native V3 acknowledgement', () => {
  const body = functionBody('hardenQuickLead', 'hardenFullCalculatorLead');
  const verification = body.indexOf("await directV3Submit(assessmentToV3('quick_check'");
  const success = body.indexOf("document.getElementById('quickSuccess')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'quick check must await V3 intake');
  assert.ok(success > verification, 'quick success must occur after V3 acknowledgement');
  assert.match(body, /replaceButton\('quickLeadButton'\)/);
  assert.doesNotMatch(body, /energy-with-mark-assessment-submit/);
});

test('full-calculator success is shown only after native V3 acknowledgement', () => {
  const body = functionBody('hardenFullCalculatorLead', 'addBillExistingSolarFields');
  const verification = body.indexOf("await directV3Submit(assessmentToV3('calculator'");
  const success = body.indexOf("document.getElementById('savedPanel')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'full calculator must await V3 intake');
  assert.ok(success > verification, 'calculator success must occur after V3 acknowledgement');
  assert.match(body, /replaceButton\('saveResult'\)/);
  assert.doesNotMatch(body, /energy-with-mark-assessment-submit/);
});

test('bill upload confirms the file first then V3 before showing the receipt panel', () => {
  const body = functionBody('hardenBillUpload', 'init');
  const clone = body.indexOf('const form = oldForm.cloneNode(true)');
  const fileReceipt = body.indexOf('const uploadReceipt = await verifiedIframeSubmit');
  const v3Receipt = body.indexOf("await directV3Submit(assessmentToV3('bill_upload'");
  const receipt = body.indexOf("receiptPanel.style.display = 'block'");
  assert.ok(clone >= 0, 'bill upload must replace the legacy form listeners');
  assert.ok(fileReceipt > clone, 'bill upload must first verify its file receipt');
  assert.ok(v3Receipt > fileReceipt, 'bill upload must link to V3 after the file receipt');
  assert.ok(receipt > v3Receipt, 'receipt panel must wait for both acknowledgements');
  assert.match(body, /expectedSource: 'energy-with-mark-bill-upload-submit'/);
  assert.match(body, /legacyUploadConfirmed: true/);
  assert.match(body, /Please do not send the bill again/);
});

test('booking requests go directly to V3 and remain requested until confirmed', () => {
  assert.match(booking, /https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-intake\/v1/);
  assert.match(booking, /kind:'appointment_request'/);
  assert.match(booking, /'Idempotency-Key':requestId/);
  assert.match(booking, /await submitV3\(payload,requestId\)/);
  assert.match(booking, /preferredDate:get\('preferredDate'\)/);
  assert.match(booking, /preferredTime:get\('preferredTime'\)/);
  assert.doesNotMatch(booking, /script\.google\.com/);
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
