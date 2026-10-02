/* =========================================================
 *  store.js —— 文章数据层
 *  三种读取方式，自动降级：
 *   1) http    通过本地小服务器读取 posts/ 目录（推荐）
 *   2) folder  浏览器里直接选择 posts 文件夹（Chrome / Edge）
 *   3) drop    手动拖入 .txt 文件（任何浏览器都能用）
 * ========================================================= */
(function (global) {
  'use strict';

  var CFG = global.SITE_CONFIG || {};

  var Store = {
    mode: 'http',          // http | folder | dropped
    dirHandle: null,
    posts: [],
    tags: {},
    ready: false,

    /* ---------- 工具 ---------- */
    join: function (dir, name) { return (dir || '').replace(/\/?$/, '/') + name; },

    /* ---------- HTTP 模式 ---------- */
    loadHttp: function () {
      var self = this;
      self.mode = 'http';
      self.dirHandle = null;
      return fetch(self.join(CFG.postsDir, 'index.json'), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('index.json ' + r.status);
          return r.json();
        })
        .then(function (data) { return self.listFromIndex(data); })
        .catch(function () { return self.listFromDirectoryListing(); })
        .then(function (files) { return self.fetchAll(files); });
    },

    listFromIndex: function (data) {
      var arr = Array.isArray(data) ? data : (data && (data.posts || data.list)) || [];
      return arr.map(function (item) {
        return typeof item === 'string' ? { file: item } : Object.assign({}, item);
      }).filter(function (it) { return it && it.file; });
    },

    /* index.json 不存在时，尝试解析目录列表页面 */
    listFromDirectoryListing: function () {
      return fetch(joinDir(CFG.postsDir), { cache: 'no-store' })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var files = [];
          var re = /href="([^"]+\.txt)"/gi, m;
          while ((m = re.exec(html))) {
            var name = decodeURIComponent(m[1].split('/').pop());
            if (name.indexOf('_') !== 0) files.push({ file: name });
          }
          if (!files.length) throw new Error('empty');
          return files;
        });
    },

    fetchAll: function (files) {
      var self = this;
      return Promise.all(files.map(function (info) {
        var url = joinDir(CFG.postsDir) + encodeURIComponent(info.file).replace(/%2F/gi, '/');
        return fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); })
          .then(function (text) { return self.buildPost(info.file, text, info); })
          .catch(function (e) {
            console.warn('[store] 读取失败：' + info.file, e);
            return null;
          });
      })).then(function (list) { return self.finish(list.filter(Boolean)); });
    },

    /* ---------- 浏览器文件夹模式 ---------- */
    supported: function () {
      return typeof global.showDirectoryPicker === 'function';
    },

    pickFolder: function () {
      var self = this;
      if (!self.supported()) return Promise.reject(new Error('当前浏览器不支持直接选择文件夹，请使用 Chrome / Edge，或先启动本地服务器。'));
      return global.showDirectoryPicker({ id: 'blog-posts', mode: 'readwrite' })
        .then(function (handle) { return self.loadFolder(handle); });
    },

    loadFolder: function (handle) {
      var self = this;
      self.mode = 'folder';
      self.dirHandle = handle;
      return self.readFolder(handle);
    },

    readFolder: function (handle) {
      var self = this;
      var files = [];
      var indexText = null;
      var iter = handle.entries();
      function step() {
        return iter.next().then(function (res) {
          if (res.done) return;
          var name = res.value[0], entry = res.value[1];
          if (entry.kind === 'file' && /\.txt$/i.test(name) && name.indexOf('_') !== 0) {
            files.push({ file: name, handle: entry });
          } else if (entry.kind === 'file' && name.toLowerCase() === 'index.json') {
            files.push({ index: true, handle: entry });
          }
          return step();
        });
      }
      return step().then(function () {
        var posts = files.filter(function (f) { return !f.index; });
        var idx = files.find(function (f) { return f.index; });
        if (idx) {
          return idx.handle.getFile().then(function (f) { return f.text(); })
            .then(function (t) { indexText = t; })
            .catch(function () { indexText = null; })
            .then(function () { return posts; });
        }
        return posts;
      }).then(function (posts) {
        return Promise.all(posts.map(function (p) {
          return p.handle.getFile().then(function (f) { return f.text(); })
            .then(function (text) { return self.buildPost(p.file, text, { handle: p.handle }); })
            .catch(function () { return null; });
        })).then(function (list) { return self.finish(list.filter(Boolean)); });
      });
    },

    /* ---------- 拖拽文件模式 ---------- */
    loadDropped: function (fileList) {
      var self = this;
      var files = Array.prototype.slice.call(fileList).filter(function (f) { return /\.txt$/i.test(f.name); });
      if (!files.length) return Promise.reject(new Error('没有找到 .txt 文件'));
      self.mode = 'dropped';
      self.dirHandle = null;
      return Promise.all(files.map(function (f) {
        return f.text().then(function (t) { return self.buildPost(f.name, t, {}); });
      })).then(function (list) { return self.finish(list); });
    },

    /* index.json 直接拖进来 */
    loadDroppedAll: function (fileList) {
      var all = Array.prototype.slice.call(fileList);
      var idxFile = all.find(function (f) { return /index\.json$/i.test(f.name); });
      var self = this;
      if (!idxFile) return self.loadDropped(all);
      return idxFile.text().then(function (t) {
        var data; try { data = JSON.parse(t); } catch (e) { data = null; }
        var names = data ? self.listFromIndex(data).map(function (i) { return i.file; }) : [];
        var map = {};
        all.forEach(function (f) { map[f.name] = f; });
        var chosen = names.map(function (n) { return map[n]; }).filter(Boolean);
        if (!chosen.length) chosen = all.filter(function (f) { return /\.txt$/i.test(f.name); });
        self.mode = 'dropped';
        return Promise.all(chosen.map(function (f) {
          return f.text().then(function (t) { return self.buildPost(f.name, t, {}); });
        })).then(function (list) { return self.finish(list); });
      });
    },

    /* ---------- 组装一篇文章 ---------- */
    buildPost: function (file, text, info) {
      info = info || {};
      var parsed = global.MD.parsePost(text, file.replace(/\.txt$/i, ''));
      var meta = parsed.meta;
      // index.json 里的字段可以覆盖 txt 头部
      ['title', 'date', 'summary', 'cover', 'author'].forEach(function (k) {
        if (info[k]) meta[k] = info[k];
      });
      if (info.tags) meta.tags = [].concat(info.tags);
      if (info.pinned !== undefined) meta.pinned = !!info.pinned;

      var body = parsed.body;
      var words = body.replace(/\s/g, '').length;
      return {
        file: file,
        slug: file.replace(/\.txt$/i, ''),
        title: meta.title,
        date: meta.date || '',
        tags: meta.tags || [],
        summary: meta.summary || global.MD.plain(body, 110),
        cover: meta.cover || '',
        author: meta.author || '',
        pinned: !!meta.pinned,
        draft: !!meta.draft,
        body: body,
        html: global.MD.render(body),
        words: words,
        minutes: Math.max(1, Math.round(words / 350)),
        raw: text
      };
    },

    /* ---------- 排序 / 索引 ---------- */
    finish: function (list) {
      var self = this;
      self.posts = list;
      self.posts.sort(function (a, b) {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return a.slug < b.slug ? 1 : -1;
      });
      self.tags = {};
      self.posts.forEach(function (p) {
        p.tags.forEach(function (t) { self.tags[t] = (self.tags[t] || 0) + 1; });
      });
      self.ready = true;
      return self.posts;
    },

    find: function (slug) {
      return this.posts.find(function (p) { return p.slug === slug; }) || null;
    },

    neighbors: function (slug) {
      var i = this.posts.findIndex(function (p) { return p.slug === slug; });
      return {
        prev: i > 0 ? this.posts[i - 1] : null,          // 更新的一篇
        next: i >= 0 && i < this.posts.length - 1 ? this.posts[i + 1] : null
      };
    },

    tagList: function () {
      var t = this.tags;
      return Object.keys(t).sort(function (a, b) { return t[b] - t[a] || (a < b ? -1 : 1); });
    },

    /* ---------- 写回文件（文件夹模式 / 下载） ---------- */
    saveFile: function (name, text) {
      var self = this;
      if (self.mode === 'folder' && self.dirHandle) {
        return self.dirHandle.getFileHandle(name, { create: true })
          .then(function (h) { return h.createWritable(); })
          .then(function (w) { return w.write(text).then(function () { return w.close(); }); })
          .then(function () { return { ok: true, how: 'folder', name: name }; });
      }
      download(name, text);
      return Promise.resolve({ ok: true, how: 'download', name: name });
    },

    exists: function (name) {
      var self = this;
      if (self.mode === 'folder' && self.dirHandle) {
        return self.dirHandle.getFileHandle(name).then(function () { return true; }).catch(function () { return false; });
      }
      return Promise.resolve(false);
    },

    /* 生成 index.json 内容 */
    buildIndex: function (names) {
      var list = names || this.posts.map(function (p) { return p.file; });
      return JSON.stringify({
        _说明: '文章清单：数组里每一项是 posts 目录下的 txt 文件名。新增文章时把文件名加进来即可。',
        posts: list
      }, null, 2) + '\n';
    }
  };

  function joinDir(dir) { return (dir || '').replace(/\/?$/, '/'); }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  Store.download = download;
  global.BlogStore = Store;
})(window);
