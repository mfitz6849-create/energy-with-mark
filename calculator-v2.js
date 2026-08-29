(() => {
  'use strict';

  const LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwODBPWtpOHekwSVCMoEgReUiHTOFsh4kVsRq3fCJDvocAs34gqTOBrkjW3KuLubXA/exec';
  const form = document.getElementById('fullSolarCalculator');
  if (!form) return;

  const $ = (selector) => form.querySelector(selector);
  const $$ = (selector) => [...form.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Math.round(value || 0));
  const number = (value) => new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(value || 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const defaults = {
    home: { label: 'home', rate: .35, supply: 1.2, day: .45, min: 3.3, max: 30, solarBase: 1000, solarPerKw: 1050, batteryBase: 1800, batteryPerKwh: 1050, batteryMax: 50 },
    business: { label: 'business', rate: .30, supply: 2.2, day: .70, min: 6.6, max: 100, solarBase: 3000, solarPerKw: 930, batteryBase: 4500, batteryPerKwh: 900, batteryMax: 150 },
    farm: { label: 'farm', rate: .31, supply: 2.8, day: .67, min: 10, max: 250, solarBase: 4800, solarPerKw: 860, batteryBase: 6000, batteryPerKwh: 820, batteryMax: 300 },
    community: { label: 'club or community site', rate: .31, supply: 2.2, day: .55, min: 6.6, max: 100, solarBase: 3500, solarPerKw: 930, batteryBase: 4800, batteryPerKwh: 900, batteryMax: 150 }
  };

  const solarSizes = [3.3, 5, 6.6, 8, 10, 13.2, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 250];
  const batterySizes = [5, 6.5, 10, 13.5, 15, 20, 27, 30, 40, 50, 60, 80, 100, 150, 200, 300];
  let result = null;

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

  function nearest(value, list, min, max) {
    const usable = list.filter((item) => item >= min && item <= max);
    return usable.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, usable[0]);
  }

  function annualBill() {
    const amount = Number($('#billAmount').value) || 0;
    const factor = { monthly: 12, quarterly: 4, annual: 1 }[$('#billFrequency').value] || 4;
    return amount * factor;
  }

  function showStep(step) {
    $$('.calc-step').forEach((section) => section.classList.toggle('active', Number(section.dataset.step) === step));
    document.querySelectorAll('#calcProgress li').forEach((item, index) => item.classList.toggle('active', index < step));
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validate(step) {
    const error = $(`#error${step}`);
    if (step === 1) {
      if (!selected('property')) { error.textContent = 'Choose the type of place.'; return false; }
      if (!selected('goal')) { error.textContent = 'Choose what you want most.'; return false; }
    }
    if (step === 2) {
      if (!(Number($('#billAmount').value) > 0)) { error.textContent = 'Enter your approximate power bill.'; return false; }
      const postcode = $('#postcode').value.trim();
      if (!/^\d{4}$/.test(postcode) || !stateFromPostcode(postcode)) { error.textContent = 'Enter a valid Australian postcode.'; return false; }
    }
    if (step === 3 && !selected('existingSolar')) { error.textContent = 'Tell us if you already have solar.'; return false; }
    error.textContent = '';
    return true;
  }

  function payback(cost, saving) {
    if (!saving || saving <= 0) return null;
    const years = cost / saving;
    return years > 30 ? null : years;
  }

  function tenYearBenefit(saving, cost) {
    let total = -cost;
    for (let year = 0; year < 10; year += 1) total += saving * Math.pow(1.025, year) * Math.pow(.995, year);
    return total;
  }

  function calculate() {
    if (!validate(3)) return;
    const property = selected('property');
    const goal = selected('goal');
    const d = defaults[property];
    const state = stateFromPostcode($('#postcode').value.trim());
    const yieldPerDay = yieldFromState(state);
    const bill = annualBill();
    const fixed = d.supply * 365;
    const dayShare = Number($('#dayUse').value) / 100 || d.day;
    const usage = Math.max(1000, (bill - fixed) / d.rate);
    const existingSolar = selected('existingSolar');
    const existingSize = Number($('#existingSize').value) || 0;
    const batteryChoice = selected('battery');

    if (existingSolar === 'yes') {
      const rawBattery = existingSize > 0 ? Math.max(5, Math.min(existingSize * .9, d.batteryMax)) : 10;
      const batteryKwh = nearest(rawBattery, batterySizes, 5, d.batteryMax);
      result = { property, state, goal, bill, usage, existingSolar, existingSize, batteryChoice, solarKw: existingSize || 0, batteryKwh, solarSaving: 0, batterySaving: 0, solarRunning: bill, batteryRunning: bill, solarCapital: 0, batteryCapital: d.batteryBase + batteryKwh * d.batteryPerKwh, solarPayback: null, batteryPayback: null, solarBenefit10: 0, batteryBenefit10: 0, reviewFirst: true };
      render();
      showStep(4);
      return;
    }

    const goalFactor = goal === 'future' ? 1.08 : goal === 'battery' ? 1.0 : .92;
    const rawSolar = (usage * goalFactor) / (yieldPerDay * 365);
    const solarKw = nearest(rawSolar, solarSizes, d.min, d.max);
    const generation = solarKw * yieldPerDay * 365;
    const dayLoad = usage * dayShare;
    const directSolar = Math.min(generation, dayLoad);
    const exports = Math.max(0, generation - directSolar);
    const importsAfterSolar = Math.max(0, usage - directSolar);
    const solarRunning = Math.max(fixed, importsAfterSolar * d.rate + fixed - exports * .05);
    const solarSaving = Math.max(0, bill - solarRunning);

    const eveningUsePerDay = Math.max(0, usage - dayLoad) / 365;
    const surplusPerDay = exports / 365;
    const rawBattery = Math.max(5, Math.min(eveningUsePerDay / .9, surplusPerDay * .95, d.batteryMax));
    const batteryKwh = nearest(rawBattery, batterySizes, 5, d.batteryMax);
    const storedPerYear = Math.min(exports, batteryKwh * 365);
    const delivered = Math.min(importsAfterSolar, storedPerYear * .9);
    const importsAfterBattery = Math.max(0, importsAfterSolar - delivered);
    const exportsAfterBattery = Math.max(0, exports - storedPerYear);
    const batteryRunning = Math.max(fixed, importsAfterBattery * d.rate + fixed - exportsAfterBattery * .05);
    const batterySaving = Math.max(0, bill - batteryRunning);

    const solarCapital = d.solarBase + solarKw * d.solarPerKw;
    const batteryCapital = d.batteryBase + batteryKwh * d.batteryPerKwh;
    const totalCapital = solarCapital + batteryCapital;
    const solarPayback = payback(solarCapital, solarSaving);
    const batteryPayback = payback(totalCapital, batterySaving);

    result = {
      property, state, goal, bill, usage, existingSolar, existingSize, batteryChoice, solarKw, batteryKwh,
      solarSaving, batterySaving, solarRunning, batteryRunning, solarCapital, batteryCapital, totalCapital,
      solarPayback, batteryPayback,
      solarBenefit10: tenYearBenefit(solarSaving, solarCapital),
      batteryBenefit10: tenYearBenefit(batterySaving, totalCapital),
      reviewFirst: false
    };
    render();
    showStep(4);
  }

  function render() {
    const r = result;
    const hideBattery = r.batteryChoice === 'no';
    $('#batteryCompareRow').classList.toggle('hidden', hideBattery);

    if (r.reviewFirst) {
      $('#resultTitle').textContent = 'Review your current solar first.';
      $('#resultIntro').textContent = 'Because you already have solar, your power bill alone cannot show what a new system would save. The best next step is to check your current solar, exports and later power use.';
      $('#solarSizeResult').textContent = r.existingSize ? `${number(r.existingSize)} kW now` : 'Review first';
      $('#batterySizeResult').textContent = `${number(r.batteryKwh)} kWh guide`;
      $('#batteryNote').textContent = 'Needs a bill and system check';
      $('#solarSavingResult').textContent = 'Review needed';
      $('#batterySavingResult').textContent = 'Review needed';
      $('#gridCostLabel').textContent = money(r.bill);
      $('#solarCostLabel').textContent = 'Current solar already included';
      $('#batteryCostLabel').textContent = 'Needs a closer check';
      $('#solarBar').style.width = '72%';
      $('#batteryBar').style.width = '58%';
      $('#solarPayback').textContent = 'Review needed';
      $('#batteryPayback').textContent = 'Review needed';
      $('#tenYearSolar').textContent = 'Review needed';
      $('#tenYearBattery').textContent = 'Review needed';
      return;
    }

    $('#resultTitle').textContent = r.solarSaving > r.bill * .18 ? 'Solar looks worth a closer look.' : 'Solar may help, but the fit is less clear.';
    $('#resultIntro').textContent = `This first estimate uses your bill, postcode and when you use power. It gives you a simple starting point before a real bill and site review.`;
    $('#solarSizeResult').textContent = `${number(r.solarKw)} kW`;
    $('#batterySizeResult').textContent = hideBattery ? 'Not included' : `${number(r.batteryKwh)} kWh`;
    $('#batteryNote').textContent = hideBattery ? 'Solar-only result chosen' : 'First battery guide';
    $('#solarSavingResult').textContent = money(r.solarSaving);
    $('#batterySavingResult').textContent = hideBattery ? 'Not included' : money(r.batterySaving);
    $('#gridCostLabel').textContent = money(r.bill);
    $('#solarCostLabel').textContent = money(r.solarRunning);
    $('#batteryCostLabel').textContent = money(r.batteryRunning);
    $('#solarBar').style.width = `${clamp(r.solarRunning / r.bill * 100, 4, 100)}%`;
    $('#batteryBar').style.width = `${clamp(r.batteryRunning / r.bill * 100, 4, 100)}%`;
    $('#solarPayback').textContent = r.solarPayback ? `${r.solarPayback.toFixed(1)} years` : 'Review needed';
    $('#batteryPayback').textContent = hideBattery ? 'Not included' : (r.batteryPayback ? `${r.batteryPayback.toFixed(1)} years` : 'Review needed');
    $('#tenYearSolar').textContent = money(r.solarBenefit10);
    $('#tenYearBattery').textContent = hideBattery ? 'Not included' : money(r.batteryBenefit10);
  }

  async function saveLead() {
    const name = $('#leadName').value.trim();
    const phone = $('#leadPhone').value.trim();
    const email = $('#leadEmail').value.trim();
    const consent = $('#leadConsent').checked;
    const error = $('#leadError');
    if (!name || !phone || !email) { error.textContent = 'Enter your name, mobile and email.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { error.textContent = 'Enter a valid email address.'; return; }
    if (!consent) { error.textContent = 'Please confirm that Mark may contact you.'; return; }
    error.textContent = '';
    const button = $('#saveResult');
    button.disabled = true;
    button.textContent = 'Saving…';

    const lead = {
      submittedAt: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }),
      name, phone, email,
      postcode: $('#postcode').value.trim(),
      property: defaults[result.property].label,
      goal: selected('goal'),
      annualBill: Math.round(result.bill),
      estimatedUsageKwh: Math.round(result.usage),
      solarRecommendationKw: result.reviewFirst ? '' : result.solarKw,
      batteryRecommendationKwh: result.batteryChoice === 'no' ? '' : result.batteryKwh,
      estimatedAnnualSavings: result.reviewFirst ? '' : Math.round(result.batteryChoice === 'no' ? result.solarSaving : result.batterySaving),
      estimatedPaybackYears: result.reviewFirst ? 'Review required' : (result.batteryChoice === 'no' ? (result.solarPayback ? result.solarPayback.toFixed(1) : 'Review required') : (result.batteryPayback ? result.batteryPayback.toFixed(1) : 'Review required')),
      state: result.state,
      systemPlan: result.reviewFirst ? 'Existing solar review' : (result.batteryChoice === 'no' ? 'Solar only' : 'Solar and battery comparison'),
      source: 'Energy With Mark Full Solar Calculator'
    };

    try {
      await fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(lead) });
      $('#leadFields').classList.add('hidden');
      $('#savedPanel').classList.remove('hidden');
      try { window.gtag?.('event', 'generate_lead', { form_type: 'full_solar_calculator' }); } catch (_) {}
    } catch (err) {
      error.textContent = 'The result could not be saved. Please call Mark on 0434 151 237.';
      button.disabled = false;
      button.textContent = 'Save My Result';
    }
  }

  $$('[data-next]').forEach((button) => button.addEventListener('click', () => {
    const current = Number(button.closest('.calc-step').dataset.step);
    const next = Number(button.dataset.next);
    if (validate(current)) showStep(next);
  }));
  $$('[data-back]').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.back))));
  $$('input[name="existingSolar"]').forEach((input) => input.addEventListener('change', () => {
    $('#existingSizeWrap').classList.toggle('hidden', selected('existingSolar') !== 'yes');
  }));
  $('#calculateFull').addEventListener('click', calculate);
  $('#saveResult').addEventListener('click', saveLead);
  $('#printResult').addEventListener('click', () => window.print());
})();