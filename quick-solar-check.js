(() => {
  'use strict';

  const LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwODBPWtpOHekwSVCMoEgReUiHTOFsh4kVsRq3fCJDvocAs34gqTOBrkjW3KuLubXA/exec';
  const DETAIL_CALCULATOR = 'calculator.html';
  const form = document.getElementById('quickSolarCheck');
  if (!form) return;

  const $ = (selector) => form.querySelector(selector);
  const $$ = (selector) => [...form.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Math.round(value || 0));
  const number = (value) => new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(value || 0);
  let result = null;

  const defaults = {
    home: { label: 'Home', rate: .35, supply: 1.2, day: .42, min: 3.3, max: 30 },
    business: { label: 'Business', rate: .30, supply: 2.2, day: .70, min: 6.6, max: 100 },
    community: { label: 'Club or community facility', rate: .31, supply: 2.2, day: .55, min: 6.6, max: 100 },
    farm: { label: 'Farm or rural property', rate: .31, supply: 2.8, day: .67, min: 10, max: 250 }
  };

  const commonSizes = [3.3, 5, 6.6, 8, 10, 13.2, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 250];

  function selected(name) {
    return form.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function stateFromPostcode(postcode) {
    const pc = Number(postcode);
    if (pc >= 800 && pc <= 999) return 'NT';
    if ((pc >= 2600 && pc <= 2618) || (pc >= 2900 && pc <= 2920)) return 'ACT';
    if ((pc >= 2000 && pc <= 2599) || (pc >= 2619 && pc <= 2899) || (pc >= 2921 && pc <= 2999)) return 'NSW';
    if ((pc >= 3000 && pc <= 3999) || (pc >= 8000 && pc <= 8999)) return 'VIC';
    if ((pc >= 4000 && pc <= 4999) || (pc >= 9000 && pc <= 9999)) return 'QLD';
    if (pc >= 5000 && pc <= 5999) return 'SA';
    if (pc >= 6000 && pc <= 6999) return 'WA';
    if (pc >= 7000 && pc <= 7999) return 'TAS';
    return '';
  }

  function yieldFromState(state) {
    return { VIC: 3.65, NSW: 4.0, ACT: 4.0, QLD: 4.35, SA: 4.25, WA: 4.25, TAS: 3.45, NT: 4.8 }[state] || 3.9;
  }

  function nearestSize(raw, min, max) {
    const available = commonSizes.filter((size) => size >= min && size <= max);
    return available.reduce((best, size) => Math.abs(size - raw) < Math.abs(best - raw) ? size : best, available[0]);
  }

  function showStep(step) {
    $$('.quick-step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === step));
    document.querySelectorAll('.quick-progress i').forEach((el, index) => el.classList.toggle('active', index < step));
  }

  function annualBill() {
    const amount = Number($('#quickBill').value) || 0;
    const factor = { monthly: 12, quarterly: 4, annual: 1 }[$('#quickFrequency').value] || 4;
    return amount * factor;
  }

  function trackNextStep(type) {
    const eventName = { calculator: 'calculator_start', assessment: 'bill_upload_start', booking: 'booking_start' }[type];
    if (!eventName) return;
    try { window.gtag?.('event', eventName, { source: '60_second_result_funnel' }); } catch (_) {}
  }

  function ensureNextStepFunnel() {
    const leadUnlock = $('.lead-unlock');
    const leadFields = $('#quickLeadFields');
    if (!leadUnlock || !leadFields || leadUnlock.querySelector('.quick-next-funnel')) return;

    const funnel = document.createElement('div');
    funnel.className = 'quick-next-funnel';
    funnel.setAttribute('aria-label', 'Choose your next step');
    funnel.innerHTML = `
      <div class="quick-next-heading">
        <span class="quick-next-label">Your next step</span>
        <h3>Keep going — choose how much help you want.</h3>
        <p>You do not need to save this result or enter contact details to continue.</p>
      </div>
      <div class="quick-next-grid">
        <a class="quick-next-card calculator" href="calculator.html" data-quick-next="calculator">
          <span class="quick-next-number">2</span>
          <div><strong>Use the Full Calculator</strong><small>See a deeper estimate for solar, battery, savings and rough payback.</small><b>Continue to Full Calculator →</b></div>
        </a>
        <a class="quick-next-card assessment" href="upload-bill.html" data-quick-next="assessment">
          <span class="quick-next-number">3</span>
          <div><strong>Get a Free Full Energy Assessment</strong><small>Best for a real answer. Upload one recent power bill and Mark reviews your actual numbers.</small><b>Upload My Bill →</b></div>
        </a>
        <a class="quick-next-card booking" href="book.html" data-quick-next="booking">
          <span class="quick-next-number">☎</span>
          <div><strong>Book a Free Call</strong><small>Prefer to talk? Ask Mark to explain the result and your options in plain English.</small><b>Book a Call →</b></div>
        </a>
      </div>
      <div class="quick-save-divider"><span>Or save this quick result for later</span></div>
      <button class="quick-save-toggle" type="button" aria-expanded="false">Save this quick result instead</button>`;

    leadUnlock.insertBefore(funnel, leadFields);
    funnel.querySelectorAll('[data-quick-next]').forEach((link) => {
      link.addEventListener('click', () => trackNextStep(link.dataset.quickNext));
    });

    const saveToggle = funnel.querySelector('.quick-save-toggle');
    leadFields.classList.add('quick-save-collapsed');
    saveToggle?.addEventListener('click', () => {
      const opening = leadFields.classList.contains('quick-save-collapsed');
      leadFields.classList.toggle('quick-save-collapsed', !opening);
      saveToggle.setAttribute('aria-expanded', String(opening));
      saveToggle.textContent = opening ? 'Hide save form' : 'Save this quick result instead';
      if (opening) $('#quickName')?.focus();
    });

    const saveHeading = leadFields.querySelector('h3');
    if (saveHeading) saveHeading.textContent = 'Save this quick result (optional)';

    const success = $('#quickSuccess');
    const successText = success?.querySelector('p');
    if (successText) successText.textContent = 'Your result is saved. Keep going with the full calculator, send your bill for a free full energy assessment, or book a call with Mark.';
    const successButtons = success?.querySelector('.btns');
    if (successButtons && !successButtons.querySelector('a[href="book.html"]')) {
      const booking = document.createElement('a');
      booking.className = 'btn btn-ghost';
      booking.href = 'book.html';
      booking.textContent = 'Book a Call';
      booking.addEventListener('click', () => trackNextStep('booking'));
      successButtons.appendChild(booking);
    }
  }

  function validateStep1() {
    const error = $('#quickError1');
    if (!selected('quickProperty')) { error.textContent = 'Choose the type of property.'; return false; }
    error.textContent = '';
    return true;
  }

  function validateStep2() {
    const error = $('#quickError2');
    const bill = Number($('#quickBill').value);
    const postcode = $('#quickPostcode').value.trim();
    if (!bill || bill <= 0) { error.textContent = 'Enter your approximate electricity bill.'; return false; }
    if (!/^\d{4}$/.test(postcode) || !stateFromPostcode(postcode)) { error.textContent = 'Enter a valid Australian postcode.'; return false; }
    if (!selected('quickExistingSolar')) { error.textContent = 'Tell me whether the property already has solar.'; return false; }
    error.textContent = '';
    return true;
  }

  function calculate() {
    const property = selected('quickProperty');
    const d = defaults[property];
    const postcode = $('#quickPostcode').value.trim();
    const state = stateFromPostcode(postcode);
    const yieldPerDay = yieldFromState(state);
    const bill = annualBill();
    const existingSolar = selected('quickExistingSolar');
    const fixed = d.supply * 365;
    const usage = Math.max(1000, (bill - fixed) / d.rate);
    const rawSolar = (usage * .9) / (yieldPerDay * 365);
    const solarKw = nearestSize(rawSolar, d.min, d.max);
    const generation = solarKw * yieldPerDay * 365;
    const directSolar = Math.min(generation, usage * d.day);
    const exports = Math.max(0, generation - directSolar);
    const imports = Math.max(0, usage - directSolar);
    const runningCost = Math.max(0, imports * d.rate + fixed - exports * .05);
    const savings = Math.max(0, bill - runningCost);
    const savingRate = bill ? savings / bill : 0;
    const low = savings * .85;
    const high = savings * 1.15;

    let status = 'Solar looks worth investigating';
    let explanation = `Based on the figures entered, solar could be worth a closer look for this ${d.label.toLowerCase()}.`;
    if (existingSolar === 'yes') {
      status = 'Your existing solar is worth reviewing';
      explanation = 'Because this property already has solar, the next step should be to review the current system, exports and later grid use before adding more equipment.';
    } else if (savingRate < .15) {
      status = 'Solar may still help, but the fit is less clear';
      explanation = 'The quick estimate shows a smaller opportunity. A bill review can check whether the assumptions match how the property actually uses electricity.';
    }

    result = { property, propertyLabel: d.label, postcode, state, annualBill: bill, usage, solarKw, savings, low, high, existingSolar, status };
    $('#quickResultStatus').textContent = status;
    $('#quickResultText').textContent = explanation;
    $('#quickSolarSize').textContent = existingSolar === 'yes' ? 'Review first' : `${number(solarKw)} kW`;
    $('#quickSavingRange').textContent = existingSolar === 'yes' ? 'Needs system review' : `${money(low)}–${money(high)}`;
    $('#quickAnnualBill').textContent = money(bill);
    $('#quickLeadSummary').textContent = existingSolar === 'yes'
      ? 'Optional: save this result if you want Mark to have the quick-check details before reviewing your existing system.'
      : 'Optional: save this result if you want Mark to have the quick-check details before you continue.';
    showStep(3);
  }

  async function sendLead() {
    const name = $('#quickName').value.trim();
    const phone = $('#quickPhone').value.trim();
    const email = $('#quickEmail').value.trim();
    const consent = $('#quickConsent').checked;
    const error = $('#quickLeadError');
    if (!name || !phone || !email) { error.textContent = 'Enter your name, mobile and email.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { error.textContent = 'Enter a valid email address.'; return; }
    if (!consent) { error.textContent = 'Please confirm that I may contact you about this enquiry.'; return; }
    error.textContent = '';
    const button = $('#quickLeadButton');
    button.disabled = true;
    button.textContent = 'Saving your result…';

    const lead = {
      submittedAt: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }),
      name, phone, email,
      postcode: result.postcode,
      property: result.propertyLabel,
      goal: result.existingSolar === 'yes' ? 'Review existing solar' : 'Find out if solar can help',
      annualBill: Math.round(result.annualBill),
      estimatedUsageKwh: Math.round(result.usage),
      solarRecommendationKw: result.existingSolar === 'yes' ? '' : result.solarKw,
      systemPlan: '60-second solar check',
      batteryRecommendationKwh: '',
      estimatedAnnualSavings: result.existingSolar === 'yes' ? '' : Math.round(result.savings),
      estimatedPaybackYears: 'Detailed review required',
      state: result.state,
      appointmentRequested: 'No',
      source: 'Energy With Mark 60 Second Solar Check'
    };

    try {
      localStorage.setItem('ewmQuickSolarLead', JSON.stringify(lead));
      await fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(lead) });
      $('#quickLeadFields').classList.add('hidden');
      $('#quickSuccess').classList.remove('hidden');
      $('#detailedCalculatorLink').href = DETAIL_CALCULATOR;
      try { window.gtag?.('event', 'generate_lead', { form_type: '60_second_solar_check' }); } catch (_) {}
    } catch (e) {
      error.textContent = 'I could not save the enquiry automatically. Please call Mark on 0434 151 237.';
      button.disabled = false;
      button.textContent = 'Save My Result';
    }
  }

  ensureNextStepFunnel();
  $('#quickNext1').addEventListener('click', () => { if (validateStep1()) showStep(2); });
  $('#quickBack2').addEventListener('click', () => showStep(1));
  $('#quickCalculate').addEventListener('click', () => { if (validateStep2()) calculate(); });
  $('#quickBack3').addEventListener('click', () => showStep(2));
  $('#quickLeadButton').addEventListener('click', sendLead);
})();