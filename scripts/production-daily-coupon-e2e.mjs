const base = process.env.BET_BUILDER_URL || 'https://bet-builder-api-live.onrender.com';

function warsawDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function get(path) {
  const res = await fetch(base + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(path + ': invalid JSON (' + res.status + ')'); }
  if (!res.ok) throw new Error(path + ': HTTP ' + res.status + ' ' + JSON.stringify(body));
  return body;
}

await get('/health');
console.log('E2E health: PASS');

const date = warsawDate();
const coupon = await get('/api/daily-coupon?date=' + encodeURIComponent(date) + '&bookmakers=STS,Superbet&stake=20&maxLegs=5&sport=all');

if (!coupon.source || coupon.source.realBookmakerFeed !== true) {
  throw new Error('REAL_BOOKMAKER_FEED_NOT_ACTIVE: ' + JSON.stringify(coupon.source));
}
if (coupon.source.provider !== 'odds-api.io') {
  throw new Error('UNEXPECTED_PROVIDER: ' + JSON.stringify(coupon.source));
}

const available = new Set((coupon.source.bookmakersAvailable || []).map(value => String(value).toLowerCase()));
for (const bookmaker of ['sts', 'superbet']) {
  if (!available.has(bookmaker)) {
    throw new Error('BOOKMAKER_NOT_PRESENT_IN_LIVE_FEED: ' + bookmaker + ' ' + JSON.stringify(coupon.source));
  }
}

if (!Array.isArray(coupon.legs)) throw new Error('COUPON_LEGS_MISSING');

if (coupon.legs.length === 0) {
  if (coupon.status !== 'BLOCKED' && coupon.status !== 'REVIEW') {
    throw new Error('NO_COUPON_LEGS_WITHOUT_BLOCK_OR_REVIEW: ' + JSON.stringify(coupon));
  }
  console.log(JSON.stringify({
    e2e: 'PASS_NO_ELIGIBLE_LEGS',
    date,
    provider: coupon.source.provider,
    realBookmakerFeed: coupon.source.realBookmakerFeed,
    status: coupon.status,
    sourceStatus: coupon.sourceStatus,
    legs: 0,
    bookmakersAvailable: coupon.source.bookmakersAvailable
  }, null, 2));
  process.exit(0);
}

if (!Number.isFinite(coupon.combinedOdds) || coupon.combinedOdds <= 1) {
  throw new Error('COMBINED_ODDS_INVALID: ' + JSON.stringify(coupon));
}
if (!Number.isFinite(coupon.potentialReturn) || !Number.isFinite(coupon.potentialProfit)) {
  throw new Error('RETURN_PROFIT_INVALID: ' + JSON.stringify(coupon));
}

for (const leg of coupon.legs) {
  if (!Number.isFinite(leg.odds) || leg.odds <= 1) throw new Error('INVALID_REAL_QUOTE: ' + JSON.stringify(leg));
  if (!leg.bookmaker || !['sts', 'superbet'].includes(String(leg.bookmaker).toLowerCase())) {
    throw new Error('UNEXPECTED_BOOKMAKER: ' + JSON.stringify(leg));
  }
}

console.log(JSON.stringify({
  e2e: 'PASS_REAL_COUPON',
  date,
  provider: coupon.source.provider,
  realBookmakerFeed: coupon.source.realBookmakerFeed,
  status: coupon.status,
  sourceStatus: coupon.sourceStatus,
  legs: coupon.legs.length,
  combinedOdds: coupon.combinedOdds,
  stake: coupon.stake,
  potentialReturn: coupon.potentialReturn,
  potentialProfit: coupon.potentialProfit,
  bookmakersAvailable: coupon.source.bookmakersAvailable
}, null, 2));
