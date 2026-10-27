# X fetch (done by the routine, not by scripts/fetch.js)

The script has no X bearer token, so the routine pulls X posts with its X tools (read only, never post, like, follow or DM).

1. **ai_builders_zara**: skip per-user calls. Read `x[]` from follow-builders' central feed
   (`node /workspace/follow-builders/scripts/prepare-digest.js`, or fetch
   https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json). It already covers all 26 builders for the last 24h.
2. **Every other category**: for each `x[]` entry in `config/sources.json`, call `x.get_users_posts` with
   `id` = the numeric id, `start_time` = now − lookbackHours (ISO 8601 UTC), `max_results` 20,
   `exclude` = `replies,retweets`, `post.fields` = `created_at,public_metrics,author_id`.
   Post URL: `https://x.com/<handle>/status/<id>`.
   - Shortcut: one `x.search_posts_all` per category with `(from:a OR from:b ...) -is:reply -is:retweet` and `start_time`. Page with `next_token`, because one page may only cover the last hour on busy accounts (Deadline, elonmusk).
3. Optional: `user-X.get_users_timeline` for Lux (id 1619169304238518273) to catch anything big from accounts not listed.
4. Skip replies, reposts, pure links with no text, emoji-only posts, promos, and giveaways.
5. Rank by substance first (new info, a launch, a number, an original opinion), then likes. Accounts that post a lot (news outlets) need a higher bar.
6. On error: 429 means wait for the reset and retry once. Skip any account that fails and list it in an errors note. Never stop the whole brief over one account.
