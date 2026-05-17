---
title: Mermaid
type: entity
entity_type: library
created: 2026-05-16
updated: 2026-05-16
tags: [library, diagrams, mermaid]
---

# Mermaid

JavaScript diagram rendering library. Converts mermaid syntax into inline SVG.

- **CDN**: `https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js`
- **Version pinned**: 10.9.1

## Usage

Mermaid fences are intercepted in `preprocess()` before [[marked.js]] sees them:

```js
md.replace(/```mermaid\n([\s\S]*?)```/g, (m, body) => {
  const attrSafe = body.trim().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<div class="mermaid" data-mermaid-source="${attrSafe}"></div>`;
});
```

The source is stored in a `data-mermaid-source` attribute (not inner text) to prevent the browser's HTML parser from mangling mermaid syntax characters like `-->`.

`rerenderMermaid()` in postprocess reads each `.mermaid` div's attribute and calls `mermaid.render(id, source)`. On success, the returned SVG replaces the div's innerHTML. On error, a styled error block is shown with the raw source.

## Theme sync

`mermaid.initialize()` is called with `theme: "dark"` or `theme: "default"` based on the current app theme. `rerenderMermaid()` is called on every theme toggle to regenerate diagrams with the correct colors.

## Security level

`securityLevel: "loose"` is set to allow clickable links inside diagrams. This is appropriate for a local server (no untrusted user input reaches the mermaid renderer).
