// Energy With Mark — simple public website runtime
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

// Give older public pages the same Energy With Mark colours and logo treatment.
if (!document.querySelector('link[href$="homepage-v2.css"]')) {
  const brandStyles = document.createElement('link');
  brandStyles.rel = 'stylesheet';
  brandStyles.href = new URL('/homepage-v2.css', window.location.origin).href;
  document.head.appendChild(brandStyles);
}
if (!document.querySelector('link[href$="personal-brand.css"]')) {
  const portraitStyles = document.createElement('link');
  portraitStyles.rel = 'stylesheet';
  portraitStyles.href = new URL('/personal-brand.css', window.location.origin).href;
  document.head.appendChild(portraitStyles);
}
document.body.classList.add('public-v2');

if (!document.querySelector('link[rel="icon"]')) {
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/svg+xml';
  favicon.href = new URL('/favicon.svg', window.location.origin).href;
  document.head.appendChild(favicon);
}

const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (navLinks) {
  navLinks.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href.includes('tools.html')) {
      link.href = 'calculator.html';
      link.textContent = 'Calculator';
    }
  });

  if (!navLinks.querySelector('a[href$="community.html"]')) {
    const link = document.createElement('a');
    link.href = 'community.html';
    link.textContent = 'Clubs & Community';
    navLinks.appendChild(link);
  }
}

if (navToggle && navLinks) {
  if (!navLinks.id) navLinks.id = 'primary-navigation';
  navToggle.setAttribute('aria-controls', navLinks.id);
  navToggle.setAttribute('aria-expanded', 'false');
  const setOpen = open => {
    navLinks.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  };
  navToggle.addEventListener('click', () => setOpen(!navLinks.classList.contains('open')));
  navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navLinks.classList.contains('open')) {
      setOpen(false);
      navToggle.focus();
    }
  });
}

// Personal-brand portraits. The preferred three-quarter portrait is primary;
// the straight-on portrait is the supporting variation.
const currentPage = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';
const portraitUrl = variant => new URL(`/assets/mark-fitzpatrick-${variant}.svg`, window.location.origin).href;

function createPortrait(variant = 'primary', shellClass = '') {
  const shell = document.createElement('div');
  shell.className = `mark-photo-shell ${shellClass}`.trim();
  shell.dataset.markPortrait = variant;
  const image = document.createElement('img');
  image.className = 'mark-photo';
  image.src = portraitUrl(variant);
  image.alt = 'Mark Fitzpatrick, Renewable Energy Specialist';
  image.loading = 'lazy';
  image.decoding = 'async';
  shell.appendChild(image);
  return shell;
}

function createBrandCard(variant = 'primary', message = 'Free advice. No pressure to buy.') {
  const card = document.createElement('div');
  card.className = 'mark-brand-card';
  card.dataset.markBrandCard = 'true';
  card.appendChild(createPortrait(variant, 'compact'));
  const copy = document.createElement('div');
  copy.innerHTML = `<strong>Mark Fitzpatrick</strong><span>Renewable Energy Specialist</span><span>${message}</span>`;
  card.appendChild(copy);
  return card;
}

function createTrustRow(variant = 'primary', title = 'Free advice from Mark', text = 'I can check the numbers, explain the options and help you work out the next step.') {
  const row = document.createElement('div');
  row.className = 'mark-trust-row';
  row.dataset.markTrustRow = 'true';
  row.appendChild(createPortrait(variant, 'compact'));
  const copy = document.createElement('div');
  copy.innerHTML = `<strong>${title}</strong><p>${text}</p>`;
  row.appendChild(copy);
  return row;
}

