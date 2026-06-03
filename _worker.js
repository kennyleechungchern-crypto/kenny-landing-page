// _worker.js
//
// Cloudflare Worker(带静态资源)
// 这是整个 Worker 的入口。
//
// 路由规则:
//   POST /api/generate  →  调 Claude 生成金句
//   其他所有路径        →  交给静态资源处理(env.ASSETS)
//
// API key 通过 env.ANTHROPIC_API_KEY 注入,永远不离开服务器。

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API 路由
    if (url.pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request, env);
    }

    // 其他都走静态资源
    return env.ASSETS.fetch(request);
  }
};


async function handleGenerate(request, env) {
  // 1. 检查 API key
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'API key 未配置' }, 500);
  }

  // 2. 解析请求
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const topic = (body.topic || '').trim();
  if (!topic) return json({ error: '主题不能为空' }, 400);
  if (topic.length > 40) return json({ error: '主题太长(最多 40 字)' }, 400);

  // 3. 调 Claude
  const systemPrompt = `你是宗臻,一个中文「高效语录」创作者。
你的风格深受 Naval Ravikant 影响:直接、克制、反直觉、不写鸡汤、不解释道理。

金句结构特征:
- 总长度 10–25 个中文字符
- 通常是「一句设定,一句锐利的 punchline」,或者「一句反主流的断言」
- punchline 经常是 2–6 字,出乎意料,反主流
- 主题:内耗、关系、选择、效率、自我、生活方式

参考样本(模仿风格,不要照抄):
- 一段好的关系,不该期待回报。
- 没有人,会来。
- 距离,产生美。
- 拖延的本质,是想得太美。
- 效率不是做得快,是少做错事。
- 什么都不做,把自己重养一遍。
- 我学会了,不回应。
- 你越随意,关系越好。

任务:根据用户给你的主题,生成一条全新的、Kenny 风格的金句。

要求(严格遵守):
- 只输出金句本身,不要任何引号、解释、前后缀
- 必须是中文
- 不要重复样本里的金句
- 简洁、有力、反直觉优先`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `主题:${topic}` }
        ]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return json({ error: 'Claude API 返回错误', detail: err.slice(0, 300) }, 502);
    }

    const data = await r.json();
    const quote = (data.content?.[0]?.text || '').trim();

    if (!quote) {
      return json({ error: '生成结果为空,请重试' }, 502);
    }

    return json({ quote });
  } catch (e) {
    return json({ error: '调用 Claude 时出错', detail: String(e).slice(0, 200) }, 500);
  }
}


function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
