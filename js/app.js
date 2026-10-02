/* =========================================================
 *  app.js —— 页面逻辑（路由 / 渲染 / 搜索 / 主题 / 交互）
 *  布局走极简路线：一列文章，没有侧边栏、没有卡片
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG;
  var S = window.BlogStore;
  var MD = window.MD;

  var state = { query: '', tag: '', route: { name: 'home' } };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = MD.escapeHtml;

  var toastTimer = null;
  var lbBound = false;

  /* ---------------- 初始化 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.title = CFG.title;
    applyFavicon();
    applyBackground();
    initTheme();
    buildHeader();
    buildFooter();
    bindGlobal();
    loadPosts();
  });

  function applyFavicon() {
    if (!CFG.favicon) return;
    var link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.rel = 'icon';
    link.href = CFG.favicon;
    document.head.appendChild(link);
  }

  function applyBackground() {
    if (CFG.background === 'plain') document.documentElement.classList.add('bg-plain');
  }

  /* ---------------- 主题 ---------------- */
  function initTheme() {
    // 支持用 ?theme=dark / ?theme=light 直接指定（方便分享和测试）
    var urlTheme = new URLSearchParams(location.search).get('theme');
    if (urlTheme === 'dark' || urlTheme === 'light') localStorage.setItem('blog-theme', urlTheme);
    setTheme(localStorage.getItem('blog-theme') || CFG.defaultTheme || 'auto');
    $('#themeBtn').addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(now);
      localStorage.setItem('blog-theme', now);
      toast(now === 'dark' ? '已切换到夜间模式' : '已切换到日间模式');
    });
  }

  function setTheme(t) {
    if (t === 'auto') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  }

  /* ---------------- 顶栏 / 页脚 ---------------- */
  function buildHeader() {
    $('#brandName').textContent = CFG.shortName || CFG.title;

    var mark = $('#brandMark');
    if (mark) {
      mark.innerHTML = avatarIsImage()
        ? '<img src="' + esc(CFG.avatar) + '" alt="">'
        : esc(CFG.avatarEmoji || '🌿');
    }

    var nav = $('#siteNav');
    nav.innerHTML = (CFG.nav || []).map(function (n) {
      return '<a href="' + esc(n.href) + '">' + esc(n.text) + '</a>';
    }).join('');

    $('#navToggle').addEventListener('click', function () { nav.classList.toggle('open'); });
    nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') nav.classList.remove('open'); });
  }

  function buildFooter() {
    $('#footerMain').textContent = CFG.footer || '';
    var note = $('#footerNote');
    if (note) note.textContent = CFG.footerNote || '';
  }

  /* ---------------- 全局事件 ---------------- */
  function bindGlobal() {
    window.addEventListener('hashchange', renderRoute);

    // 搜索框是随页面渲染出来的，这里用事件委托
    document.addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'searchInput') return;
      state.query = e.target.value.trim().toLowerCase();
      var clear = $('#searchClear');
      if (clear) clear.hidden = !e.target.value;
      if (state.route.name !== 'home' && state.route.name !== 'tag') {
        location.hash = '#/';
        return;
      }
      updateList();
    });

    document.addEventListener('click', function (e) {
      var clear = e.target.closest && e.target.closest('#searchClear');
      if (!clear) return;
      var input = $('#searchInput');
      if (!input) return;
      input.value = '';
      state.query = '';
      clear.hidden = true;
      updateList();
      input.focus();
    });

    // 顶栏滚动阴影 + 阅读进度 + 回到顶部
    var toTop = $('#toTop');
    var progress = $('#readProgress');
    var topbar = $('#topbar');
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || document.documentElement.scrollTop;
        toTop.classList.toggle('show', y > 400);
        if (topbar) topbar.classList.toggle('scrolled', y > 6);
        updateProgress(progress);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { updateProgress(progress); }, { passive: true });

    toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    // 返回上一页
    $('#backBtn').addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.hash = '#/';
    });

    // 图片放大
    $('#lightbox').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });

    /* 拖入 txt 文件即可浏览 */
    var dragDepth = 0;
    document.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      dragDepth++; document.body.classList.add('drop-active');
    });
    document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('dragleave', function () {
      dragDepth--; if (dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop-active'); }
    });
    document.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0; document.body.classList.remove('drop-active');
      S.loadDroppedAll(e.dataTransfer.files).then(function () { renderRoute(); }).catch(showError);
    });
  }

  function hasFiles(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
  }

  /* ---------------- 数据加载 ---------------- */
  function loadPosts() {
    setView('<div class="loading"><span class="spinner"></span><span>正在读取文章…</span></div>');
    var isFile = location.protocol === 'file:';

    var task = isFile
      ? Promise.reject(new Error('file-protocol'))
      : S.loadHttp().catch(function () { return S.loadHttp(); });

    task.then(function () {
      renderRoute();
    }).catch(function (err) {
      console.warn(err);
      renderSetup(isFile);
    });
  }

  function showError(err) {
    setView('<div class="empty-state"><h3>出错了</h3><p>' + esc(err.message || String(err)) + '</p></div>');
  }

  /* 无法自动读取时的引导页 */
  function renderSetup(isFile) {
    var canFolder = CFG.enableLocalFolderMode && S.supported();
    var html = ''
      + '<div class="empty-state">'
      + '<h3>还差一步就能看到文章</h3>'
      + '<p>'
      + (isFile
        ? '浏览器出于安全限制，直接双击打开网页时无法读取 txt 文件。任选一种方式即可：'
        : '没有找到 <code>posts/index.json</code>。请确认文章目录与清单存在，或者换一种方式：')
      + '</p>'
      + '<div class="setup-actions">'
      + (canFolder ? '<button class="btn primary" id="pickFolder">选择 posts 文件夹</button>' : '')
      + '<button class="btn" id="pickFiles">选择 txt 文件</button>'
      + '</div>'
      + '<p style="margin-top:18px">或者在项目根目录运行一条命令，再访问 <code>http://localhost:8080</code>：</p>'
      + '<p><code>python -m http.server 8080</code></p>'
      + '<p style="font-size:13px">Windows 用户也可以直接双击 <code>start.bat</code></p>'
      + '</div>';
    setView(html);

    var pf = $('#pickFolder');
    if (pf) pf.addEventListener('click', function () {
      pf.disabled = true; pf.textContent = '读取中…';
      S.pickFolder().then(function () { renderRoute(); })
        .catch(function (e) {
          pf.disabled = false; pf.textContent = '选择 posts 文件夹';
          if (e && e.name !== 'AbortError') alert(e.message);
        });
    });

    $('#pickFiles').addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = true; inp.accept = '.txt,.json';
      inp.addEventListener('change', function () {
        S.loadDroppedAll(inp.files).then(function () { renderRoute(); }).catch(showError);
      });
      inp.click();
    });
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = (location.hash || '#/').replace(/^#/, '');
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'post' && parts[1]) return { name: 'post', slug: parts.slice(1).join('/') };
    if (parts[0] === 'tag' && parts[1]) return { name: 'tag', tag: parts.slice(1).join('/') };
    if (parts[0] === 'tags') return { name: 'tags' };
    if (parts[0] === 'about') return { name: 'about' };
    return { name: 'home' };
  }

  function renderRoute() {
    state.route = parseHash();
    state.tag = state.route.name === 'tag' ? state.route.tag : '';

    $$('#siteNav a').forEach(function (a) {
      var href = a.getAttribute('href');
      a.classList.toggle('active',
        (state.route.name === 'home' && href === '#/') ||
        (state.route.name === 'tag' && href === '#/tags') ||
        (state.route.name === 'tags' && href === '#/tags') ||
        (state.route.name === 'about' && href === '#/about'));
    });

    if (!S.ready) return;

    var back = $('#backBtn');
    if (back) {
      var r = state.route.name;
      back.classList.toggle('show', r === 'post' || r === 'tags' || r === 'about');
    }

    switch (state.route.name) {
      case 'post': return renderPost(state.route.slug);
      case 'tags': return renderTags();
      case 'about': return renderAbout();
      default: return renderHome();   // home 与 tag 共用
    }
  }

  /* ---------------- 首页：一列文章 ---------------- */
  function filtered() {
    var q = state.query;
    return S.posts.filter(function (p) {
      if (state.tag && p.tags.indexOf(state.tag) === -1) return false;
      if (!q) return true;
      return (p.title + ' ' + p.tags.join(' ') + ' ' + p.body).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderHome() {
    var html = ''
      + '<header class="home-head">'
      + '<div class="avatar-lg' + (avatarIsImage() ? ' has-img' : '') + '">' + avatarInner() + '</div>'
      + '<h1>' + esc(CFG.title) + '</h1>'
      + (CFG.subtitle ? '<p class="tagline">' + esc(CFG.subtitle) + '</p>' : '')
      + '<p class="home-stats">' + statsLine() + '</p>'
      + '</header>'
      + '<div class="list-bar">'
      + '<label class="search-field">'
      + '<svg class="search-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">'
      + '<circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/>'
      + '<path d="M15.2 15.2 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
      + '</svg>'
      + '<input class="search-input" id="searchInput" type="search" placeholder="搜索文章…" autocomplete="off"'
      + ' aria-label="搜索文章" value="' + esc(state.query) + '">'
      + '<button class="search-clear" id="searchClear" type="button" aria-label="清除搜索"' + (state.query ? '' : ' hidden') + '>×</button>'
      + '</label>'
      + '<span class="list-count" id="listCount"></span>'
      + '</div>'
      + '<ul class="entries" id="entryList"></ul>';

    setView(html);
    updateList();
    document.title = CFG.title + (CFG.subtitle ? ' · ' + CFG.subtitle : '');
    if (state.query) {
      var inp = $('#searchInput');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function statsLine() {
    var n = S.posts.length;
    if (!n) return '还没有文章';
    var last = S.posts[0] && S.posts[0].date;
    return '共 ' + n + ' 篇' + (last ? ' · 最近更新 ' + last : '');
  }

  /* 只刷新列表，避免搜索时输入框失焦 */
  function updateList() {
    var listEl = $('#entryList');
    if (!listEl) return;
    var list = filtered();

    var html = '';
    var year = null;
    list.forEach(function (p) {
      var y = (p.date || '').slice(0, 4);
      if (y && y !== year) {
        year = y;
        html += '<li class="year-mark" aria-hidden="true"><span>' + esc(y) + '</span></li>';
      }
      html += entry(p);
    });
    listEl.innerHTML = html || '<li class="empty-line">没有找到匹配的文章' + (state.query ? '，换个词试试' : '') + '</li>';

    var count = $('#listCount');
    if (count) {
      var filtering = !!(state.tag || state.query);
      count.textContent = filtering
        ? (state.tag ? '#' + state.tag + ' · ' : '') + '找到 ' + list.length + ' 篇'
        : '';
    }
  }

  function entry(p) {
    var tags = (CFG.showTags !== false && p.tags.length)
      ? '<span class="entry-tags">' + p.tags.slice(0, 2).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>'
      : '';
    var summary = (CFG.showSummary !== false && p.summary)
      ? '<span class="entry-summary">' + esc(p.summary) + '</span>' : '';
    return '<li class="entry"><a href="#/post/' + encodeURIComponent(p.slug) + '">'
      + '<time datetime="' + esc(p.date || '') + '">' + esc(p.date || '') + '</time>'
      + '<span class="entry-main">'
      + '<span class="entry-title">' + esc(p.title) + (p.pinned ? '<span class="pin">置顶</span>' : '') + '</span>'
      + summary
      + '</span>'
      + tags
      + '</a></li>';
  }

  /* ---------------- 文章页 ---------------- */
  function renderPost(slug) {
    var p = S.find(slug);
    if (!p) {
      setView('<div class="empty-state"><h3>找不到这篇文章</h3><p>它可能已被重命名或删除。</p><p><a class="btn" href="#/">返回首页</a></p></div>');
      return;
    }

    var nb = S.neighbors(slug);
    var meta = [];
    if (p.date) meta.push('<time datetime="' + esc(p.date) + '">' + esc(p.date) + '</time>');
    if (p.author) meta.push('<span>' + esc(p.author) + '</span>');
    meta.push('<span>' + p.words + ' 字</span>');
    meta.push('<span>约 ' + p.minutes + ' 分钟</span>');

    var tags = p.tags.length
      ? '<span class="post-tags">' + p.tags.map(function (t) {
          return '<a class="tag" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
        }).join('') + '</span>'
      : '';

    var html = ''
      + '<article class="post">'
      + '<header class="post-head">'
      + '<h1 class="post-title">' + esc(p.title) + '</h1>'
      + '<div class="post-meta">' + meta.join('<span class="dot"></span>') + tags + '</div>'
      + '</header>'
      + (p.cover ? '<div class="post-cover"><img src="' + esc(resolveAsset(p.cover)) + '" alt="" loading="lazy"></div>' : '')
      + '<div class="markdown" id="postBody">' + p.html + '</div>'
      + '</article>'
      + '<nav class="post-nav" aria-label="上下篇">'
      + (nb.prev
          ? '<a href="#/post/' + encodeURIComponent(nb.prev.slug) + '"><span class="nav-label">← 更新的一篇</span><strong>' + esc(nb.prev.title) + '</strong></a>'
          : '<span class="muted"><span class="nav-label">← 更新的一篇</span>已经是最新了</span>')
      + (nb.next
          ? '<a class="next" href="#/post/' + encodeURIComponent(nb.next.slug) + '"><span class="nav-label">更早的一篇 →</span><strong>' + esc(nb.next.title) + '</strong></a>'
          : '<span class="muted next"><span class="nav-label">更早的一篇 →</span>已经到底了</span>')
      + '</nav>'
      + '<div class="post-actions">'
      + '<a class="link-btn" href="#/">返回首页</a>'
      + '<button class="link-btn" id="copyLink" type="button">复制链接</button>'
      + '<button class="link-btn" id="printBtn" type="button">打印 / 存为 PDF</button>'
      + '</div>';

    setView(html);
    document.title = p.title + ' · ' + CFG.title;

    enhanceArticle();
    updateProgress($('#readProgress'));

    $('#copyLink').addEventListener('click', function () {
      copyText(location.href).then(function () { toast('链接已复制'); },
        function () { prompt('复制这个链接：', location.href); });
    });
    $('#printBtn').addEventListener('click', function () { window.print(); });
  }

  /* 文章页的小增强：目录、代码复制、图片放大 */
  function enhanceArticle() {
    var body = $('#postBody');
    if (!body) return;

    /* 目录（3 个以上标题才显示） */
    var heads = $$('h2, h3', body).filter(function (h) { return h.id; });
    if (heads.length >= 3) {
      var toc = '<details class="toc"><summary>本文目录<span class="toc-n">' + heads.length + ' 节</span></summary><ol>';
      heads.forEach(function (h) {
        toc += '<li class="' + (h.tagName === 'H3' ? 'lv3' : 'lv2') + '">'
          + '<a href="#' + h.id + '" data-target="' + h.id + '">' + esc(h.textContent) + '</a></li>';
      });
      toc += '</ol></details>';
      body.insertAdjacentHTML('beforebegin', toc);

      /* 目录点击：平滑滚动，不污染 hash 路由 */
      var tocEl = $('.toc');
      tocEl.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-target]');
        if (!a) return;
        e.preventDefault();
        var target = document.getElementById(a.getAttribute('data-target'));
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    /* 代码块：语言标签 + 复制按钮 */
    $$('.code-block', body).forEach(function (block) {
      var lang = block.getAttribute('data-lang');
      if (lang) {
        block.removeAttribute('data-lang');
        var span = document.createElement('span');
        span.className = 'code-lang';
        span.textContent = lang;
        block.appendChild(span);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-code';
      btn.textContent = '复制';
      btn.addEventListener('click', function () {
        var code = block.querySelector('code');
        copyText(code ? code.textContent : '').then(function () {
          btn.textContent = '已复制';
          toast('代码已复制');
          setTimeout(function () { btn.textContent = '复制'; }, 1600);
        }, function () { toast('复制失败，请手动选择'); });
      });
      block.appendChild(btn);
    });

    /* 图片：点击放大 */
    $$('img', body).forEach(function (img) { img.classList.add('zoomable'); });
    if (!lbBound) {
      body.addEventListener('click', function (e) {
        if (e.target.tagName === 'IMG') openLightbox(e.target.getAttribute('src'), e.target.alt);
      });
      lbBound = true;
    }
  }

  /* ---------------- 阅读进度 ---------------- */
  function updateProgress(el) {
    if (!el) return;
    var post = $('.post');
    if (!post) { el.classList.remove('on'); el.style.width = '0%'; return; }
    var rect = post.getBoundingClientRect();
    var total = rect.height - window.innerHeight * 0.55;
    if (total <= 0) { el.classList.remove('on'); el.style.width = '0%'; return; }
    var done = Math.min(Math.max(-rect.top + window.innerHeight * 0.15, 0), total);
    el.style.width = (done / total * 100).toFixed(2) + '%';
    el.classList.add('on');
  }

  /* ---------------- 标签页 / 关于 ---------------- */
  function renderTags() {
    var tags = S.tagList();
    var body = tags.length
      ? '<div class="tag-cloud">' + tags.map(function (t) {
          return '<a class="tag-chip" href="#/tag/' + encodeURIComponent(t) + '">' + esc(t)
            + '<span class="tag-num">' + S.tags[t] + '</span></a>';
        }).join('') + '</div>'
      : '<div class="empty-state"><h3>还没有标签</h3><p>在 txt 文件头部写 <code>标签: 随笔, 笔记</code> 就会出现在这里。</p></div>';

    setView('<header class="page-head"><h1>标签</h1><p class="page-sub">共 ' + tags.length + ' 个标签 · ' + S.posts.length + ' 篇文章</p></header>' + body);
    document.title = '标签 · ' + CFG.title;
  }

  function renderAbout() {
    setView('<article class="post"><div class="markdown" id="postBody">' + MD.render(CFG.about || '') + '</div></article>');
    document.title = '关于 · ' + CFG.title;
    enhanceArticle();
  }

  /* ---------------- 工具 ---------------- */
  function avatarIsImage() {
    return !!CFG.avatar && /\.(png|jpe?g|webp|gif|svg)$/i.test(CFG.avatar);
  }

  function avatarInner() {
    if (avatarIsImage()) return '<img src="' + esc(CFG.avatar) + '" alt="头像">';
    return esc(CFG.avatarEmoji || '🌿');
  }

  function resolveAsset(src) {
    if (/^(https?:)?\/\//i.test(src) || src.charAt(0) === '/') return src;
    return (CFG.postsDir || '') + src;
  }

  function setView(html) {
    $('#view').innerHTML = html;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function copyText(text) {
    function legacy() {
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          var done = document.execCommand('copy');
          ta.remove();
          done ? resolve() : reject(new Error('execCommand failed'));
        } catch (err) { reject(err); }
      });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }

  function openLightbox(src, alt) {
    var box = $('#lightbox');
    var img = $('#lightboxImg');
    if (!box || !img) return;
    img.src = src;
    img.alt = alt || '';
    box.hidden = false;
  }

  function closeLightbox() {
    var box = $('#lightbox');
    if (box && !box.hidden) {
      box.hidden = true;
      img_reset();
    }
  }
  function img_reset() {
    var img = $('#lightboxImg');
    if (img) img.removeAttribute('src');
  }
})();
