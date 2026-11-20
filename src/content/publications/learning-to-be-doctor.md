---
title: "Learning to Be A Doctor: Searching for Effective Medical Agent Architectures"
date: 2025-04-07
venue: "ACM International Conference on Multimedia (ACM MM) 2025"
badge: "ACM MM 2025"
doi: 10.1145/3746027.3755559
authors:
  - Yangyang Zhuang
  - Wenjia Jiang
  - Jiayu Zhang
  - Ze Yang
  - Joey Tianyi Zhou
  - Chi Zhang
links:
  paper: https://arxiv.org/abs/2504.11301
  pdf: https://arxiv.org/pdf/2504.11301
featured: false
featuredOrder: 2
image: /images/paper_image/doctor.png
imageWidth: 694
imageHeight: 383
summary: "An innovative approach to searching AI agent architectures capable of medical reasoning and diagnosis in medical scenarios."
---

Large Language Model (LLM)-based agents have demonstrated strong capabilities across a wide range of tasks, and their application in the medical domain holds particular promise due to the demand for high generalizability and reliance on interdisciplinary knowledge. However, existing medical agent systems often rely on static, manually crafted workflows that lack the flexibility to accommodate diverse diagnostic requirements and adapt to emerging clinical scenarios.

Motivated by the success of automated machine learning (AutoML), this paper introduces a novel framework for the automated design of medical agent architectures. Specifically, we define a hierarchical and expressive agent search space that enables dynamic workflow adaptation through structured modifications at the node, structural, and framework levels. Our framework conceptualizes medical agents as graph-based architectures composed of diverse, functional node types and supports iterative self-improvement guided by diagnostic feedback.

Experimental results on skin disease diagnosis tasks demonstrate that the proposed method effectively evolves workflow structures and significantly enhances diagnostic accuracy over time. This work represents the first fully automated framework for medical agent architecture design and offers a scalable, adaptable foundation for deploying intelligent agents in real-world clinical environments.
