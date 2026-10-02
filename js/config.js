/* =========================================================
 *  站点配置  ——  改这里就能改整站外观与文案（不需要碰其他代码）
 * ========================================================= */
window.SITE_CONFIG = {
  /* 站点名称与副标题 */
  title: '墨渊Maris小站',
  shortName: '墨渊Maris',          /* 顶栏左上角显示的短名字 */
  subtitle: '一盏清茶，几行文字',
  description: '墨渊Maris 的个人小站，文章全部存放在 posts 文件夹里的 .txt 文件中。',

  /* 头像：图片路径，或 emoji（填 emoji 时自动画成圆形底色） */
  avatar: 'assets/avatar.png',
  avatarEmoji: '🌿',

  /* 站点图标 */
  favicon: 'assets/avatar.png',

  /* 文章清单：默认读取 posts/index.json；也可以直接写死一个数组 */
  postsIndex: 'posts/index.json',
  postsDir: 'posts/',

  /* 首页列表：是否显示一行摘要 / 一行标签 */
  showSummary: true,
  showTags: true,

  /* 背景：'gradient' 浅绿渐变（顶部柔光 + 竖向渐层）；'plain' 纯色 */
  background: 'gradient',

  /* B站视频：clickToPlay = true 时先显示封面，点了才加载播放器（更省流量） */
  video: {
    clickToPlay: false,
    autoplay: false,
    danmaku: true,        /* 是否显示弹幕 */
    highQuality: true     /* 是否优先高清 */
  },

  /* 背景动态特效（想关掉哪一个就把对应项改成 false；intensity 越大越明显） */
  effects: {
    enabled: true,      // 总开关
    glow: true,         // 跟随鼠标的柔光 + 背景缓慢游动的光斑
    trail: true,        // 鼠标划过时散出的几何图形
    ambient: true,      // 背景里慢慢漂浮、会被鼠标推开的线框几何
    intensity: 1        // 0.5 更淡，1.5 更明显
  },

  /* 关于页内容（Markdown） */
  about: [
    '## 关于我',
    '',
    '我是**墨渊Maris**，这里放一些随笔、笔记和碎碎念。',
    '',
    '小站是纯静态的：没有数据库、没有后台，所有文章都是 `posts/` 目录下的 `.txt` 文件。',
    '',
    '- 写文章：复制 `posts/_template.txt`，改文件名和开头几行',
    '',
    '> 慢一点，也很好。'
  ].join('\n'),

  /* 页脚 */
  footer: '© 2026 墨渊Maris小站 · 保留所有权利',
  /* 备案号之类的补充信息，留空则不显示 */
  footerNote: '',

  /* 本地文件模式下默认尝试读取的目录（仅 Chrome / Edge 支持） */
  enableLocalFolderMode: true,

  /* 主题："auto" 跟随系统 / "light" 浅绿 / "dark" 夜绿 */
  defaultTheme: 'auto',

  /* 导航栏（可自由增删）。注意：写作台是本地工具，不放在站点里 */
  nav: [
    { text: '首页', href: '#/' },
    { text: '标签', href: '#/tags' },
    { text: '关于', href: '#/about' }
  ]
};
