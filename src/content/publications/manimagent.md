---
title: "ManimAgent: Self-Evolving Multimodal Agents for Visual Education"
date: 2026-06-29
venue: "Conference on Empirical Methods in Natural Language Processing (EMNLP) 2026, Main Conference"
badge: "EMNLP 2026 Main"
doi: 10.48550/arxiv.2606.30296
authors:
  - Wenjia Jiang
  - Zongyuan Cai
  - Yuanhang Shao
  - Chenru Wang
  - Boyan Han
  - Zhixue Song
  - Keyu Chen
  - Shengwei An
  - Xu Yang
  - Zhou Yang
links:
  paper: https://arxiv.org/abs/2606.30296
  pdf: https://arxiv.org/pdf/2606.30296
  project: https://manimagent.github.io/
  code: https://github.com/jwj1342/Paper2Manim
featured: true
featuredOrder: 2
image: /images/paper_image/manimagent.png
imageWidth: 1229
imageHeight: 572
summary: "A self-evolving multimodal agent that turns sections of scientific papers into Manim animations and carries what it learns from one task to the next through a dual-channel episodic memory."
---

Multi-round reflection lets agents built on large language models recover from failures within a single task, but each task remains an isolated episode: lessons learned across many reflection rounds on one task are discarded before the next begins. We study this gap on a code-generation task: from a scientific paper section, the agent writes Python in the open-source Manim library to render a mathematical animation.

We present ManimAgent, a self-evolving multimodal agent that carries reflection experience across tasks through a dual-channel Episodic Memory Bank grown entirely from its own task stream, with no weight updates and no human seeds. After each animation converges, a vision-language model scores the rendered keyframes; the resulting signals populate a positive channel M+ that stores success rationales as soft Reference Examples, and a negative channel M- that stores validated failure patterns as hard Known Pitfalls.

On a fixed-probe evaluation against no-memory, matched-budget retrieval-augmented generation, and shuffled-memory baselines, blind human Pass@1 rises and reflection rounds fall as memory size grows.
