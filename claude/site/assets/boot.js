/* code-atlas viewer bootstrap: data containers + shard loader (works from file:// via <script> tags). */
window.ATLAS = {meta: null, search: [], shards: {f: {}, s: {}}, loaded: {f: {}, s: {}}, waiters: {}};
function ATLAS_META(m) { ATLAS.meta = m; }
function ATLAS_SEARCH(s) { ATLAS.search = s; }
function ATLAS_SHARD(kind, n, obj) {
  ATLAS.loaded[kind][n] = true;
  Object.assign(ATLAS.shards[kind], obj);
  var k = kind + n, w = ATLAS.waiters[k] || [];
  delete ATLAS.waiters[k];
  w.forEach(function (f) { f(); });
}
function fnv(s) {
  var b = new TextEncoder().encode(s), h = 0x811c9dc5;
  for (var i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function atlasGet(kind, key, cb) {
  var n = fnv(key) % ATLAS.meta.shards[kind];
  if (ATLAS.loaded[kind][n] || ATLAS.meta.single) { cb(ATLAS.shards[kind][key]); return; }
  var k = kind + n;
  if (ATLAS.waiters[k]) { ATLAS.waiters[k].push(function () { cb(ATLAS.shards[kind][key]); }); return; }
  ATLAS.waiters[k] = [function () { cb(ATLAS.shards[kind][key]); }];
  var s = document.createElement('script');
  s.src = 'data/' + kind + '/' + n + '.js';
  s.onerror = function () { delete ATLAS.waiters[k]; cb(undefined); };
  document.head.appendChild(s);
}
