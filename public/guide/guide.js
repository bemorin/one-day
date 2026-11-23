/*! One Day guide. MIT License. */
/* A few small things, and nothing sent anywhere: the app's own light or dark choice (it reads oneday.theme, which the
   app keeps in this browser), a copy of the page as Markdown for the clipboard, where you are in "On this page" (and,
   narrower, that list in a sheet from the bar), a link to copy at the end of every title, and the paragraph to paste
   into an assistant. */
'use strict';
try {
  const th = localStorage.getItem('oneday.theme');
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
} catch (e) {}

// The page as Markdown, to paste into an assistant or a note: its words, links and pictures, with full addresses.
function guideMarkdown(doc = document) {
  const base = doc.querySelector('link[rel="canonical"]')?.href || doc.location.href.split('#')[0];
  const abs = u => new URL(u, base).href;
  const squash = s => s.replace(/[ \t\n\r]+/g, ' ');
  const inline = n =>
    [...n.childNodes]
      .map(c => {
        if (c.nodeType === 3) return squash(c.nodeValue);
        if (c.nodeType !== 1 || c.matches('svg, .d, [hidden], [aria-hidden="true"], .hl')) return '';
        const t = c.tagName,
          inner = inline(c);
        if (t === 'B' || t === 'STRONG') return `**${inner.trim()}**`;
        if (t === 'I' || t === 'EM') return `*${inner.trim()}*`;
        if (t === 'CODE') return c.textContent.includes('`') ? `\`\` ${c.textContent} \`\`` : `\`${c.textContent}\``;
        if (t === 'A') return `[${inner.trim()}](${abs(c.getAttribute('href'))})`;
        if (t === 'BR') return '\n';
        return inner;
      })
      .join('');
  const text = n => inline(n).replace(/ +/g, ' ').trim();
  const pics = fig =>
    [...fig.querySelectorAll('img')]
      .filter(i => !i.closest('.d'))
      .map(i => `![${i.alt}](${abs(i.getAttribute('src'))})`);
  const cells = tr => '| ' + [...tr.children].map(c => text(c).replace(/\|/g, '\\|')).join(' | ') + ' |';
  const out = [];
  const block = n => {
    const t = n.tagName;
    if (t === 'H1') out.push('# ' + text(n));
    else if (t === 'H2') out.push('## ' + text(n));
    else if (t === 'H3') out.push('### ' + text(n));
    else if (t === 'H4') out.push('#### ' + text(n));
    // a row of buttons (the ways to reach me) reads better as a list
    else if (t === 'P' && n.classList.contains('links'))
      out.push([...n.querySelectorAll('a')].map(a => `- [${text(a)}](${abs(a.getAttribute('href'))})`).join('\n'));
    else if (t === 'P') out.push(text(n));
    else if (t === 'UL' || t === 'OL')
      out.push([...n.children].map((li, i) => (t === 'OL' ? `${i + 1}. ` : '- ') + text(li)).join('\n'));
    else if (t === 'PRE') out.push('```text\n' + n.textContent + '\n```');
    else if (t === 'TABLE') {
      const cap = n.querySelector('caption'),
        head = n.querySelector('thead tr'),
        rows = [...n.querySelectorAll('tbody tr')];
      if (cap) out.push(`**${text(cap)}**`);
      out.push([cells(head), '| ' + [...head.children].map(() => '---').join(' | ') + ' |', ...rows.map(cells)].join('\n'));
    } else if (t === 'FIGURE') {
      out.push(pics(n).join('\n'));
      const cap = n.querySelector(':scope > figcaption');
      if (cap) out.push(`*${text(cap)}*`);
    } else if (t === 'ASIDE' || t === 'BLOCKQUOTE') out.push(...[...n.children].map(c => '> ' + text(c)));
    else if (t === 'SECTION' || t === 'DIV' || t === 'HEADER') [...n.children].forEach(block);
  };
  const hero = doc.querySelector('.hero');
  block(hero.querySelector('h1'));
  block(hero.querySelector('.lede'));
  out.push(`From ${base}`);
  [...doc.querySelector('.body').children].forEach(block);
  return out.filter(Boolean).join('\n\n') + '\n';
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  if (root.dataset.theme)
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = root.dataset.theme === 'dark' ? '#0e0e0e' : '#ffffff';

  // Copy page as Markdown: to the clipboard only.
  const btn = document.getElementById('copy'),
    label = btn && btn.querySelector('span'),
    status = document.getElementById('copied');
  let back = 0;
  if (btn)
    btn.addEventListener('click', async () => {
      let ok = true;
      try {
        await navigator.clipboard.writeText(guideMarkdown());
      } catch (e) {
        ok = false;
      }
      label.textContent = ok ? 'Copied' : 'Copy page as Markdown';
      status.textContent = ok ? 'The page is in your clipboard, as Markdown.' : 'This browser blocked the copy.';
      clearTimeout(back);
      back = setTimeout(() => {
        label.textContent = 'Copy page as Markdown';
        status.textContent = '';
      }, 4000);
    });

  // A copy for the clipboard, with a word on the button and for screen readers, for a few seconds.
  const copied = (ok, b, idle, words) => {
    const span = b && b.querySelector('span');
    if (span) span.textContent = ok ? 'Copied' : idle;
    status.textContent = ok ? words : 'This browser blocked the copy.';
    clearTimeout(back);
    back = setTimeout(() => {
      if (span) span.textContent = idle;
      status.textContent = '';
    }, 4000);
  };

  // The paragraph an assistant needs, to paste in its instructions.
  const pbtn = document.getElementById('copyPrompt'),
    para = document.getElementById('aiPrompt');
  if (pbtn && para)
    pbtn.addEventListener('click', async () => {
      let ok = true;
      try {
        await navigator.clipboard.writeText(para.textContent);
      } catch (e) {
        ok = false;
      }
      copied(ok, pbtn, 'Copy the paragraph', 'The paragraph is in your clipboard.');
    });

  // Every chapter, section and question ends with a link, always shown: a click copies the address of that place
  // in the guide.
  const LINK =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4a2.75 2.75 0 0 0 3.9 0l2.1-2.1a2.76 2.76 0 0 0-3.9-3.9l-.7.7"/><path d="M9.4 6.6a2.75 2.75 0 0 0-3.9 0L3.4 8.7a2.76 2.76 0 0 0 3.9 3.9l.7-.7"/></svg>',
    TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.75 8.4 2.6 2.6 5.9-6.2"/></svg>';
  for (const h of document.querySelectorAll('.body .ch h2, .body .chapter > section > h3, .body h4[id]')) {
    const id = h.tagName === 'H2' ? h.closest('.chapter').id : h.tagName === 'H3' ? h.parentElement.id : h.id;
    if (!id) continue;
    const a = document.createElement('a');
    a.className = 'hl';
    a.href = '#' + id;
    a.setAttribute('aria-label', 'Copy the link to ' + h.textContent.trim());
    a.innerHTML = LINK;
    h.append(a);
  }
  document.addEventListener('click', async e => {
    const a = e.target.closest && e.target.closest('a.hl');
    if (!a) return;
    e.preventDefault();
    let ok = true;
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname + a.hash);
    } catch (err) {
      ok = false;
    }
    history.replaceState(null, '', a.hash);
    copied(ok, null, '', 'The link is in your clipboard.');
    if (!ok) return;
    a.innerHTML = TICK;
    a.classList.add('done');
    setTimeout(() => {
      a.innerHTML = LINK;
      a.classList.remove('done');
    }, 1600);
  });

  // On this page: the section you are reading.
  const links = new Map([...document.querySelectorAll('.toc a[href^="#"]')].map(a => [a.hash.slice(1), a]));
  const sections = [...links.keys()].map(id => document.getElementById(id)).filter(Boolean);
  let now = null,
    queued = false;
  const pick = () => {
    queued = false;
    let at = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= innerHeight * 0.3) at = s;
    if (innerHeight + scrollY >= root.scrollHeight - 2) at = sections[sections.length - 1];
    if (!at || at === now) return;
    if (now) links.get(now.id).removeAttribute('aria-current');
    now = at;
    links.get(now.id).setAttribute('aria-current', 'true');
  };
  if (sections.length) {
    addEventListener('scroll', () => queued || ((queued = true), requestAnimationFrame(pick)), { passive: true });
    addEventListener('resize', pick, { passive: true });
    pick();
  }

  // Narrower, where "On this page" is not beside the text: a button in the bar opens it in a sheet, like the app's.
  // It rises from the bottom, the page behind it dimmed and out of reach; the section you are reading is marked.
  // A choice, the cross, the dimmed page, Escape or the phone's back close it.
  const tocb = document.getElementById('tocb'),
    tocd = document.getElementById('tocd'),
    chs = document.querySelector('.toc .chs');
  if (tocb && tocd && chs) {
    const nav = tocd.querySelector('nav'),
      sheet = tocd.querySelector('.tocd-sheet'),
      calm = matchMedia('(prefers-reduced-motion: reduce)'),
      behind = [document.querySelector('.top'), document.querySelector('.page'), document.querySelector('.foot')].filter(Boolean);
    nav.append(chs.cloneNode(true));
    nav.querySelectorAll('[aria-current]').forEach(x => x.removeAttribute('aria-current'));
    let watch = null,
      from = null;
    const shut = (refocus = true) => {
      if (tocd.hidden || tocd.dataset.out) return;
      if (watch) {
        const w = watch;
        watch = null;
        w.destroy();
      }
      tocb.setAttribute('aria-expanded', 'false');
      behind.forEach(n => (n.inert = false));
      const gone = () => {
        delete tocd.dataset.out;
        tocd.hidden = true;
        tocd.getAnimations({ subtree: true }).forEach(x => x.cancel());
      };
      if (refocus && from && from.isConnected) from.focus({ preventScroll: true });
      if (calm.matches) return gone();
      tocd.dataset.out = '1';
      tocd.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease', fill: 'forwards' });
      sheet.animate([{ transform: 'none' }, { transform: 'translateY(105%)' }], {
        duration: 300,
        easing: 'cubic-bezier(.25,1,.5,1)',
        fill: 'forwards',
      }).onfinish = gone;
    };
    tocb.addEventListener('click', () => {
      from = document.activeElement;
      tocd.getAnimations({ subtree: true }).forEach(x => x.cancel());
      delete tocd.dataset.out;
      tocd.hidden = false;
      tocb.setAttribute('aria-expanded', 'true');
      behind.forEach(n => (n.inert = true));
      const cur = document.querySelector('.toc a[aria-current]'),
        mine = cur && nav.querySelector(`a[href="${cur.getAttribute('href')}"]`);
      nav.querySelectorAll('[aria-current]').forEach(x => x.removeAttribute('aria-current'));
      if (mine) {
        mine.setAttribute('aria-current', 'true');
        // the list scrolls to it, not the page behind (scrollIntoView would move both)
        nav.scrollTop = Math.max(0, mine.offsetTop - (nav.clientHeight - mine.offsetHeight) / 2);
      }
      (mine || nav.querySelector('a')).focus({ preventScroll: true });
      if (!calm.matches) {
        tocd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
        sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
      if (typeof window.CloseWatcher === 'function')
        try {
          watch = new CloseWatcher();
          watch.onclose = () => {
            watch = null;
            shut();
          };
        } catch (e) {}
    });
    document.getElementById('tocdX').addEventListener('click', () => shut());
    tocd.addEventListener('click', e => e.target === tocd && shut());
    tocd.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      shut();
    });
    // a choice closes the sheet, and the page goes to it
    nav.addEventListener('click', e => e.target.closest('a[href^="#"]') && shut(false));
    matchMedia('(min-width: 1120px)').addEventListener('change', m => m.matches && shut(false));
  }
});
