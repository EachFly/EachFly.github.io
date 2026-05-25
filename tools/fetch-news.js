#!/usr/bin/env node
/**
 * 每日热点新闻抓取脚本
 * 从多个数据源抓取科技/财经新闻，生成 Hexo Markdown 文章
 */

const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const POST_DIR = path.join(__dirname, '..', 'source', '_posts');
const MAX_ITEMS_PER_SOURCE = 10;
const FETCH_TIMEOUT = 15000; // 15秒超时
const RETENTION_DAYS = 90;   // 保留最近90天的文章
const REQUEST_DELAY = 1000;  // 请求间隔1秒，避免限流

// RSSHub 实例列表（按优先级排列，自动降级）
const RSSHUB_INSTANCES = [
  'https://rsshub.rssforever.com',
  'https://rsshub.pseudoyu.com',
  'https://hub.slarker.me',
  'https://rsshub.feeded.xyz',
  'https://rsshub.app',
];

// ========== 数据源定义 ==========
// RSSHub 路由（会自动尝试多个实例）
const RSSHUB_ROUTES = [
  // 科技
  { category: 'tech', name: '36氪快讯', route: '/36kr/newsflashes' },
  { category: 'tech', name: 'IT之家', route: '/ithome/ranking/daily' },
  // 财经
  { category: 'finance', name: '华尔街见闻', route: '/wallstreetcn/news/global' },
  { category: 'finance', name: '财联社电报', route: '/cls/telegraph' },
  // 热榜
  { category: 'hot', name: '知乎热榜', route: '/zhihu/hotlist' },
];

// 直接 RSS 源（不依赖 RSSHub）
const DIRECT_RSS_SOURCES = [
  { category: 'tech', name: '36氪官方RSS', url: 'https://www.36kr.com/feed' },
  { category: 'tech', name: 'Readhub热门', url: 'https://readhub.cn/rss/topic' },
];

// ========== 工具函数 ==========

/** 延迟 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 清理文本：去除 HTML 标签、多余空白 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 转义 Markdown 链接文本中的特殊字符 */
function escapeMarkdownLink(text) {
  if (!text) return '无标题';
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/** 从 RSS feed 中提取标准化的条目 */
function parseItems(feed) {
  return feed.items.slice(0, MAX_ITEMS_PER_SOURCE).map(item => ({
    title: cleanText(item.title) || '无标题',
    link: item.link || '#',
    summary: cleanText(item.contentSnippet || item.content || '').substring(0, 200),
    date: item.isoDate || item.pubDate || '',
  }));
}

// ========== 数据源抓取 ==========

/** 创建 RSS 解析器 */
function createParser() {
  return new Parser({
    timeout: FETCH_TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DailyNewsBot/1.0)',
    },
  });
}

/** 抓取直接 RSS 源 */
async function fetchDirectRSS(source) {
  const parser = createParser();
  try {
    console.log(`  📡 正在抓取: ${source.name} ...`);
    const feed = await parser.parseURL(source.url);
    const items = parseItems(feed);
    console.log(`  ✅ ${source.name}: 获取 ${items.length} 条`);
    return items;
  } catch (err) {
    console.warn(`  ⚠️ ${source.name} 抓取失败: ${err.message}`);
    return [];
  }
}

/** 抓取 RSSHub 源（自动尝试多个实例，失败自动降级） */
async function fetchRSSHub(route) {
  const parser = createParser();
  console.log(`  📡 正在抓取: ${route.name} ...`);

  for (const instance of RSSHUB_INSTANCES) {
    const url = `${instance}${route.route}`;
    try {
      const feed = await parser.parseURL(url);
      const items = parseItems(feed);
      console.log(`  ✅ ${route.name}: 获取 ${items.length} 条 (实例: ${instance})`);
      return items;
    } catch (err) {
      console.warn(`  ⚠️ ${route.name} @ ${instance} 失败: ${err.message}`);
    }
  }

  console.warn(`  ❌ ${route.name}: 所有实例均失败`);
  return [];
}

/** 抓取 Hacker News (Firebase API) */
async function fetchHackerNews() {
  try {
    console.log('  📡 正在抓取: Hacker News ...');
    const res = await fetch(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
    );
    const ids = await res.json();
    const topIds = ids.slice(0, MAX_ITEMS_PER_SOURCE);

    const items = await Promise.all(
      topIds.map(async (id) => {
        try {
          const r = await fetch(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
          );
          return await r.json();
        } catch {
          return null;
        }
      })
    );

    const result = items
      .filter(item => item && item.title)
      .map(item => ({
        title: item.title,
        link: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        summary: `🔺 ${item.score} points | 💬 ${item.descendants || 0} comments`,
        date: new Date(item.time * 1000).toISOString(),
      }));

    console.log(`  ✅ Hacker News: 获取 ${result.length} 条`);
    return result;
  } catch (err) {
    console.warn(`  ⚠️ Hacker News 抓取失败: ${err.message}`);
    return [];
  }
}

/** 抓取 V2EX 热门话题 */
async function fetchV2EX() {
  try {
    console.log('  📡 正在抓取: V2EX 热门 ...');
    const res = await fetch('https://www.v2ex.com/api/topics/hot.json', {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyNewsBot/1.0)' },
    });
    const topics = await res.json();

    const result = topics.slice(0, MAX_ITEMS_PER_SOURCE).map(t => ({
      title: t.title || '无标题',
      link: t.url || `https://www.v2ex.com/t/${t.id}`,
      summary: cleanText(t.content || '').substring(0, 200) || `节点: ${t.node?.title || '未知'} | 回复: ${t.replies || 0}`,
      date: t.created ? new Date(t.created * 1000).toISOString() : '',
    }));

    console.log(`  ✅ V2EX 热门: 获取 ${result.length} 条`);
    return result;
  } catch (err) {
    console.warn(`  ⚠️ V2EX 抓取失败: ${err.message}`);
    return [];
  }
}

