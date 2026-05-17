---
title: KaTeX
type: entity
entity_type: library
created: 2026-05-16
updated: 2026-05-16
tags: [library, math, latex]
---

# KaTeX

Fast LaTeX math rendering library. Renders `$...$` and `$$...$$` math in wiki pages.

- **CDN (CSS)**: `https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css`
- **CDN (JS)**: `katex.min.js` — loaded `defer`
- **CDN (auto-render)**: `contrib/auto-render.min.js` — loaded `defer`
- **Version pinned**: 0.16.11

## Usage

`renderMathInElement` (from auto-render) is called in `postprocess()` after `marked.parse()`. It walks the article DOM looking for math delimiters:

```js
renderMathInElement(els.article, {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$",  right: "$",  display: false },
  ],
  throwOnError: false,
});
```

`throwOnError: false` ensures a malformed formula degrades gracefully (shows the raw LaTeX) rather than crashing the page.

## Timing

KaTeX and auto-render are loaded `defer`, so postprocess guards with `if (window.renderMathInElement)` before calling. On first load this is usually fine; on very fast subsequent navigations (loadPage before defer scripts execute) the guard prevents a runtime error.
