---
title: 这个主页是怎么搭起来的
description: 从 Jekyll 模板换成 Astro 和 Cloudflare：这个站现在由哪些部分组成，以及中间遇到的几个问题。
date: 2026-11-20
lang: zh
tags: [meta, astro, cloudflare]
---

这个主页原来用的是 Jekyll 的学术主页模板，托管在 GitHub Pages 上，地址是 `jwj1342.github.io`。这次我把它整个重写了一遍：页面换成 Astro，托管换到 Cloudflare，域名换成 wenjia.me。整个过程是和 Claude Code 一起完成的。这篇文章记录现在这个站由哪些部分组成，以及中间遇到的几个问题。

## 整体结构

网站的主体是纯静态的：构建时生成一批 HTML、CSS 和 JS 文件，访客拿到的就是这些文件。只有 `/api/` 开头的两个地址会运行代码。

```text
访客 → wenjia.me
        ├─ /, /blog/, ...    静态文件
        ├─ /api/log          Worker → D1（访客日志）
        ├─ /api/visitors     Worker → D1（访客地图的数据）
        ├─ photos.wenjia.me  R2（照片）
        └─ models.wenjia.me  R2（Pop Cat 的模型权重）
```

## 页面

页面用 [Astro](https://astro.build) 写，输出静态 HTML，没有用 React 或 Vue。论文和博客是 Markdown 文件，各自有一份字段约定，写错字段构建时会直接报错。数学公式用 KaTeX，代码高亮用 Shiki。

样式是手写的 CSS，没有用 Tailwind。配色取自莫奈的《日出·印象》：港口的青绿色是主色，太阳的橙色只在少数地方出现。浅色和深色主题共用同一组变量名，各有一套取值。

## 大文件不进 Git

照片和模型权重都放在 Cloudflare 的 R2 存储桶里，仓库里只记录它们的地址。

加照片是一条命令：脚本生成缩略图和大图两个 WebP 文件，去掉位置信息，上传到 R2，再把尺寸和主色调写进一个 JSON 文件。原图不会上传，也不会进仓库。

## 角落里的猫

右下角的 Pop Cat 是一个跑在访客浏览器里的小语言模型：Qwen3.5 0.8B，通过 [WebLLM](https://webllm.mlc.ai) 和 WebGPU 运行，推理不经过任何服务器，也不需要 API key。访客第一次提问时才下载权重，大约 430 MB，之后留在浏览器缓存里。

权重放在自己的 R2 里，没有用默认的 Hugging Face 地址，因为后者在中国大陆打不开。

猫知道的关于我的事情不是手写的。构建时有一个脚本把站点里的经历、论文和成就拼成一份资料，所以我改了经历，猫也跟着更新。

## 地球仪

Misc 页有一个地球仪，标着我去过的地方。第一版用的是一个点阵风格的库，它把海岸线画成一个个小圆点，放大以后很模糊。后来改成自己在 canvas 上画：用 d3-geo 做投影，用 Natural Earth 的矢量数据画海岸线和国界，放大多少倍都是清楚的。

改写之后有一阵子，地球仪是一个没有陆地的纯色圆盘。原因是脚本从 CSS 变量里读颜色，而页面上还留着旧版本的变量名，新的那几个没有定义。给 canvas 设一个空的颜色值不会报错，它只是继续用上一次的颜色，于是陆地、海洋和线条全是同一个颜色。

## 访客地图和日志

首页最下面有一张访客地图。它背后是一个很小的 Worker 和一个 D1 数据库：页面打开时向 `/api/log` 报告一次，Worker 从 Cloudflare 提供的请求信息里读出访客所在的城市，写进数据库。不存 IP，不设 Cookie，位置只精确到城市。

Pop Cat 收到的问题和它的回答也会被记录，这样我能知道大家都问了什么。聊天框里写明了这一点。模型虽然在本地运行，但提问会被记录，这件事应该告诉访客。

接口需要限流。我用了 Cloudflare 自带的限流功能，设成每个访客每分钟 60 次，然后实际测了一下：一次并发 150 个请求，全部通过；接着持续发了半分钟共 300 个，只有 8 个被拒绝。原因是 Cloudflare 的每台机器各自计数。

我没有再往上叠更严格的限制，而是换了个思路：Worker 每天检查一次数据库，如果占用超过八成，或者一天内写入的日志多得不正常，就给我发一封邮件，我再去导出和清理。对一个个人主页来说，这样够用，也更容易维护。

## 部署

代码放在 [GitHub](https://github.com/jwj1342/jwj1342.github.io) 上。推送到 `master` 之后，Cloudflare 会自己拉代码、构建、发布，大约一分钟上线。

旧地址 `jwj1342.github.io` 还能用。GitHub Pages 不支持配置 301 跳转，所以我让它只发布一个很小的分支，里面只有两个页面，作用是把访客带到 wenjia.me 的同一个路径：

```html
<script>
  location.replace('https://wenjia.me' + location.pathname + location.search + location.hash);
</script>
```

其中一个页面是 `404.html`。旧站的任何地址在新分支里都不存在，都会落到这个页面上，再被带到新站。旧的论文链接到了新站之后，由一份跳转表对应到新的页面。

## 用到的东西

- 页面：Astro、TypeScript、手写 CSS、KaTeX、Shiki
- 地图：canvas、d3-geo、Natural Earth 的矢量数据
- 聊天：WebLLM、WebGPU、Qwen3.5 0.8B
- Cloudflare：Workers（静态文件和两个接口）、D1、R2、Workers Builds、Workers AI（翻译博客用）

这篇文章的英文版由 Claude 翻译。站里还有一个翻译脚本，可以为每篇文章生成另一种语言的版本，读者可以在文章上方切换。