// ========== Markdown 生成 ==========

function generateMarkdown(date, sections) {
  const dateStr = date.toISOString().split('T')[0];

  let md = '';
  md += '---\n';
  md += `title: 每日热点速递 - ${dateStr}\n`;
  md += `date: ${dateStr} 08:00:00\n`;
  md += `categories: [每日热点]\n`;
  md += `tags: [科技, 财经, 热榜]\n`;
  md += `excerpt: 今日科技、财经热点新闻速递\n`;
  md += '---\n\n';

  for (const section of sections) {
    if (section.items.length === 0) continue;

    md += `## ${section.icon} ${section.title}\n\n`;

    section.items.forEach((item, i) => {
      const title = escapeMarkdownLink(item.title);
      md += `### ${i + 1}. [${title}](${item.link})\n\n`;
      if (item.summary) {
        md += `> ${item.summary}\n\n`;
      }
    });

    md += '---\n\n';
  }

  md += `> 📅 本文由 [GitHub Actions](https://github.com/EachFly/EachFly.github.io/actions) 于 ${dateStr} 自动生成\n`;

  return md;
}

// ========== 旧文章清理 ==========

function cleanOldPosts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  if (!fs.existsSync(POST_DIR)) return;

  const files = fs.readdirSync(POST_DIR).filter(f => f.startsWith('daily-news-'));
  let cleaned = 0;

  for (const file of files) {
    const match = file.match(/daily-news-(\d{4}-\d{2}-\d{2})\.md/);
    if (match) {
      const fileDate = new Date(match[1]);
      if (fileDate < cutoff) {
        fs.unlinkSync(path.join(POST_DIR, file));
        console.log(`  🗑️ 已删除过期文章: ${file}`);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    console.log(`  🧹 共清理 ${cleaned} 篇过期文章`);
  }
}

// ========== 主函数 ==========

async function main() {
  console.log('🚀 开始抓取每日新闻...\n');

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  // 检查今日文章是否已存在
  const filename = `daily-news-${dateStr}.md`;
  const filepath = path.join(POST_DIR, filename);

  if (fs.existsSync(filepath)) {
    console.log(`⏭️ 今日文章已存在，跳过: ${filename}`);
    return;
  }

  // 确保目录存在
  fs.mkdirSync(POST_DIR, { recursive: true });

  // ===== 抓取所有数据源 =====
  console.log('📡 开始抓取各数据源...\n');

  // 第一批: RSSHub 源（串行，每个源内部有多实例降级）
  const rsshubResults = [];
  for (const route of RSSHUB_ROUTES) {
    const items = await fetchRSSHub(route);
    rsshubResults.push({ category: route.category, items });
    await delay(500);
  }

  await delay(REQUEST_DELAY);

  // 第二批: 直接 RSS 源（并行）
  const directResults = await Promise.all(
    DIRECT_RSS_SOURCES.map(source => fetchDirectRSS(source))
  );

  await delay(REQUEST_DELAY);

  // 第三批: API 源（并行）
  const [hnItems, v2exItems] = await Promise.all([
    fetchHackerNews(),
    fetchV2EX(),
  ]);

  // ===== 整理结果 =====
  const techRSS = [];
  const financeRSS = [];
  const hotRSS = [];

  // RSSHub 结果
  rsshubResults.forEach(({ category, items }) => {
    switch (category) {
      case 'tech': techRSS.push(...items); break;
      case 'finance': financeRSS.push(...items); break;
      case 'hot': hotRSS.push(...items); break;
    }
  });

  // 直接 RSS 结果
  DIRECT_RSS_SOURCES.forEach((source, i) => {
    const items = directResults[i] || [];
    switch (source.category) {
      case 'tech': techRSS.push(...items); break;
      case 'finance': financeRSS.push(...items); break;
      case 'hot': hotRSS.push(...items); break;
    }
  });

  // 合并科技类
  const techItems = [...techRSS, ...v2exItems];
  const financeItems = financeRSS;
  const hotItems = hotRSS;

  // 检查是否有任何数据
  const totalItems = techItems.length + hnItems.length + financeItems.length + hotItems.length;
  console.log(`\n📊 抓取汇总: 科技=${techItems.length}, HN=${hnItems.length}, 财经=${financeItems.length}, 热榜=${hotItems.length}, 总计=${totalItems}`);

  if (totalItems === 0) {
    console.error('\n❌ 所有数据源均未返回数据，跳过文章生成');
    process.exit(1);
  }

  // ===== 生成 Markdown =====
  const sections = [
    { icon: '🔬', title: '科技热点', items: techItems.slice(0, 15) },
    { icon: '🌍', title: 'Hacker News 热门', items: hnItems.slice(0, 10) },
    { icon: '💰', title: '财经要闻', items: financeItems.slice(0, 10) },
    { icon: '🔥', title: '知乎热榜', items: hotItems.slice(0, 10) },
  ];

  const markdown = generateMarkdown(today, sections);

  // ===== 写入文件 =====
  fs.writeFileSync(filepath, markdown, 'utf-8');
  console.log(`\n✅ 文章已生成: ${filename} (${markdown.length} 字节)`);

  // ===== 清理旧文章 =====
  console.log('\n🧹 检查过期文章...');
  cleanOldPosts();

  console.log('\n🎉 完成！');
}

// 运行
main().catch(err => {
  console.error('❌ 致命错误:', err);
  process.exit(1);
});
