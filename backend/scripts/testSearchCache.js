// backend/scripts/testSearchCache.js
const BASE = 'http://localhost:5000';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const call = async (url, label) => {
  const t    = Date.now();
  const r    = await fetch(url);
  const ms   = Date.now() - t;
  const cached = r.headers.get('x-cache') || '?';
  const data   = await r.json();
  const count  = data.products?.length ?? data.suggestions?.length ?? '?';
  const status = cached === 'HIT' ? '✅' : '❌';
  console.log(`  ${status} [${cached.padEnd(4)}] ${String(ms).padStart(4)}ms | ${label} | ${count} résultats`);
  return cached;
};

const getMetrics = async () => {
  const r = await fetch(`${BASE}/api/admin/cache/metrics`);
  const d = await r.json();
  const m = d.data || d.metrics;
  if (!m) { console.log('\n⚠️  Métriques non disponibles'); return; }
  console.log(`\n📊 Métriques:`);
  console.log(`   Hit Rate    : ${m.hitRate}%`);
  console.log(`   Total       : ${m.totalRequests} requêtes`);
  console.log(`   L1 Hits     : ${m.l1Hits}`);
  console.log(`   L2 Hits     : ${m.l2Hits}`);
  console.log(`   Misses (L3) : ${m.totalMisses}`);
  console.log(`   L1 Avg Time : ${m.l1AvgResponseTime}ms`);
  console.log(`   L2 Avg Time : ${m.l2AvgResponseTime}ms`);
  console.log(`   L3 Avg Time : ${m.l3AvgResponseTime}ms`);
};

(async () => {
  console.log('\n🧪 TEST CACHE RECHERCHE — Fashion Store\n');
  console.log('══════════════════════════════════════════\n');

  // Reset
  await fetch(`${BASE}/api/admin/cache/metrics/reset`, { method: 'POST' });
  console.log('🔄 Métriques reset\n');

  // ── Test 1 : Recherche textuelle ──────────────────────
  console.log('── Test 1 : Recherche textuelle ──');
  const r1 = await call(`${BASE}/api/products?search=robe`,        '1er appel   → MISS attendu');
  const r2 = await call(`${BASE}/api/products?search=robe`,        '2ème appel  → HIT attendu');
  const r3 = await call(`${BASE}/api/products?search=Robe`,        'Majuscule   → HIT attendu (normalisé)');
  const r4 = await call(`${BASE}/api/products?search=robe&page=1`, 'Avec page=1 → HIT attendu (page exclu)');

  const test1 = r1==='MISS' && r2==='HIT' && r3==='HIT' && r4==='HIT';
  console.log(`  ${test1 ? '✅ PASS' : '❌ FAIL'} — Normalisation recherche\n`);

  await wait(300);

  // ── Test 2 : Filtres ──────────────────────────────────
  console.log('── Test 2 : Filtres catégorie/genre ──');
  const r5 = await call(`${BASE}/api/products?gender=Femme`, '1er appel   → MISS attendu');
  const r6 = await call(`${BASE}/api/products?gender=Femme`, '2ème appel  → HIT attendu');
  console.log(`  ${r5==='MISS' && r6==='HIT' ? '✅ PASS' : '❌ FAIL'} — Cache filtre catégorie\n`);

  await wait(300);

  // ── Test 3 : Suggestions ──────────────────────────────
  console.log('── Test 3 : Suggestions autocomplete ──');
  const r7 = await call(`${BASE}/api/products/search/suggestions?q=rob`, '1er appel  → MISS attendu');
  const r8 = await call(`${BASE}/api/products/search/suggestions?q=rob`, '2ème appel → HIT attendu');
  const r9 = await call(`${BASE}/api/products/search/suggestions?q=Rob`, 'Majuscule  → HIT attendu');
  console.log(`  ${r7==='MISS' && r8==='HIT' && r9==='HIT' ? '✅ PASS' : '❌ FAIL'} — Cache suggestions\n`);

  await wait(300);

  // ── Test 4 : Routes existantes inchangées ─────────────
  console.log('── Test 4 : Routes catégories (inchangées) ──');
  await call(`${BASE}/api/products/categories`, '1er appel  → MISS ou HIT (déjà en cache)');
  await call(`${BASE}/api/products/categories`, '2ème appel → HIT');
  console.log('  ℹ️  Ces routes utilisent CACHE_CONFIG, comportement normal\n');

  // ── Résultats finaux ──────────────────────────────────
  await getMetrics();

  console.log('\n══════════════════════════════════════════');
  console.log(test1
    ? '🎉 Tous les tests principaux PASSENT !'
    : '⚠️  Certains tests ont échoué — voir les détails ci-dessus');
  console.log('══════════════════════════════════════════\n');
})();
