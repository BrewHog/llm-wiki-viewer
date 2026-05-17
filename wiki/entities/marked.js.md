---
title: marked.js
type: entity
entity_type: library
created: 2026-05-16
updated: 2026-05-16
tags: [library, markdown, rendering]
---

# marked.js

Markdown parser and renderer used by llm-wiki-viewer to convert wiki page markdown into HTML.

- **CDN**: `https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js`
- **Version pinned**: 12.0.2
- **Usage**: `marked.parse(preprocessedMarkdown)` → HTML string written to `els.article.innerHTML`

## Role in the pipeline

marked runs as Stage 2 of the [[Rendering Pipeline]]. By the time markdown reaches `marked.parse()`, mermaid fences have already been converted to `<div>` placeholders and wikilinks have been converted to `<a>` tags by `preprocess()`. marked does not see raw mermaid or wikilink syntax.

marked handles: headings, paragraphs, lists, blockquotes, tables, code blocks, inline code, bold/italic, horizontal rules, images, and standard `[text](url)` links.

## What marked does NOT handle

- Math (`$...$`) — handled by [[KaTeX]] in postprocess
- Diagrams (` ```mermaid ```) — intercepted in preprocess, rendered by [[Mermaid]]
- Wikilinks (`[[...]]`) — intercepted in preprocess, resolved in postprocess
- Syntax highlighting — added by [[highlight.js]] in postprocess
