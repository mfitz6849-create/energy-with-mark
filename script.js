// Energy With Mark — public website
// Google Analytics is limited to site usage/navigation. Do not send customer PII or bill contents as Analytics event parameters.
const GA_MEASUREMENT_ID = 'G-22EYYXBP2S';

(function initialiseAnalytics() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(tag);
})();

// Paste the deployed Google Apps Script /exec URL between the quotes when the private backend is ready.
const BACKEND_URL = '';

const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  if (!navLinks.id) navLinks.id = 'primary-navigation';
  navToggle.setAttribute('aria-controls', navLinks.id);
  navToggle.setAttribute('aria-expanded', 'false');

  const setMenuOpen = (open) => {
    navLinks.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };

  navToggle.addEventListener('click', () => setMenuOpen(!navLinks.classList.contains('open')));
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navLinks.classList.contains('open')) {
      setMenuOpen(false);
      navToggle.focus();
    }
  });
}

// Add structured breadcrumb data only where a visible breadcrumb trail already exists.
function addBreadcrumbStructuredData() {
  const breadcrumbNav = document.querySelector('nav.breadcrumbs');
  if (!breadcrumbNav) return;

  const itemListElement = [...breadcrumbNav.querySelectorAll('a[href]')].map((link, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: (link.textContent || '').trim(),
    item: new URL(link.getAttribute('href'), window.location.href).href
  }));

  const currentName = [...breadcrumbNav.querySelectorAll('span')]
    .map(span => (span.textContent || '').trim())
    .filter(text => text && text !== '›')
    .pop();

  if (currentName) {
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: currentName,
      item: window.location.href.split('#')[0]
    });
  }

  if (itemListElement.length < 2) return;

  const schema = document.createElement('script');
  schema.type = 'application/ld+json';
  schema.dataset.generatedBreadcrumb = 'true';
  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  });
  document.head.appendChild(schema);
}

// Ensure every Article schema points back to the canonical page, including the newer guides.
function enhanceArticleStructuredData() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href.split('#')[0];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(schema => {
    try {
      const data = JSON.parse(schema.textContent || '{}');
      const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      let changed = false;

      nodes.forEach(node => {
        if (node && node['@type'] === 'Article' && !node.mainEntityOfPage) {
          node.mainEntityOfPage = { '@type': 'WebPage', '@id': canonical };
          changed = true;
        }
      });

      if (changed) schema.textContent = JSON.stringify(data);
    } catch (err) {
      // Ignore non-JSON or unrelated structured-data blocks rather than affecting the page.
    }
  });
}

addBreadcrumbStructuredData();
enhanceArticleStructuredData();

function sendAnalyticsEvent(name, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, {
    page_path: window.location.pathname,
    ...params
  });
}

// Measure public-site actions that show increasing customer intent.
// Never send names, email addresses, phone numbers, form values or uploaded-file details to Analytics.
document.querySelectorAll('a[href]').forEach(link => {
  link.addEventListener('click', () => {
    const rawHref = link.getAttribute('href') || '';

    if (rawHref.includes('assessment.html')) {
      sendAnalyticsEvent('assessment_start');
      return;
    }
    if (rawHref.includes('upload-bill.html')) {
      sendAnalyticsEvent('bill_upload_start');
      return;
    }
    if (rawHref.includes('book.html')) {
      sendAnalyticsEvent('booking_start');
      return;
    }
    if (rawHref.includes('tools.html')) {
      sendAnalyticsEvent('calculator_open');
      return;
    }
    if (rawHref.startsWith('tel:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'phone' });
      return;
    }
    if (rawHref.startsWith('mailto:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'email' });
      return;
    }

    const isArticleLink = rawHref.includes('articles/') || link.classList.contains('related-card') || Boolean(link.closest('.related-section'));
    if (isArticleLink && rawHref.endsWith('.html')) {
      const articleUrl = new URL(rawHref, window.location.href);
      sendAnalyticsEvent('article_open', { article_path: articleUrl.pathname });
    }
  });
});

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

// Until the private backend is ready, make the public forms clearly non-live before a visitor enters information.
if (!BACKEND_URL) {
  try { localStorage.removeItem('markEnergyLastSubmission'); } catch (err) { /* local storage may be unavailable */ }

  document.querySelectorAll('[data-backend-form]').forEach(form => {
    if (!form.querySelector('[data-offline-form-notice]')) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.dataset.offlineFormNotice = 'true';
      notice.style.marginBottom = '20px';
      notice.innerHTML = '<strong>Online submission is being connected.</strong><br>You can review the questions on this page, but the form is not accepting information yet. For now, call <a href="tel:+61434151237">0434 151 237</a> or email <a href="mailto:mark.fitzpatrick@classaenergy.com.au">mark.fitzpatrick@classaenergy.com.au</a>.';
      form.prepend(notice);
    }

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Online Submission Being Connected';
      submitButton.setAttribute('aria-disabled', 'true');
    }
  });
}

// Live submission helper. The private Apps Script backend will store files in Drive and CRM data in Sheets.
document.querySelectorAll('[data-backend-form]').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!BACKEND_URL) return;

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
        source: 'Energy With Mark Website',
        submittedAt: new Date().toISOString(),
        fields,
        files
      };

      if (status) status.textContent = 'Sending securely to the assessment system…';
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
      // Record only that a website lead was submitted; no form fields are sent to Analytics.
      sendAnalyticsEvent('generate_lead', {
        form_type: form.dataset.formType || 'assessment'
      });
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

// Lightweight calculator for exploration only. It is deliberately indicative, not a proposal engine.
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
    sendAnalyticsEvent('calculator_use');
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