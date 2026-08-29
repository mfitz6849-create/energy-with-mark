// Energy With Mark — simple public website runtime
const GA_MEASUREMENT_ID = 'G-22EYYXBP2S';
const siteUrl = path => new URL(`/${String(path).replace(/^\/+/, '')}`, window.location.origin).href;

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
  brandStyles.href = siteUrl('homepage-v2.css');
  document.head.appendChild(brandStyles);
}
if (!document.querySelector('link[href$="personal-brand.css"]')) {
  const portraitStyles = document.createElement('link');
  portraitStyles.rel = 'stylesheet';
  portraitStyles.href = siteUrl('personal-brand.css');
  document.head.appendChild(portraitStyles);
}
if (!document.querySelector('link[href$="conversion-v1.css"]')) {
  const conversionStyles = document.createElement('link');
  conversionStyles.rel = 'stylesheet';
  conversionStyles.href = siteUrl('conversion-v1.css');
  document.head.appendChild(conversionStyles);
}
document.body.classList.add('public-v2');

// Site-wide keyboard support: a visible-on-focus skip link plus high-contrast focus rings.
(function initialiseKeyboardAccessibility() {
  if (!document.getElementById('ewm-accessibility-styles')) {
    const styles = document.createElement('style');
    styles.id = 'ewm-accessibility-styles';
    styles.textContent = `
      .skip-link{position:fixed;left:12px;top:12px;z-index:1000;padding:10px 14px;border-radius:10px;background:#C6E11A;color:#0F2E2E;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.2);transform:translateY(-180%);transition:transform .15s ease}
      .skip-link:focus{transform:translateY(0)}
      a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid #C6E11A!important;outline-offset:3px!important}
    `;
    document.head.appendChild(styles);
  }
  const mainContent = document.querySelector('main');
  if (mainContent) {
    if (!mainContent.id) mainContent.id = 'main-content';
    if (!mainContent.hasAttribute('tabindex')) mainContent.setAttribute('tabindex', '-1');
    if (!document.querySelector('.skip-link')) {
      const skipLink = document.createElement('a');
      skipLink.className = 'skip-link';
      skipLink.href = `#${mainContent.id}`;
      skipLink.textContent = 'Skip to main content';
      document.body.prepend(skipLink);
    }
  }
})();

if (!document.querySelector('link[rel="icon"]')) {
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/x-icon';
  favicon.href = siteUrl('favicon.ico');
  document.head.appendChild(favicon);
}

// Correct retired and nested paths immediately, before nav and analytics are attached.
document.querySelectorAll('a[href]').forEach(link => {
  let url;
  try { url = new URL(link.getAttribute('href') || '', window.location.href); } catch (_) { return; }
  const pathname = url.pathname;
  if (pathname.endsWith('/tools.html') || pathname === '/articles/calculator.html') {
    link.href = siteUrl('calculator.html');
  } else if (pathname.endsWith('/assessment.html')) {
    link.href = siteUrl('upload-bill.html');
  } else if (pathname === '/articles/community.html') {
    link.href = siteUrl('community.html');
  } else if (pathname === '/articles/how-i-get-paid.html') {
    link.href = siteUrl('how-i-get-paid.html');
  } else if (pathname === '/articles/who-i-work-with.html') {
    link.href = siteUrl('who-i-work-with.html');
  }
});

