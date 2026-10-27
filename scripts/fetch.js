#!/usr/bin/env node
// Lux Sources — fetch RSS/Atom/YouTube feeds from config/sources.json,
// keep items from the last N hours, dedupe by URL, skip items seen on earlier days.
// Usage: node scripts/fetch.js [--hours 24] [--out /tmp/lux-sources.json] [--no-state]
// Zero dependencies (Node 20+ global fetch). X posts are NOT fetched here; see prompts/x-fetch.md.
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cfg = JSON.parse(await readFile(join(ROOT, 'config/sources.json'), 'utf8'));
const HOURS = Number(opt('--hours', cfg.lookbackHours || 24));
const OUT = opt('--out', '/tmp/lux-sources.json');
const STATE = opt('--state', join(homedir(), '.lux-sources/state.json'));
const USE_STATE = !args.includes('--no-state');
const cutoff = Date.now() - HOURS * 3600e3;

const decode = s => (s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ' }[m]))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/\s+/g, ' ').trim();
const tag = (xml, names) => {
  for (const n of names) {
    const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return m[1];
  }
  return '';
};
function link(block) {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i) || block.match(/<link[^>]*href=["']([^"']+)/i);
  const plain = decode(tag(block, ['link']));
  if (plain && /^https?:/.test(plain)) return plain;
  if (alt) return alt[1].replace(/&amp;/g, '&');
  const enc = block.match(/<enclosure[^>]*url=["']([^"']+)/i);
  return enc ? enc[1] : decode(tag(block, ['guid']));
}
function parse(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map(b => ({
    title: decode(tag(b, ['title'])),
    url: link(b),
    publishedAt: safeDate(decode(tag(b, ["pubDate", "published", "updated", "dc:date"]))),
    summary: decode(tag(b, ['description', 'summary', 'media:description', 'content:encoded', 'content'])).slice(0, 400),
  }));
}
function safeDate(s) { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); }
const normUrl = u => (u || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();

async function get(url) {
  const ctl = AbortSignal.timeout(20000);
  const res = await fetch(url, { signal: ctl, headers: { 'User-Agent': 'Mozilla/5.0 (lux-sources)' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

let state = { seen: {} };
if (USE_STATE && existsSync(STATE)) try { state = JSON.parse(await readFile(STATE, 'utf8')); } catch {}

const out = { generatedAt: new Date().toISOString(), lookbackHours: HOURS, categories: {}, stats: { feeds: 0, feedsOk: 0, items: 0, skippedSeen: 0 }, errors: [] };
const seenNow = new Set();
const jobs = [];
for (const [cat, c] of Object.entries(cfg.categories)) {
  out.categories[cat] = [];
  for (const f of c.feeds || []) {
    out.stats.feeds++;
    jobs.push(get(f.url).then(xml => {
      out.stats.feedsOk++;
      for (const it of parse(xml)) {
        if (!it.url || !it.publishedAt || Date.parse(it.publishedAt) < cutoff) continue;
        const k = normUrl(it.url);
        if (seenNow.has(k)) continue;
        if (state.seen[k]) { out.stats.skippedSeen++; continue; }
        seenNow.add(k);
        out.categories[cat].push({ source: f.name, type: f.type || 'article', ...it });
      }
    }).catch(e => out.errors.push(`${cat} / ${f.name}: ${e.message}`)));
  }
}
await Promise.all(jobs);
for (const cat in out.categories) { out.categories[cat].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); out.stats.items += out.categories[cat].length; }

if (USE_STATE) {
  const now = Date.now();
  for (const k of seenNow) state.seen[k] = now;
  for (const k in state.seen) if (now - state.seen[k] > 14 * 864e5) delete state.seen[k]; // keep 14 days
  await mkdir(dirname(STATE), { recursive: true });
  await writeFile(STATE, JSON.stringify(state));
}
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ out: OUT, ...out.stats, errors: out.errors }));
