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
