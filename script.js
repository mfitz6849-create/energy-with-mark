// Mark Fitzpatrick Energy Advisory — Website V7
// Paste the deployed Google Apps Script /exec URL between the quotes when ready.
const BACKEND_URL = '';

const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
}

// Conditional assessment fields.
const existingSolar = document.querySelector('[name="existingSolar"]');
const existingSolarSection = document.querySelector('[data-existing-solar]');
if (existingSolar && existingSolarSection) {
  const toggleExisting = () => {
    existingSolarSection.style.display = existingSolar.value === 'Yes' ? 'block' : 'none';
  };
  existingSolar.addEventListener('change', toggleExisting);
  toggleExisting();
}

const customerType = document.querySelector('[name="customerType"]');
const residentialFields = document.querySelector('[data-residential]');
const commercialFields = document.querySelector('[data-commercial]');
if (customerType && residentialFields && commercialFields) {
  const toggleType = () => {
    residentialFields.style.display = customerType.value === 'Homeowner' ? 'block' : 'none';
    commercialFields.style.display = ['Business owner','Commercial property owner','Manager','Sporting or community organisation'].includes(customerType.value) ? 'block' : 'none';
  };
  customerType.addEventListener('change', toggleType);
  toggleType();
}

// Secure-ish first-version submission helper. The Apps Script backend stores files in Drive and CRM data in Sheets.
document.querySelectorAll('[data-backend-form]').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const success = form.querySelector('.success');
    const errorBox = form.querySelector('.form-error');
    const status = form.querySelector('.submit-status');

    if (success) success.style.display = 'none';
    if (errorBox) errorBox.style.display = 'none';
    if (submitButton) submitButton.disabled = true;
    if (status) status.textContent = 'Preparing your information…';

    try {
      const fields = collectFields(form);
      const attribution = collectAttribution();
      Object.assign(fields, attribution);
      const files = await collectFiles(form, status);
      fields.fileCount = files.length;
      const payload = {
        type: form.dataset.formType || 'assessment',
        source: 'Website V7',
        submittedAt: new Date().toISOString(),
        fields,
        files
      };

      if (!BACKEND_URL) {
        // Preview mode: save a copy locally for testing but do not pretend it reached Mark.
        localStorage.setItem('markEnergyLastSubmission', JSON.stringify({ ...payload, files: files.map(f => ({name:f.name,mimeType:f.mimeType,category:f.category})) }));
        if (status) status.textContent = 'Preview complete — backend connection is not configured yet.';
        if (success) {
          success.style.display = 'block';
          const title = success.querySelector('h3');
          const copy = success.querySelector('p');
          if (title) title.textContent = 'Your form is working in preview mode.';
          if (copy) copy.textContent = 'No customer information was transmitted. Connect the Google Apps Script Web App URL in script.js to make submissions live.';
          success.scrollIntoView({behavior:'smooth', block:'center'});
        }
      } else {
        if (status) status.textContent = 'Sending securely to the assessment system…';
        // text/plain + no-cors is intentionally used so a static GitHub Pages site can post to Apps Script.
        await fetch(BACKEND_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {'Content-Type': 'text/plain;charset=utf-8'},
          body: JSON.stringify(payload)
        });
        if (status) status.textContent = 'Submission sent.';
        form.reset();
        if (existingSolarSection) existingSolarSection.style.display = 'none';
        if (success) {
          success.style.display = 'block';
          success.scrollIntoView({behavior:'smooth', block:'center'});
        }
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = '';
      if (errorBox) {
        errorBox.textContent = err.message || 'Something went wrong. Please try again or contact Mark directly.';
        errorBox.style.display = 'block';
        errorBox.scrollIntoView({behavior:'smooth', block:'center'});
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
});

function collectAttribution() {
  const params = new URLSearchParams(window.location.search);
  return {
    landingPage: window.location.pathname || '/',
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmContent: params.get('utm_content') || '',
    utmTerm: params.get('utm_term') || ''
  };
}

function collectFields(form) {
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name || el.type === 'file' || el.disabled) return;
    if (el.type === 'checkbox') {
      if (!el.checked) return;
      if (!data[el.name]) data[el.name] = [];
      data[el.name].push(el.value || 'Yes');
      return;
    }
    if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
      return;
    }
    data[el.name] = el.value;
  });
  return data;
}

async function collectFiles(form, status) {
  const fileInputs = [...form.querySelectorAll('input[type="file"]')];
  const files = [];
  for (const input of fileInputs) {
    for (const file of [...input.files]) {
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than the 8 MB per-file limit.`);
      if (status) status.textContent = `Preparing ${file.name}…`;
      const data = await fileToBase64(file);
      files.push({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        category: input.dataset.category || 'Upload',
        data
      });
    }
  }
  return files;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

// Lightweight calculator for the prototype only. It is deliberately indicative, not a proposal engine.
const calcBtn = document.querySelector('#calcBtn');
if (calcBtn) {
  calcBtn.addEventListener('click', () => {
    const bill = Math.max(0, Number(document.querySelector('#annualBill')?.value || 0));
    const daytime = Math.min(100, Math.max(0, Number(document.querySelector('#daytimeUse')?.value || 50)));
    const solarSavingRate = 0.38 + (daytime/100)*0.32;
    const solarSaving = bill * Math.min(.72, solarSavingRate);
    const batteryExtra = bill * (daytime < 45 ? .18 : .10);
    const grid = Math.round(bill);
    const solar = Math.max(0, Math.round(bill - solarSaving));
    const solarBattery = Math.max(0, Math.round(bill - solarSaving - batteryExtra));
    document.querySelector('#gridResult').textContent = `$${grid.toLocaleString()}`;
    document.querySelector('#solarResult').textContent = `$${solar.toLocaleString()}`;
    document.querySelector('#batteryResult').textContent = `$${solarBattery.toLocaleString()}`;
    document.querySelector('#calcResults').style.display = 'grid';
    document.querySelector('#calcNote').style.display = 'block';
  });
}

// Knowledge tabs.
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(btn.dataset.target)?.classList.add('active');
  });
});
