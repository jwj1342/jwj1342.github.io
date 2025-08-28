---
title: "Skeleton-Guided Spatial-Temporal Feature Learning for Video-Based Visible-Infrared Person Re-Identification"
collection: publications
category: manuscripts
permalink: /publication/2024-12-11-skeleton-guided-spatial-temporal
excerpt: "Video-based visible-infrared person re-identification (VVI-ReID) is challenging due to significant modality feature discrepancies. This work proposes a novel Skeleton-guided spatial-Temporal feAture leaRning (STAR) method that uses skeleton information to improve spatial-temporal features in videos of both modalities."
date: 2024-12-11
venue: "arXiv preprint"
paperurl: "https://arxiv.org/abs/2411.11069"
citation: "Jiang, W., Zhu, X., Gao, J., & Liao, D. (2024). Skeleton-Guided Spatial-Temporal Feature Learning for Video-Based Visible-Infrared Person Re-Identification. arXiv preprint arXiv:2411.11069."
---

Video-based visible-infrared person re-identification (VVI-ReID) is challenging due to significant modality feature discrepancies. Spatial-temporal information in videos is crucial, but the accuracy of spatial-temporal information is often influenced by issues like low quality and occlusions in videos. Existing methods mainly focus on reducing modality differences, but pay limited attention to improving spatial-temporal features, particularly for infrared videos.

To address this, we propose a novel Skeleton-guided spatial-Temporal feAture leaRning (STAR) method for VVI-ReID. By using skeleton information, which is robust to issues such as poor image quality and occlusions, STAR improves the accuracy of spatial-temporal features in videos of both modalities. Specifically, STAR employs two levels of skeleton-guided strategies: frame level and sequence level. At the frame level, the robust structured skeleton information is used to refine the visual features of individual frames. At the sequence level, we design a feature aggregation mechanism based on skeleton key points graph, which learns the contribution of different body parts to spatial-temporal features, further enhancing the accuracy of global features.

Experiments on benchmark datasets demonstrate that STAR outperforms state-of-the-art methods.
