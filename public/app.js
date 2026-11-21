// All page text goes through textContent, never innerHTML, so user-supplied URLs can't inject HTML (XSS).
const $ = (id) => document.getElementById(id);

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showMessage(text, isError = false, link) {
  const msg = $('message');
  msg.textContent = text;
  msg.className = isError ? 'error' : '';
  if (link) {
    const a = el('a', link);
    a.href = link;
    msg.append(' ', a);
  }
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

$('shorten').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { url: form.url.value.trim() };
  if (form.alias.value.trim()) body.alias = form.alias.value.trim();
  if (form.expiresAt.value) body.expiresAt = new Date(form.expiresAt.value).toISOString();
  try {
    const link = await api('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    form.reset();
    showMessage('Short link:', false, `${location.origin}/${link.code}`);
    loadLinks();
  } catch (err) {
    showMessage(err.message, true);
  }
});

async function loadLinks() {
  const tbody = $('links');
  try {
    const links = await api('/api/links');
    tbody.replaceChildren(...links.map(row));
    if (!links.length) {
      const td = el('td', 'No links yet.', 'muted');
      td.colSpan = 5;
      const tr = el('tr');
      tr.append(td);
      tbody.append(tr);
    }
  } catch (err) {
    showMessage(err.message, true);
  }
}

function row(link) {
  const tr = el('tr');
  const short = `${location.origin}/${link.code}`;
  const a = el('a', `/${link.code}`);
  a.href = short;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const shortCell = el('td');
  shortCell.append(a);

  const original = el('td', link.originalUrl, 'original');
  original.title = link.originalUrl;

  const expires = link.expiresAt ? new Date(link.expiresAt).toLocaleString() : '—';

  const actions = el('td', undefined, 'actions');
  const statsBtn = el('button', 'Stats', 'secondary');
  statsBtn.type = 'button';
  statsBtn.addEventListener('click', () => showStats(link.code));
  const delBtn = el('button', 'Delete', 'danger');
  delBtn.type = 'button';
  delBtn.addEventListener('click', async () => {
    try {
      await api(`/api/links/${encodeURIComponent(link.code)}`, { method: 'DELETE' });
      $('stats').hidden = true;
      loadLinks();
    } catch (err) {
      showMessage(err.message, true);
    }
  });
  actions.append(statsBtn, ' ', delBtn);

  tr.append(shortCell, original, el('td', String(link.clicks)), el('td', expires), actions);
  return tr;
}

async function showStats(code) {
  try {
    const s = await api(`/api/links/${encodeURIComponent(code)}/stats`);
    $('stats-title').textContent = `Stats for /${s.code}`;
    $('stats-total').textContent = `${s.total} total click${s.total === 1 ? '' : 's'}`;
    const max = Math.max(1, ...s.perDay.map((d) => d.clicks));
    $('stats-days').replaceChildren(...s.perDay.map((d) => {
      const li = el('li');
      const bar = el('div', undefined, 'bar');
      bar.style.width = `${(d.clicks / max) * 100}%`;
      const track = el('div');
      track.append(bar);
      li.append(el('span', d.day), track, el('span', String(d.clicks)));
      return li;
    }));
    $('stats').hidden = false;
    $('stats').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showMessage(err.message, true);
  }
}

loadLinks();
