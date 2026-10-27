/*
 * dsh-fatfish-level · 浏览器半区（无依赖，直接由服务端下发）
 *
 * 游戏化版本：
 *  - 右下角铭牌：等级、称号、连击火苗、升级进度；
 *  - 点开是三页面板：成长 / 今日 / 成就；
 *  - 今日任务、每日目标环、连击、成就徽章、个人记录；
 *  - 升级撒花 + 小鲸鱼头顶皇冠，等级越高装饰越亮。
 *
 * 数据：
 *  - 等级 / 累计 / 今日 / 模型：`/dsh-fatfish-level/state.json`
 *  - 历史逐轮（连击、单轮纪录、深夜/早起）：只读 `/dsh-whale/usage-records.json`
 *  - 成就解锁、单轮纪录、装饰开关：浏览器 localStorage
 */
(function () {
  'use strict'

  if (window.__dshFatfishLevel) return
  window.__dshFatfishLevel = true

  var API = '/dsh-fatfish-level/state.json'
  var WHALE_API = '/dsh-whale/usage-records.json'
  var POLL_MS = 8000
  var HISTORY_MS = 45000
  var CHAT_SELECTOR =
    '[data-composer-input],[data-composer-seat],[data-composer-card],[role="textbox"][aria-multiline="true"]'
  var DAILY_GOAL = 20000000
  var STORE_ACHV = 'dshf.achv'
  var STORE_MAXTURN = 'dshf.maxTurn'
  var STORE_HOURS = 'dshf.hourMask'
  var STORE_FX = 'dshf.fx'

  var TIERS = [
    { min: 1, max: 3, name: '幼苗期' },
    { min: 4, max: 6, name: '肥鱼期' },
    { min: 7, max: 9, name: '鲸鱼期' },
    { min: 10, max: 11, name: '星海期' },
    { min: 12, max: 14, name: '宇宙期' },
  ]

  // 与 lib/levels.js 的 LADDER.atLeast 逐项一致；测试会比对，改一边必须改另一边。
  // Lv.2–4 约 3～4 倍，Lv.5–7 约 2 倍，Lv.8 起 3～4 倍，顶级 1 万亿。
  var THRESHOLDS = [
    0,
    3000000,
    12000000,
    40000000,
    100000000,
    220000000,
    400000000,
    1000000000,
    3000000000,
    10000000000,
    30000000000,
    100000000000,
    300000000000,
    1000000000000,
  ]

  // 只给预览 / 测试比对用，不参与业务。
  window.__dshFatfishThresholds = THRESHOLDS.slice()

  // DeepSeek 官方鲸鱼矢量路径（DSH FishLogo，viewBox 23.16 × 17.04）。
  // 用它按等级改色、放大和加装饰，19px / 32px / 64px 都清晰。
  var FISH_W = 23.16
  var FISH_H = 17.04
  var FISH_PATH = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z"
  var iconSeq = 0
  var iconCache = {}

  var ACHIEVEMENTS = [
    { id: 'first_bite', icon: '🐣', name: '初尝鱼味', desc: '累计烧掉 1 万 token', target: 1e4, kind: 'tokens', value: function (c) { return c.total } },
    { id: 'million', icon: '🍬', name: '百万俱乐部', desc: '累计烧掉 100 万 token', target: 1e6, kind: 'tokens', value: function (c) { return c.total } },
    { id: 'hundred_million', icon: '💎', name: '亿级玩家', desc: '累计烧掉 1 亿 token', target: 1e8, kind: 'tokens', value: function (c) { return c.total } },
    { id: 'billion', icon: '🌊', name: '十亿巨浪', desc: '累计烧掉 10 亿 token', target: 1e9, kind: 'tokens', value: function (c) { return c.total } },
    { id: 'big_bite', icon: '🍰', name: '一口千万', desc: '单轮烧掉 1000 万 token', target: 1e7, kind: 'tokens', value: function (c) { return c.maxTurn } },
    { id: 'day_100m', icon: '☀️', name: '日破亿', desc: '单日烧掉 1 亿 token', target: 1e8, kind: 'tokens', value: function (c) { return c.maxDay } },
    { id: 'streak_3', icon: '🎯', name: '三连击', desc: '连续 3 天有消耗', target: 3, kind: 'count', value: function (c) { return c.bestStreak } },
    { id: 'streak_7', icon: '🏅', name: '七日不断', desc: '连续 7 天有消耗', target: 7, kind: 'count', value: function (c) { return c.bestStreak } },
    { id: 'night_owl', icon: '🌙', name: '深夜摸鱼', desc: '在 23–6 点烧过 token', target: 1, kind: 'flag', value: function (c) { return c.night ? 1 : 0 } },
    { id: 'early_bird', icon: '🌅', name: '早起的鱼', desc: '在 5–8 点烧过 token', target: 1, kind: 'flag', value: function (c) { return c.early ? 1 : 0 } },
    { id: 'models_3', icon: '🧃', name: '三栖燃料', desc: '用过 3 个不同模型', target: 3, kind: 'count', value: function (c) { return c.modelCount } },
    { id: 'level_6', icon: '👑', name: '大肥鱼本鱼', desc: '达到 Lv.6 大肥鱼', target: 6, kind: 'level', value: function (c) { return c.lv } },
    { id: 'level_10', icon: '🌌', name: '吞星预备役', desc: '达到 Lv.10 吞星鲸', target: 10, kind: 'level', value: function (c) { return c.lv } },
    { id: 'turns_100', icon: '🕹️', name: '百轮老玩家', desc: '累计烧满 100 轮', target: 100, kind: 'count', value: function (c) { return c.turns } },
  ]

  var CSS = [
    '.dshf-root{position:fixed;right:16px;bottom:16px;z-index:10000;width:0;height:0;pointer-events:none;--dshf-accent:#5aa9ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#203170;line-height:1.5}',
    '.dshf-root[hidden]{display:none!important}',
    '.dshf-pill{pointer-events:auto;position:absolute;right:0;bottom:0;display:inline-flex;align-items:center;gap:6px;height:33px;padding:0 13px 2px 10px;border-radius:999px;border:1px solid rgba(32,49,112,.16);background:rgba(255,255,255,.88);-webkit-backdrop-filter:blur(14px) saturate(1.25);backdrop-filter:blur(14px) saturate(1.25);box-shadow:0 6px 18px rgba(32,49,112,.15),0 1px 0 rgba(255,255,255,.7) inset;color:#203170;font:inherit;font-size:12.5px;font-weight:600;line-height:1;white-space:nowrap;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,opacity .2s ease}',
    '.dshf-pill:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(32,49,112,.22),0 1px 0 rgba(255,255,255,.7) inset}',
    '.dshf-pill:focus-visible{outline:2px solid var(--dshf-accent);outline-offset:2px}',
    '.dshf-pill-icon{width:19px;height:19px;flex:0 0 auto;display:block;transform-origin:50% 60%}',
    '.dshf-pill-icon svg{display:block;width:19px;height:19px}',
    '.dshf-lv{color:var(--dshf-accent);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.2px}',
    '.dshf-name{max-width:88px;overflow:hidden;text-overflow:ellipsis;color:#34457a}',
    '.dshf-flame{font-size:11.5px;font-weight:700;color:#f0743a;font-variant-numeric:tabular-nums}',
    '.dshf-mini{position:absolute;left:10px;right:12px;bottom:3px;height:2.5px;border-radius:99px;background:rgba(32,49,112,.1);overflow:hidden}',
    '.dshf-mini i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--dshf-accent),#7de3c3);transition:width .6s cubic-bezier(.22,1,.36,1)}',
    '.dshf-root.dshf-stale .dshf-pill{opacity:.62}',
    '.dshf-panel{pointer-events:auto;position:absolute;right:0;bottom:42px;box-sizing:border-box;width:348px;max-width:calc(100vw - 24px);max-height:min(86vh,780px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(32,49,112,.25) transparent;padding:16px 16px 12px;border-radius:18px;border:1px solid rgba(32,49,112,.14);background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(20px) saturate(1.2);backdrop-filter:blur(20px) saturate(1.2);box-shadow:0 24px 64px rgba(20,35,80,.24),0 2px 8px rgba(20,35,80,.08);opacity:0;transform:translateY(7px) scale(.99);transition:opacity .18s ease,transform .18s ease}',
    '.dshf-panel[hidden]{display:none!important}',
    '.dshf-panel.dshf-open{opacity:1;transform:none}',
    '.dshf-head{display:flex;align-items:center;gap:11px}',
    '.dshf-avatar-wrap{position:relative;flex:0 0 auto;width:52px;height:52px;display:grid;place-items:center}',
    '.dshf-ring{position:absolute;inset:0;width:52px;height:52px;transform:rotate(-90deg)}',
    '.dshf-ring circle{fill:none;stroke-width:3}',
    '.dshf-ring-bg{stroke:rgba(32,49,112,.1)}',
    '.dshf-ring-fill{stroke:var(--dshf-accent);stroke-linecap:round;stroke-dasharray:157.08;stroke-dashoffset:157.08;transition:stroke-dashoffset .6s ease}',
    '.dshf-avatar{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#eef5ff,#fff);border:1px solid rgba(32,49,112,.1);box-shadow:0 2px 6px rgba(32,49,112,.06) inset}',
    '.dshf-avatar-icon{width:32px;height:32px;display:block;line-height:1}',
    '.dshf-avatar-icon svg{display:block;width:32px;height:32px}',
    '.dshf-headtext{flex:1;min-width:0}',
    '.dshf-title{display:flex;align-items:baseline;gap:6px;font-size:17px;font-weight:800;letter-spacing:.2px;color:#1b2a5e;white-space:nowrap}',
    '.dshf-title .dshf-tlv{color:var(--dshf-accent);font-variant-numeric:tabular-nums}',
    '.dshf-tier{font-size:9px;font-weight:700;color:var(--dshf-accent);background:rgba(90,169,255,.12);padding:2px 6px;border-radius:6px;letter-spacing:.05em}',
    '.dshf-sub{margin-top:1px;font-size:11.5px;color:#8b96b6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dshf-close{flex:0 0 auto;width:28px;height:28px;display:grid;place-items:center;border:none;border-radius:9px;background:transparent;color:#8b96b6;font-size:18px;line-height:1;cursor:pointer;font-family:inherit}',
    '.dshf-close:hover{background:#f0f4ff;color:#34457a}',
    '.dshf-chips{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}',
    '.dshf-chip{border:none;background:#f5f8ff;color:#5b6a92;font:inherit;font-size:10.5px;font-weight:600;padding:4px 8px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;transition:background .15s ease,color .15s ease}',
    '.dshf-chip:hover{background:#e9f0ff;color:#34457a}',
    '.dshf-xp{margin-top:12px;padding:12px 13px 11px;border-radius:14px;border:1px solid rgba(32,49,112,.08);background:linear-gradient(180deg,#f8fbff,#f1f6ff)}',
    '.dshf-xptop{display:flex;align-items:baseline;gap:4px}',
    '.dshf-total{font-size:25px;font-weight:800;letter-spacing:-.4px;color:#1b2a5e;font-variant-numeric:tabular-nums}',
    '.dshf-unit{font-size:11px;font-weight:600;color:#8b96b6;letter-spacing:.02em}',
    '.dshf-track{margin-top:9px;height:8px;border-radius:99px;background:rgba(32,49,112,.1);overflow:hidden}',
    '.dshf-fill{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--dshf-accent),#7de3c3);transition:width .6s cubic-bezier(.22,1,.36,1)}',
    '.dshf-xpfoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;font-size:11px;color:#6c7a9c}',
    '.dshf-pct{font-variant-numeric:tabular-nums;font-weight:700;color:var(--dshf-accent)}',
    '.dshf-tabs{display:flex;gap:4px;margin-top:12px;padding:3px;background:#f3f6fd;border-radius:11px}',
    '.dshf-tab{flex:1;border:none;background:transparent;border-radius:8px;padding:6px 0;font:inherit;font-size:11.5px;font-weight:600;color:#7b87a8;cursor:pointer;position:relative;transition:background .15s ease,color .15s ease}',
    '.dshf-tab.on{background:#fff;color:#203170;box-shadow:0 1px 4px rgba(32,49,112,.12)}',
    '.dshf-newdot{position:absolute;top:4px;right:calc(50% - 26px);width:6px;height:6px;border-radius:50%;background:#ff5c7a}',
    '.dshf-view{display:block}',
    '.dshf-view[hidden]{display:none}',
    '.dshf-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}',
    '.dshf-stat{padding:8px 10px 7px;border-radius:12px;border:1px solid rgba(32,49,112,.07);background:#fbfcff}',
    '.dshf-stat b{display:block;font-size:15px;font-weight:700;letter-spacing:-.2px;color:#24345f;font-variant-numeric:tabular-nums}',
    '.dshf-stat span{display:block;margin-top:1px;font-size:10.5px;color:#8a96b5}',
    '.dshf-sec{display:flex;align-items:center;justify-content:space-between;margin:14px 2px 8px;font-size:11px;font-weight:700;color:#8b96b6;letter-spacing:.06em}',
    '.dshf-sec em{font-style:normal;font-weight:500;letter-spacing:0;font-size:10.5px;color:#a4aec8}',
    '.dshf-goalcard{margin-top:11px;padding:11px 12px;border-radius:13px;border:1px solid rgba(32,49,112,.07);background:linear-gradient(135deg,rgba(90,169,255,.1),rgba(125,227,195,.1))}',
    '.dshf-goaltop{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
    '.dshf-goaltop b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;color:#1b2a5e}',
    '.dshf-goaltop span{font-size:10.5px;color:#7b87a8}',
    '.dshf-goalbar{margin-top:8px;height:6px;border-radius:99px;background:rgba(32,49,112,.1);overflow:hidden}',
    '.dshf-goalbar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--dshf-accent),#7de3c3);transition:width .6s cubic-bezier(.22,1,.36,1)}',
    '.dshf-goalnote{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:10.5px;color:#6c7a9c}',
    '.dshf-quests{display:flex;flex-direction:column;gap:7px}',
    '.dshf-quest{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:11px;background:#fbfcff;border:1px solid rgba(32,49,112,.06)}',
    '.dshf-quest.done{background:linear-gradient(90deg,rgba(125,227,195,.14),#fbfcff);border-color:rgba(18,184,134,.25)}',
    '.dshf-qicon{flex:0 0 auto;width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:#f3f7ff;font-size:14px}',
    '.dshf-qbody{flex:1;min-width:0}',
    '.dshf-qname{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#3a4a72}',
    '.dshf-qname b{font-weight:600}',
    '.dshf-qname span{color:#98a3c0;font-variant-numeric:tabular-nums;font-size:10px}',
    '.dshf-qbar{margin-top:4px;height:4px;border-radius:99px;background:rgba(32,49,112,.08);overflow:hidden}',
    '.dshf-qbar i{display:block;height:100%;width:0;border-radius:99px;background:var(--dshf-accent);opacity:.8;transition:width .5s ease}',
    '.dshf-qcheck{flex:0 0 auto;width:17px;height:17px;display:grid;place-items:center;border-radius:50%;font-size:10px;color:#fff;background:rgba(32,49,112,.14)}',
    '.dshf-quest.done .dshf-qcheck{background:#12b886}',
    '.dshf-models{display:flex;flex-direction:column;gap:7px}',
    '.dshf-mrow{display:flex;align-items:center;gap:8px;font-size:11.5px}',
    '.dshf-mname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#3a4a72}',
    '.dshf-mbar{flex:0 0 auto;width:62px;height:4px;border-radius:99px;background:rgba(32,49,112,.08);overflow:hidden}',
    '.dshf-mbar i{display:block;height:100%;width:0;border-radius:99px;background:var(--dshf-accent);opacity:.72}',
    '.dshf-mtokens{flex:0 0 auto;width:56px;text-align:right;color:#65739a;font-variant-numeric:tabular-nums}',
    '.dshf-empty{font-size:11px;color:#a4aec8;padding:2px}',
    '.dshf-seedtext{margin-top:8px;padding:0 2px;font-size:10.5px;color:#95a0bd}',
    '.dshf-ladder{display:flex;flex-direction:column;gap:1px;max-height:252px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(32,49,112,.22) transparent;padding-right:2px}',
    '.dshf-lrow{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:9px;font-size:11.5px;color:#55628a;transition:background .15s ease}',
    '.dshf-lrow .dshf-licon{flex:0 0 auto;width:20px;height:20px;display:block}',
    '.dshf-lrow .dshf-licon svg{display:block;width:20px;height:20px}',
    '.dshf-lrow .dshf-llv{flex:0 0 auto;width:34px;font-weight:700;font-variant-numeric:tabular-nums;color:#9aa7c7}',
    '.dshf-lrow .dshf-lname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dshf-lrow .dshf-lneed{flex:0 0 auto;font-size:10.5px;color:#a4aec8;font-variant-numeric:tabular-nums}',
    '.dshf-lrow.reached{color:#2f3c63}',
    '.dshf-lrow.current{background:linear-gradient(90deg,rgba(90,169,255,.16),rgba(125,227,195,.13));color:#1b2a5e;font-weight:700}',
    '.dshf-lrow.current .dshf-llv{color:var(--dshf-accent)}',
    '.dshf-lrow.current .dshf-lneed{color:var(--dshf-accent);font-weight:700}',
    '.dshf-lrow.locked{opacity:.55}',
    '.dshf-badges{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
    '.dshf-badge{padding:8px 9px 7px;border-radius:12px;background:#fbfcff;border:1px solid rgba(32,49,112,.07);opacity:.78}',
    '.dshf-badge.unlocked{opacity:1;background:linear-gradient(160deg,rgba(90,169,255,.11),#fff);border-color:rgba(90,169,255,.3)}',
    '.dshf-bhead{display:flex;align-items:center;gap:6px;min-width:0}',
    '.dshf-bicon{font-size:16px;line-height:1;flex:0 0 auto}',
    '.dshf-bhead b{font-size:11px;font-weight:700;color:#2f3c63;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dshf-badge.unlocked .dshf-bhead b{color:#1b2a5e}',
    '.dshf-bdesc{margin-top:2px;font-size:9.5px;color:#98a3c0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dshf-bbar{margin-top:5px;height:3px;border-radius:99px;background:rgba(32,49,112,.08);overflow:hidden}',
    '.dshf-bbar i{display:block;height:100%;width:0;border-radius:99px;background:var(--dshf-accent);opacity:.65}',
    '.dshf-badge.unlocked .dshf-bbar i{background:#12b886;opacity:.9}',
    '.dshf-records{display:flex;flex-direction:column;gap:1px}',
    '.dshf-rec{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 2px;font-size:11px;color:#55628a;border-bottom:1px dashed rgba(32,49,112,.07)}',
    '.dshf-rec b{font-weight:700;color:#24345f;font-variant-numeric:tabular-nums}',
    '.dshf-hint{margin-top:10px;font-size:10px;line-height:1.6;color:#a4aec8}',
    '.dshf-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed rgba(32,49,112,.12);font-size:10.5px;color:#95a0bd}',
    '.dshf-foot .dshf-note{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dshf-footbtns{flex:0 0 auto;display:flex;gap:5px}',
    '.dshf-fx,.dshf-refresh{border:none;border-radius:8px;padding:4px 9px;background:#f1f5ff;color:#4a5a86;font:inherit;font-size:10.5px;cursor:pointer;transition:background .15s ease,opacity .15s ease}',
    '.dshf-fx:hover,.dshf-refresh:hover{background:#e7efff}',
    '.dshf-fx[aria-pressed="false"]{opacity:.5}',
    '.dshf-refresh[disabled]{opacity:.5;cursor:default}',
    '.dshf-toast{pointer-events:none;position:absolute;right:0;bottom:44px;display:flex;align-items:center;gap:7px;max-width:calc(100vw - 24px);padding:9px 14px;border-radius:999px;background:linear-gradient(135deg,#203170,#3a57b5);color:#fff;font-size:12.5px;font-weight:700;white-space:nowrap;box-shadow:0 16px 34px rgba(32,49,112,.32);opacity:0;transform:translateY(8px);transition:opacity .24s ease,transform .24s ease}',
    '.dshf-toast.show{opacity:1;transform:none}',
    '.dshf-cheer{pointer-events:none;position:absolute;right:0;bottom:46px;display:flex;align-items:flex-start;gap:8px;max-width:min(292px,calc(100vw - 40px));padding:9px 13px;border-radius:13px;border:1px solid rgba(32,49,112,.14);background:#fff;box-shadow:0 14px 30px rgba(32,49,112,.22);opacity:0;transform:translateY(8px) scale(.97);transition:opacity .22s ease,transform .22s ease;z-index:10060}',
    '.dshf-cheer.show{opacity:1;transform:none}',
    '.dshf-cheer::after{content:"";position:absolute;right:16px;bottom:-6px;width:11px;height:11px;background:#fff;border-right:1px solid rgba(32,49,112,.14);border-bottom:1px solid rgba(32,49,112,.14);transform:rotate(45deg)}',
    '.dshf-cheer-ico{flex:0 0 auto;width:24px;height:24px;display:block}',
    '.dshf-cheer-ico svg{display:block;width:24px;height:24px}',
    '.dshf-cheer-text{min-width:0}',
    '.dshf-cheer b{display:block;font-size:12px;font-weight:800;color:#1b2a5e}',
    '.dshf-cheer span{display:block;margin-top:1px;font-size:10.5px;color:#7b87a8}',
    '.dshf-confetti{position:absolute;right:0;bottom:16px;width:0;height:0;pointer-events:none;z-index:10070}',
    '.dshf-confetti i{position:absolute;left:0;top:0;width:6px;height:6px;border-radius:2px;background:var(--dshf-accent);animation:dshf-confetti .95s cubic-bezier(.2,.7,.4,1) forwards}',
    '.dshf-aura{position:fixed;left:0;top:0;pointer-events:none;border-radius:50%;z-index:9998;opacity:0;transition:opacity .4s ease;filter:blur(10px)}',
    '.dshf-crown{position:fixed;left:0;top:0;pointer-events:none;z-index:10003;font-size:20px;line-height:1;opacity:0;transition:opacity .25s ease;filter:drop-shadow(0 2px 4px rgba(32,49,112,.28))}',
    '.dshf-crown.on{opacity:1;animation:dshf-crown-bob 3.2s ease-in-out infinite}',
    '.dshf-crown.pop{animation:dshf-crown-pop .7s ease}',
    '@keyframes dshf-confetti{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot));opacity:0}}',
    '@keyframes dshf-crown-bob{0%,100%{transform:translate(-50%,-100%) rotate(-9deg)}50%{transform:translate(-50%,calc(-100% - 3px)) rotate(-4deg)}}',
    '@keyframes dshf-crown-pop{0%{transform:translate(-50%,-100%) scale(.5) rotate(-20deg)}60%{transform:translate(-50%,-100%) scale(1.25) rotate(4deg)}100%{transform:translate(-50%,-100%) scale(1) rotate(-9deg)}}',
    '@keyframes dshf-pop{0%{transform:scale(.94)}55%{transform:scale(1.05)}100%{transform:scale(1)}}',
    '@keyframes dshf-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}55%{transform:rotate(10deg)}80%{transform:rotate(-4deg)}}',
    '.dshf-pill.dshf-pop{animation:dshf-pop .52s cubic-bezier(.22,1,.36,1)}',
    '.dshf-pill.dshf-pop .dshf-pill-icon{animation:dshf-wiggle .62s ease}',
    '@media (max-width:720px){.dshf-name,.dshf-flame{display:none}}',
    '@media (prefers-reduced-motion:reduce){.dshf-pill,.dshf-fill,.dshf-panel,.dshf-toast,.dshf-cheer,.dshf-goalbar i,.dshf-qbar i,.dshf-bbar i{transition:none!important}.dshf-pill.dshf-pop,.dshf-pill.dshf-pop .dshf-pill-icon,.dshf-confetti i,.dshf-crown.on,.dshf-crown.pop{animation:none!important}}',
  ].join('\n')

  var TEMPLATE = [
    '<button class="dshf-pill" type="button" aria-haspopup="dialog" aria-expanded="false" title="大肥鱼等级">',
    '  <span class="dshf-pill-icon" aria-hidden="true"></span>',
    '  <span class="dshf-lv">Lv.–</span>',
    '  <span class="dshf-name"></span>',
    '  <span class="dshf-flame" hidden></span>',
    '  <span class="dshf-mini" aria-hidden="true"><i></i></span>',
    '</button>',
    '<div class="dshf-panel" role="dialog" aria-label="大肥鱼等级" hidden>',
    '  <div class="dshf-head">',
    '    <div class="dshf-avatar-wrap">',
    '      <svg class="dshf-ring" viewBox="0 0 56 56" aria-hidden="true">',
    '        <circle class="dshf-ring-bg" cx="28" cy="28" r="25"></circle>',
    '        <circle class="dshf-ring-fill" cx="28" cy="28" r="25"></circle>',
    '      </svg>',
    '      <div class="dshf-avatar" aria-hidden="true"><span class="dshf-avatar-icon"></span></div>',
    '    </div>',
    '    <div class="dshf-headtext">',
    '      <div class="dshf-title"><span class="dshf-tlv">Lv.–</span><span class="dshf-tname">加载中</span><span class="dshf-tier" hidden></span></div>',
    '      <div class="dshf-sub">正在读取本机 token 账本…</div>',
    '    </div>',
    '    <button class="dshf-close" type="button" aria-label="关闭">×</button>',
    '  </div>',
    '  <div class="dshf-chips">',
    '    <button class="dshf-chip" type="button" data-go="badges"><span class="dshf-chip-streak">🔥 —</span></button>',
    '    <button class="dshf-chip" type="button" data-go="today"><span class="dshf-chip-goal">🎯 —</span></button>',
    '    <button class="dshf-chip" type="button" data-go="badges"><span class="dshf-chip-badge">🏆 0/0</span></button>',
    '  </div>',
    '  <div class="dshf-xp">',
    '    <div class="dshf-xptop"><span class="dshf-total">0</span><span class="dshf-unit">tokens 累计</span></div>',
    '    <div class="dshf-track" role="progressbar" aria-label="升级进度"><div class="dshf-fill"></div></div>',
    '    <div class="dshf-xpfoot"><span class="dshf-remain">—</span><span class="dshf-pct">0%</span></div>',
    '  </div>',
    '  <div class="dshf-tabs" role="tablist">',
    '    <button class="dshf-tab on" type="button" role="tab" data-tab="growth">成长</button>',
    '    <button class="dshf-tab" type="button" role="tab" data-tab="today">今日</button>',
    '    <button class="dshf-tab" type="button" role="tab" data-tab="badges">成就<i class="dshf-newdot" hidden></i></button>',
    '  </div>',
    '  <section class="dshf-view" data-view="growth">',
    '    <div class="dshf-stats">',
    '      <div class="dshf-stat"><b class="dshf-s-today">—</b><span>今日烧掉</span></div>',
    '      <div class="dshf-stat"><b class="dshf-s-week">—</b><span>近七日</span></div>',
    '      <div class="dshf-stat"><b class="dshf-s-turns">—</b><span>已烧轮数</span></div>',
    '      <div class="dshf-stat"><b class="dshf-s-avg">—</b><span>平均每轮</span></div>',
    '    </div>',
    '    <div class="dshf-seedtext" hidden></div>',
    '    <div class="dshf-sec">等级阶梯 <em>按累计 token 量级</em></div>',
    '    <div class="dshf-ladder"></div>',
    '  </section>',
    '  <section class="dshf-view" data-view="today" hidden>',
    '    <div class="dshf-goalcard">',
    '      <div class="dshf-goaltop"><b class="dshf-goal-today">—</b><span class="dshf-goal-target">/ 2000万</span></div>',
    '      <div class="dshf-goalbar"><i></i></div>',
    '      <div class="dshf-goalnote"><span class="dshf-goal-remain">—</span><span class="dshf-goal-days">—</span></div>',
    '    </div>',
    '    <div class="dshf-sec">今日任务 <em>每天 0 点刷新</em></div>',
    '    <div class="dshf-quests"></div>',
    '    <div class="dshf-sec">主要燃料 <em>按累计 token</em></div>',
    '    <div class="dshf-models"></div>',
    '  </section>',
    '  <section class="dshf-view" data-view="badges" hidden>',
    '    <div class="dshf-sec">成就徽章 <em class="dshf-achcount"></em></div>',
    '    <div class="dshf-badges"></div>',
    '    <div class="dshf-sec">个人记录</div>',
    '    <div class="dshf-records"></div>',
    '    <div class="dshf-hint">连击、单轮纪录与深夜/早起来自本机小鲸鱼账本（只读）；没装小鲸鱼时，从本次观察开始累计。</div>',
    '  </section>',
    '  <div class="dshf-foot">',
    '    <span class="dshf-note">输入 + 缓存 + 输出 · 只存本机</span>',
    '    <div class="dshf-footbtns">',
    '      <button class="dshf-fx" type="button" aria-pressed="true" title="显示小鲸鱼装饰">✨</button>',
    '      <button class="dshf-refresh" type="button">刷新</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="dshf-toast" role="status" aria-live="polite"></div>',
    '<div class="dshf-cheer" hidden><span class="dshf-cheer-ico"></span><div class="dshf-cheer-text"><b></b><span class="dshf-cheer-sub"></span></div></div>',
    '<div class="dshf-confetti" aria-hidden="true"></div>',
  ].join('')

  var rootEl = null
  var fxEls = null
  var refs = {}
  var state = null
  var history = null
  var prevLv = null
  var open = false
  var mounted = false
  var busy = false
  var historyBusy = false
  var timer = null
  var historyTimer = null
  var ladderRows = {}
  var ladderKey = ''
  var lastScrolledLv = null
  var toastTimer = null
  var toastQueue = []
  var toastBusy = false
  var cheerTimer = null
  var closeTimer = null
  var confettiTimer = null
  var silentUntil = 0
  var newBadges = false
  var currentTab = 'growth'
  var fxOn = true
  var achvUnlocked = null

  // ---------------------------------------------------------------- 基础工具

  function $(selector) {
    return rootEl ? rootEl.querySelector(selector) : null
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text
  }

  function setWidth(el, ratio) {
    if (!el) return
    var pctValue = Math.max(0, Math.min(100, (Number(ratio) || 0) * 100))
    el.style.width = pctValue.toFixed(2) + '%'
  }

  function fmt(n) {
    var v = Number(n)
    if (!Number.isFinite(v) || v <= 0) return '0'
    if (v < 10000) return String(Math.round(v))
    if (v < 1e8) {
      var w = v / 1e4
      return (w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')) + '万'
    }
    if (v < 1e12) {
      var y = v / 1e8
      return (y >= 100 ? Math.round(y) : y.toFixed(1).replace(/\.0$/, '')) + '亿'
    }
    return (v / 1e12).toFixed(1).replace(/\.0$/, '') + '万亿'
  }

  function pct(ratio) {
    return Math.round(Math.max(0, Math.min(1, Number(ratio) || 0)) * 100) + '%'
  }

  function todayKey() {
    return dayKey(new Date())
  }

  function dayKey(date) {
    var y = date.getFullYear()
    var m = String(date.getMonth() + 1).padStart(2, '0')
    var d = String(date.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }

  function parseDay(key) {
    var parts = String(key).split('-')
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0, 0)
  }

  function shiftDay(key, delta) {
    var d = parseDay(key)
    d.setDate(d.getDate() + delta)
    return dayKey(d)
  }

  function fmtTime(value) {
    try {
      var d = value ? new Date(value) : new Date()
      if (isNaN(d.getTime())) d = new Date()
      return d.toLocaleTimeString('zh-CN', { hour12: false })
    } catch (err) {
      return ''
    }
  }

  function num(value) {
    var n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  function safeGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key)
      return raw == null ? fallback : raw
    } catch (err) {
      return fallback
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (err) { /* 隐私模式就算了 */ }
  }

  function tierOf(lv) {
    for (var i = 0; i < TIERS.length; i += 1) {
      if (lv <= TIERS[i].max) return TIERS[i]
    }
    return TIERS[TIERS.length - 1]
  }

  /**
   * 用前端这份门槛重算等级。
   * 服务端模块改门槛要重启宿主才能生效，而前端脚本刷新就生效；
   * 两边数值由测试钉在一起，所以这里的结果与重启后的服务端一致。
   */
  function effectiveLevel() {
    var total = state ? num(state.total) : 0
    var index = 0
    for (var i = THRESHOLDS.length - 1; i >= 0; i -= 1) {
      if (total >= THRESHOLDS[i]) { index = i; break }
    }
    var rows = state && Array.isArray(state.ladder) ? state.ladder : []
    var row = rows[index] || null
    var nextRow = rows[index + 1] || null
    var atLeast = THRESHOLDS[index]
    var nextAt = index + 1 < THRESHOLDS.length ? THRESHOLDS[index + 1] : null
    var span = nextAt === null ? 0 : nextAt - atLeast
    var progress = span > 0 ? Math.max(0, Math.min(1, (total - atLeast) / span)) : 1
    return {
      lv: index + 1,
      name: row ? row.name : 'Lv.' + (index + 1),
      desc: row ? row.desc : '',
      color: row ? row.color : '#5aa9ff',
      atLeast: atLeast,
      atLeastText: fmt(atLeast),
      progress: progress,
      remain: nextAt === null ? 0 : Math.max(0, nextAt - total),
      remainText: nextAt === null ? '' : fmt(nextAt - total),
      next: nextAt !== null && nextRow
        ? { lv: index + 2, name: nextRow.name, atLeast: nextAt, atLeastText: fmt(nextAt) }
        : null,
    }
  }

  function ladderView() {
    var rows = state && Array.isArray(state.ladder) ? state.ladder : []
    var level = effectiveLevel()
    var total = num(state && state.total)
    return rows.map(function (row, i) {
      var atLeast = THRESHOLDS[i]
      return {
        lv: i + 1,
        name: row.name,
        desc: row.desc,
        color: row.color,
        atLeast: atLeast,
        atLeastText: fmt(atLeast),
        reached: total >= atLeast,
        current: (i + 1) === level.lv,
      }
    })
  }

  // ---------------------------------------------------------------- 账本 / 历史

  function loadUnlocked() {
    if (achvUnlocked) return achvUnlocked
    var raw = safeGet(STORE_ACHV, '{}')
    try {
      var parsed = JSON.parse(raw)
      achvUnlocked = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (err) {
      achvUnlocked = {}
    }
    return achvUnlocked
  }

  function saveUnlocked() {
    if (!achvUnlocked) return
    try {
      safeSet(STORE_ACHV, JSON.stringify(achvUnlocked))
    } catch (err) { /* 满了就算了 */ }
  }

  function storedMaxTurn() {
    return num(safeGet(STORE_MAXTURN, '0'))
  }

  function storedHourMask() {
    return Math.floor(num(safeGet(STORE_HOURS, '0'))) & 0xffffff
  }

  /** 把 whale 账本接口的逐轮事件折成按天 / 按轮聚合。 */
  function deriveHistory(raw) {
    var events = raw && raw.all && Array.isArray(raw.all.events) ? raw.all.events : []
    if (!events.length) return null
    var byDay = {}
    var turnTotals = {}
    var turnsByDay = {}
    var hourMask = 0
    var models = {}
    for (var i = 0; i < events.length; i += 1) {
      var event = events[i]
      if (!event || typeof event !== 'object') continue
      var tokens = num(event.tokens)
      if (!tokens) continue
      var ts = num(event.ts) || Date.now()
      var day = typeof event.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.day)
        ? event.day
        : dayKey(new Date(ts))
      byDay[day] = (byDay[day] || 0) + tokens
      var key = day + '#' + ts
      turnTotals[key] = (turnTotals[key] || 0) + tokens
      if (event.model) models[String(event.model)] = 1
      var hour = new Date(ts).getHours()
      if (hour >= 0 && hour < 24) hourMask |= (1 << hour)
    }
    var maxTurn = 0
    Object.keys(turnTotals).forEach(function (key) {
      if (turnTotals[key] > maxTurn) maxTurn = turnTotals[key]
      var day = key.split('#')[0]
      turnsByDay[day] = (turnsByDay[day] || 0) + 1
    })
    var days = Object.keys(byDay)
    if (!days.length) return null
    var maxDay = 0
    days.forEach(function (day) { if (byDay[day] > maxDay) maxDay = byDay[day] })
    return { byDay: byDay, turnsByDay: turnsByDay, maxTurn: maxTurn, maxDay: maxDay, hourMask: hourMask, models: models }
  }

  function computeStreaks(byDay, today) {
    var has = function (day) { return (byDay[day] || 0) > 0 }
    var keys = Object.keys(byDay).filter(has).sort()
    var best = 0
    var run = 0
    var prev = null
    for (var i = 0; i < keys.length; i += 1) {
      if (prev && shiftDay(prev, 1) === keys[i]) run += 1
      else run = 1
      if (run > best) best = run
      prev = keys[i]
    }
    var cursor = today
    if (!has(cursor)) {
      var yesterday = shiftDay(today, -1)
      if (!has(yesterday)) return { current: 0, best: best }
      cursor = yesterday
    }
    var current = 0
    while (has(cursor)) {
      current += 1
      cursor = shiftDay(cursor, -1)
    }
    return { current: current, best: Math.max(best, current) }
  }

  /** 全部游戏数据的统一视图：服务端快照 + 小鲸鱼历史 + 本地观察。 */
  function buildCtx() {
    if (!state) return null
    var today = todayKey()
    var byDay = {}
    if (history && history.byDay) {
      Object.keys(history.byDay).forEach(function (day) { byDay[day] = history.byDay[day] })
    }
    byDay[today] = Math.max(byDay[today] || 0, num(state.today))
    var maxDay = 0
    Object.keys(byDay).forEach(function (day) { if (byDay[day] > maxDay) maxDay = byDay[day] })

    var lastTurn = state.lastEvent ? num(state.lastEvent.tokens) : 0
    var maxTurn = Math.max(history ? history.maxTurn : 0, lastTurn, storedMaxTurn())
    var hourMask = storedHourMask() | (history ? history.hourMask : 0)
    if (state.lastEvent && state.lastEvent.ts) {
      var age = Date.now() - new Date(state.lastEvent.ts).getTime()
      if (age >= 0 && age < 5 * 60 * 1000) hourMask |= (1 << new Date().getHours())
    }

    var models = {}
    var rows = Array.isArray(state.byModel) ? state.byModel : []
    for (var r = 0; r < rows.length; r += 1) {
      var rowModel = rows[r] && rows[r].model
      if (rowModel && rowModel !== '未记录') models[rowModel] = 1
    }
    if (history && history.models) Object.keys(history.models).forEach(function (name) { models[name] = 1 })

    var streaks = computeStreaks(byDay, today)
    var goalDays = 0
    Object.keys(byDay).forEach(function (day) { if (byDay[day] >= DAILY_GOAL) goalDays += 1 })

    return {
      today: today,
      total: num(state.total),
      todayTokens: byDay[today] || 0,
      maxTurn: maxTurn,
      maxDay: maxDay,
      byDay: byDay,
      streak: streaks.current,
      bestStreak: streaks.best,
      hourMask: hourMask,
      night: ((hourMask & 0x3f) !== 0 || (hourMask & (1 << 23)) !== 0),
      early: (hourMask & 0xe0) !== 0,
      modelCount: Object.keys(models).length,
      turns: num(state.turns),
      lv: effectiveLevel().lv,
      goalDays: goalDays,
    }
  }

  function evaluateAchievements(silent) {
    var ctx = buildCtx()
    if (!ctx) return
    var maxTurnText = String(Math.round(ctx.maxTurn))
    if (safeGet(STORE_MAXTURN, '0') !== maxTurnText) safeSet(STORE_MAXTURN, maxTurnText)
    var hoursText = String(ctx.hourMask & 0xffffff)
    if (safeGet(STORE_HOURS, '0') !== hoursText) safeSet(STORE_HOURS, hoursText)

    var unlocked = loadUnlocked()
    var fresh = []
    for (var i = 0; i < ACHIEVEMENTS.length; i += 1) {
      var def = ACHIEVEMENTS[i]
      if (unlocked[def.id]) continue
      if (def.value(ctx) >= def.target) {
        unlocked[def.id] = new Date().toISOString()
        fresh.push(def)
      }
    }
    if (fresh.length) {
      saveUnlocked()
      if (!silent) {
        if (currentTab !== 'badges') newBadges = true
        fresh.slice(0, 3).forEach(function (def) {
          queueToast('🏆 成就解锁 · ' + def.name, 3200)
        })
        if (fresh.length > 3) queueToast('🏆 还有 ' + (fresh.length - 3) + ' 个成就不声不响地解锁了', 3000)
        renderBadgesDot()
      }
    }
  }

  // ---------------------------------------------------------------- 数据请求

  function fetchState(manual) {
    if (busy) return
    busy = true
    if (refs.refresh) refs.refresh.disabled = true
    try {
      fetch(API + '?t=' + Date.now(), {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return res.json()
        })
        .then(function (payload) {
          if (!payload || payload.ok !== true) throw new Error('bad payload')
          applyState(payload)
        })
        .catch(function () {
          if (rootEl) rootEl.classList.add('dshf-stale')
          if (manual) queueToast('取不到等级数据，稍后再试', 2600)
        })
        .then(function () {
          busy = false
          if (refs.refresh) refs.refresh.disabled = false
        })
    } catch (err) {
      busy = false
      if (refs.refresh) refs.refresh.disabled = false
      if (rootEl) rootEl.classList.add('dshf-stale')
    }
  }

  function fetchHistory() {
    if (historyBusy) return
    historyBusy = true
    try {
      fetch(WHALE_API, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (res) { return res.ok ? res.json() : null })
        .then(function (payload) {
          var next = deriveHistory(payload)
          if (!next) return
          history = next
          evaluateAchievements(Date.now() < silentUntil)
          renderHeader()
          renderChips()
          renderToday()
          renderBadges()
        })
        .catch(function () { /* 没装小鲸鱼 / 接口变了都无所谓 */ })
        .then(function () { historyBusy = false })
    } catch (err) {
      historyBusy = false
    }
  }

  // ---------------------------------------------------------------- DOM 骨架

  function ensureRoot() {
    if (rootEl || !document.body) return
    var style = document.getElementById('dshf-style')
    if (!style) {
      style = document.createElement('style')
      style.id = 'dshf-style'
      style.textContent = CSS
      document.head.appendChild(style)
    }
    rootEl = document.createElement('div')
    rootEl.className = 'dshf-root'
    rootEl.hidden = true
    rootEl.innerHTML = TEMPLATE
    document.body.appendChild(rootEl)

    fxOn = safeGet(STORE_FX, '1') !== '0'
    fxEls = buildFx()

    refs.pill = $('.dshf-pill')
    refs.pillIcon = $('.dshf-pill-icon')
    refs.lv = $('.dshf-pill .dshf-lv')
    refs.name = $('.dshf-pill .dshf-name')
    refs.flame = $('.dshf-flame')
    refs.mini = $('.dshf-mini i')
    refs.panel = $('.dshf-panel')
    refs.avatarWrap = $('.dshf-avatar-wrap')
    refs.ring = $('.dshf-ring-fill')
    refs.avatarIcon = $('.dshf-avatar-icon')
    refs.ptitleLv = $('.dshf-tlv')
    refs.ptitleName = $('.dshf-tname')
    refs.tier = $('.dshf-tier')
    refs.pdesc = $('.dshf-sub')
    refs.total = $('.dshf-total')
    refs.fill = $('.dshf-fill')
    refs.remain = $('.dshf-remain')
    refs.pct = $('.dshf-pct')
    refs.track = $('.dshf-track')
    refs.today = $('.dshf-s-today')
    refs.week = $('.dshf-s-week')
    refs.turns = $('.dshf-s-turns')
    refs.avg = $('.dshf-s-avg')
    refs.seeded = $('.dshf-seedtext')
    refs.ladder = $('.dshf-ladder')
    refs.goalToday = $('.dshf-goal-today')
    refs.goalTarget = $('.dshf-goal-target')
    refs.goalBar = $('.dshf-goalbar i')
    refs.goalRemain = $('.dshf-goal-remain')
    refs.goalDays = $('.dshf-goal-days')
    refs.quests = $('.dshf-quests')
    refs.models = $('.dshf-models')
    refs.badges = $('.dshf-badges')
    refs.achCount = $('.dshf-achcount')
    refs.records = $('.dshf-records')
    refs.note = $('.dshf-note')
    refs.refresh = $('.dshf-refresh')
    refs.fx = $('.dshf-fx')
    refs.toast = $('.dshf-toast')
    refs.cheer = $('.dshf-cheer')
    refs.cheerIcon = refs.cheer.querySelector('.dshf-cheer-ico')
    refs.cheerTitle = refs.cheer.querySelector('b')
    refs.cheerSub = refs.cheer.querySelector('.dshf-cheer-sub')
    refs.confetti = $('.dshf-confetti')
    refs.chipStreak = $('.dshf-chip-streak')
    refs.chipGoal = $('.dshf-chip-goal')
    refs.chipBadge = $('.dshf-chip-badge')
    refs.newdot = $('.dshf-newdot')

    refs.pill.addEventListener('click', function () { setOpen(!open) })
    $('.dshf-close').addEventListener('click', function () { setOpen(false) })
    refs.refresh.addEventListener('click', function () {
      fetchState(true)
      fetchHistory()
    })
    refs.fx.addEventListener('click', toggleFx)
    refs.fx.setAttribute('aria-pressed', fxOn ? 'true' : 'false')
    refs.fx.title = fxOn ? '隐藏小鲸鱼装饰' : '显示小鲸鱼装饰'

    var chips = rootEl.querySelectorAll('.dshf-chip')
    for (var i = 0; i < chips.length; i += 1) {
      chips[i].addEventListener('click', function (event) {
        var target = event.currentTarget.getAttribute('data-go')
        if (target) setTab(target)
      })
    }
    var tabs = rootEl.querySelectorAll('.dshf-tab')
    for (var j = 0; j < tabs.length; j += 1) {
      tabs[j].addEventListener('click', function (event) {
        setTab(event.currentTarget.getAttribute('data-tab'))
      })
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && open) setOpen(false)
    })
    document.addEventListener('pointerdown', function (event) {
      if (!open || !rootEl) return
      if (rootEl.contains(event.target)) return
      setOpen(false)
    }, true)
  }

  function buildFx() {
    var aura = document.createElement('div')
    aura.className = 'dshf-aura'
    aura.hidden = true
    document.body.appendChild(aura)
    var crown = document.createElement('div')
    crown.className = 'dshf-crown'
    crown.textContent = '👑'
    crown.hidden = true
    document.body.appendChild(crown)
    return { aura: aura, crown: crown }
  }

  // ---------------------------------------------------------------- 定位 / 装饰

  function hasChat() {
    try {
      return !!document.querySelector(CHAT_SELECTOR)
    } catch (err) {
      return false
    }
  }

  /** 小鲸鱼的可见矩形；它支持拖动和左右翻转，位置以实际矩形为准。 */
  function whaleBox() {
    try {
      var el = document.querySelector('.dshwv-root')
      if (!el) return null
      var rect = el.getBoundingClientRect()
      if (!rect || rect.width < 40 || rect.height < 40) return null
      if (!el.offsetParent && el.getClientRects().length === 0) return null
      return { rect: rect, mirrored: el.classList.contains('dshwv-left') }
    } catch (err) {
      return null
    }
  }

  function layout() {
    if (!rootEl) return
    var vw = window.innerWidth || 1024
    var vh = window.innerHeight || 768
    var box = whaleBox()
    var mirrored = !!(box && box.mirrored)
    var right = 16
    var bottom = 16

    if (box) {
      var fish = box.rect.width * 0.5945
      if (!mirrored) right = Math.round(vw - box.rect.right + fish + 12)
      bottom = Math.max(10, Math.round(vh - box.rect.bottom + 14))
    }

    if (mirrored) {
      var left = Math.round((box.rect.left + box.rect.width * 0.5945) + 12)
      rootEl.style.left = Math.max(12, Math.min(left, vw - 132)) + 'px'
      rootEl.style.right = 'auto'
      refs.panel.style.left = '0px'
      refs.panel.style.right = 'auto'
    } else {
      var maxRight = Math.max(12, vw - 132)
      if (right > maxRight) right = maxRight
      rootEl.style.left = 'auto'
      rootEl.style.right = Math.max(12, right) + 'px'
      if (vw < 580) {
        refs.panel.style.right = (12 - Math.max(12, right)) + 'px'
        refs.panel.style.width = Math.max(260, Math.min(348, vw - 24)) + 'px'
        refs.panel.style.left = 'auto'
      } else {
        refs.panel.style.right = '0px'
        refs.panel.style.left = 'auto'
        refs.panel.style.width = '348px'
      }
    }
    rootEl.style.bottom = bottom + 'px'

    layoutFx(box)
  }

  function layoutFx(box) {
    if (!fxEls) return
    var level = state ? effectiveLevel() : null
    var lv = level ? level.lv : 1
    if (!box || !fxOn || !state) {
      fxEls.aura.hidden = true
      fxEls.crown.hidden = true
      return
    }
    var rect = box.rect
    var fish = rect.width * 0.5945
    var fishLeft = box.mirrored ? rect.left : rect.right - fish
    var fishTop = rect.bottom - fish
    var accent = level.color || '#5aa9ff'

    if (lv >= 4) {
      var d = Math.round(fish * 1.5)
      fxEls.aura.hidden = false
      fxEls.aura.style.width = d + 'px'
      fxEls.aura.style.height = d + 'px'
      fxEls.aura.style.left = Math.round(fishLeft + fish / 2 - d / 2) + 'px'
      fxEls.aura.style.top = Math.round(fishTop + fish / 2 - d / 2) + 'px'
      fxEls.aura.style.background = 'radial-gradient(circle, ' + hexToRgba(accent, 0.34) + ', ' + hexToRgba(accent, 0) + ' 70%)'
      fxEls.aura.style.opacity = String(Math.min(0.85, 0.25 + (lv - 4) * 0.06))
    } else {
      fxEls.aura.hidden = true
    }

    if (lv >= 6) {
      fxEls.crown.hidden = false
      fxEls.crown.classList.add('on')
      fxEls.crown.style.fontSize = (15 + Math.min(9, lv - 5)) + 'px'
      fxEls.crown.style.left = Math.round(fishLeft + fish * (box.mirrored ? 0.34 : 0.66)) + 'px'
      fxEls.crown.style.top = Math.round(fishTop + fish * 0.1) + 'px'
      fxEls.crown.style.filter = 'drop-shadow(0 2px 4px ' + hexToRgba(accent, 0.45) + ')'
    } else {
      fxEls.crown.hidden = true
    }
  }

  function hexToRgba(hex, alpha) {
    var text = String(hex || '').replace('#', '')
    if (text.length !== 6) return 'rgba(90,169,255,' + alpha + ')'
    var r = parseInt(text.slice(0, 2), 16)
    var g = parseInt(text.slice(2, 4), 16)
    var b = parseInt(text.slice(4, 6), 16)
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }

  function mixColor(hex, target, amount) {
    var a = String(hex || '#5aa9ff').replace('#', '')
    var t = String(target || '#ffffff').replace('#', '')
    if (a.length !== 6 || t.length !== 6) return hex || '#5aa9ff'
    var ar = parseInt(a.slice(0, 2), 16)
    var ag = parseInt(a.slice(2, 4), 16)
    var ab = parseInt(a.slice(4, 6), 16)
    var tr = parseInt(t.slice(0, 2), 16)
    var tg = parseInt(t.slice(2, 4), 16)
    var tb = parseInt(t.slice(4, 6), 16)
    var r = Math.round(ar + (tr - ar) * amount)
    var g = Math.round(ag + (tg - ag) * amount)
    var b = Math.round(ab + (tb - ab) * amount)
    return 'rgb(' + r + ',' + g + ',' + b + ')'
  }

  function crownMarkup(cx, top, scale) {
    return '<g transform="translate(' + cx + ' ' + top + ') scale(' + scale.toFixed(2) + ')">' +
      '<path d="M-8 0 L-10 -8 L-4.5 -4.5 L0 -10.5 L4.5 -4.5 L10 -8 L8 0 Z" fill="#ffd166" stroke="#d99a22" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-5.2" r="1" fill="#fff7d6"/></g>'
  }

  /** 用官方鲸鱼路径生成某一级的图标；mode=light 白底彩鲸，solid 彩底白鲸。 */
  function levelIcon(lv, color, mode) {
    var t = (lv - 1) / 13
    var deep = lv >= 14
    var solid = mode === 'solid' || deep
    var id = 'fi' + (++iconSeq)
    var bgA = solid ? mixColor(color, '#1b2a5e', deep ? 0.72 : 0.45) : mixColor(color, '#ffffff', 0.88)
    var bgB = solid ? mixColor(color, '#10162e', deep ? 0.82 : 0.62) : mixColor(color, '#ffffff', 0.97)
    var bodyFill = solid ? '#ffffff' : 'url(#' + id + 'body)'
    var bodyA = solid ? '#ffffff' : color
    var bodyB = solid ? '#ffffff' : mixColor(color, '#1b2a5e', 0.22)
    var line = solid ? 'rgba(255,255,255,.55)' : mixColor(color, '#1b2a5e', 0.22)
    var starColor = solid ? '#ffe9a8' : color

    var s = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    s += '<defs><linearGradient id="' + id + 'bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bgA + '"/><stop offset="1" stop-color="' + bgB + '"/></linearGradient>'
    s += '<linearGradient id="' + id + 'body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bodyB + '"/><stop offset="1" stop-color="' + bodyA + '"/></linearGradient></defs>'
    s += '<rect x="1.5" y="1.5" width="61" height="61" rx="17" fill="url(#' + id + 'bg)" stroke="' + (solid ? 'rgba(255,255,255,.18)' : mixColor(color, '#ffffff', 0.55)) + '"/>'

    if (lv >= 12) {
      s += '<ellipse cx="32" cy="34" rx="27" ry="9.6" fill="none" stroke="' + starColor + '" stroke-opacity="' + (solid ? '.7' : '.38') + '" stroke-width="1.15" stroke-dasharray="2.6 3.4" transform="rotate(-16 32 34)"/>'
    }
    if (lv >= 10) {
      var pts = [[14, 17], [50, 14], [53, 44], [12, 47], [41, 7]]
      for (var p = 0; p < pts.length; p += 1) {
        var x = pts[p][0]
        var y = pts[p][1]
        s += '<path d="M' + x + ' ' + (y - 2.1) + ' L' + (x + 0.65) + ' ' + (y - 0.65) + ' L' + (x + 2.1) + ' ' + y + ' L' + (x + 0.65) + ' ' + (y + 0.65) + ' L' + x + ' ' + (y + 2.1) + ' L' + (x - 0.65) + ' ' + (y + 0.65) + ' L' + (x - 2.1) + ' ' + y + ' L' + (x - 0.65) + ' ' + (y - 0.65) + ' Z" fill="' + starColor + '" opacity="' + (solid ? '.9' : '.55') + '"/>'
      }
    }
    if (deep) {
      for (var i = 0; i < 9; i += 1) {
        var a = i * 2.399
        var r = 5 + (i % 4) * 5
        s += '<circle cx="' + (32 + Math.cos(a) * r * 1.2).toFixed(1) + '" cy="' + (34 + Math.sin(a) * r).toFixed(1) + '" r="' + (0.5 + (i % 3) * 0.22).toFixed(2) + '" fill="#fff" opacity=".75"/>'
      }
    }

    var w = 40 + t * 14
    var h = w * FISH_H / FISH_W
    var ox = (64 - w) / 2
    var oy = 35.5 - h / 2
    s += '<g transform="translate(' + ox.toFixed(2) + ' ' + oy.toFixed(2) + ') scale(' + (w / FISH_W).toFixed(3) + ')">'
    s += '<path d="' + FISH_PATH + '" fill="' + bodyFill + '" stroke="' + (solid ? 'none' : line) + '" stroke-width="' + (solid ? 0 : 0.35) + '"/>'
    s += '</g>'

    if (lv >= 3) {
      s += '<circle cx="' + (50 + (lv >= 7 ? 2 : 0)) + '" cy="15" r="' + (1.6 + t) + '" fill="none" stroke="' + line + '" stroke-width="1" opacity="' + (solid ? '.65' : '.5') + '"/>'
      s += '<circle cx="' + (55 + (lv >= 7 ? 2 : 0)) + '" cy="9" r="' + (1.1 + t * 0.7) + '" fill="none" stroke="' + line + '" stroke-width="1" opacity="' + (solid ? '.5' : '.38') + '"/>'
    }
    if (lv >= 6) {
      s += crownMarkup(32, Math.max(7, oy - 1.5), 0.9 + t * 0.35)
    }
    s += '</svg>'
    return s
  }

  function iconMarkup(lv, color, mode) {
    var key = lv + ':' + mode
    if (!iconCache[key]) iconCache[key] = levelIcon(lv, color, mode)
    return iconCache[key]
  }

  function toggleFx() {
    fxOn = !fxOn
    safeSet(STORE_FX, fxOn ? '1' : '0')
    if (refs.fx) {
      refs.fx.setAttribute('aria-pressed', fxOn ? 'true' : 'false')
      refs.fx.title = fxOn ? '隐藏小鲸鱼装饰' : '显示小鲸鱼装饰'
    }
    layoutFx(whaleBox())
  }

  // ---------------------------------------------------------------- 渲染

  function applyState(next) {
    state = next
    if (!rootEl) return
    if (!silentUntil) silentUntil = Date.now() + 1800
    var level = effectiveLevel()
    rootEl.style.setProperty('--dshf-accent', level.color || '#5aa9ff')
    rootEl.classList.remove('dshf-stale')

    // 先庆祝升级，再结算成就：两个提示同时出现时，升级排在前面。
    if (prevLv !== null && level.lv > prevLv) celebrateLevel(level)

    evaluateAchievements(Date.now() < silentUntil)
    renderHeader()
    renderXp()
    renderChips()
    renderGrowth()
    renderToday()
    renderBadges()
    renderTab()
    layoutFx(whaleBox())

    prevLv = level.lv
  }

  function renderHeader() {
    if (!state) return
    var level = effectiveLevel()
    var tier = tierOf(level.lv)
    setText(refs.lv, 'Lv.' + level.lv)
    setText(refs.name, level.name)
    setText(refs.ptitleLv, 'Lv.' + level.lv)
    setText(refs.ptitleName, level.name)
    setText(refs.pdesc, level.desc || '')
    if (refs.tier) {
      refs.tier.hidden = false
      refs.tier.textContent = tier.name
    }
    if (refs.pillIcon) refs.pillIcon.innerHTML = iconMarkup(level.lv, level.color, 'solid')
    if (refs.avatarIcon) refs.avatarIcon.innerHTML = iconMarkup(level.lv, level.color, 'light')

    var tip = '大肥鱼 Lv.' + level.lv + ' ' + level.name + ' · 累计 ' + state.totalText + ' tokens'
    refs.pill.title = tip
    refs.pill.setAttribute('aria-label', tip)

    // 头像圆环画当前等级进度；今日目标在「今日」胶囊和「今日」页里。
    if (refs.ring) refs.ring.style.strokeDashoffset = String(157.08 * (1 - level.progress))
    if (refs.avatarWrap) {
      refs.avatarWrap.title = level.next
        ? '升级进度 ' + pct(level.progress) + '，距 Lv.' + level.next.lv + ' ' + level.next.name + ' 还需 ' + level.remainText
        : '已到最高等级'
      refs.avatarWrap.setAttribute('aria-label', refs.avatarWrap.title)
    }
  }

  function renderXp() {
    if (!state) return
    var level = effectiveLevel()
    setText(refs.total, state.totalText)
    setWidth(refs.fill, level.progress)
    setText(refs.pct, pct(level.progress))
    setText(
      refs.remain,
      level.next ? '距 Lv.' + level.next.lv + ' ' + level.next.name + ' 还需 ' + level.remainText : '已到最高等级'
    )
    setWidth(refs.mini, level.progress)
    if (refs.track) refs.track.setAttribute('aria-valuenow', String(Math.round(level.progress * 100)))
  }

  function renderChips() {
    if (!state || !refs.chipStreak) return
    var ctx = buildCtx()
    if (!ctx) return
    setText(refs.chipStreak, ctx.streak > 0 ? '🔥 连续 ' + ctx.streak + ' 天' : '💤 今天还没动静')
    setText(refs.chipGoal, '🎯 今日 ' + pct(ctx.todayTokens / DAILY_GOAL))
    var unlocked = loadUnlocked()
    var count = 0
    for (var i = 0; i < ACHIEVEMENTS.length; i += 1) if (unlocked[ACHIEVEMENTS[i].id]) count += 1
    setText(refs.chipBadge, '🏆 ' + count + '/' + ACHIEVEMENTS.length)
    if (refs.flame) {
      if (ctx.streak >= 2) {
        refs.flame.hidden = false
        refs.flame.textContent = '🔥' + ctx.streak
      } else {
        refs.flame.hidden = true
      }
    }
    if (refs.newdot) refs.newdot.hidden = !newBadges
  }

  function renderGrowth() {
    if (!state) return
    var level = effectiveLevel()
    setText(refs.today, state.todayText)
    setText(refs.week, state.weekText)
    setText(refs.turns, String(state.turns || 0) + ' 轮')
    setText(refs.avg, state.avgPerTurnText || '0')
    var seededText = state.seeded && state.seeded.text ? state.seeded.text : ''
    setText(refs.seeded, seededText)
    if (refs.seeded) refs.seeded.hidden = !seededText
    var ladder = ladderView()
    buildLadder(ladder)
    paintLadder(ladder)
    if (level.lv !== lastScrolledLv) {
      lastScrolledLv = level.lv
      requestAnimationFrame(scrollLadder)
    }
  }

  function renderToday() {
    if (!state || !refs.quests) return
    var ctx = buildCtx()
    if (!ctx) return

    var share = Math.min(1, ctx.todayTokens / DAILY_GOAL)
    setText(refs.goalToday, fmt(ctx.todayTokens))
    setText(refs.goalTarget, '/ ' + fmt(DAILY_GOAL))
    setWidth(refs.goalBar, share)
    setText(refs.goalRemain, ctx.todayTokens >= DAILY_GOAL ? '今日目标已达成 🎉' : '还差 ' + fmt(DAILY_GOAL - ctx.todayTokens))
    setText(refs.goalDays, '达标 ' + ctx.goalDays + ' 天')

    var quests = [
      { icon: '🍚', name: '今日烧掉 500 万', target: 5000000, value: ctx.todayTokens },
      { icon: '🍱', name: '今日烧掉 2000 万', target: 20000000, value: ctx.todayTokens },
      { icon: '🍲', name: '今日烧掉 5000 万', target: 50000000, value: ctx.todayTokens },
    ]
    refs.quests.textContent = ''
    quests.forEach(function (quest) {
      var done = quest.value >= quest.target
      var row = document.createElement('div')
      row.className = 'dshf-quest' + (done ? ' done' : '')

      var icon = document.createElement('span')
      icon.className = 'dshf-qicon'
      icon.textContent = quest.icon

      var body = document.createElement('div')
      body.className = 'dshf-qbody'
      var name = document.createElement('div')
      name.className = 'dshf-qname'
      var label = document.createElement('b')
      label.textContent = quest.name
      var amount = document.createElement('span')
      amount.textContent = fmt(quest.value) + ' / ' + fmt(quest.target)
      name.appendChild(label)
      name.appendChild(amount)
      var bar = document.createElement('div')
      bar.className = 'dshf-qbar'
      var fill = document.createElement('i')
      fill.style.width = Math.min(100, (quest.value / quest.target) * 100).toFixed(1) + '%'
      bar.appendChild(fill)
      body.appendChild(name)
      body.appendChild(bar)

      var check = document.createElement('span')
      check.className = 'dshf-qcheck'
      check.textContent = done ? '✓' : ''

      row.appendChild(icon)
      row.appendChild(body)
      row.appendChild(check)
      refs.quests.appendChild(row)
    })

    buildModels(state.byModel)
  }

  function buildModels(models) {
    if (!refs.models) return
    refs.models.textContent = ''
    if (!models || !models.length) {
      var empty = document.createElement('div')
      empty.className = 'dshf-empty'
      empty.textContent = '还没有记录，聊一轮就有了。'
      refs.models.appendChild(empty)
      return
    }
    for (var i = 0; i < models.length; i += 1) {
      var item = models[i]
      var row = document.createElement('div')
      row.className = 'dshf-mrow'

      var name = document.createElement('span')
      name.className = 'dshf-mname'
      name.textContent = item.model || '未知模型'
      name.title = item.model || ''

      var bar = document.createElement('span')
      bar.className = 'dshf-mbar'
      var fill = document.createElement('i')
      fill.style.width = Math.max(2, Math.min(100, (item.share || 0) * 100)).toFixed(1) + '%'
      bar.appendChild(fill)

      var tokens = document.createElement('span')
      tokens.className = 'dshf-mtokens'
      tokens.textContent = item.text || ''

      row.appendChild(name)
      row.appendChild(bar)
      row.appendChild(tokens)
      refs.models.appendChild(row)
    }
  }

  function renderBadges() {
    if (!refs.badges) return
    var ctx = buildCtx()
    var unlocked = loadUnlocked()
    var count = 0
    refs.badges.textContent = ''
    for (var i = 0; i < ACHIEVEMENTS.length; i += 1) {
      var def = ACHIEVEMENTS[i]
      var isOn = !!unlocked[def.id]
      if (isOn) count += 1
      var value = ctx ? def.value(ctx) : 0
      var ratio = Math.min(1, def.target > 0 ? value / def.target : 0)
      var card = document.createElement('div')
      card.className = 'dshf-badge' + (isOn ? ' unlocked' : '')

      var head = document.createElement('div')
      head.className = 'dshf-bhead'
      var icon = document.createElement('span')
      icon.className = 'dshf-bicon'
      icon.textContent = def.icon
      if (!isOn) icon.style.filter = 'grayscale(1)'
      var title = document.createElement('b')
      title.textContent = def.name
      head.appendChild(icon)
      head.appendChild(title)

      var desc = document.createElement('div')
      desc.className = 'dshf-bdesc'
      desc.textContent = isOn
        ? def.desc
        : ctx && value > 0 ? achProgressText(def, value) + ' / ' + achTargetText(def) : def.desc

      var bar = document.createElement('div')
      bar.className = 'dshf-bbar'
      var fill = document.createElement('i')
      fill.style.width = (isOn ? 100 : ratio * 100).toFixed(1) + '%'
      bar.appendChild(fill)

      card.appendChild(head)
      card.appendChild(desc)
      card.appendChild(bar)
      refs.badges.appendChild(card)
    }
    setText(refs.achCount, count + ' / ' + ACHIEVEMENTS.length)
    renderChips()
    renderRecords()
  }

  function achProgressText(def, value) {
    if (def.kind === 'tokens') return fmt(value)
    return String(Math.floor(value))
  }

  function achTargetText(def) {
    if (def.kind === 'tokens') return fmt(def.target)
    return String(def.target)
  }

  function renderRecords() {
    if (!refs.records) return
    var ctx = buildCtx()
    if (!ctx) return
    var rows = [
      ['最高单轮', fmt(ctx.maxTurn) + ' tokens'],
      ['单日最高', fmt(ctx.maxDay) + ' tokens'],
      ['最长连击', ctx.bestStreak + ' 天'],
      ['今日目标', pct(ctx.todayTokens / DAILY_GOAL)],
      ['达标天数', ctx.goalDays + ' 天'],
      ['累计轮数', ctx.turns + ' 轮'],
    ]
    refs.records.textContent = ''
    rows.forEach(function (row) {
      var el = document.createElement('div')
      el.className = 'dshf-rec'
      var label = document.createElement('span')
      label.textContent = row[0]
      var value = document.createElement('b')
      value.textContent = row[1]
      el.appendChild(label)
      el.appendChild(value)
      refs.records.appendChild(el)
    })
  }

  function buildLadder(ladder) {
    if (!refs.ladder || !ladder) return
    var key = ladder.map(function (row) { return row.lv + ':' + row.atLeast }).join('|')
    if (key === ladderKey) return
    ladderKey = key
    ladderRows = {}
    refs.ladder.textContent = ''
    for (var i = 0; i < ladder.length; i += 1) {
      var item = ladder[i]
      var row = document.createElement('div')
      row.className = 'dshf-lrow'
      row.setAttribute('data-lv', String(item.lv))

      var icon = document.createElement('span')
      icon.className = 'dshf-licon'
      icon.innerHTML = iconMarkup(item.lv, item.color, 'light')

      var lv = document.createElement('span')
      lv.className = 'dshf-llv'
      lv.textContent = 'Lv.' + item.lv

      var name = document.createElement('span')
      name.className = 'dshf-lname'
      name.textContent = item.name
      name.title = item.desc || ''

      var need = document.createElement('span')
      need.className = 'dshf-lneed'

      row.appendChild(icon)
      row.appendChild(lv)
      row.appendChild(name)
      row.appendChild(need)
      refs.ladder.appendChild(row)
      ladderRows[item.lv] = { row: row, need: need }
    }
  }

  function paintLadder(ladder) {
    for (var i = 0; i < ladder.length; i += 1) {
      var item = ladder[i]
      var entry = ladderRows[item.lv]
      if (!entry) continue
      entry.row.className = 'dshf-lrow' + (item.current ? ' current' : item.reached ? ' reached' : ' locked')
      entry.need.textContent = item.current ? '进行中' : item.reached ? '✓' : item.atLeastText
    }
  }

  /** 只滚等级阶梯自己的容器，把当前等级放到中间；不会带着面板标题一起滚走。 */
  function scrollLadder() {
    if (!refs.ladder) return
    var row = refs.ladder.querySelector('.dshf-lrow.current')
    if (!row) return
    var rowRect = row.getBoundingClientRect()
    var boxRect = refs.ladder.getBoundingClientRect()
    var delta = (rowRect.top - boxRect.top) + refs.ladder.scrollTop
    refs.ladder.scrollTop = Math.max(0, delta - refs.ladder.clientHeight / 2 + rowRect.height / 2)
  }

  function renderTab() {
    if (!rootEl) return
    var tabs = rootEl.querySelectorAll('.dshf-tab')
    for (var i = 0; i < tabs.length; i += 1) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === currentTab)
    }
    var views = rootEl.querySelectorAll('.dshf-view')
    for (var j = 0; j < views.length; j += 1) {
      views[j].hidden = views[j].getAttribute('data-view') !== currentTab
    }
    if (currentTab === 'growth') requestAnimationFrame(scrollLadder)
  }

  function setTab(name) {
    if (!name) return
    currentTab = name
    if (name === 'badges') {
      newBadges = false
      renderBadgesDot()
    }
    if (refs.panel) refs.panel.scrollTop = 0
    renderTab()
  }

  function renderBadgesDot() {
    if (refs.newdot) refs.newdot.hidden = !newBadges
  }

  // ---------------------------------------------------------------- 庆祝 / 提示

  function queueToast(text, ms) {
    toastQueue.push({ text: text, ms: ms || 3000 })
    pumpToast()
  }

  function pumpToast() {
    if (toastBusy || !toastQueue.length || !refs.toast) return
    toastBusy = true
    var item = toastQueue.shift()
    refs.toast.textContent = item.text
    refs.toast.classList.add('show')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      toastTimer = null
      refs.toast.classList.remove('show')
      toastBusy = false
      pumpToast()
    }, item.ms)
  }

  function celebrateLevel(level) {
    refs.pill.classList.remove('dshf-pop')
    void refs.pill.offsetWidth
    refs.pill.classList.add('dshf-pop')
    if (fxEls && fxEls.crown && !fxEls.crown.hidden) {
      fxEls.crown.classList.remove('pop')
      void fxEls.crown.offsetWidth
      fxEls.crown.classList.add('pop')
    }
    burstConfetti()
    if (open) {
      queueToast('🎉 升到 Lv.' + level.lv + ' ' + level.name, 3400)
      return
    }
    if (!refs.cheer) return
    if (refs.cheerIcon) refs.cheerIcon.innerHTML = iconMarkup(level.lv, level.color, 'solid')
    refs.cheerTitle.textContent = '本鱼升级！Lv.' + level.lv + ' ' + level.name
    refs.cheerSub.textContent = tierOf(level.lv).name + ' · 又胖了一圈'
    refs.cheer.hidden = false
    requestAnimationFrame(function () { refs.cheer.classList.add('show') })
    if (cheerTimer) clearTimeout(cheerTimer)
    cheerTimer = setTimeout(function () {
      refs.cheer.classList.remove('show')
      cheerTimer = setTimeout(function () { refs.cheer.hidden = true }, 240)
    }, 4600)
  }

  function burstConfetti() {
    if (!refs.confetti || !fxOn) return
    refs.confetti.textContent = ''
    var colors = ['#5aa9ff', '#7de3c3', '#ffd166', '#ff8fa8', '#8a5cff']
    var count = 18
    for (var i = 0; i < count; i += 1) {
      var piece = document.createElement('i')
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.4
      var distance = 40 + Math.random() * 60
      piece.style.setProperty('--dx', Math.round(Math.cos(angle) * distance) + 'px')
      piece.style.setProperty('--dy', Math.round(Math.sin(angle) * distance - 30) + 'px')
      piece.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg')
      piece.style.background = colors[i % colors.length]
      piece.style.animationDelay = (i % 4) * 24 + 'ms'
      refs.confetti.appendChild(piece)
    }
    if (confettiTimer) clearTimeout(confettiTimer)
    confettiTimer = setTimeout(function () {
      if (refs.confetti) refs.confetti.textContent = ''
    }, 1400)
  }

  // ---------------------------------------------------------------- 面板 / 生命周期

  function setOpen(next) {
    open = !!next
    if (!rootEl) return
    refs.pill.setAttribute('aria-expanded', open ? 'true' : 'false')
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (open) {
      refs.panel.hidden = false
      refs.panel.scrollTop = 0
      requestAnimationFrame(function () {
        if (!open) return
        refs.panel.classList.add('dshf-open')
        if (currentTab === 'growth') scrollLadder()
      })
      fetchState(false)
      fetchHistory()
    } else {
      refs.panel.classList.remove('dshf-open')
      closeTimer = setTimeout(function () {
        closeTimer = null
        if (!open) refs.panel.hidden = true
      }, 190)
    }
  }

  function mount() {
    if (mounted || !hasChat()) return
    ensureRoot()
    if (!rootEl) return
    mounted = true
    rootEl.hidden = false
    layout()
    fetchState(false)
    fetchHistory()
    if (!timer) {
      timer = setInterval(function () {
        if (document.visibilityState === 'hidden') return
        if (!hasChat()) return
        fetchState(false)
      }, POLL_MS)
    }
    if (!historyTimer) {
      historyTimer = setInterval(function () {
        if (document.visibilityState === 'hidden') return
        fetchHistory()
      }, HISTORY_MS)
    }
  }

  function unmount() {
    if (!mounted) return
    mounted = false
    if (rootEl) rootEl.hidden = true
    if (fxEls) {
      fxEls.aura.hidden = true
      fxEls.crown.hidden = true
    }
    if (open) setOpen(false)
  }

  function tick() {
    if (document.visibilityState === 'hidden') return
    if (hasChat()) {
      mount()
      if (mounted) layout()
    } else {
      unmount()
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      tick()
      if (mounted) {
        fetchState(false)
        fetchHistory()
      }
    }
  })
  window.addEventListener('resize', function () {
    layout()
    layoutFx(whaleBox())
  })

  if (typeof MutationObserver === 'function') {
    var scheduled = false
    var observer = new MutationObserver(function () {
      if (scheduled) return
      scheduled = true
      setTimeout(function () {
        scheduled = false
        tick()
      }, 320)
    })
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true })
    } catch (err) { /* 观察不了就靠定时器 */ }
  }

  setInterval(tick, 1800)
  tick()
})()
