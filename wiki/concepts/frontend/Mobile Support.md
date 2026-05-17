---
title: Mobile Support
type: concept
created: 2026-05-16
updated: 2026-05-16
tags: [frontend, mobile, responsive, hamburger]
---

# Mobile Support

The viewer switches layout at 880px. Below that breakpoint the sidebar becomes a collapsible strip pinned to the top of the page, controlled by a hamburger button.

## Breakpoint behavior

```css
@media (max-width: 880px) {
  body { grid-template-columns: 1fr; }   /* stack sidebar above content */
  .sidebar {
    position: sticky;
    top: 0;
    height: auto;
    z-index: 60;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-body { display: none; }       /* collapsed by default */
  .sidebar--open .sidebar-body { display: flex; flex-direction: column; }
  .hamburger { display: inline-flex !important; }
}
```

On desktop, `.hamburger` is `display: none`. On mobile, it appears in the sidebar header via the `!important` override of the desktop rule.

## Sidebar structure

The sidebar is split into two parts for toggling:

```
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">          ← always visible (brand + controls)
    brand · theme-toggle · hamburger
  </div>
  <div class="sidebar-body">            ← toggled by hamburger
    search · tree · footer
  </div>
</aside>
```

`toggleSidebar()` adds/removes `.sidebar--open` on `els.sidebar`. The CSS shows `.sidebar-body` when the class is present.

## Auto-close on navigation

When the user taps a page link in the tree on mobile, the sidebar closes automatically:

```js
a.addEventListener("click", (e) => {
  e.preventDefault();
  navigateTo(file.path);
  if (window.innerWidth <= 880) {
    els.sidebar.classList.remove("sidebar--open");
  }
});
```

This prevents the sidebar from staying open over the content after navigation — a common mobile UX annoyance.

## Content padding

Mobile content gets reduced horizontal padding:
```css
.content { padding: 24px 20px 80px; }  /* vs 48px 64px 120px on desktop */
```

The 80px bottom padding ensures the last paragraph isn't hidden behind browser chrome on mobile.