(function addPersonalBrandPortraits() {
  if (currentPage === 'index.html') {
    const note = document.querySelector('.mark-note');
    if (note && !note.querySelector('[data-mark-portrait]')) {
      const person = document.createElement('div');
      person.className = 'mark-note-personal';
      person.appendChild(createPortrait('primary', 'compact'));
      const copy = document.createElement('div');
      copy.innerHTML = '<strong>Mark Fitzpatrick</strong><span>Renewable Energy Specialist</span><span>Free advice after your calculator result.</span>';
      person.appendChild(copy);
      note.prepend(person);
    }
  }

  if (currentPage === 'how-i-help.html') {
    const profile = document.querySelector('.profile-card');
    if (profile && !profile.querySelector('[data-mark-portrait]')) profile.prepend(createPortrait('primary'));
  }

  if (currentPage === 'calculator.html') {
    const leadPanel = document.querySelector('.lead-panel');
    if (leadPanel && !leadPanel.querySelector('[data-mark-trust-row]')) {
      leadPanel.prepend(createTrustRow('primary', 'Want a real person to check the result?', 'My review and advice are free. I can check your bill and explain what may make sense in plain English.'));
    }
  }

  const primarySidePages = ['home.html','business.html','existing-solar.html','community.html','book.html','upload-bill.html'];
  if (primarySidePages.includes(currentPage)) {
    const sideCard = document.querySelector('.page-side-card');
    if (sideCard && !sideCard.querySelector('[data-mark-brand-card]')) sideCard.prepend(createBrandCard('primary'));
  }

  const secondarySidePages = ['how-i-get-paid.html','who-i-work-with.html'];
  if (secondarySidePages.includes(currentPage)) {
    const sideCard = document.querySelector('.page-side-card');
    if (sideCard && !sideCard.querySelector('[data-mark-brand-card]')) sideCard.prepend(createBrandCard('secondary', 'Clear advice and clear commercial relationships.'));
  }

  if (currentPage === 'service-relationship.html') {
    const hero = document.querySelector('.page-hero .container');
    if (hero && !hero.querySelector('[data-mark-trust-row]')) {
      hero.appendChild(createTrustRow('secondary', 'A clear relationship from the start', 'I explain who I work with, how I am paid and which company is responsible for your project.'));
    }
  }

  // A small personal-brand cue in the footer makes older guide pages feel connected
  // to the same real person without overwhelming their educational content.
  const footerFirst = document.querySelector('.footer .footer-grid > div:first-child');
  if (footerFirst && !footerFirst.querySelector('.footer-person')) {
    const person = document.createElement('div');
    person.className = 'footer-person';
    person.appendChild(createPortrait('primary', 'compact'));
    const copy = document.createElement('div');
    copy.innerHTML = '<strong>Mark Fitzpatrick</strong><span>Free solar & battery advice</span>';
    person.appendChild(copy);
    footerFirst.appendChild(person);
  }
})();

// Keep the new transparency pages easy to find from older public pages too.
document.querySelectorAll('.footer-small').forEach(footer => {
  const addFooterLink = (href, text) => {
    if (footer.querySelector(`a[href$="${href}"]`)) return;
    if ((footer.textContent || '').trim()) footer.appendChild(document.createTextNode(' · '));
    const link = document.createElement('a');
    link.href = href;
    link.textContent = text;
    footer.appendChild(link);
  };
  addFooterLink('how-i-get-paid.html', 'How I Get Paid');
  addFooterLink('who-i-work-with.html', 'Who I Work With');
});

function sendAnalyticsEvent(name, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, { page_path: window.location.pathname, ...params });
}

document.querySelectorAll('a[href]').forEach(link => {
  link.addEventListener('click', () => {
    const href = link.getAttribute('href') || '';
    if (href.includes('calculator.html') || href === '#solar-check' || href === '#calculator') {
      sendAnalyticsEvent('calculator_start');
    } else if (href.includes('upload-bill.html')) {
      sendAnalyticsEvent('bill_upload_start');
    } else if (href.includes('book.html')) {
      sendAnalyticsEvent('booking_start');
    } else if (href.includes('assessment.html')) {
      sendAnalyticsEvent('assessment_start');
    } else if (href.startsWith('tel:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'phone' });
    } else if (href.startsWith('mailto:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'email' });
    } else if (href.includes('articles/')) {
      sendAnalyticsEvent('article_open', { article_path: new URL(href, window.location.href).pathname });
    }
  });
});

const breadcrumbNav = document.querySelector('nav.breadcrumbs');
if (breadcrumbNav) {
  const items = [...breadcrumbNav.querySelectorAll('a[href]')].map((link, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: (link.textContent || '').trim(),
    item: new URL(link.getAttribute('href'), window.location.href).href
  }));
  const current = [...breadcrumbNav.querySelectorAll('span')].map(el => (el.textContent || '').trim()).filter(Boolean).pop();
  if (current) items.push({ '@type': 'ListItem', position: items.length + 1, name: current, item: window.location.href.split('#')[0] });
  if (items.length > 1) {
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items });
    document.head.appendChild(schema);
  }
}