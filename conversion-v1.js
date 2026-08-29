(() => {
  'use strict';

  const page = window.location.pathname.split('/').filter(Boolean).pop() || 'index.html';
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
  ensureMeta('og:site_name', 'Energy With Mark');
  ensureMeta('og:type', 'website');
  ensureMeta('og:title', document.title);
  ensureMeta('og:description', description);
  ensureMeta('og:url', canonical);
  ensureMeta('twitter:card', 'summary', 'name');
  ensureMeta('twitter:title', document.title, 'name');
  ensureMeta('twitter:description', description, 'name');

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
      image:'https://energywithmark.com.au/assets/mark-fitzpatrick-primary.svg',
      email:'mark.fitzpatrick@classaenergy.com.au',
      telephone:'+61434151237',
      sameAs:socialProfiles.map(([, , url]) => url),
      worksFor:{'@type':'Organization',name:'Energy With Mark',url:'https://energywithmark.com.au/'}
    });
    document.head.appendChild(schema);
  }

  const exactReplacements = new Map([
    ['Free Bill Review','Free Full Energy Assessment'],
    ['Bill Review','Free Full Energy Assessment'],
    ['Solar Calculator','Full Calculator'],
    ['Try Calculator','Full Calculator'],
    ['Start Assessment','Free Full Energy Assessment'],
    ['Book a Discussion','Book a Call']
  ]);
  document.querySelectorAll('a,button').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (exactReplacements.has(text)) el.textContent = exactReplacements.get(text);
  });

  const footerFirst = document.querySelector('.footer .footer-grid > div:first-child');
  if (footerFirst) {
    let social = footerFirst.querySelector('[data-footer-social]');
    if (!social) {
      social = document.createElement('div');
      social.dataset.footerSocial = 'true';
      footerFirst.appendChild(social);
    }
    social.className = 'footer-social';
    social.innerHTML = `<strong>Follow Energy With Mark</strong><div class="social-chip-row">${socialProfiles.map(([label,mark,url]) => `<a class="social-chip" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Energy With Mark on ${label}"><span class="social-mark">${mark}</span><span>${label}</span></a>`).join('')}</div>`;
  }

  const journeyPages = new Set(['home.html','business.html','existing-solar.html','community.html','calculator.html','upload-bill.html','book.html','how-i-help.html']);
  if (journeyPages.has(page) && !document.querySelector('.site-journey')) {
    const active = page === 'calculator.html' ? 2 : page === 'upload-bill.html' ? 3 : page === 'book.html' ? 4 : 0;
    const steps = [
      ['1','60 Second Check','Fast first result','index.html#solar-check'],
      ['2','Full Calculator','More detail','calculator.html'],
      ['3','Free Full Energy Assessment','Upload one bill','upload-bill.html'],
      ['4','Book a Call','Talk it through','book.html']
    ];
    const section = document.createElement('section');
    section.className = 'site-journey';
    section.setAttribute('aria-label','Your Energy With Mark journey');
    section.innerHTML = `<div class="container"><div class="journey-mini-head"><strong>Your simple next steps</strong><span>Start simple. Go deeper only when it is useful.</span></div><div class="journey-mini-grid">${steps.map(([n,title,sub,href]) => `<a class="journey-mini-step${Number(n)===active?' active':''}" href="${href}"><span class="n">${n}</span><span><strong>${title}</strong><small>${sub}</small></span></a>`).join('')}</div></div>`;
    const footer = document.querySelector('.footer');
    if (footer) footer.insertAdjacentElement('beforebegin', section);
  }
})();
