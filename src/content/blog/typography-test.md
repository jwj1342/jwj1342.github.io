---
title: 排版测试：中文、代码与公式
description: 一篇用来检查博客排版的草稿，上线前可以删除。
date: 2026-11-19
lang: zh
draft: true
---

这是一篇**草稿**，只在本地开发时可见，用来检查中文正文、English words mixed in、行内代码 `tokenizer.decode(ids)` 和链接[的样式](https://wenjia.me)。标点挤压、两端对齐和行高都应该看起来自然，长段落在手机上也不应出现横向滚动。

## 代码块

超长的代码行应该在代码块内部横向滚动，而不是撑破页面：

```python
def stream(prompt: str, max_new_tokens: int = 256):
    ids = tokenizer.encode(prompt, return_tensors="pt")
    for token_id in model.generate(ids, max_new_tokens=max_new_tokens, do_sample=True, temperature=0.7, top_p=0.95, streamer=True):
        yield tokenizer.decode(token_id, skip_special_tokens=True)
```

## 数学公式

行内公式 $p(x_t \mid x_{<t})$ 与正文混排，独立公式单独成行：

$$
\mathcal{L}(\theta) = -\sum_{t=1}^{T} \log p_\theta\left(x_t \mid x_1, x_2, \ldots, x_{t-1}\right)
$$

## 列表、引用与表格

- 第一项，包含 `inline code`
- 第二项，稍微长一点，用来确认换行之后的缩进是否对齐，尤其是在手机这样比较窄的屏幕上

> 引用块用来放别人说过的话，或者需要强调的一段文字。

| Model | Params | Context |
| ----- | ------ | ------- |
| A     | 7B     | 32k     |
| B     | 70B    | 128k    |
