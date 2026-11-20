---
title: "Teaching Code Agents to Ask Without Leaking Private Code"
date: 2026-10-17
venue: "arXiv preprint"
badge: "arXiv 2026"
preprint: true
doi: 10.48550/arxiv.2610.24824
authors:
  - Wenjia Jiang
  - Jieke Shi
  - Zhensu Sun
  - Chengran Yang
  - Shidong Pan
  - Peixin Zhang
  - Yifan Jia
  - James Hoang
  - Xiwei Xu
  - Zhenchang Xing
  - David Lo
  - Zhou Yang
links:
  paper: https://arxiv.org/abs/2610.24824
  pdf: https://arxiv.org/pdf/2610.24824
  code: https://github.com/jwj1342/UVA
featured: true
featuredOrder: 1
image: /images/paper_image/uva.png
imageWidth: 1320
imageHeight: 405
summary: "Teaches a local coding agent to consult a stronger cloud model by describing private code by its role and type, so it solves more repository issues while disclosing far fewer private identifiers and less verbatim code."
---

Local coding agents can extend their reach by consulting a stronger cloud model. Such consultations, however, often expose the repository's private identifiers, file paths, and source code. Host-side masking hides recognized identifiers but leaves the surrounding code and the agent's phrasing unchanged, while training for less disclosure risks suppressing consultation or producing questions too vague to answer.

We propose utility-verified abstraction (UVA), which teaches the agent to describe private entities by their role and type while retaining the technical details an expert needs. From solved repair trajectories, we rewrite each question into this form and keep the rewrite only if it discloses fewer private entities and the repair, replayed from the same execution state with the repair trajectories.

Across two benchmarks, the trained agent consults more often than before training. On repository-level issue repair, it solves 37.6% of issues, against 25.3% for the same model working alone, a gain from the training as a whole rather than from consultation alone. Its questions disclose 3.7-fold fewer private entities and 1.4-fold less verbatim code than the untrained agent's questions to the same expert.
