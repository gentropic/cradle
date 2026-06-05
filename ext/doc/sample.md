---
title: "Itomori Caldera — field notes"
theme: "paper"
accent: "#9a6a3c"
font: "serif"
toc: true
author: "Mitsuha Miyamizu"
date: "2026-06-05"
tags: ["geology", "fieldwork", "itomori"]
---

A short abstract with **bold**, *italic*, `inline code`, a [link](https://example.org), ==a highlight==, and notation like H~2~O and a^2^+b^2^.

## Setting

Itomori sits in a [post-impact](#methods) depression. Key markers[^1]:

- Tephra layer (~1200 yr BP)
- A shocked-quartz horizon
- Lacustrine infill

> A caldera lake records the comet's arrival in laminated mud.

## Methods

We logged the section and sampled at 5 cm intervals.

| Unit | Thickness (m) | Notes |
|---|---|---|
| Topsoil | 0.4 | modern |
| Tephra | 0.1 | glass shards |
| Lacustrine | 3.2 | varved |

```python
def varve_count(core):
    return sum(1 for layer in core if layer.is_annual)
```

## Results

The varve chronology agrees with the tephra date.[^2]

[^1]: Field season 2026, GCU.
[^2]: Within two sigma.
