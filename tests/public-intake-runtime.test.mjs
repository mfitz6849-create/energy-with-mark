import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../conversion-v1.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
const booking = readFileSync(new URL('../book.html', import.meta.url), 'utf8');
const billPage = readFileSync(new URL('../upload-bill.html', import.meta.url), 'utf8');
const homePage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const calculatorPage = readFileSync(new URL('../calculator.html', import.meta.url), 'utf8');
const exampleAssessment = readFileSync(new URL('../example-assessment.html', import.meta.url), 'utf8');
const quickFallback = readFileSync(new URL('../quick-solar-check.js', import.meta.url), 'utf8');
const calculatorFallback = readFileSync(new URL('../calculator-v2.js', import.meta.url), 'utf8');

function functionBody(name, nextName) {
  const start = runtime.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? runtime.indexOf(`const ${nextName} =`, start + 1) : runtime.length;
  assert.ok(end > start, `${name} body must be bounded`);
  return runtime.slice(start, end);
}

test('core runtime always loads the conversion layer', () => {
  assert.match(core, /conversionScript\.src\s*=\s*siteUrl\('conversion-v1\.js\?v=20260920-native-bill-v5'\)/);
  assert.match(core, /script\[src\*="conversion-v1\.js"\]/);
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

test('legacy Apps Script bill carrier is absent from the active public runtime', () => {
  assert.match(runtime, /NATIVE_BILL_UPLOAD_ENDPOINT = 'https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-bill-upload\/v1'/);
  assert.doesNotMatch(runtime, /LEGACY_BILL_ENDPOINT|verifiedIframeSubmit|script\.google\.com|googleusercontent\.com/);
  assert.doesNotMatch(runtime, /energy-with-mark-assessment-submit/);
  assert.doesNotMatch(billPage, /script\.google\.com/);
});

test('quick-check success is shown only after native V3 acknowledgement', () => {
  const body = functionBody('hardenQuickLead', 'hardenFullCalculatorLead');
  const verification = body.indexOf("await directV3Submit(assessmentToV3('quick_check'");
  const success = body.indexOf("document.getElementById('quickSuccess')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'quick check must await V3 intake');
  assert.ok(success > verification, 'quick success must occur after V3 acknowledgement');
  assert.match(body, /replaceButton\('quickLeadButton'\)/);
  assert.match(body, /journey: '60_second_check'/);
});

test('full-calculator success is shown only after native V3 acknowledgement', () => {
  const body = functionBody('hardenFullCalculatorLead', 'addBillExistingSolarFields');
  const verification = body.indexOf("await directV3Submit(assessmentToV3('calculator'");
  const success = body.indexOf("document.getElementById('savedPanel')?.classList.remove('hidden')");
  assert.ok(verification >= 0, 'full calculator must await V3 intake');
  assert.ok(success > verification, 'calculator success must occur after V3 acknowledgement');
  assert.match(body, /replaceButton\('saveResult'\)/);
  assert.match(body, /journey: 'full_calculator'/);
});

test('bill upload pre-registers in native D1 before sending the exact file to Control Centre storage', () => {
  const body = functionBody('hardenBillUpload', 'hardenGeneralEnquiry');
  const clone = body.indexOf('const form = oldForm.cloneNode(true)');
  const preRegister = body.indexOf("await directV3Submit(assessmentToV3('bill_upload'");
  const pendingMarker = body.indexOf('billUploadPending: true', preRegister);
  const submissionId = body.indexOf("const submissionId = clean(registration?.submissionId)", preRegister);
  const fileUpload = body.indexOf('await nativeBillFileUpload({', submissionId);
  const receiptCheck = body.indexOf('await waitForNativeBillReceipt(activeRequestId', fileUpload);
  const receipt = body.indexOf("receiptPanel.style.display = 'block'");
  assert.ok(clone >= 0, 'bill upload must replace any page-level fallback listener');
  assert.ok(preRegister > clone, 'bill upload must register the customer/intake before file transfer');
  assert.ok(pendingMarker > preRegister && pendingMarker < fileUpload, 'pre-registration must explicitly mark the file as pending');
  assert.ok(submissionId > preRegister && submissionId < fileUpload, 'file upload must use the canonical submission id returned by D1');
  assert.ok(fileUpload > preRegister, 'native file transfer must start only after successful D1 registration');
  assert.ok(receiptCheck > fileUpload, 'bill upload should read back the native D1 receipt after file storage');
  assert.ok(receipt > fileUpload, 'confirmed flow must show the receipt panel only after native file storage');
  assert.match(body, /activeRequestId/);
  assert.match(body, /activeSubmissionId/);
  assert.match(body, /native_control_centre_file/);
  assert.doesNotMatch(body, /legacyUploadConfirmed|legacyFileFolderId|verifiedIframeSubmit|dataBase64/);
});

test('general enquiry goes directly to V3 and waits for acknowledgement', () => {
  const body = functionBody('hardenGeneralEnquiry', 'init');
  const verification = body.indexOf("await directV3Submit(assessmentToV3('enquiry'");
  const success = body.indexOf("successBox.style.display = 'block'");
  assert.ok(verification >= 0, 'general enquiry must await V3 intake');
  assert.ok(success > verification, 'enquiry success must occur after acknowledgement');
  assert.match(body, /sourcePage: '\/contact\.html'/);
  assert.match(body, /journey: 'general_enquiry'/);
  assert.match(runtime, /hardenGeneralEnquiry\(\)/);
});

test('booking requests go directly to V3 and remain requested until confirmed', () => {
  assert.match(booking, /https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-intake\/v1/);
  assert.match(booking, /kind:'appointment_request'/);
  assert.match(booking, /'Idempotency-Key':requestId/);
  assert.match(booking, /await submitV3\(payload,requestId\)/);
  assert.match(booking, /preferredDate:get\('preferredDate'\)/);
  assert.match(booking, /preferredTime:get\('preferredTime'\)/);
  assert.match(booking, /address:get\('address'\)/);
  assert.match(booking, /postcode:get\('postcode'\)/);
  assert.doesNotMatch(booking, /script\.google\.com/);
});

test('public intake journeys collect enough site and consent context for V3', () => {
  assert.match(contact, /data-form-type="enquiry"/);
  assert.match(contact, /name="phone"[^>]*required/);
  assert.match(contact, /name="address"[^>]*required/);
  assert.match(contact, /name="postcode"[^>]*required/);
  assert.match(contact, /name="privacyAcknowledged"[^>]*required/);
  assert.match(booking, /name="phone"[^>]*required/);
  assert.match(booking, /name="address"[^>]*required/);
  assert.match(booking, /name="postcode"[^>]*required/);
  assert.match(billPage, /name="phone"[^>]*required/);
  assert.match(billPage, /name="address"[^>]*required/);
  assert.match(billPage, /name="postcode"[^>]*required/);
  assert.doesNotMatch(billPage, /Postcode[^<]*<span[^>]*>\(optional\)/i);
  assert.match(runtime + booking, /intake\.energywithmark\.com\.au/);
  assert.match(runtime, /address: clean\(fields\.address\)/);
  assert.match(runtime, /quickAddress/);
  assert.match(runtime, /leadAddress/);
});

test('public property wording is clear and the example assessment is a working destination', () => {
  assert.match(homePage, /What type of property is this\?/);
  assert.doesNotMatch(homePage, /What type of place is this\?/);
  assert.match(calculatorPage, /What type of property are we checking\?/);
  assert.match(calculatorPage, /Tell us about your property/);
  assert.doesNotMatch(calculatorPage, /Tell us about your place/);
  assert.match(billPage, /href="\/example-assessment\.html">See an Example Assessment/);
  assert.match(homePage, /href="\/example-assessment\.html">See Example Assessment/);
  assert.match(exampleAssessment, /Example Energy Assessment/);
  assert.match(exampleAssessment, /See how your assessment is presented/);
  assert.match(exampleAssessment, /single-property example/);
  assert.match(exampleAssessment, /Illustrative example only/);
  assert.match(exampleAssessment, /Strong solar opportunity/);
  assert.match(exampleAssessment, /Page 1 of 3/);
  assert.match(exampleAssessment, /Page 2 of 3/);
  assert.match(exampleAssessment, /Page 3 of 3/);
  assert.doesNotMatch(exampleAssessment, /Property B/);
  assert.doesNotMatch(exampleAssessment, /Property C/);
  assert.match(core, /See Example Assessment/);
  assert.match(core, /example-assessment\.html/);
});

test('Ask Mark next steps use customer-facing language', () => {
  assert.match(contact, /2\. I look at what matters/);
  assert.match(contact, /give you a useful, practical answer/);
  assert.doesNotMatch(contact, /connected to the same Energy With Mark customer journey/);
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


test('example assessment has one clear top action group without a duplicate sticky CTA', () => {
  assert.doesNotMatch(exampleAssessment, /assessment-example-actions/);
  assert.equal((exampleAssessment.match(/Start My Free Assessment/g) || []).length, 1);
  assert.match(exampleAssessment, /Print \/ Save Example/);
});


test('public example mirrors the single-property backend initial-assessment shape', () => {
  assert.equal((exampleAssessment.match(/<article class="assessment-page/g) || []).length, 3);
  assert.match(exampleAssessment, /What the bills show/);
  assert.match(exampleAssessment, /Annual snapshot/);
  assert.match(exampleAssessment, /Likely options/);
  assert.match(exampleAssessment, /What we still need to confirm/);
  assert.match(exampleAssessment, /Likely paths forward/);
});


test('quick-check and calculator fallbacks cannot escape native V3 intake', () => {
  assert.match(runtime, /button\.dataset\.ewmV3Hardened = 'true'/);
  for (const source of [quickFallback, calculatorFallback]) {
    assert.match(source, /https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-intake\/v1/);
    assert.match(source, /mode: 'cors'/);
    assert.match(source, /'Idempotency-Key': requestId/);
    assert.match(source, /dataset\.ewmV3Hardened === 'true'/);
    assert.match(source, /!response\.ok \|\| !body\?\.ok/);
    assert.doesNotMatch(source, /script\.google\.com/);
    assert.doesNotMatch(source, /mode:\s*'no-cors'/);
  }
  assert.match(quickFallback, /kind: 'quick_check'/);
  assert.match(calculatorFallback, /kind: 'calculator'/);
});


test('native bill file upload and receipt verifier are cache-busted and customer-safe', async () => {
  const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  const bill = readFileSync(new URL('../upload-bill.html', import.meta.url), 'utf8');
  assert.match(runtime, /NATIVE_BILL_UPLOAD_ENDPOINT = 'https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-bill-upload\/v1'/);
  assert.match(runtime, /BILL_RECEIPT_ENDPOINT = 'https:\/\/intake\.energywithmark\.com\.au\/api\/public\/website-intake\/v1\?receipt=bill'/);
  assert.match(runtime, /window\.crypto\.subtle\.digest\('SHA-256'/);
  assert.match(runtime, /'X-EWM-Submission-ID': submissionId/);
  assert.match(runtime, /'X-EWM-Content-SHA256': contentSha256/);
  assert.match(runtime, /credentials: 'omit'/);
  assert.match(runtime, /receipt\?\.fileStored/);
  assert.match(script, /conversion-v1\.js\?v=20260920-native-bill-v5/);
  assert.match(bill, /script\.js\?v=20260920-native-bill-v5/);
  assert.doesNotMatch(runtime, /script\.google\.com/);
  assert.doesNotMatch(bill, /script\.google\.com/);
  assert.match(bill, /Thanks — your assessment has started/);
  assert.doesNotMatch(bill, /Your bill is with Mark/);
});
