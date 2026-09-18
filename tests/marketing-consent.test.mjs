import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../conversion-v1.js', import.meta.url), 'utf8');
const quickFallback = readFileSync(new URL('../quick-solar-check.js', import.meta.url), 'utf8');
const calculatorFallback = readFileSync(new URL('../calculator-v2.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const calculator = readFileSync(new URL('../calculator.html', import.meta.url), 'utf8');
const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
const booking = readFileSync(new URL('../book.html', import.meta.url), 'utf8');
const bill = readFileSync(new URL('../upload-bill.html', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');

const pages = [home, calculator, contact, booking, bill];

test('marketing opt-in is optional and visibly separate from required privacy acknowledgement', () => {
  for (const page of pages) {
    assert.match(page, /name="marketingConsent"[^>]*type="checkbox"[^>]*value="Yes"|name="marketingConsent"[^>]*value="Yes"[^>]*type="checkbox"/);
    assert.doesNotMatch(page, /name="marketingConsent"[^>]*required/);
    assert.match(page, /I can unsubscribe at any time/);
  }
  assert.match(contact, /name="privacyAcknowledged"[^>]*required/);
  assert.match(booking, /name="privacyAcknowledged"[^>]*required/);
  assert.match(bill, /name="privacyAcknowledged"[^>]*required/);
});

test('main public runtime sends explicit consent and never derives it from privacy acknowledgement', () => {
  assert.match(runtime, /MARKETING_CONSENT_VERSION = '2026-09-19-v1'/);
  assert.match(runtime, /marketingConsentAccepted: fields\.marketingConsentAccepted === true/);
  assert.match(runtime, /marketingConsentVersion: fields\.marketingConsentAccepted === true \? MARKETING_CONSENT_VERSION : ''/);
  assert.match(runtime, /marketingConsentAccepted: marketingOptIn\(form\)/);
  assert.match(runtime, /marketingConsentAccepted: fd\.get\('marketingConsent'\) === 'Yes'/);
  assert.doesNotMatch(runtime, /marketingConsentAccepted:\s*fields\.privacyAcknowledged/);
});

test('booking and calculator fallback transports preserve consent version when checked', () => {
  assert.match(booking, /MARKETING_CONSENT_VERSION='2026-09-19-v1'/);
  assert.match(booking, /marketingConsentAccepted:Boolean\(form\.elements\.marketingConsent\?\.checked\)/);
  assert.match(booking, /marketingConsentVersion:form\.elements\.marketingConsent\?\.checked\?MARKETING_CONSENT_VERSION:''/);

  for (const fallback of [quickFallback, calculatorFallback]) {
    assert.match(fallback, /MARKETING_CONSENT_VERSION = '2026-09-19-v1'/);
    assert.match(fallback, /marketingConsentAccepted:/);
    assert.match(fallback, /marketingConsentVersion:/);
  }
});

test('privacy policy explains the marketing consent scope and withdrawal', () => {
  assert.match(privacy, /id="marketing-emails"/);
  assert.match(privacy, /Marketing email consent is separate from the privacy acknowledgement/);
  assert.match(privacy, /Energy With Mark express consent/);
  assert.match(privacy, /Energy With Mark only/);
  assert.match(privacy, /continues until you withdraw it or the mailing activity ends/);
  assert.match(privacy, /withdraw this consent at any time/);
});
