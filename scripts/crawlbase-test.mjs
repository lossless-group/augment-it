#!/usr/bin/env node
// One-shot diagnostic: hits Crawlbase against a single LinkedIn profile
// URL and prints the first 1KB of the raw response so we can see what
// Crawlbase actually returns (HTML / JSON / error). Use this before
// running the full 252-profile batch.
//
// Reads CRAWLBASE_TOKEN from env (or CRAWLBASE_JS_TOKEN if --js).
//
// Usage:
//   export $(grep CRAWLBASE_TOKEN .env | xargs)
//   node scripts/crawlbase-test.mjs
//   node scripts/crawlbase-test.mjs --js          # use JavaScript token
//   node scripts/crawlbase-test.mjs --no-scraper  # omit scraper param

const useJsToken = process.argv.includes('--js');
const noScraper = process.argv.includes('--no-scraper');
const tokenEnv = useJsToken ? 'CRAWLBASE_JS_TOKEN' : 'CRAWLBASE_TOKEN';
const token = process.env[tokenEnv];
if (!token) {
  console.error(`No ${tokenEnv} in env. Run: export $(grep ${tokenEnv} .env | xargs)`);
  process.exit(1);
}

const target = 'https://www.linkedin.com/in/charlene-kuo-a877781';
const params = new URLSearchParams({ token, url: target });
if (!noScraper) params.set('scraper', 'linkedin-profile');

const apiUrl = `https://api.crawlbase.com/?${params.toString()}`;
console.log('using token:', tokenEnv, `(${token.length} chars)`);
console.log('scraper:    ', noScraper ? '(none)' : 'linkedin-profile');
console.log('target:     ', target);
console.log('');

const res = await fetch(apiUrl);
const text = await res.text();
console.log('http status:', res.status);
console.log('pc_status:  ', res.headers.get('pc_status') || '(none)');
console.log('content-type:', res.headers.get('content-type') || '(none)');
console.log('body length:', text.length);
console.log('');
console.log('--- first 1KB of body ---');
console.log(text.slice(0, 1024));
console.log('--- end ---');
