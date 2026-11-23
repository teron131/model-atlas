#!/usr/bin/env node

// Searches Reddit and X and reads Reddit threads for the community research through the Scrape Creators API, printing the fields the research reads as JSON on stdout.
// Every request costs one credit: --pages bounds what a call spends and each output's `requests` records it; searches keep only posts dated on or after --since.
// Usage, with SCRAPECREATORS_API_KEY in the environment:
//   node --use-env-proxy scrape.mjs reddit-search "<query>" --since YYYY-MM-DD [--pages 2]
//   node --use-env-proxy scrape.mjs reddit-thread <thread-url> [--pages 3]
//   node --use-env-proxy scrape.mjs x-search "<query>" --since YYYY-MM-DD [--pages 2]
// --use-env-proxy makes fetch follow HTTPS_PROXY, which sandboxed shells route all traffic through; without a proxy it changes nothing.

import { parseArgs } from "node:util";

const API = "https://api.scrapecreators.com";
const REQUEST_TIMEOUT_MS = 60_000;
const RETRIES = 2;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { since: { type: "string" }, pages: { type: "string" } },
});
const [command, target] = positionals;
const key = process.env.SCRAPECREATORS_API_KEY;
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set");
if (!target)
  throw new Error(
    "Usage: scrape.mjs reddit-search|x-search <query> --since YYYY-MM-DD [--pages N] | scrape.mjs reddit-thread <thread-url> [--pages N]",
  );

const commands = {
  "reddit-search": () => redditSearch(target, sinceDate(), pageLimit(2)),
  "reddit-thread": () => redditThread(target, pageLimit(3)),
  "x-search": () => xSearch(target, sinceDate(), pageLimit(2)),
};
if (!Object.hasOwn(commands, command)) throw new Error(`Unknown command: ${command}`);
console.log(JSON.stringify(await commands[command](), null, 2));

function pageLimit(fallback) {
  const pages = values.pages === undefined ? fallback : Number(values.pages);
  if (!Number.isInteger(pages) || pages < 1)
    throw new Error(`--pages must be a positive integer, got ${values.pages}`);
  return pages;
}

function sinceDate() {
  if (!values.since || !/^\d{4}-\d{2}-\d{2}$/.test(values.since))
    throw new Error(`${command} requires --since YYYY-MM-DD`);
  return values.since;
}

// The API's timeframe below a year is a month, too short for the 60-day window, so this searches a year and keeps posts by date.
async function redditSearch(query, since, limit) {
  const pages = await fetchPages(
    "/v1/reddit/search",
    { query, sort: "relevance", timeframe: "year" },
    limit,
    "after",
    (page) => page.after,
  );
  const posts = new Map();
  for (const post of pages.flatMap((page) => page.posts))
    if (isOnOrAfter(post.created_at_iso, since)) posts.set(post.id, trimRedditPost(post));
  return { query, since, requests: pages.length, posts: [...posts.values()] };
}

async function redditThread(url, limit) {
  const pages = await fetchPages(
    "/v1/reddit/post/comments",
    { url },
    limit,
    "cursor",
    (page) => page.more?.has_more === true && page.more.cursor,
  );
  return {
    post: trimRedditPost(pages[0].post),
    requests: pages.length,
    comments: pages.flatMap((page) =>
      page.comments.flatMap((comment) => flattenComment(comment, 0)),
    ),
    more: pages.at(-1).more?.has_more === true,
  };
}

// X search covers Google-indexed public posts and returns no reply text, only a reply count.
async function xSearch(query, since, limit) {
  const pages = await fetchPages(
    "/v1/twitter/search/posts",
    { query },
    limit,
    "cursor",
    (page) => page.cursor,
  );
  const posts = new Map();
  for (const post of pages.flatMap((page) => page.posts)) {
    const trimmed = trimXPost(post);
    if (isOnOrAfter(trimmed.created_at, since)) posts.set(post.rest_id, trimmed);
  }
  return { query, since, requests: pages.length, posts: [...posts.values()] };
}

// ISO timestamps compare by their date prefix: "2026-11-05T08:00:00.000Z" is on or after "2026-11-05".
function isOnOrAfter(timestamp, date) {
  return timestamp.slice(0, 10) >= date;
}

function trimRedditPost(post) {
  return {
    id: post.id,
    subreddit: post.subreddit,
    title: post.title,
    url: new URL(post.permalink, "https://www.reddit.com").href,
    author: post.author,
    created_at: post.created_at_iso,
    score: post.score,
    comments: post.num_comments,
    text: post.selftext,
  };
}

// Skips AutoModerator's boilerplate but keeps the replies under it.
function flattenComment(comment, depth) {
  const replies = (comment.replies?.items ?? []).flatMap((reply) =>
    flattenComment(reply, depth + 1),
  );
  if (comment.author === "AutoModerator") return replies;
  const row = {
    depth,
    author: comment.author,
    created_at: comment.created_at_iso,
    score: comment.score,
    text: comment.body,
  };
  return [row, ...replies];
}

function trimXPost(post) {
  const quoted = post.quoted_status_result?.result;
  return {
    url: post.url,
    author: xAuthor(post),
    created_at: new Date(post.legacy.created_at).toISOString(),
    likes: post.legacy.favorite_count,
    replies: post.legacy.reply_count,
    text: xText(post),
    quoted: quoted && { author: xAuthor(quoted), text: xText(quoted) },
  };
}

function xAuthor(post) {
  return post.core.user_results.result.core.screen_name;
}

// A long post's full text lives in note_tweet; legacy.full_text holds only its first 280 characters.
function xText(post) {
  return post.note_tweet?.note_tweet_results?.result?.text ?? post.legacy.full_text;
}

// Follows the API's cursor through at most `limit` pages, one request and one credit each.
async function fetchPages(path, params, limit, cursorParam, nextCursor) {
  const pages = [];
  let cursor;
  do {
    pages.push(await request(path, { ...params, [cursorParam]: cursor }));
    cursor = nextCursor(pages.at(-1));
  } while (cursor && pages.length < limit);
  return pages;
}

// Retries network failures and 5xx responses with growing pauses, since every request is a read and safe to repeat; other failures surface at once with the API's message.
async function request(path, params) {
  const url = new URL(path, API);
  for (const [name, value] of Object.entries(params))
    if (value !== undefined) url.searchParams.set(name, value);
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        headers: { "x-api-key": key },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt < RETRIES) {
        await pause(attempt);
        continue;
      }
      throw new Error(`${path} failed: ${error.message}`, { cause: error });
    }
    if (response.ok) return response.json();
    if (response.status >= 500 && attempt < RETRIES) {
      await pause(attempt);
      continue;
    }
    throw new Error(
      `${path} returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
}

function pause(attempt) {
  return new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
}
