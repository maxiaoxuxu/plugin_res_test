/* code-atlas viewer: hash router, search, tree. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KIND = {f: '函数', m: '方法', k: 'Kernel', s: '结构体', c: '类', u: '联合体', e: '枚举', t: '类型别名', d: '宏', v: '变量', n: '枚举值', F: '成员'};
  var main = $('main'), content = $('content');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var m;
    if ((m = h.match(/^\/s\/(.+)$/))) return show('f', 's:' + dec(m[1]));
    if ((m = h.match(/^\/f\/(.+)$/))) return show('f', 'f:' + dec(m[1]));
    if ((m = h.match(/^\/d\/(.*)$/))) return show('f', 'd:' + dec(m[1]));
    if (h === '/conc') return show('f', 'conc');
    if ((m = h.match(/^\/src\/(.+)@(\d+)$/))) return showSrc(dec(m[1]), +m[2]);
    if ((m = h.match(/^\/q\/(.*)$/))) return showSearch(dec(m[1]));
    return show('f', 'overview');
  }

  function listing(lines, a, b, cap, hl, big) {
    b = Math.min(b, lines.length);
    var cut = (b - a + 1) > cap, bb = cut ? a + cap - 1 : b, out = [];
    for (var i = a; i <= bb; i++) out.push('<span class="ln' + (i === hl ? ' hl' : '') + '" id="L' + i + '">' + i + '</span>' + esc(lines[i - 1]));
    return '<pre class="code' + (big ? ' big' : '') + '">' + out.join('\n') + '</pre>' + (cut ? '<p class="muted">已截断(共 ' + (b - a + 1) + ' 行)</p>' : '');
  }

  function fillSlices() {
    var els = content.querySelectorAll('.codeslice');
    Array.prototype.forEach.call(els, function (el) {
      var p = el.getAttribute('data-p'), a = +el.getAttribute('data-a'), b = +el.getAttribute('data-b'), cap = +el.getAttribute('data-cap') || 300;
      atlasGet('s', p, function (lines) {
        el.innerHTML = lines ? listing(lines, a, b, cap, 0, false) +
          (b - a + 1 > cap ? '<p><a href="#/src/' + encodeURIComponent(p).replace(/%2F/g, '/') + '@' + a + '">查看完整源码</a></p>' : '') : '<span class="muted">源码不可用</span>';
      });
    });
  }

  function show(kind, key, after) {
    atlasGet(kind, key, function (html) {
      content.innerHTML = html || '<p class="conf warn">没有找到:' + esc(key) + '</p>';
      main.scrollTop = 0; window.scrollTo(0, 0);
      markTree();
      fillSlices();
      if (after) after();
    });
  }

  function showSrc(path, line) {
    if (!ATLAS.meta.with_source) { content.innerHTML = '<p class="conf warn">构建时未包含源码(--no-source)。</p>'; return; }
    atlasGet('s', path, function (lines) {
      if (!lines) { content.innerHTML = '<p class="conf warn">源码不存在:' + esc(path) + '</p>'; return; }
      content.innerHTML = '<header class="sym-head"><span class="badge k-file">源码</span><h1>' + esc(path) + '</h1><div class="sub"><a href="#/f/' +
        encodeURIComponent(path).replace(/%2F/g, '/') + '">文件页</a></div></header>' + listing(lines, 1, lines.length, 1e9, line, true);
      var el = document.getElementById('L' + line);
      if (el) el.scrollIntoView({block: 'center'});
    });
  }

  function score(e, q, toks) {
    var name = e[2].toLowerCase(), qn = e[3].toLowerCase(), file = e[4].toLowerCase(), s = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], sc = 0;
      if (name === t) sc = 100;
      else if (qn === t || qn.endsWith('::' + t) || qn.endsWith('.' + t)) sc = 90;
      else if (name.indexOf(t) === 0) sc = 70;
      else if (name.indexOf(t) > 0) sc = 50;
      else if (qn.indexOf(t) >= 0) sc = 40;
      else if (file.indexOf(t) >= 0) sc = 20;
      else return -1;
      s += sc;
    }
    return s - name.length * 0.01;
  }

  function search(q, limit) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    var toks = q.split(/\s+/), kinds = $('kind').value ? $('kind').value.split(',') : null, out = [];
    var S = ATLAS.search;
    for (var i = 0; i < S.length; i++) {
      var e = S[i];
      if (kinds && kinds.indexOf(e[1]) < 0) continue;
      var sc = score(e, q, toks);
      if (sc >= 0) out.push([sc, e]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, limit).map(function (x) { return x[1]; });
  }

  function row(e) {
    return '<a class="res" href="#/s/' + encodeURIComponent(e[0]) + '"><span class="badge k-' + (e[1]) + '">' + (KIND[e[1]] || e[1]) + '</span> <b>' + esc(e[3]) +
      '</b><span class="muted"> ' + esc(e[4]) + ':' + e[5] + '</span><div class="sigline">' + esc(e[6]) + '</div></a>';
  }

  function showSearch(q) {
    var r = search(q, 400);
    content.innerHTML = '<header class="sym-head"><h1>搜索:' + esc(q) + '</h1><div class="sub">' + r.length + ' 个结果</div></header>' +
      '<div class="reslist">' + r.map(row).join('') + '</div>';
  }

  var timer;
  function live() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var q = $('q').value, box = $('results');
      if (!q.trim()) { box.hidden = true; $('tree').hidden = false; return; }
      var r = search(q, 40);
      box.innerHTML = r.map(row).join('') + (r.length ? '<a class="res more" href="#/q/' + encodeURIComponent(q) + '">查看全部结果 →</a>' : '<div class="muted pad">没有匹配</div>');
      box.hidden = false; $('tree').hidden = true;
    }, 80);
  }

  function buildTree() {
    var T = ATLAS.meta.tree;
    function node(d, depth) {
      var info = T[d]; if (!info) return '';
      var s = '';
      info.d.forEach(function (sd) {
        var name = sd.split('/').pop();
        s += '<details data-d="' + esc(sd) + '"' + (depth < 1 ? ' open' : '') + '><summary><a href="#/d/' + encodeURIComponent(sd).replace(/%2F/g, '/') + '">' + esc(name) + '/</a></summary>' + node(sd, depth + 1) + '</details>';
      });
      info.f.forEach(function (f) {
        s += '<a class="file" data-f="' + esc(f[1]) + '" href="#/f/' + encodeURIComponent(f[1]).replace(/%2F/g, '/') + '">' + esc(f[0]) + '</a>';
      });
      return s;
    }
    $('tree').innerHTML = '<a class="file" href="#/d/">/ (根目录)</a>' + node('', 0);
  }

  function markTree() {
    var h = location.hash, els = document.querySelectorAll('#tree .cur');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('cur');
    var m = h.match(/^#\/f\/(.+)$/);
    if (m) {
      var p = dec(m[1]), el = document.querySelector('#tree [data-f="' + p.replace(/"/g, '\\"') + '"]');
      if (el) { el.classList.add('cur'); var d = el.parentNode; while (d && d.id !== 'tree') { if (d.tagName === 'DETAILS') d.open = true; d = d.parentNode; } }
    }
  }

  function init() {
    if (!ATLAS.meta) { content.textContent = '数据未加载(data/meta.js 缺失)'; return; }
    $('proj').textContent = ATLAS.meta.name;
    buildTree();
    $('q').addEventListener('input', live);
    $('kind').addEventListener('change', live);
    $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { location.hash = '#/q/' + encodeURIComponent(this.value); $('results').hidden = true; $('tree').hidden = false; } });
    document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('q').focus(); } });
    $('results').addEventListener('click', function () { $('results').hidden = true; $('tree').hidden = false; });
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
