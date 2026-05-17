---
title: highlight.js
type: entity
entity_type: library
created: 2026-05-16
updated: 2026-05-16
tags: [library, syntax-highlighting, code]
---

# highlight.js

Syntax highlighting library that colorizes `<code>` blocks inside wiki pages.

- **CDN (JS)**: `https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js`
- **CDN (light CSS)**: `styles/github.min.css` — GitHub light theme
- **CDN (dark CSS)**: `styles/github-dark.min.css` — GitHub dark theme
- **Version pinned**: 11.9.0

## Usage in the viewer

`hljs.highlightElement(block)` is called on every `pre code` element in postprocess, after `marked.parse()` has generated the HTML. This adds `class="hljs"` and language-specific token classes (e.g. `hljs-keyword`, `hljs-string`) to the `<code>` element.

Language is auto-detected from the fenced code block language specifier (e.g. ` ```python `). If no language is specified, hljs guesses.

## Theme switching

Two `<link>` elements are loaded in `index.html`. `syncHljsTheme()` toggles `disabled` on each to match the app's current dark/light mode. Since token classes are permanent, only the active CSS file needs to change — no re-highlighting. See [[Theming]] for details.

## CSS layout

The `<pre>` element is transparent; the `<code class="hljs">` element provides background, padding, border-radius, and border. `style.css` overrides hljs's default `code.hljs` background to use our border token:

```css
.article pre { background: transparent; padding: 0; border: none; }
pre code.hljs { border-radius: var(--radius); border: 1px solid var(--border); ... }
```
