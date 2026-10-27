# News-sources — Lux's personal information sources

A personal "sources config → daily fetch → filtered last-24h JSON → digest prompts" pipeline that feeds Lux's daily morning brief (Simplified Chinese).
The design is modeled on, and fully includes the sources of, **[zarazhangrui/follow-builders](https://github.com/zarazhangrui/follow-builders)** (MIT) by Zara Zhang. Thank you!

## Layout
```
config/sources.json   categories → x[] (handle, numeric id, origin), feeds[] (RSS/Atom/podcast), pages[]
scripts/fetch.js      pulls all feeds, keeps last N hours, dedupes by URL, skips items seen before → /tmp/lux-sources.json
prompts/x-fetch.md    how the routine pulls X posts with X tools (the script has no X token)
prompts/digest.md     how to turn it all into a short Chinese digest
sample-digest.md      example output
```
`origin` = `lux_follow` (Lux follows it on X), `follow-builders` (from Zara's list), or `addition`.

## Run (Node 20+, no dependencies)
```
node scripts/fetch.js                 # last 24h, writes /tmp/lux-sources.json, updates ~/.lux-sources/state.json
node scripts/fetch.js --hours 48 --out out.json --no-state   # test without touching state
```
Output: `{generatedAt, lookbackHours, categories: {cat: [{source,type,title,url,publishedAt,summary}]}, stats, errors}`.
State keeps seen URLs for 14 days so the same article never shows up two days in a row.

## Add or remove a source
- **Feed**: add `{"name": "...", "url": "<rss url>", "origin": "addition"}` to a category's `feeds`. Check it first:
  `curl -sL -A Mozilla/5.0 <url> | grep -c '<item\|<entry'` should be > 0. YouTube channel: `https://www.youtube.com/feeds/videos.xml?channel_id=UC...`.
- **X account**: add `{"handle": "...", "id": "<numeric id>", "origin": "addition"}`. Look the id up with the X tool `get_users_by_usernames`.
- **Remove**: delete the entry. **New category**: add a key under `categories` with `x`/`feeds` arrays, then mention it in `prompts/digest.md`'s order list.
- `pages[]` entries (Anthropic Engineering, Claude Blog) have no RSS. They come through follow-builders' central `feed-blogs.json`.
