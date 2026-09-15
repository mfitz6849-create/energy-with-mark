(() => {
  'use strict';

  const page = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  const rootUrl = path => new URL(`/${String(path).replace(/^\/+/, '')}`, window.location.origin).href;
  const socialProfiles = [
    ['Instagram','IG','https://www.instagram.com/mark.fitzpatrick2026/'],
    ['Facebook','f','https://www.facebook.com/profile.php?id=61592092305366'],
    ['YouTube','▶','https://www.youtube.com/@EnergywithMark'],
    ['LinkedIn','in','https://www.linkedin.com/in/mark-fitzpatrick-b9378017b/'],
    ['TikTok','♪','https://www.tiktok.com/@markfitzpatrickenergy'],
    ['Substack','S','https://markfitzpatrickenergy.substack.com/']
  ];

  const ensureMeta = (property, content, attr = 'property') => {
    let el = document.head.querySelector(`meta[${attr}="${property}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, property);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href.split('#')[0];
  const description = document.querySelector('meta[name="description"]')?.content || 'Plain-English solar, battery and energy advice from Mark Fitzpatrick.';
  const profileImage = rootUrl('assets/mark-fitzpatrick-primary.svg');
  ensureMeta('og:site_name', 'Energy With Mark');
  ensureMeta('og:type', document.querySelector('meta[property="og:type"]')?.content || 'website');
  ensureMeta('og:title', document.title);
  ensureMeta('og:description', description);
  ensureMeta('og:url', canonical);
  ensureMeta('og:image', profileImage);
  ensureMeta('og:image:alt', 'Mark Fitzpatrick — Energy With Mark');
  ensureMeta('twitter:card', 'summary', 'name');
  ensureMeta('twitter:title', document.title, 'name');
  ensureMeta('twitter:description', description, 'name');
  ensureMeta('twitter:image', profileImage, 'name');

  if (!document.querySelector('script[data-mark-person-schema]')) {
    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.dataset.markPersonSchema = 'true';
    schema.textContent = JSON.stringify({
      '@context':'https://schema.org',
      '@type':'Person',
      name:'Mark Fitzpatrick',
      jobTitle:'Renewable Energy Specialist',
      url:'https://energywithmark.com.au/',
      image:profileImage,
      email:'mark.fitzpatrick@classaenergy.com.au',
      telephone:'+61434151237',
      sameAs:socialProfiles.map(([, , url]) => url),
      worksFor:{'@type':'Organization',name:'Energy With Mark',url:'https://energywithmark.com.au/'}
    });
    document.head.appendChild(schema);
  }

  // Retire old customer paths everywhere, including older article templates.
  document.querySelectorAll('a[href]').forEach(link => {
    let url;
    try { url = new URL(link.getAttribute('href') || '', window.location.href); } catch (_) { return; }
    const pathname = url.pathname;
    if (pathname.endsWith('/tools.html') || pathname === '/articles/calculator.html') {
      link.href = rootUrl('calculator.html');
    } else if (pathname.endsWith('/assessment.html')) {
      link.href = rootUrl('upload-bill.html');
    } else if (pathname === '/articles/community.html') {
      link.href = rootUrl('community.html');
    } else if (pathname === '/articles/how-i-get-paid.html') {
      link.href = rootUrl('how-i-get-paid.html');
    } else if (pathname === '/articles/who-i-work-with.html') {
      link.href = rootUrl('who-i-work-with.html');
    }
  });

  const exactReplacements = new Map([
    ['Free Bill Review','Free Full Energy Assessment'],
    ['Bill Review','Free Full Energy Assessment'],
    ['Solar Calculator','Full Calculator'],
    ['Try Calculator','Full Calculator'],
    ['Start Assessment','Free Full Energy Assessment'],
    ['Energy Assessment','Free Full Energy Assessment'],
    ['Have My Energy Use Assessed','Get Free Full Energy Assessment'],
    ['Upload My Electricity Bill','Get Free Full Energy Assessment'],
    ['Send My Power Bill','Get Free Full Energy Assessment'],
    ['Book a Discussion','Book a Call'],
    ['Ask for a Call','Book a Call']
  ]);
  document.querySelectorAll('a,button').forEach(el => {
    const text = (el.textContent || '').trim();
    if (exactReplacements.has(text)) el.textContent = exactReplacements.get(text);
  });

  // Older article CTAs often had two routes that now point to the same place.
  document.querySelectorAll('.article-cta .btns').forEach(group => {
    const links = [...group.querySelectorAll('a[href]')];
    if (!links.length) return;
    links[0].href = rootUrl('upload-bill.html');
    links[0].textContent = 'Get Free Full Energy Assessment';
    if (links[1]) {
      links[1].href = rootUrl('calculator.html');
      links[1].textContent = 'Use Full Calculator';
    }
  });

  // Remove duplicate destinations from older footer link groups after legacy rewrites.
  document.querySelectorAll('.footer p').forEach(group => {
    const seen = new Set();
    [...group.querySelectorAll('a[href]')].forEach(link => {
      let key;
      try { key = new URL(link.href, window.location.href).pathname; } catch (_) { return; }
      if (!seen.has(key)) { seen.add(key); return; }
      const next = link.nextSibling;
      const prev = link.previousSibling;
      if (next && next.nodeName === 'BR') next.remove();
      else if (prev && prev.nodeName === 'BR') prev.remove();
      link.remove();
    });
  });

  if (page === 'calculator.html') {
    const sideHelp = document.querySelector('.side-help p');
    if (sideHelp) sideHelp.textContent = 'Choose the answer that feels closest. This is a first estimate, not a full assessment or final quote.';
    const warning = document.querySelector('.plain-warning strong');
    if (warning) warning.textContent = 'This is a first estimate, not a full assessment or final quote.';
    document.querySelectorAll('.result-actions a[href$="upload-bill.html"]').forEach(link => { link.textContent = 'Get Free Full Energy Assessment'; });
    const calcButton = document.getElementById('calculateFull');
    if (calcButton) calcButton.addEventListener('click', () => setTimeout(() => {
      if (document.querySelector('.calc-step[data-step="4"].active')) {
        try { window.gtag?.('event','full_calculator_complete'); } catch (_) {}
      }
    }, 0));
  }

  if (page === 'index.html') {
    const quickNote = document.querySelector('.quick-result-note');
    if (quickNote) quickNote.textContent = 'This is a first estimate, not a full assessment or final quote. Your real result depends on your power use, roof, current solar and final prices.';
    const quickButton = document.getElementById('quickCalculate');
    if (quickButton) quickButton.addEventListener('click', () => setTimeout(() => {
      if (document.querySelector('.quick-step[data-step="3"].active')) {
        try { window.gtag?.('event','quick_check_complete'); } catch (_) {}
      }
    }, 0));
  }

  const footerFirst = document.querySelector('.footer .footer-grid > div:first-child');
  if (footerFirst) {
    let social = footerFirst.querySelector('[data-footer-social]');
    if (!social) {
      social = document.createElement('div');
      social.dataset.footerSocial = 'true';
      footerFirst.appendChild(social);
    } else if (social.tagName === 'P') {
      const replacement = document.createElement('div');
      replacement.dataset.footerSocial = 'true';
      social.replaceWith(replacement);
      social = replacement;
    }
    social.className = 'footer-social';
    social.innerHTML = `<strong>Follow Energy With Mark</strong><div class="social-chip-row">${socialProfiles.map(([label,mark,url]) => `<a class="social-chip" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Energy With Mark on ${label}"><span class="social-mark">${mark}</span><span>${label}</span></a>`).join('')}</div>`;
  }

  if (page === 'index.html' && !document.querySelector('.proof-section')) {
    const proof = document.createElement('section');
    proof.className = 'proof-section';
    proof.innerHTML = `<div class="container"><div class="proof-head"><div class="eyebrow">Common situations</div><h2>Different energy problems need different answers.</h2><p>The goal is not to sell everyone the same system. It is to work out what is worth checking for your situation.</p></div><div class="proof-grid"><div class="proof-card"><div class="proof-icon">⌂</div><h3>High home power bills</h3><p>Check whether solar may reduce grid use and whether a battery is actually worth comparing.</p></div><div class="proof-card"><div class="proof-icon">☀</div><h3>You already have solar</h3><p>Review the current system, exports and later grid use before adding more equipment.</p></div><div class="proof-card"><div class="proof-icon">▦</div><h3>Business energy costs</h3><p>Look at daytime use, tariff structure and whether the investment case is strong enough to go further.</p></div><div class="proof-card"><div class="proof-icon">★</div><h3>Club or community site</h3><p>Start with the whole site, then work out which energy option fits how the facility is actually used.</p></div></div></div>`;
    const assessment = document.querySelector('.assessment-section');
    if (assessment) assessment.insertAdjacentElement('beforebegin', proof);

    const preview = document.createElement('section');
    preview.className = 'assessment-preview-section';
    preview.innerHTML = `<div class="container assessment-preview"><div><span class="preview-badge">Example assessment</span><h2>What a full energy assessment can tell you.</h2><p>This is the kind of plain-English answer I aim to give after reviewing your real bill. The exact result depends on your property and energy use.</p><a class="btn btn-primary" href="${rootUrl('upload-bill.html')}">Upload My Bill for Free Assessment</a></div><div class="preview-report"><div><span>Current position</span><strong>What you use and what you pay</strong><small>Bill amount, usage, tariff and any solar credits shown.</small></div><div><span>What I found</span><strong>The main opportunity or problem</strong><small>Solar, battery, existing-system review or sometimes no change.</small></div><div><span>Options considered</span><strong>What is worth comparing</strong><small>Simple options with the assumptions and missing information made clear.</small></div><div><span>Next step</span><strong>What I would check next</strong><small>You can stop there, send more information, or book a call to talk it through.</small></div></div></div>`;
    if (proof.nextElementSibling) proof.insertAdjacentElement('afterend', preview);
  }

  const journeyPages = new Set(['home.html','business.html','existing-solar.html','community.html','calculator.html','upload-bill.html','book.html','how-i-help.html']);
  if (journeyPages.has(page) && !document.querySelector('.site-journey')) {
    const active = page === 'calculator.html' ? 2 : page === 'upload-bill.html' ? 3 : page === 'book.html' ? 4 : 0;
    const steps = [
      ['1','60 Second Check','Fast first result',rootUrl('index.html#solar-check')],
      ['2','Full Calculator','More detail',rootUrl('calculator.html')],
      ['3','Free Full Energy Assessment','Upload one bill',rootUrl('upload-bill.html')],
      ['4','Book a Call','Talk it through',rootUrl('book.html')]
    ];
    const section = document.createElement('section');
    section.className = 'site-journey';
    section.setAttribute('aria-label','Your Energy With Mark journey');
    section.innerHTML = `<div class="container"><div class="journey-mini-head"><strong>Your simple next steps</strong><span>Start simple. Go deeper only when it is useful.</span></div><div class="journey-mini-grid">${steps.map(([n,title,sub,href]) => `<a class="journey-mini-step${Number(n)===active?' active':''}" href="${href}"><span class="n">${n}</span><span><strong>${title}</strong><small>${sub}</small></span></a>`).join('')}</div></div>`;
    const footer = document.querySelector('.footer');
    if (footer) footer.insertAdjacentElement('beforebegin', section);
  }
})();
