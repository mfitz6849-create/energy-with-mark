(() => {
  'use strict';

  const LEGACY_BILL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyqgpvd3M2qv9XHuxqqna3ndpikbC0egGDHnTb4dXBtLBMnhIS4TppCuWq5OufTPZtEPQ/exec';
  const V3_INTAKE_ENDPOINT = 'https://intake.energywithmark.com.au/api/public/website-intake/v1';
  const BILL_RECEIPT_ENDPOINT = 'https://intake.energywithmark.com.au/api/public/website-intake/v1?receipt=bill';
  const NATIVE_BILL_RECEIPT_ENABLED = false;
  const PRIVACY_NOTICE_VERSION = '2026-08-14-v1';
  const MARKETING_CONSENT_VERSION = '2026-09-19-v1';
  const CONTEXT_KEY = 'ewmExistingSolarContext';

  // Keep the existing conversion/profile layer unchanged.
  const loadBaseLayer = () => {
    if (document.querySelector('script[data-ewm-conversion-base]')) return;
    const base = document.createElement('script');
    base.src = new URL('/conversion-v1-base.js', window.location.origin).href;
    base.async = true;
    base.dataset.ewmConversionBase = 'true';
    document.body.appendChild(base);
  };

  const clean = value => String(value ?? '').trim();
  const value = selector => clean(document.querySelector(selector)?.value);
  const text = selector => clean(document.querySelector(selector)?.textContent);
  const selectedValue = (root, name) => root?.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const marketingOptIn = root => Boolean(root?.querySelector('input[name="marketingConsent"]')?.checked);
  const queryFields = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || ''
    };
  };

  const propertyToCustomerType = property => ({
    home: 'Homeowner',
    business: 'Business owner',
    community: 'Sporting or community organisation',
    farm: 'Other'
  }[property] || 'Other');

  const frequencyToBillingPeriod = frequency => ({
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Other'
  }[frequency] || 'Other');

  const makeRequestId = prefix => {
    let randomPart = '';
    try {
      if (window.crypto?.getRandomValues) {
        randomPart = Array.from(window.crypto.getRandomValues(new Uint32Array(2)))
          .map(v => v.toString(36)).join('');
      }
    } catch (_) {}
    if (!randomPart) randomPart = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return (`ewm-${prefix}-${Date.now().toString(36)}-${randomPart}`).slice(0, 78);
  };

  const saveExistingContext = context => {
    try { localStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...context, savedAt: new Date().toISOString() })); } catch (_) {}
  };

  const getExistingContext = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(CONTEXT_KEY) || 'null');
      if (!raw || raw.existingSolar !== 'yes') return null;
      return raw;
    } catch (_) { return null; }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const readNativeBillReceipt = async requestId => {
    try {
      const response = await fetch(`${BILL_RECEIPT_ENDPOINT}&requestId=${encodeURIComponent(requestId)}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return body?.ok ? body : null;
    } catch (_) {
      return null;
    }
  };

  const waitForNativeBillReceipt = async (requestId, timeoutMs = 12000, intervalMs = 900) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await readNativeBillReceipt(requestId);
      if (receipt?.fileStored) return receipt;
      await sleep(intervalMs);
    }
    return null;
  };

  const verifiedIframeSubmit = ({ payload, expectedSource, timeoutMs = 14000, timeoutMessage }) => new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.name = `ewm_verified_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    iframe.title = 'Energy With Mark secure submission acknowledgement';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText = 'position:absolute;width:1px;height:1px;border:0;left:-10000px;top:auto;overflow:hidden;';
    document.body.appendChild(iframe);

    const transport = document.createElement('form');
    transport.method = 'POST';
    transport.action = LEGACY_BILL_ENDPOINT;
    transport.target = iframe.name;
    transport.style.display = 'none';

    const add = (name, fieldValue) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = fieldValue;
      transport.appendChild(input);
    };
    add('responseMode', 'iframe');
    add('parentOrigin', window.location.origin);
    add('payload', JSON.stringify(payload));
    document.body.appendChild(transport);

    let finished = false;
    let timer = null;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
      transport.remove();
      iframe.remove();
    };
    const fail = message => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    };
    const succeed = result => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };
    const onMessage = event => {
      const googleOrigin = event.origin === 'https://script.google.com' || event.origin.endsWith('.googleusercontent.com');
      if (!googleOrigin) return;
      const message = event.data;
      if (!message || message.source !== expectedSource || !message.payload) return;
      const result = message.payload;
      if (result.requestId !== payload?.fields?.clientRequestId) return;
      if (!result.ok) return fail(result.error || 'The submission could not be accepted.');
      succeed(result);
    };

    const pollNativeReceipt = async () => {
      if (!NATIVE_BILL_RECEIPT_ENABLED) return;
      const requestId = clean(payload?.fields?.clientRequestId);
      if (!requestId) return;
      const receipt = await waitForNativeBillReceipt(requestId, Math.max(2500, timeoutMs - 700), 900);
      if (!receipt?.fileStored || finished) return;
      succeed({
        ok: true,
        requestId,
        fileStored: true,
        nativeReceiptConfirmed: true,
        transport: 'native_bill_receipt_verifier'
      });
    };

    window.addEventListener('message', onMessage);
    timer = setTimeout(() => fail(timeoutMessage || 'Your upload was sent securely, but confirmation is taking longer than usual. Please do not upload it again. I’ll check it and contact you only if anything is missing.'), timeoutMs);
    transport.submit();
    void pollNativeReceipt();
  });

  const directV3Submit = async (payload, requestId, timeoutMs = 20000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(V3_INTAKE_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('The request was sent, but this page could not confirm it. Please do not send it again. Call Mark on 0434 151 237 so he can check.');
      throw new Error('The request could not be confirmed. Please try again or call Mark on 0434 151 237.');
    } finally {
      window.clearTimeout(timer);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) throw new Error(body?.message || 'The request could not be accepted.');
    return body;
  };

  const assessmentToV3 = (kind, payload, extra = {}) => {
    const fields = payload?.fields || {};
    const helpWith = Array.isArray(fields.helpWith) ? fields.helpWith.filter(Boolean).join(' · ') : clean(fields.helpWith);
    return {
      kind,
      clientRequestId: clean(fields.clientRequestId),
      name: clean(fields.name),
      phone: clean(fields.phone),
      email: clean(fields.email),
      address: clean(fields.address),
      postcode: clean(fields.postcode),
      customerType: clean(fields.customerType),
      helpRequested: helpWith,
      existingSolar: clean(fields.existingSolar),
      billAmount: clean(fields.billAmount),
      notes: clean(fields.notes),
      sourcePage: clean(fields.sourcePage),
      landingPage: clean(fields.landingPage || fields.sourcePage),
      privacyNoticeVersion: clean(fields.privacyNoticeVersion) || PRIVACY_NOTICE_VERSION,
      privacyAcknowledged: fields.privacyAcknowledged === true,
      marketingConsentAccepted: fields.marketingConsentAccepted === true,
      marketingConsentVersion: fields.marketingConsentAccepted === true ? MARKETING_CONSENT_VERSION : '',
      honeypot: clean(fields.website),
      utmSource: clean(fields.utmSource),
      utmMedium: clean(fields.utmMedium),
      utmCampaign: clean(fields.utmCampaign),
      goals: Array.isArray(fields.goals) ? fields.goals.filter(Boolean) : [],
      billingPeriod: clean(fields.billingPeriod),
      solarSize: clean(fields.solarSize),
      systemAge: clean(fields.systemAge),
      inverter: clean(fields.inverter),
      batteryInterest: clean(fields.batteryInterest),
      pageUrl: clean(fields.pageUrl || window.location.href),
      referrer: clean(fields.referrer || document.referrer),
      context: payload?.context && typeof payload.context === 'object' ? payload.context : {},
      ...extra
    };
  };

  const assessmentPayload = ({
    sourcePage, customerType, postcode, address = '', helpWith, goals, billAmount, billingPeriod,
    existingSolar, solarSize = '', systemAge = '', inverter = '', name, phone, email,
    notes, requestId, website = '', context = {}, marketingConsentAccepted = false
  }) => ({
    type: 'assessment',
    context,
    source: 'Energy With Mark Website',
    submittedAt: new Date().toISOString(),
    fields: {
      name, phone, email, customerType, postcode, address,
      helpWith, goals, billAmount, billingPeriod, existingSolar, solarSize, systemAge,
      inverter, highExports: '', usagePattern: '', evStatus: '', businessName: '',
      businessType: '', startTime: '', finishTime: '', hasIntervalData: '',
      batteryInterest: '', backupImportance: '', futureNeeds: [],
      preferredContact: 'Phone', notes, website,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyAcknowledged: true,
      marketingConsentAccepted,
      marketingConsentVersion: marketingConsentAccepted ? MARKETING_CONSENT_VERSION : '',
      sourcePage, landingPage: sourcePage, pageUrl: window.location.href,
      referrer: document.referrer || '', clientRequestId: requestId, ...queryFields()
    },
    files: []
  });

  const addQuickExistingSolarFields = () => {
    const form = document.getElementById('quickSolarCheck');
    if (!form || document.getElementById('quickExistingSolarDetails')) return;
    const yes = form.querySelector('input[name="quickExistingSolar"][value="yes"]');
    const host = yes?.closest('.quick-field');
    if (!host) return;

    const details = document.createElement('div');
    details.id = 'quickExistingSolarDetails';
    details.className = 'quick-field full';
    details.style.display = 'none';
    details.innerHTML = `
      <span>About your current solar <small>(if known)</small></span>
      <div class="quick-fields" style="margin-top:8px">
        <div class="quick-field"><span>System size (kW)</span><input id="quickExistingSize" type="number" min="0" step="0.1" placeholder="e.g. 6.6"></div>
        <div class="quick-field"><span>System age</span><select id="quickSystemAge"><option value="">Not sure</option><option>Under 2 years</option><option>2–5 years</option><option>5–10 years</option><option>More than 10 years</option></select></div>
      </div>`;
    host.insertAdjacentElement('afterend', details);

    const sync = () => {
      const existing = selectedValue(form, 'quickExistingSolar');
      details.style.display = existing === 'yes' ? '' : 'none';
      if (existing === 'yes') saveExistingContext({
        existingSolar: 'yes',
        systemSize: value('#quickExistingSize'),
        systemAge: value('#quickSystemAge')
      });
    };
    form.querySelectorAll('input[name="quickExistingSolar"]').forEach(input => input.addEventListener('change', sync));
    details.querySelectorAll('input,select').forEach(input => input.addEventListener('change', sync));
    sync();
  };

  const addFullCalculatorExistingSolarFields = () => {
    const form = document.getElementById('fullSolarCalculator');
    const wrap = document.getElementById('existingSizeWrap');
    if (!form || !wrap || document.getElementById('existingSystemExtra')) return;

    const label = wrap.querySelector('label > span');
    if (label) label.innerHTML = 'About how big is your current solar system? <em>Optional if unknown</em>';

    const extra = document.createElement('div');
    extra.id = 'existingSystemExtra';
    extra.className = 'simple-fields';
    extra.style.marginTop = '14px';
    extra.innerHTML = `
      <label><span>How old is the system?</span><select id="existingSystemAge"><option value="">Not sure</option><option>Under 2 years</option><option>2–5 years</option><option>5–10 years</option><option>More than 10 years</option></select></label>
      <label><span>Inverter brand/model <em>Optional</em></span><input id="existingInverter" type="text" placeholder="e.g. Sungrow SH5.0RS"></label>
      <label><span>Do you already have a battery?</span><select id="existingBattery"><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></select></label>`;
    wrap.appendChild(extra);

    const context = getExistingContext();
    if (context) {
      if (context.systemSize && !value('#existingSize')) document.getElementById('existingSize').value = context.systemSize;
      if (context.systemAge) document.getElementById('existingSystemAge').value = context.systemAge;
    }
    const sync = () => {
      if (selectedValue(form, 'existingSolar') === 'yes') {
        saveExistingContext({
          existingSolar: 'yes',
          systemSize: value('#existingSize'),
          systemAge: value('#existingSystemAge'),
          inverter: value('#existingInverter'),
          hasBattery: value('#existingBattery')
        });
      }
    };
    form.querySelectorAll('input[name="existingSolar"]').forEach(input => input.addEventListener('change', sync));
    extra.querySelectorAll('input,select').forEach(input => input.addEventListener('change', sync));
    document.getElementById('existingSize')?.addEventListener('change', sync);
  };

  const replaceButton = id => {
    const oldButton = document.getElementById(id);
    if (!oldButton) return null;
    const button = oldButton.cloneNode(true);
    button.dataset.ewmV3Hardened = 'true';
    oldButton.replaceWith(button);
    return button;
  };

  const hardenQuickLead = () => {
    const form = document.getElementById('quickSolarCheck');
    const button = replaceButton('quickLeadButton');
    if (!form || !button) return;

    const consentCopy = document.querySelector('#quickConsent')?.closest('label')?.querySelector('span');
    if (consentCopy) consentCopy.innerHTML = 'I have read the <a href="privacy.html"><strong>privacy policy</strong></a> and Mark may contact me about this result.';

    button.addEventListener('click', async () => {
      const error = document.getElementById('quickLeadError');
      const name = value('#quickName'), phone = value('#quickPhone'), email = value('#quickEmail'), address = value('#quickAddress');
      const consent = Boolean(document.getElementById('quickConsent')?.checked);
      if (!name || !phone || !email || !address) { if (error) error.textContent = 'Enter your name, mobile, email and property address.'; return; }
      if (!/^\S+@\S+\.\S+$/.test(email)) { if (error) error.textContent = 'Enter a valid email address.'; return; }
      if (!consent) { if (error) error.textContent = 'Please read the privacy policy and confirm that Mark may contact you.'; return; }
      if (error) error.textContent = '';

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Confirming your result…';
      const existing = selectedValue(form, 'quickExistingSolar');
      const requestId = makeRequestId('quick');
      const payload = assessmentPayload({
        sourcePage: '/',
        customerType: propertyToCustomerType(selectedValue(form, 'quickProperty')),
        postcode: value('#quickPostcode'),
        address,
        helpWith: [existing === 'yes' ? 'Existing solar' : 'Solar'],
        goals: [existing === 'yes' ? 'Review existing solar and next options' : 'Find out if solar can help'],
        billAmount: value('#quickBill'),
        billingPeriod: frequencyToBillingPeriod(value('#quickFrequency')),
        existingSolar: existing === 'yes' ? 'Yes' : 'No',
        solarSize: value('#quickExistingSize'),
        systemAge: value('#quickSystemAge'),
        name, phone, email,
        notes: [
          'Saved from Energy With Mark 60 Second Check.',
          `Result: ${text('#quickResultStatus') || 'Not recorded'}`,
          `Possible solar size/result: ${text('#quickSolarSize') || 'Not recorded'}`,
          `Possible yearly saving/result: ${text('#quickSavingRange') || 'Not recorded'}`,
          `Displayed yearly bill: ${text('#quickAnnualBill') || 'Not recorded'}`
        ].join(' | '),
        requestId,
        marketingConsentAccepted: marketingOptIn(form),
        context: {
          journey: '60_second_check',
          property: selectedValue(form, 'quickProperty'),
          billFrequency: value('#quickFrequency'),
          existingSolar: existing,
          existingSolarSize: value('#quickExistingSize'),
          existingSystemAge: value('#quickSystemAge'),
          resultStatus: text('#quickResultStatus'),
          solarSizeResult: text('#quickSolarSize'),
          savingRangeResult: text('#quickSavingRange'),
          displayedAnnualBill: text('#quickAnnualBill')
        }
      });

      try {
        await directV3Submit(assessmentToV3('quick_check', payload), requestId);
        if (existing === 'yes') saveExistingContext({
          existingSolar: 'yes',
          systemSize: value('#quickExistingSize'),
          systemAge: value('#quickSystemAge')
        });
        try { localStorage.setItem('ewmQuickSolarLead', JSON.stringify({ requestId, name, phone, email, address, postcode: value('#quickPostcode'), source: 'Energy With Mark 60 Second Solar Check' })); } catch (_) {}
        document.getElementById('quickLeadFields')?.classList.add('hidden');
        document.getElementById('quickSuccess')?.classList.remove('hidden');
        try { window.gtag?.('event', 'generate_lead', { form_type: '60_second_solar_check', acknowledgement: 'v3' }); } catch (_) {}
      } catch (err) {
        if (error) error.textContent = err instanceof Error ? err.message : 'The result could not be confirmed. Please call Mark on 0434 151 237.';
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  };

  const hardenFullCalculatorLead = () => {
    const form = document.getElementById('fullSolarCalculator');
    const button = replaceButton('saveResult');
    if (!form || !button) return;

    const consentCopy = document.querySelector('#leadConsent')?.closest('label')?.querySelector('span');
    if (consentCopy) consentCopy.innerHTML = 'I have read the <a href="privacy.html">privacy policy</a> and Mark may contact me about this result.';

    button.addEventListener('click', async () => {
      const error = document.getElementById('leadError');
      const name = value('#leadName'), phone = value('#leadPhone'), email = value('#leadEmail'), address = value('#leadAddress');
      const consent = Boolean(document.getElementById('leadConsent')?.checked);
      if (!name || !phone || !email || !address) { if (error) error.textContent = 'Enter your name, mobile, email and property address.'; return; }
      if (!/^\S+@\S+\.\S+$/.test(email)) { if (error) error.textContent = 'Enter a valid email address.'; return; }
      if (!consent) { if (error) error.textContent = 'Please read the privacy policy and confirm that Mark may contact you.'; return; }
      if (error) error.textContent = '';

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Confirming your result…';
      const existing = selectedValue(form, 'existingSolar');
      const battery = selectedValue(form, 'battery');
      const goal = selectedValue(form, 'goal');
      const requestId = makeRequestId('calculator');
      const help = existing === 'yes' ? 'Existing solar' : battery === 'no' ? 'Solar' : 'Solar + battery';

      const payload = assessmentPayload({
        sourcePage: '/calculator.html',
        customerType: propertyToCustomerType(selectedValue(form, 'property')),
        postcode: value('#postcode'),
        address,
        helpWith: [help],
        goals: [goal || 'Understand whether solar or battery makes financial sense'],
        billAmount: value('#billAmount'),
        billingPeriod: frequencyToBillingPeriod(value('#billFrequency')),
        existingSolar: existing === 'yes' ? 'Yes' : existing === 'no' ? 'No' : 'Not sure',
        solarSize: value('#existingSize'),
        systemAge: value('#existingSystemAge'),
        inverter: value('#existingInverter'),
        name, phone, email,
        notes: [
          'Saved from Energy With Mark Full Calculator.',
          existing === 'yes' ? `Existing battery: ${value('#existingBattery') || 'Not sure'}` : '',
          `Solar result: ${text('#solarSizeResult') || 'Not recorded'}`,
          `Battery result: ${text('#batterySizeResult') || 'Not recorded'}`,
          `Solar saving result: ${text('#solarSavingResult') || 'Not recorded'}`,
          `Solar + battery saving result: ${text('#batterySavingResult') || 'Not recorded'}`,
          `Solar payback result: ${text('#solarPayback') || 'Not recorded'}`,
          `Solar + battery payback result: ${text('#batteryPayback') || 'Not recorded'}`
        ].filter(Boolean).join(' | '),
        requestId,
        marketingConsentAccepted: marketingOptIn(form),
        context: {
          journey: 'full_calculator',
          property: selectedValue(form, 'property'),
          state: value('#state'),
          goal,
          billFrequency: value('#billFrequency'),
          existingSolar: existing,
          existingSolarSize: value('#existingSize'),
          existingSystemAge: value('#existingSystemAge'),
          existingInverter: value('#existingInverter'),
          existingBattery: value('#existingBattery'),
          batteryChoice: battery,
          solarSizeResult: text('#solarSizeResult'),
          batterySizeResult: text('#batterySizeResult'),
          solarSavingResult: text('#solarSavingResult'),
          batterySavingResult: text('#batterySavingResult'),
          solarPaybackResult: text('#solarPayback'),
          batteryPaybackResult: text('#batteryPayback')
        }
      });

      try {
        await directV3Submit(assessmentToV3('calculator', payload), requestId);
        if (existing === 'yes') saveExistingContext({
          existingSolar: 'yes',
          systemSize: value('#existingSize'),
          systemAge: value('#existingSystemAge'),
          inverter: value('#existingInverter'),
          hasBattery: value('#existingBattery')
        });
        document.getElementById('leadFields')?.classList.add('hidden');
        document.getElementById('savedPanel')?.classList.remove('hidden');
        try { window.gtag?.('event', 'generate_lead', { form_type: 'full_solar_calculator', acknowledgement: 'v3' }); } catch (_) {}
      } catch (err) {
        if (error) error.textContent = err instanceof Error ? err.message : 'The result could not be confirmed. Please call Mark on 0434 151 237.';
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  };

  const addBillExistingSolarFields = form => {
    if (!form || form.querySelector('[data-existing-solar-assessment]')) return;
    const help = form.elements.helpWith?.closest('.field');
    if (!help) return;

    const field = document.createElement('div');
    field.className = 'field full';
    field.dataset.existingSolarAssessment = 'true';
    field.innerHTML = `
      <label>Do you already have solar?</label>
      <select name="existingSolar"><option value="Not sure">Not sure</option><option value="Yes">Yes</option><option value="No">No</option></select>
      <div data-existing-details style="display:none;margin-top:14px">
        <div class="form-grid">
          <div class="field"><label>Current solar size (kW) <span class="small">(if known)</span></label><input name="solarSize" type="number" min="0" step="0.1" placeholder="e.g. 6.6"></div>
          <div class="field"><label>System age</label><select name="systemAge"><option value="">Not sure</option><option>Under 2 years</option><option>2–5 years</option><option>5–10 years</option><option>More than 10 years</option></select></div>
          <div class="field"><label>Inverter brand/model <span class="small">(optional)</span></label><input name="inverter" placeholder="e.g. Sungrow, Fronius"></div>
          <div class="field"><label>Do you already have a battery?</label><select name="existingBattery"><option value="">Not sure</option><option value="Yes">Yes</option><option value="No">No</option></select></div>
        </div>
      </div>`;
    help.insertAdjacentElement('afterend', field);

    const details = field.querySelector('[data-existing-details]');
    const context = getExistingContext();
    if (context) {
      form.elements.existingSolar.value = 'Yes';
      if (context.systemSize) form.elements.solarSize.value = context.systemSize;
      if (context.systemAge) form.elements.systemAge.value = context.systemAge;
      if (context.inverter) form.elements.inverter.value = context.inverter;
      if (context.hasBattery) form.elements.existingBattery.value = context.hasBattery === 'yes' ? 'Yes' : context.hasBattery === 'no' ? 'No' : '';
    }
    const sync = () => {
      const isExisting = form.elements.existingSolar.value === 'Yes';
      details.style.display = isExisting ? '' : 'none';
      if (isExisting) saveExistingContext({
        existingSolar: 'yes',
        systemSize: clean(form.elements.solarSize.value),
        systemAge: clean(form.elements.systemAge.value),
        inverter: clean(form.elements.inverter.value),
        hasBattery: clean(form.elements.existingBattery.value).toLowerCase()
      });
    };
    form.elements.existingSolar.addEventListener('change', sync);
    details.querySelectorAll('input,select').forEach(input => input.addEventListener('change', sync));
    sync();
  };

  const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('I could not read that file. Please choose it again.'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.readAsDataURL(file);
  });

  const hardenBillUpload = () => {
    const oldForm = document.querySelector('form[data-form-type="bill_upload"]');
    if (!oldForm) return;

    const form = oldForm.cloneNode(true);
    oldForm.replaceWith(form);
    addBillExistingSolarFields(form);

    const button = form.querySelector('[type="submit"]');
    const errorBox = form.querySelector('.form-error');
    const statusBox = form.querySelector('.submit-status');
    const showError = message => {
      if (statusBox) statusBox.textContent = '';
      if (errorBox) { errorBox.textContent = message; errorBox.style.display = 'block'; }
      if (button) button.disabled = false;
    };

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (errorBox) errorBox.style.display = 'none';

      const file = form.elements.billFile?.files?.[0];
      if (!file) return showError('Please choose one power bill.');
      if (form.elements.billFile.files.length !== 1) return showError('Please send one bill at a time.');
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      const allowedExtension = /\.(pdf|jpe?g|png)$/i.test(file.name || '');
      if (!allowedTypes.includes(file.type) || !allowedExtension) return showError('Please use a PDF, JPG or PNG.');
      if (file.size > 5 * 1024 * 1024) return showError('That file is over 5 MB. Please use a smaller file.');

      if (button) button.disabled = true;
      if (statusBox) statusBox.textContent = 'Preparing your bill securely…';

      try {
        const fd = new FormData(form);
        const requestId = makeRequestId('bill');
        const dataBase64 = await fileToBase64(file);
        const existingSolar = clean(fd.get('existingSolar')) || 'Not sure';
        const payload = {
          type: 'bill_upload',
          fields: {
            name: clean(fd.get('name')), phone: clean(fd.get('phone')), email: clean(fd.get('email')),
            address: clean(fd.get('address')), postcode: clean(fd.get('postcode')), customerType: clean(fd.get('customerType')),
            helpWith: clean(fd.get('helpWith')), existingSolar, billAmount: clean(fd.get('billAmount')),
            notes: [
              clean(fd.get('notes')),
              existingSolar === 'Yes' ? `Current solar size: ${clean(fd.get('solarSize')) || 'Not known'} kW` : '',
              existingSolar === 'Yes' ? `System age: ${clean(fd.get('systemAge')) || 'Not known'}` : '',
              existingSolar === 'Yes' ? `Inverter: ${clean(fd.get('inverter')) || 'Not known'}` : '',
              existingSolar === 'Yes' ? `Existing battery: ${clean(fd.get('existingBattery')) || 'Not known'}` : ''
            ].filter(Boolean).join(' | '),
            website: clean(fd.get('website')),
            privacyNoticeVersion: clean(fd.get('privacyNoticeVersion')) || PRIVACY_NOTICE_VERSION,
            privacyAcknowledged: fd.get('privacyAcknowledged') === 'Yes',
            marketingConsentAccepted: fd.get('marketingConsent') === 'Yes',
            marketingConsentVersion: fd.get('marketingConsent') === 'Yes' ? MARKETING_CONSENT_VERSION : '',
            sourcePage: '/upload-bill.html', landingPage: '/upload-bill.html',
            pageUrl: window.location.href, referrer: document.referrer || '',
            clientRequestId: requestId, ...queryFields()
          },
          context: {
            journey: 'bill_upload',
            billFile: { name: file.name, mimeType: file.type, sizeBytes: file.size },
            existingSolar,
            solarSize: clean(fd.get('solarSize')),
            systemAge: clean(fd.get('systemAge')),
            inverter: clean(fd.get('inverter')),
            existingBattery: clean(fd.get('existingBattery'))
          },
          files: [{ name: file.name, mimeType: file.type, category: 'Electricity Bill', dataBase64 }]
        };

        let preRegistered = false;
        if (statusBox) statusBox.textContent = 'Starting your assessment securely…';
        try {
          await directV3Submit(assessmentToV3('bill_upload', payload, {
            billUploadPending: true
          }), requestId);
          preRegistered = true;
        } catch (_) {
          // Do not block secure Drive storage if the native intake service is briefly
          // unavailable. The verified legacy feed can reconcile this exact bill later.
        }

        if (statusBox) statusBox.textContent = 'Uploading your bill to the private review area…';
        const uploadReceipt = await verifiedIframeSubmit({
          payload,
          expectedSource: 'energy-with-mark-bill-upload-submit',
          timeoutMs: 14000,
          timeoutMessage: 'Your upload was sent securely, but confirmation is taking longer than usual. Please do not upload it again. I’ll check it and contact you only if anything is missing.'
        });
        const receipt = uploadReceipt && typeof uploadReceipt === 'object' ? uploadReceipt : {};
        const nativeReceipt = receipt.nativeReceiptConfirmed === true
          ? receipt
          : NATIVE_BILL_RECEIPT_ENABLED
            ? await waitForNativeBillReceipt(requestId, 2500, 500)
            : null;
        const fileFolderId = clean(receipt.fileFolderId || receipt.folderId);
        const reportedFileCount = Number(receipt.fileCount || 0);
        const legacyFileCount = Number.isFinite(reportedFileCount) && reportedFileCount > 0 ? Math.floor(reportedFileCount) : (fileFolderId ? 1 : 0);

        if (!nativeReceipt?.fileStored) {
          if (statusBox) statusBox.textContent = 'Linking your bill to your assessment…';
          try {
            await directV3Submit(assessmentToV3('bill_upload', payload, {
              legacyUploadConfirmed: true,
              legacyFileFolderId: fileFolderId,
              legacyFileCount,
              legacySubmissionId: clean(receipt.submissionId || receipt.id),
              legacyUploadReceipt: {
                ok: receipt.ok === true,
                requestId: clean(receipt.requestId),
                submissionId: clean(receipt.submissionId || receipt.id),
                fileFolderId,
                fileCount: legacyFileCount,
                transport: 'secure_apps_script_bill_upload'
              }
            }), requestId);
          } catch (_) {
            // The file carrier has already confirmed receipt. Keep the customer on the
            // success path; the verified legacy intake feed will enrich the pending D1
            // record (or create it if pre-registration was unavailable).
          }
        }

        if (existingSolar === 'Yes') saveExistingContext({
          existingSolar: 'yes',
          systemSize: clean(fd.get('solarSize')),
          systemAge: clean(fd.get('systemAge')),
          inverter: clean(fd.get('inverter')),
          hasBattery: clean(fd.get('existingBattery')).toLowerCase()
        });

        const receiptPanel = document.getElementById('billReceiptPanel');
        const waiting = document.getElementById('billReceiptWaiting');
        const receiptFrame = document.getElementById('billReceiptFrame');
        if (waiting) waiting.textContent = existingSolar === 'Yes'
          ? 'Your bill and current solar details have been received and confirmed. I’ll review the system you already have before recommending any next step.'
          : 'Your bill has been received and confirmed. I’ll use it as the starting point for your free full energy assessment.';
        if (receiptFrame) receiptFrame.style.display = 'none';
        form.style.display = 'none';
        if (receiptPanel) {
          receiptPanel.style.display = 'block';
          receiptPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        try { window.gtag?.('event', 'bill_upload_complete', { form_type: 'full_energy_assessment', acknowledgement: preRegistered ? 'v3_pre_registered' : 'legacy_reconciled', existing_solar: existingSolar === 'Yes' }); } catch (_) {}
      } catch (err) {
        const message = err instanceof Error ? err.message : 'I could not confirm that bill. Please call Mark on 0434 151 237.';
        if (/confirmation is taking longer than usual/i.test(message)) {
          if (statusBox) statusBox.textContent = '';
          if (errorBox) errorBox.style.display = 'none';
          const receiptPanel = document.getElementById('billReceiptPanel');
          const waiting = document.getElementById('billReceiptWaiting');
          const receiptFrame = document.getElementById('billReceiptFrame');
          if (waiting) waiting.textContent = 'Your bill has been sent securely. You do not need to upload it again. I’ll check the receipt in the background and contact you only if anything is missing.';
          if (receiptFrame) receiptFrame.style.display = 'none';
          form.style.display = 'none';
          if (button) button.disabled = true;
          if (receiptPanel) {
            receiptPanel.style.display = 'block';
            receiptPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          try { window.gtag?.('event', 'bill_upload_sent_confirmation_pending', { form_type: 'full_energy_assessment' }); } catch (_) {}
        } else {
          showError(message);
        }
      }
    });
  };

  const hardenGeneralEnquiry = () => {
    const oldForm = document.querySelector('form[data-form-type="enquiry"]');
    if (!oldForm) return;

    const form = oldForm.cloneNode(true);
    oldForm.replaceWith(form);
    const button = form.querySelector('[type="submit"]');
    const errorBox = form.querySelector('.form-error');
    const statusBox = form.querySelector('.submit-status');
    const successBox = form.querySelector('.success');
    const showError = message => {
      if (statusBox) statusBox.textContent = '';
      if (errorBox) { errorBox.textContent = message; errorBox.style.display = 'block'; }
      if (button) button.disabled = false;
    };

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (errorBox) errorBox.style.display = 'none';
      if (successBox) successBox.style.display = 'none';

      const fd = new FormData(form);
      const name = clean(fd.get('name'));
      const phone = clean(fd.get('phone'));
      const email = clean(fd.get('email'));
      const address = clean(fd.get('address'));
      const postcode = clean(fd.get('postcode'));
      const consent = fd.get('privacyAcknowledged') === 'Yes';
      if (!name || !phone || !email || !address || !postcode) return showError('Please enter your name, mobile, email, property address and postcode.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Please enter a valid email address.');
      if (!consent) return showError('Please read the privacy notice before sending your question.');

      if (button) button.disabled = true;
      if (statusBox) statusBox.textContent = 'Sending your question…';
      const requestId = makeRequestId('enquiry');
      const help = clean(fd.get('helpWith')) || 'General energy question';
      const payload = assessmentPayload({
        sourcePage: '/contact.html',
        customerType: clean(fd.get('customerType')) || 'Other',
        postcode,
        address,
        helpWith: [help],
        goals: ['Get clear energy advice'],
        billAmount: '',
        billingPeriod: 'Other',
        existingSolar: clean(fd.get('existingSolar')) || 'Not sure',
        name, phone, email,
        notes: clean(fd.get('notes')),
        requestId,
        website: clean(fd.get('website')),
        marketingConsentAccepted: fd.get('marketingConsent') === 'Yes',
        context: {
          journey: 'general_enquiry',
          questionType: help,
          existingSolar: clean(fd.get('existingSolar')) || 'Not sure'
        }
      });

      try {
        await directV3Submit(assessmentToV3('enquiry', payload), requestId);
        if (statusBox) statusBox.textContent = 'Question received.';
        form.reset();
        if (successBox) successBox.style.display = 'block';
        if (button) button.disabled = false;
        try { window.gtag?.('event', 'generate_lead', { form_type: 'general_enquiry', acknowledgement: 'verified' }); } catch (_) {}
      } catch (err) {
        showError(err instanceof Error ? err.message : 'I could not confirm your question. Please call Mark on 0434 151 237.');
      }
    });
  };
  const init = () => {
    loadBaseLayer();
    addQuickExistingSolarFields();
    addFullCalculatorExistingSolarFields();
    hardenQuickLead();
    hardenFullCalculatorLead();
    hardenBillUpload();
    hardenGeneralEnquiry();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();