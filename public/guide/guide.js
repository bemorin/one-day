/*! One Day guide. MIT License. */
/* Three small things, and nothing sent anywhere: the app's own light or dark choice (it reads oneday.theme, which the
   app keeps in this browser), a copy of the page as Markdown for the clipboard, and where you are in "On this page". */
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
        if (c.nodeType !== 1 || c.matches('svg, .d, [hidden], [aria-hidden="true"]')) return '';
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
    else if (t === 'P') out.push(text(n));
    else if (t === 'UL' || t === 'OL')
      out.push([...n.children].map((li, i) => (t === 'OL' ? `${i + 1}. ` : '- ') + text(li)).join('\n'));
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
  const help = doc.querySelector('.help');
  if (help) {
    block(help.querySelector('h2'));
    block(help.querySelector('p'));
    out.push([...help.querySelectorAll('.links a')].map(a => `- [${text(a)}](${abs(a.getAttribute('href'))})`).join('\n'));
  }
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
});
