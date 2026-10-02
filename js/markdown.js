/* =========================================================
 *  markdown.js —— 一个很小的 Markdown 渲染器（无任何外部依赖）
 *  支持：标题 / 粗体 / 斜体 / 删除线 / 行内代码 / 代码块 /
 *        无序·有序·嵌套列表 / 待办清单 / 引用 / 表格 / 分割线 /
 *        链接 / 图片 / 自动链接
 *  由于文章是本地 txt，这里会先转义 HTML，避免 XSS。
 * ========================================================= */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- B 站视频 ----------
   * 支持四种写法（都要单独占一行）：
   *   @bilibili BV1xx411c7mD          或用 @bili
   *   https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=60
   *   <iframe src="//player.bilibili.com/player.html?bvid=BV..."></iframe>
   *   播放器链接
   * 只会解析出视频号，播放地址由这里拼，避免任意 iframe 注入。
   */
  function videoCfg() { return (global.SITE_CONFIG && global.SITE_CONFIG.video) || {}; }

  function parseBili(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    var ifr = s.match(/<iframe[^>]*src=["']([^"']+)["']/i);
    if (ifr) s = ifr[1];
    s = s.replace(/^@(?:bili|bilibili)\b[\s:：,，]*/i, '');
    var page = 1, t = 0;
    var mp = s.match(/[?&#](?:p|page)=(\d+)/i); if (mp) page = parseInt(mp[1], 10) || 1;
    var mt = s.match(/[?&#](?:t|start)=(\d+)/i); if (mt) t = parseInt(mt[1], 10) || 0;
    var m;
    if ((m = s.match(/BV[0-9A-Za-z]{10}/))) return { param: 'bvid', value: m[0], page: page, t: t, label: 'B 站视频 ' + m[0] };
    if ((m = s.match(/\bav(\d+)/i))) return { param: 'aid', value: m[1], page: page, t: t, label: 'B 站视频 av' + m[1] };
    if ((m = s.match(/\bep(\d+)/i))) return { param: 'ep_id', value: m[1], page: 1, t: t, label: 'B 站番剧 ep' + m[1] };
    return null;
  }

  function biliSrc(info) {
    var v = videoCfg();
    var q = ['isOutside=true', info.param + '=' + info.value];
    if (info.param !== 'ep_id' && info.page > 1) q.push('page=' + info.page);
    if (info.t) q.push('t=' + info.t);
    q.push('autoplay=' + (v.autoplay ? 1 : 0));
    q.push('danmaku=' + (v.danmaku === false ? 0 : 1));
    q.push('high_quality=' + (v.highQuality === false ? 0 : 1));
    q.push('as_wide=1');
    return 'https://player.bilibili.com/player.html?' + q.join('&');
  }

  function embedHtml(info) {
    var src = escapeHtml(biliSrc(info));
    var label = escapeHtml(info.label || 'B 站视频');
    if (videoCfg().clickToPlay) {
      return '<div class="video-embed is-facade">'
        + '<button type="button" class="video-facade" data-src="' + src + '" title="点击加载 B 站播放器">'
        + '<span class="video-play">▶</span><span class="video-label">点击播放 · ' + label + '</span>'
        + '</button></div>';
    }
    return '<div class="video-embed">'
      + '<iframe src="' + src + '" scrolling="no" frameborder="no" framespacing="0" allowfullscreen="true"'
      + ' allow="autoplay; fullscreen; picture-in-picture" loading="lazy" title="' + label + '"></iframe>'
      + '</div>';
  }

  /* 点击封面才加载播放器（clickToPlay 模式）；站点和写作台共用这段 */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.video-facade');
      if (!btn) return;
      var src = btn.getAttribute('data-src');
      if (!src) return;
      var wrap = btn.parentNode;
      var f = document.createElement('iframe');
      f.setAttribute('src', src);
      f.setAttribute('scrolling', 'no');
      f.setAttribute('frameborder', 'no');
      f.setAttribute('allowfullscreen', 'true');
      f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      f.setAttribute('title', btn.getAttribute('title') || 'B 站视频');
      wrap.classList.remove('is-facade');
      btn.remove();
      wrap.appendChild(f);
    });
  }

  /* ---------- 行内语法 ---------- */
  function inline(text) {
    var codes = [];
    var s = escapeHtml(text);

    // 行内代码先抽出来，避免里面的符号被继续解析
    s = s.replace(/`([^`]+)`/g, function (m, code) {
      codes.push(code);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });

    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (m, alt, src, title) {
      return '<img src="' + src + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy">';
    });
    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (m, txt, href, title) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer"' + (title ? ' title="' + title + '"' : '') + '>' + txt + '</a>';
    });
    // 裸链接
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()）]+)/g, function (m, pre, url) {
      return pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });

    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');

    // 还原行内代码
    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) {
      return '<code>' + codes[+i] + '</code>';
    });
    return s;
  }

  /* ---------- 列表（支持按缩进嵌套） ---------- */
  function isUl(line) { return /^(\s*)([-*+])\s+/.test(line); }
  function isOl(line) { return /^(\s*)(\d+)[.)]\s+/.test(line); }
  function isLi(line) { return isUl(line) || isOl(line); }

  function buildList(items, ordered, start) {
    var html = ordered
      ? '<ol' + (start && start !== 1 ? ' start="' + start + '"' : '') + '>'
      : '<ul>';
    items.forEach(function (it) {
      var inner = '';
      if (it.task !== undefined) {
        inner += '<input type="checkbox" disabled' + (String(it.task).toLowerCase() === 'x' ? ' checked' : '') + '> ';
      }
      if (it.text) inner += inline(it.text);
      if (it.children) inner += buildList(it.children.items, it.children.ordered, it.children.start);
      html += '<li' + (it.task !== undefined ? ' class="task"' : '') + '>' + inner + '</li>';
    });
    return html + (ordered ? '</ol>' : '</ul>');
  }

  function collectList(lines, start) {
    var RE = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
    var first = lines[start].match(RE);
    var rootOrdered = !!first[3];
    var rootIndent = first[1].replace(/\t/g, '  ').length;
    var root = { items: [], ordered: rootOrdered, start: 1 };
    var stack = [{ indent: rootIndent - 1, node: root }];

    var i = start;
    while (i < lines.length) {
      var line = lines[i];
      var m = line.match(RE);
      if (!m) {
        // 空行后如果还是同一层级的同类列表，就当作松散列表继续
        if (/^\s*$/.test(line)) {
          var j = i + 1;
          while (j < lines.length && /^\s*$/.test(lines[j])) j++;
          var nm = j < lines.length ? lines[j].match(RE) : null;
          if (nm) {
            var nIndent = nm[1].replace(/\t/g, '  ').length;
            if (nIndent <= rootIndent && !!nm[3] === rootOrdered) { i = j; continue; }
          }
        }
        break;
      }
      var indent = m[1].replace(/\t/g, '  ').length;
      var ordered = !!m[3];
      // 同一层级的另一种列表 → 属于新的列表，交给外层重新解析
      if (indent <= rootIndent && ordered !== rootOrdered) break;

      var text = m[4];
      var num = m[3] ? parseInt(m[3], 10) : 0;
      var task = text.match(/^\[( |x|X)\]\s*(.*)$/);
      if (task) text = task[2];

      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();

      var top = stack[stack.length - 1];
      var item = { text: text, children: null };
      if (task) item.task = task[1];
      if (indent > top.indent && top.node.items.length) {
        var parent = top.node.items[top.node.items.length - 1];
        parent.children = parent.children || { items: [], ordered: ordered, start: num || 1 };
        parent.children.items.push(item);
        stack.push({ indent: indent, node: parent.children });
      } else {
        top.node.items.push(item);
        top.indent = indent;
      }
      i++;
    }
    return { html: buildList(root.items, root.ordered, root.start), end: i };
  }

  /* ---------- 块级语法 ---------- */
  function render(src) {
    if (!src) return '';
    src = String(src).replace(/\r\n?/g, '\n');
    var lines = src.split('\n');
    var out = [];
    var i = 0;
    var usedIds = {};        // 同名标题自动加序号，保证锚点唯一

    while (i < lines.length) {
      var line = lines[i];

      // 代码块
      var fence = line.match(/^\s*(```|~~~)\s*([\w+#-]*)\s*$/);
      if (fence) {
        var marker = fence[1], lang = fence[2] || '';
        var buf = [];
        i++;
        while (i < lines.length && !new RegExp('^\\s*' + marker + '\\s*$').test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre class="code-block"' + (lang ? ' data-lang="' + escapeHtml(lang) + '"' : '') + '><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 空行
      if (/^\s*$/.test(line)) { i++; continue; }

      // 分割线
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { out.push('<hr>'); i++; continue; }

      // 标题
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = h[1].length;
        var id = slug(h[2]);
        if (usedIds[id]) { usedIds[id]++; id = id + '-' + usedIds[id]; }
        else { usedIds[id] = 1; }
        out.push('<h' + lv + ' id="' + id + '">' + inline(h[2]) + '</h' + lv + '>');
        i++;
        continue;
      }

      // 单独一行的图片：带标题时生成图注
      var im = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
      if (im) {
        var imgAlt = escapeHtml(im[1]);
        var imgSrc = escapeHtml(im[2]);
        var imgTitle = im[3] ? escapeHtml(im[3]) : '';
        if (imgTitle) {
          out.push('<figure class="fig"><img src="' + imgSrc + '" alt="' + imgAlt + '" loading="lazy" decoding="async">'
            + '<figcaption>' + imgTitle + '</figcaption></figure>');
        } else {
          out.push('<p><img src="' + imgSrc + '" alt="' + imgAlt + '" loading="lazy" decoding="async"></p>');
        }
        i++;
        continue;
      }

      // 表格
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].indexOf('-') !== -1) {
        var head = splitRow(line);
        var aligns = splitRow(lines[i + 1]).map(function (c) {
          if (/^:.*:$/.test(c.trim())) return 'center';
          if (/:$/.test(c.trim())) return 'right';
          return '';
        });
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        var t = '<div class="table-wrap"><table><thead><tr>';
        head.forEach(function (c, k) { t += '<th' + (aligns[k] ? ' style="text-align:' + aligns[k] + '"' : '') + '>' + inline(c) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>';
          head.forEach(function (_, k) { t += '<td>' + inline(r[k] === undefined ? '' : r[k]) + '</td>'; });
          t += '</tr>';
        });
        out.push(t + '</tbody></table></div>');
        continue;
      }

      // 引用
      if (/^\s*>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + render(q.join('\n')) + '</blockquote>');
        continue;
      }

      // 列表
      if (isLi(line)) {
        var res = collectList(lines, i);
        out.push(res.html);
        i = res.end;
        continue;
      }

      // B 站视频（必须单独占一行）
      var bili = null;
      var one = line.trim();
      if (/^@(?:bili|bilibili)\b/i.test(one)) bili = parseBili(one);
      else if (/^<iframe\b/i.test(one) && /bilibili/i.test(one)) bili = parseBili(one);
      else if (/^https?:\/\/\S+$/i.test(one) && /(bilibili\.com\/video\/|b23\.tv\/|player\.bilibili\.com)/i.test(one)) bili = parseBili(one);
      if (bili) { out.push(embedHtml(bili)); i++; continue; }

      // 段落
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
        !/^\s*(```|~~~)/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !isLi(lines[i]) &&
        !/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      if (para.length) out.push('<p>' + inline(joinLines(para)) + '</p>');
      else i++;
    }
    return out.join('\n');
  }

  /* 段落内的软换行：英文之间补空格，中文之间不补，避免出现多余空隙 */
  var CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;
  function joinLines(lines) {
    return lines.reduce(function (a, b) {
      if (!a) return b;
      var last = a.slice(-1), first = b.charAt(0);
      return a + (CJK.test(last) && CJK.test(first) ? '' : '\n') + b;
    }, '');
  }

  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return s.split('|').map(function (c) { return c.trim(); });
  }

  function slug(text) {
    return String(text).trim().toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  /* ---------- 解析文章头 ----------
   * 支持中文键与英文键，例如：
   *   标题: 你好
   *   title: Hello
   *   日期: 2026-01-01
   * 头部与正文之间用单独一行 --- 分隔
   */
  var KEY_MAP = {
    '标题': 'title', '题目': 'title', 'title': 'title', 'name': 'title',
    '日期': 'date', '时间': 'date', 'date': 'date',
    '标签': 'tags', '分类': 'tags', 'tag': 'tags', 'tags': 'tags',
    '摘要': 'summary', '简介': 'summary', '描述': 'summary', 'summary': 'summary', 'desc': 'summary',
    '封面': 'cover', '头图': 'cover', 'cover': 'cover', 'image': 'cover',
    '置顶': 'pinned', 'pinned': 'pinned', 'top': 'pinned',
    '作者': 'author', 'author': 'author',
    '草稿': 'draft', 'draft': 'draft'
  };

  function parsePost(text, fallbackTitle) {
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var meta = {}, body = text;
    var m = text.match(/^([\s\S]*?)\n\s*(?:-{3,}|={3,})\s*\n?([\s\S]*)$/);
    if (m && looksLikeHeader(m[1])) {
      meta = parseHeader(m[1]);
      body = m[2];
    } else if (looksLikeHeader(text.split('\n').slice(0, 12).join('\n')) && !/^#{1,6}\s/.test(text)) {
      // 没有分隔线的纯头部文件
      var split = text.split('\n');
      var headLines = [], k = 0;
      for (; k < split.length; k++) {
        if (/^\s*$/.test(split[k])) break;
        if (!/^\s*(#\s*)?[^\s:：]{1,8}\s*[:：]/.test(split[k])) break;
        headLines.push(split[k]);
      }
      if (headLines.length) { meta = parseHeader(headLines.join('\n')); body = split.slice(k).join('\n'); }
    }

    if (!meta.title) {
      var h1 = body.match(/^\s*#\s+(.+)$/m);
      meta.title = h1 ? h1[1].trim() : (fallbackTitle || '未命名文章');
    }
    meta.tags = normalizeTags(meta.tags);
    meta.pinned = /^(1|true|yes|是|置顶)$/i.test(String(meta.pinned || ''));
    meta.draft = /^(1|true|yes|是|草稿)$/i.test(String(meta.draft || ''));
    if (meta.date) meta.date = normalizeDate(meta.date);
    return { meta: meta, body: body.replace(/^\s*\n/, '') };
  }

  function looksLikeHeader(block) {
    var lines = block.split('\n').filter(function (l) { return !/^\s*$/.test(l); });
    if (!lines.length) return false;
    var hits = 0;
    lines.forEach(function (l) {
      if (/^\s*(#\s*)?(标题|题目|日期|时间|标签|分类|摘要|简介|描述|封面|头图|置顶|作者|草稿|title|name|date|tags?|summary|desc|cover|image|pinned|top|author|draft)\s*[:：]/i.test(l)) hits++;
    });
    return hits > 0 && hits >= Math.ceil(lines.length * 0.6);
  }

  function parseHeader(block) {
    var meta = {};
    block.split('\n').forEach(function (line) {
      var m = line.match(/^\s*#?\s*([^:：]{1,10})\s*[:：]\s*(.*)$/);
      if (!m) return;
      var key = KEY_MAP[m[1].trim().toLowerCase()] || KEY_MAP[m[1].trim()];
      if (!key) return;
      meta[key] = m[2].trim();
    });
    return meta;
  }

  function normalizeTags(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    return String(v).split(/[,，、;；\/|]+/).map(function (t) { return t.trim(); }).filter(Boolean);
  }

  function normalizeDate(v) {
    var s = String(v).trim().replace(/[./年]/g, '-').replace(/月/g, '-').replace(/日/g, '');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    var m2 = s.match(/^(\d{1,2})-(\d{1,2})/);
    if (m2) return new Date().getFullYear() + '-' + pad(m2[1]) + '-' + pad(m2[2]);
    return s;
  }
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }

  /* 纯文本摘要（去掉 Markdown 符号） */
  function plain(md, len) {
    var t = String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*`_~\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    len = len || 120;
    return t.length > len ? t.slice(0, len) + '…' : t;
  }

  global.MD = {
    render: render,
    inline: inline,
    escapeHtml: escapeHtml,
    parsePost: parsePost,
    parseBili: parseBili,
    biliSrc: biliSrc,
    slug: slug,
    plain: plain
  };
})(window);