const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (navLinks) {
  navLinks.querySelectorAll('a').forEach(link => {
    let path = '';
    try { path = new URL(link.href, window.location.href).pathname; } catch (_) {}
    if (path.endsWith('/calculator.html')) {
      link.href = siteUrl('calculator.html');
      link.textContent = 'Full Calculator';
    }
  });

  if (![...navLinks.querySelectorAll('a[href]')].some(link => {
    try { return new URL(link.href, window.location.href).pathname === '/community.html'; } catch (_) { return false; }
  })) {
    const link = document.createElement('a');
    link.href = siteUrl('community.html');
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
const portraitUrl = variant => siteUrl(`assets/mark-fitzpatrick-${variant}.svg`);

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
    const heroCopy = document.querySelector('.quick-hero-grid > div:first-child');
    if (heroCopy && !heroCopy.querySelector('.hero-personal-cue')) {
      const cue = document.createElement('div');
      cue.className = 'hero-personal-cue';
      cue.appendChild(createPortrait('primary', 'compact'));
      const copy = document.createElement('div');
      copy.innerHTML = '<strong>Hi, I’m Mark.</strong><span>I help people work out whether solar or a battery makes sense.</span><b>My advice is free.</b>';
      cue.appendChild(copy);
      const trust = heroCopy.querySelector('.quick-trust');
      if (trust) trust.insertAdjacentElement('afterend', cue); else heroCopy.appendChild(cue);
    }

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
    const sideHelpCopy = document.querySelector('.side-help p');
    if (sideHelpCopy) sideHelpCopy.textContent = 'Choose the answer that feels closest. This is a first estimate, not a full assessment or final quote.';

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

  // Fallback markup; conversion-v1.js upgrades this to the richer chip layout.
  if (footerFirst && !footerFirst.querySelector('[data-footer-social]')) {
    const social = document.createElement('div');
    social.dataset.footerSocial = 'true';
    social.style.marginTop = '18px';
    social.innerHTML = '<strong>Follow Energy With Mark</strong><br><a href="https://www.instagram.com/mark.fitzpatrick2026/" target="_blank" rel="noopener noreferrer">Instagram ↗</a> · <a href="https://www.facebook.com/profile.php?id=61592092305366" target="_blank" rel="noopener noreferrer">Facebook ↗</a> · <a href="https://www.youtube.com/@EnergywithMark" target="_blank" rel="noopener noreferrer">YouTube ↗</a> · <a href="https://www.linkedin.com/in/mark-fitzpatrick-b9378017b/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> · <a href="https://www.tiktok.com/@markfitzpatrickenergy" target="_blank" rel="noopener noreferrer">TikTok ↗</a> · <a href="https://markfitzpatrickenergy.substack.com/" target="_blank" rel="noopener noreferrer">Substack ↗</a>';
    footerFirst.appendChild(social);
  }
})();

// Keep transparency pages easy to find, using root-safe URLs even on nested articles.
document.querySelectorAll('.footer-small').forEach(footer => {
  const addFooterLink = (path, text) => {
    const target = siteUrl(path);
    const targetPath = new URL(target).pathname;
    const exists = [...footer.querySelectorAll('a[href]')].some(link => {
      try { return new URL(link.href, window.location.href).pathname === targetPath; } catch (_) { return false; }
    });
    if (exists) return;
    if ((footer.textContent || '').trim()) footer.appendChild(document.createTextNode(' · '));
    const link = document.createElement('a');
    link.href = target;
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
    } else if (href.startsWith('tel:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'phone' });
    } else if (href.startsWith('mailto:')) {
      sendAnalyticsEvent('contact_click', { contact_type: 'email' });
    } else if (href.includes('instagram.com')) {
      sendAnalyticsEvent('social_click', { platform: 'instagram' });
    } else if (href.includes('facebook.com')) {
      sendAnalyticsEvent('social_click', { platform: 'facebook' });
    } else if (href.includes('youtube.com')) {
      sendAnalyticsEvent('social_click', { platform: 'youtube' });
    } else if (href.includes('linkedin.com')) {
      sendAnalyticsEvent('social_click', { platform: 'linkedin' });
    } else if (href.includes('tiktok.com')) {
      sendAnalyticsEvent('social_click', { platform: 'tiktok' });
    } else if (href.includes('substack.com')) {
      sendAnalyticsEvent('social_click', { platform: 'substack' });
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

// Load the site-wide conversion, consistency and profile layer after the core runtime.
if (!document.querySelector('script[src$="conversion-v1.js"]')) {
  const conversionScript = document.createElement('script');
  conversionScript.src = siteUrl('conversion-v1.js');
  conversionScript.defer = true;
  document.body.appendChild(conversionScript);
}
