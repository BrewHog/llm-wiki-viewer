// llm-wiki-viewer / app.js

const state = {
  welcome: null,
  tree: null,
  stemMap: new Map(),
  pathSet: new Set(),
  currentPath: null,
  currentRaw: null,
  pendingSelection: null,
  selectedSeverity: "warn",
  searchFocusIndex: -1,
  searchResults: [],
  lastSearchQ: "",
  auditFilter: "open",
  fsCurrentPath: null,
  fsParent: null,
  fsSelectedPath: null,
  wikiPath: null,
  bookmarkedPaths: new Set(),
};

const els = {
  tree: document.getElementById("tree"),
  article: document.getElementById("article"),
  articleHeader: document.getElementById("article-header"),
  articleTitle: document.getElementById("article-title"),
  breadcrumb: document.getElementById("breadcrumb"),
  frontmatterStrip: document.getElementById("frontmatter-strip"),
  welcome: document.getElementById("welcome"),
  welcomeTitle: document.getElementById("welcome-title"),
  welcomeTagline: document.getElementById("welcome-tagline"),
  welcomeGrid: document.getElementById("welcome-grid"),
  brandText: document.getElementById("brand-text"),
  pageCount: document.getElementById("page-count"),
  whoLink: document.getElementById("who-link"),
  themeToggle: document.getElementById("theme-toggle"),
  homeLink: document.getElementById("home-link"),
  searchInput: document.getElementById("search-input"),
  searchResults: document.getElementById("search-results"),
  selectionToolbar: document.getElementById("selection-toolbar"),
  auditBtn: document.getElementById("audit-btn"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalClose: document.getElementById("modal-close"),
  modalCancel: document.getElementById("modal-cancel"),
  modalSubmit: document.getElementById("modal-submit"),
  modalError: document.getElementById("modal-error"),
  severityRow: document.getElementById("severity-row"),
  selectionPreview: document.getElementById("selection-preview"),
  authorInput: document.getElementById("author-input"),
  commentInput: document.getElementById("comment-input"),
  toast: document.getElementById("toast"),
  sidebar: document.getElementById("sidebar"),
  sidebarBody: document.getElementById("sidebar-body"),
  hamburger: document.getElementById("hamburger"),
  backlinksSection: document.getElementById("backlinks-section"),
  backlinksCount: document.getElementById("backlinks-count"),
  backlinksInner: document.getElementById("backlinks-inner"),
  inboxBtn: document.getElementById("inbox-btn"),
  inboxBackdrop: document.getElementById("inbox-backdrop"),
  inboxClose: document.getElementById("inbox-close"),
  inboxList: document.getElementById("inbox-list"),
  inboxFilterRow: document.getElementById("inbox-filter-row"),
  openWikiBtn: document.getElementById("open-wiki-btn"),
  bookmarkBtn: document.getElementById("bookmark-btn"),
  picker: document.getElementById("picker"),
  pickerBookmarksSection: document.getElementById("picker-bookmarks-section"),
  pickerBookmarks: document.getElementById("picker-bookmarks"),
  pickerRecentsSection: document.getElementById("picker-recents-section"),
  pickerRecents: document.getElementById("picker-recents"),
  pickerBreadcrumb: document.getElementById("picker-breadcrumb"),
  pickerUpBtn: document.getElementById("picker-up-btn"),
  pickerEntries: document.getElementById("picker-entries"),
  pickerPathInput: document.getElementById("picker-path-input"),
  pickerOpenBtn: document.getElementById("picker-open-btn"),
  pickerError: document.getElementById("picker-error"),
};

// ============================================================
// theme + highlight.js
// ============================================================
function syncHljsTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const light = document.getElementById("hljs-light");
  const dk = document.getElementById("hljs-dark");
  if (light) light.disabled = dark;
  if (dk) dk.disabled = !dark;
}

function initTheme() {
  const stored = localStorage.getItem("lwv-theme");
  const theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
  syncHljsTheme();
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("lwv-theme", next);
  syncHljsTheme();
  rerenderMermaid();
}

// ============================================================
// author
// ============================================================
function getAuthor() {
  return localStorage.getItem("lwv-author") || "";
}
function setAuthor(name) {
  if (name) localStorage.setItem("lwv-author", name);
  els.whoLink.textContent = getAuthor() || "unnamed";
}

// ============================================================
// welcome data (title, tagline, brand, featured cards)
// ============================================================
async function loadWelcome() {
  try {
    const res = await fetch("/api/welcome");
    state.welcome = await res.json();
  } catch (e) {
    state.welcome = { title: "Wiki", tagline: "", brand: "Wiki", featured: [] };
  }
  const w = state.welcome;
  document.title = w.title || "Wiki";
  els.brandText.textContent = w.brand || w.title || "Wiki";
  els.welcomeTitle.textContent = w.title || "Wiki";
  els.welcomeTagline.textContent = w.tagline || "";
  renderFeaturedCards(w.featured || []);
}

function renderFeaturedCards(cards) {
  els.welcomeGrid.innerHTML = "";
  if (!cards.length) {
    els.welcomeGrid.style.display = "none";
    return;
  }
  els.welcomeGrid.style.display = "";
  cards.forEach((card) => {
    const a = document.createElement("a");
    a.className = "welcome-card";
    a.href = card.path ? `?p=${encodeURIComponent(card.path)}` : "/";
    a.dataset.target = card.path || "";
    a.innerHTML = `
      ${card.tag ? `<span class="card-tag">${escapeHtml(card.tag)}</span>` : ""}
      <h3>${escapeHtml(card.title || "")}</h3>
      ${card.blurb ? `<p>${escapeHtml(card.blurb)}</p>` : ""}
    `;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (a.dataset.target) navigateTo(a.dataset.target);
      else goHome();
    });
    els.welcomeGrid.appendChild(a);
  });
}

// ============================================================
// tree (collapsible folders)
// ============================================================
let collapsedFolders = new Set();
try {
  collapsedFolders = new Set(JSON.parse(localStorage.getItem("lwv-collapsed") || "[]"));
} catch (_) {}

function saveCollapsedFolders() {
  localStorage.setItem("lwv-collapsed", JSON.stringify([...collapsedFolders]));
}

async function loadTree() {
  const res = await fetch("/api/tree");
  const tree = await res.json();
  state.tree = tree;
  let count = 0;
  walkTree(tree, (node) => {
    if (node.is_file) {
      state.pathSet.add(node.path);
      state.stemMap.set(node.filename, node.path);
      count++;
    }
  });
  els.pageCount.textContent = `${count} pages`;
  renderTree(tree);
}

function walkTree(node, fn) {
  fn(node);
  if (node.children) node.children.forEach((c) => walkTree(c, fn));
}

function renderTree(tree) {
  els.tree.innerHTML = "";
  const rootFiles = tree.children.filter((c) => c.is_file);
  const folders = tree.children.filter((c) => !c.is_file);
  if (rootFiles.length > 0) {
    rootFiles.forEach((f) => els.tree.appendChild(makeItem(f)));
  }
  const folderOrder = ["concepts", "entities", "summaries"];
  folders.sort((a, b) => {
    const ai = folderOrder.indexOf(a.name);
    const bi = folderOrder.indexOf(b.name);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.name.localeCompare(b.name);
  });
  folders.forEach((f) => els.tree.appendChild(makeFolder(f, 0)));
}

function makeFolder(folder, depth) {
  const wrap = document.createElement("div");
  wrap.className = "tree-folder";

  const label = document.createElement("div");
  label.className = "tree-folder-name";
  label.textContent = folder.name;

  const folderKey = folder.path || folder.name;
  if (collapsedFolders.has(folderKey)) {
    wrap.classList.add("tree-folder--collapsed");
  }
  label.addEventListener("click", () => {
    const collapsed = wrap.classList.toggle("tree-folder--collapsed");
    if (collapsed) collapsedFolders.add(folderKey);
    else collapsedFolders.delete(folderKey);
    saveCollapsedFolders();
  });

  const inner = document.createElement("div");
  inner.className = depth > 0 ? "tree-folder-inner tree-nested" : "tree-folder-inner";
  folder.children.forEach((c) => {
    if (c.is_file) inner.appendChild(makeItem(c));
    else inner.appendChild(makeFolder(c, depth + 1));
  });

  wrap.appendChild(label);
  wrap.appendChild(inner);
  return wrap;
}

function makeItem(file) {
  const a = document.createElement("a");
  a.className = "tree-item";
  a.dataset.path = file.path;
  a.textContent = file.name;
  a.href = `?p=${encodeURIComponent(file.path)}`;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(file.path);
    // close sidebar on mobile after selecting a page
    if (window.innerWidth <= 880) {
      els.sidebar.classList.remove("sidebar--open");
    }
  });
  return a;
}

function updateActiveTreeItem() {
  document.querySelectorAll(".tree-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.path === state.currentPath);
  });
}

// ============================================================
// scroll position memory
// ============================================================
function saveScrollPos(path) {
  try {
    const d = JSON.parse(localStorage.getItem("lwv-scroll") || "{}");
    d[path] = window.scrollY;
    localStorage.setItem("lwv-scroll", JSON.stringify(d));
  } catch (_) {}
}

function restoreScrollPos(path) {
  try {
    const d = JSON.parse(localStorage.getItem("lwv-scroll") || "{}");
    window.scrollTo(0, d[path] != null ? d[path] : 0);
  } catch (_) {
    window.scrollTo(0, 0);
  }
}

// ============================================================
// navigation
// ============================================================
function navigateTo(path, push = true) {
  if (path === state.currentPath) return;
  if (push) {
    const url = new URL(window.location);
    url.searchParams.set("p", path);
    history.pushState({ path }, "", url);
  }
  loadPage(path);
}

function goHome(push = true) {
  if (state.currentPath) saveScrollPos(state.currentPath);
  state.currentPath = null;
  if (push) {
    const url = new URL(window.location);
    url.searchParams.delete("p");
    history.pushState({}, "", url);
  }
  els.welcome.hidden = false;
  els.articleHeader.hidden = true;
  els.article.innerHTML = "";
  els.backlinksSection.hidden = true;
  updateActiveTreeItem();
  window.scrollTo(0, 0);
}

async function loadPage(path) {
  if (state.currentPath) saveScrollPos(state.currentPath);
  try {
    const res = await fetch(`/api/page?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      renderError(err.error || `Failed to load ${path}`);
      return;
    }
    const data = await res.json();
    state.currentPath = path;
    state.currentRaw = data.markdown;
    renderPage(data);
    updateActiveTreeItem();
    restoreScrollPos(path);
    loadBacklinks(path);
  } catch (e) {
    renderError(e.message);
  }
}

function renderPage(data) {
  els.welcome.hidden = true;
  els.articleHeader.hidden = false;
  els.articleTitle.textContent = data.title;
  renderBreadcrumb(data.path);
  renderFrontmatter(data.frontmatter);
  const md = preprocess(data.markdown);
  els.article.innerHTML = marked.parse(md);
  postprocess();
}

function renderBreadcrumb(path) {
  const parts = path.split("/");
  const frags = [];
  frags.push(`<a href="/" id="bc-home">wiki</a>`);
  for (let i = 0; i < parts.length - 1; i++) {
    frags.push(`<span class="breadcrumb-sep">/</span>`);
    frags.push(`<span>${escapeHtml(parts[i])}</span>`);
  }
  els.breadcrumb.innerHTML = frags.join("");
  document.getElementById("bc-home")?.addEventListener("click", (e) => {
    e.preventDefault();
    goHome();
  });
}

function renderFrontmatter(fm) {
  els.frontmatterStrip.innerHTML = "";
  if (!fm || Object.keys(fm).length === 0) return;
  const interesting = ["type", "entity_type", "created", "updated", "tags"];
  interesting.forEach((key) => {
    const val = fm[key];
    if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) return;
    if (Array.isArray(val)) {
      val.forEach((t) => {
        const pill = document.createElement("span");
        pill.className = "fm-pill fm-tag";
        pill.textContent = t;
        els.frontmatterStrip.appendChild(pill);
      });
    } else {
      const pill = document.createElement("span");
      pill.className = "fm-pill";
      pill.innerHTML = `<span class="fm-key">${escapeHtml(key)}</span>${escapeHtml(String(val))}`;
      els.frontmatterStrip.appendChild(pill);
    }
  });
}

function renderError(msg) {
  els.welcome.hidden = true;
  els.articleHeader.hidden = false;
  els.articleTitle.textContent = "Not found";
  els.breadcrumb.innerHTML = `<a href="/" id="bc-home">wiki</a>`;
  els.frontmatterStrip.innerHTML = "";
  els.article.innerHTML = `<p>${escapeHtml(msg)}</p>`;
  els.backlinksSection.hidden = true;
  document.getElementById("bc-home")?.addEventListener("click", (e) => {
    e.preventDefault();
    goHome();
  });
}

// ============================================================
// markdown preprocessing
// ============================================================
function preprocess(md) {
  md = md.replace(/```mermaid\n([\s\S]*?)```/g, (m, body) => {
    const attrSafe = body.trim()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "&#10;");
    return `<div class="mermaid" data-mermaid-source="${attrSafe}"></div>`;
  });
  md = md.replace(/\[\[([^\]]+)\]\]/g, (match, raw) => {
    const parts = raw.split("|");
    const target = parts[0].trim();
    const display = (parts[1] || target).trim();
    const cleanTarget = target.split("#")[0];
    return `<a class="wikilink" data-target="${escapeHtml(cleanTarget)}" href="#">${escapeHtml(display)}</a>`;
  });
  return md;
}

function postprocess() {
  // wikilinks
  els.article.querySelectorAll("a.wikilink").forEach((a) => {
    const target = a.dataset.target;
    const resolved = resolveLink(target);
    if (resolved) {
      a.dataset.path = resolved;
      a.href = `?p=${encodeURIComponent(resolved)}`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(resolved);
      });
    } else {
      a.classList.add("broken");
      a.title = `Page not found: ${target}`;
      a.addEventListener("click", (e) => e.preventDefault());
    }
  });

  // mermaid diagrams
  rerenderMermaid();

  // math
  if (window.renderMathInElement) {
    try {
      renderMathInElement(els.article, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch (e) {
      console.warn("KaTeX render failed", e);
    }
  }

  // syntax highlighting
  if (window.hljs) {
    els.article.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  // heading anchors
  addHeadingAnchors();

  // external links open in new tab
  els.article.querySelectorAll("a[href^=http]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}

// ============================================================
// heading anchors
// ============================================================
function slugifyHeading(text) {
  return text.trim().toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function addHeadingAnchors() {
  const usedSlugs = new Map();
  els.article.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
    const raw = slugifyHeading(h.textContent);
    const count = usedSlugs.get(raw) || 0;
    const slug = count === 0 ? raw : `${raw}-${count}`;
    usedSlugs.set(raw, count + 1);
    h.id = slug;

    const a = document.createElement("a");
    a.className = "heading-anchor";
    a.href = `#${slug}`;
    a.title = "Link to this section";
    a.setAttribute("aria-hidden", "true");
    a.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = new URL(window.location);
      url.hash = slug;
      history.replaceState(null, "", url);
      h.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    h.appendChild(a);
  });
}

function resolveLink(target) {
  if (state.pathSet.has(target)) return target;
  if (state.stemMap.has(target)) return state.stemMap.get(target);
  const last = target.split("/").pop();
  if (state.stemMap.has(last)) return state.stemMap.get(last);
  return null;
}

async function rerenderMermaid() {
  const blocks = els.article.querySelectorAll(".mermaid");
  if (blocks.length === 0 || !window.mermaid) return;
  const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "loose",
    fontFamily: "Inter, sans-serif",
  });
  for (const block of blocks) {
    const source = block.dataset.mermaidSource ?? block.textContent;
    const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const { svg } = await mermaid.render(id, source);
      block.innerHTML = svg;
    } catch (e) {
      const msg = (e && (e.message || e.str)) || String(e);
      block.innerHTML = `
        <div class="mermaid-error">
          <div class="mermaid-error-title">Mermaid syntax error</div>
          <div class="mermaid-error-msg">${escapeHtml(msg)}</div>
          <pre class="mermaid-error-src">${escapeHtml(source)}</pre>
        </div>`;
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// backlinks
// ============================================================
async function loadBacklinks(path) {
  els.backlinksSection.hidden = true;
  els.backlinksInner.innerHTML = "";
  try {
    const res = await fetch(`/api/backlinks?path=${encodeURIComponent(path)}`);
    const links = await res.json();
    if (!links.length) return;
    els.backlinksCount.textContent = `${links.length}`;
    els.backlinksInner.innerHTML = "";
    links.forEach((link) => {
      const a = document.createElement("a");
      a.className = "backlink-item";
      a.href = `?p=${encodeURIComponent(link.path)}`;
      a.textContent = link.title;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(link.path);
      });
      els.backlinksInner.appendChild(a);
    });
    els.backlinksSection.hidden = false;
  } catch (_) {}
}

// ============================================================
// search
// ============================================================
let searchTimer = null;

async function doSearch(q) {
  state.lastSearchQ = q;
  if (!q || q.length < 2) {
    els.searchResults.hidden = true;
    state.searchResults = [];
    return;
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const results = await res.json();
  state.searchResults = results;
  state.searchFocusIndex = -1;
  renderSearchResults(results, q);
}

function highlightSnippet(snippet, q) {
  if (!q || !snippet) return escapeHtml(snippet || "");
  const escapedSnippet = escapeHtml(snippet);
  const escapedQ = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escapedSnippet.replace(new RegExp(escapedQ, "gi"), (m) => `<mark class="search-mark">${m}</mark>`);
}

function renderSearchResults(results, q) {
  els.searchResults.innerHTML = "";
  if (results.length === 0) {
    els.searchResults.innerHTML = `<div class="search-result"><span class="muted">No results</span></div>`;
  } else {
    results.forEach((r) => {
      const el = document.createElement("div");
      el.className = "search-result";
      el.dataset.path = r.path;
      el.innerHTML = `
        <div class="search-result-title">${escapeHtml(r.title)}</div>
        ${r.snippet ? `<div class="search-result-snippet">${highlightSnippet(r.snippet, q)}</div>` : ""}
      `;
      el.addEventListener("click", () => {
        navigateTo(r.path);
        els.searchInput.value = "";
        els.searchResults.hidden = true;
      });
      els.searchResults.appendChild(el);
    });
  }
  els.searchResults.hidden = false;
}

// ============================================================
// selection + audit
// ============================================================
function onSelectionChange() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    els.selectionToolbar.hidden = true;
    return;
  }
  const range = sel.getRangeAt(0);
  if (!els.article.contains(range.commonAncestorContainer)) {
    els.selectionToolbar.hidden = true;
    return;
  }
  const text = sel.toString().trim();
  if (text.length < 3) {
    els.selectionToolbar.hidden = true;
    return;
  }
  const rect = range.getBoundingClientRect();
  if (!rect || rect.width === 0) {
    els.selectionToolbar.hidden = true;
    return;
  }
  const toolbarHeight = 36;
  const top = window.scrollY + rect.top - toolbarHeight - 8;
  const left = window.scrollX + rect.left + rect.width / 2 - 60;
  els.selectionToolbar.style.top = `${Math.max(window.scrollY + 4, top)}px`;
  els.selectionToolbar.style.left = `${Math.max(8, left)}px`;
  els.selectionToolbar.hidden = false;
  state.pendingSelection = { text, rect };
}

function openAuditModal() {
  if (!state.pendingSelection || !state.currentPath || !state.currentRaw) return;
  const raw = state.currentRaw;
  const text = state.pendingSelection.text;
  let pos = raw.indexOf(text);
  if (pos < 0) {
    const normalized = text.replace(/\s+/g, " ");
    const rawNorm = raw.replace(/\s+/g, " ");
    const normPos = rawNorm.indexOf(normalized);
    if (normPos >= 0) {
      let mapped = 0, normIdx = 0;
      while (mapped < raw.length && normIdx < normPos) {
        const c = raw[mapped];
        if (/\s/.test(c)) {
          while (mapped + 1 < raw.length && /\s/.test(raw[mapped + 1])) mapped++;
        }
        mapped++;
        normIdx++;
      }
      pos = mapped;
    }
  }
  if (pos < 0) {
    showToast("Selection couldn't be located in source markdown (likely inside a rendered diagram or formula). Try selecting plain prose.", true);
    return;
  }
  let matched = raw.slice(pos, pos + text.length);
  if (matched !== text) matched = text;
  const before = raw.slice(Math.max(0, pos - 80), pos);
  const after = raw.slice(pos + matched.length, pos + matched.length + 80);

  state.pendingSelection.anchorBefore = before;
  state.pendingSelection.anchorText = matched;
  state.pendingSelection.anchorAfter = after;

  els.selectionPreview.textContent = matched;
  els.authorInput.value = getAuthor();
  els.commentInput.value = "";
  els.modalError.hidden = true;
  setSeverity("warn");
  els.modalBackdrop.hidden = false;
  setTimeout(() => els.commentInput.focus(), 50);
}

function closeAuditModal() {
  els.modalBackdrop.hidden = true;
}

function setSeverity(sev) {
  state.selectedSeverity = sev;
  els.severityRow.querySelectorAll(".sev-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.sev === sev);
  });
}

async function submitAudit() {
  const author = els.authorInput.value.trim();
  const comment = els.commentInput.value.trim();
  if (!author) { showModalError("Add your name so the AI knows who filed this."); return; }
  if (!comment) { showModalError("Add a comment."); return; }
  setAuthor(author);
  const payload = {
    target: state.currentPath,
    anchor_text: state.pendingSelection.anchorText,
    anchor_before: state.pendingSelection.anchorBefore,
    anchor_after: state.pendingSelection.anchorAfter,
    severity: state.selectedSeverity,
    author,
    comment,
  };
  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      showModalError(data.error || "Failed to file feedback.");
      return;
    }
    closeAuditModal();
    showToast(`Feedback filed: ${data.id}`);
    els.selectionToolbar.hidden = true;
    window.getSelection().removeAllRanges();
  } catch (e) {
    showModalError(e.message);
  }
}

function showModalError(msg) {
  els.modalError.textContent = msg;
  els.modalError.hidden = false;
}

function showToast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", isError);
  els.toast.hidden = false;
  setTimeout(() => { els.toast.hidden = true; }, 4000);
}

function updateSearchFocus(items) {
  items.forEach((el, i) => el.classList.toggle("focused", i === state.searchFocusIndex));
  if (state.searchFocusIndex >= 0 && items[state.searchFocusIndex]) {
    items[state.searchFocusIndex].scrollIntoView({ block: "nearest" });
  }
}

// ============================================================
// audit inbox
// ============================================================
function openInbox() {
  els.inboxBackdrop.hidden = false;
  loadInboxAudits();
}

function closeInbox() {
  els.inboxBackdrop.hidden = true;
}

async function loadInboxAudits() {
  els.inboxList.innerHTML = `<div class="inbox-empty">Loading…</div>`;
  try {
    const res = await fetch("/api/audits");
    const audits = await res.json();
    renderInboxAudits(audits);
  } catch (e) {
    els.inboxList.innerHTML = `<div class="inbox-empty">Failed to load: ${escapeHtml(e.message)}</div>`;
  }
}

function renderInboxAudits(audits) {
  const filtered = state.auditFilter === "open"
    ? audits.filter((a) => a.status === "open")
    : audits;

  if (filtered.length === 0) {
    els.inboxList.innerHTML = `<div class="inbox-empty">${
      state.auditFilter === "open" ? "No open feedback." : "No feedback yet."
    }</div>`;
    return;
  }

  els.inboxList.innerHTML = "";
  filtered.forEach((audit) => {
    const div = document.createElement("div");
    div.className = `inbox-item inbox-item--${escapeHtml(audit.severity)}`;

    const targetDisplay = audit.target.replace(/^wiki\//, "").replace(/\.md$/, "");
    const created = audit.created ? new Date(audit.created) : null;
    const timeStr = created ? relativeTime(created) : "";
    const anchorExcerpt = audit.anchor_text
      ? audit.anchor_text.slice(0, 80) + (audit.anchor_text.length > 80 ? "…" : "")
      : "";

    div.innerHTML = `
      <div class="inbox-item-header">
        <span class="inbox-sev inbox-sev--${escapeHtml(audit.severity)}">${escapeHtml(audit.severity)}</span>
        <a class="inbox-target" href="#" data-path="${escapeHtml(targetDisplay)}">${escapeHtml(targetDisplay)}</a>
        <span class="inbox-meta">${escapeHtml(audit.author)}${timeStr ? " · " + escapeHtml(timeStr) : ""}</span>
      </div>
      ${anchorExcerpt ? `<div class="inbox-anchor">"${escapeHtml(anchorExcerpt)}"</div>` : ""}
      ${audit.comment ? `<div class="inbox-comment">${escapeHtml(audit.comment)}</div>` : ""}
    `;

    div.querySelector(".inbox-target").addEventListener("click", (e) => {
      e.preventDefault();
      closeInbox();
      navigateTo(targetDisplay);
    });

    els.inboxList.appendChild(div);
  });
}

function relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ============================================================
// mobile sidebar
// ============================================================
function toggleSidebar() {
  els.sidebar.classList.toggle("sidebar--open");
}

// ============================================================
// bookmarks
// ============================================================
async function refreshBookmarks() {
  try {
    const res = await fetch("/api/bookmarks");
    const data = await res.json();
    state.bookmarkedPaths = new Set(data.map((b) => b.path));
    return data;
  } catch (_) {
    state.bookmarkedPaths = new Set();
    return [];
  }
}

async function toggleBookmark(path) {
  const isBookmarked = state.bookmarkedPaths.has(path);
  try {
    await fetch(isBookmarked ? "/api/unbookmark" : "/api/bookmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (isBookmarked) state.bookmarkedPaths.delete(path);
    else state.bookmarkedPaths.add(path);
  } catch (_) {}
}

const STAR_OUTLINE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const STAR_FILLED = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const STAR_OUTLINE_SM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const STAR_FILLED_SM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

function updateBookmarkBtn() {
  if (!els.bookmarkBtn || !state.wikiPath) return;
  const isBookmarked = state.bookmarkedPaths.has(state.wikiPath);
  els.bookmarkBtn.classList.toggle("icon-btn--active", isBookmarked);
  els.bookmarkBtn.title = isBookmarked ? "Remove bookmark" : "Bookmark this wiki";
  els.bookmarkBtn.innerHTML = isBookmarked ? STAR_FILLED : STAR_OUTLINE;
}

function renderPickerBookmarks(bookmarks) {
  const valid = bookmarks.filter((b) => b.valid);
  if (!valid.length) {
    els.pickerBookmarksSection.hidden = true;
    return;
  }
  els.pickerBookmarks.innerHTML = "";
  valid.forEach((b) => {
    const row = document.createElement("div");
    row.className = "picker-bookmark-item";
    row.innerHTML = `
      <div class="picker-bookmark-main">
        ${STAR_FILLED_SM}
        <span class="picker-recent-name">${escapeHtml(b.name)}</span>
        <span class="picker-recent-path">${escapeHtml(b.path)}</span>
      </div>
      <button class="picker-item-star picker-item-star--active" title="Remove bookmark">${STAR_FILLED_SM}</button>
    `;
    row.querySelector(".picker-bookmark-main").addEventListener("click", () => doOpenWiki(b.path));
    row.querySelector(".picker-item-star").addEventListener("click", async () => {
      await toggleBookmark(b.path);
      const data = await refreshBookmarks();
      renderPickerBookmarks(data);
      renderPickerRecents(await fetch("/api/recents").then((r) => r.json()));
    });
    els.pickerBookmarks.appendChild(row);
  });
  els.pickerBookmarksSection.hidden = false;
}

function renderPickerRecents(recents) {
  const valid = recents.filter((r) => r.valid);
  if (!valid.length) {
    els.pickerRecentsSection.hidden = true;
    return;
  }
  els.pickerRecents.innerHTML = "";
  valid.forEach((r) => {
    const isBookmarked = state.bookmarkedPaths.has(r.path);
    const row = document.createElement("div");
    row.className = "picker-recent-item";
    row.innerHTML = `
      <div class="picker-recent-main">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="picker-recent-name">${escapeHtml(r.name)}</span>
        <span class="picker-recent-path">${escapeHtml(r.path)}</span>
      </div>
      <button class="picker-item-star${isBookmarked ? " picker-item-star--active" : ""}" title="${isBookmarked ? "Remove bookmark" : "Bookmark"}">${isBookmarked ? STAR_FILLED_SM : STAR_OUTLINE_SM}</button>
    `;
    row.querySelector(".picker-recent-main").addEventListener("click", () => doOpenWiki(r.path));
    row.querySelector(".picker-item-star").addEventListener("click", async () => {
      await toggleBookmark(r.path);
      const [bookmarkData, recentsData] = await Promise.all([
        refreshBookmarks(),
        fetch("/api/recents").then((res) => res.json()),
      ]);
      renderPickerBookmarks(bookmarkData);
      renderPickerRecents(recentsData);
    });
    els.pickerRecents.appendChild(row);
  });
  els.pickerRecentsSection.hidden = false;
}

// ============================================================
// wiki picker
// ============================================================
function showPicker() {
  els.welcome.hidden = true;
  els.articleHeader.hidden = true;
  els.article.innerHTML = "";
  els.backlinksSection.hidden = true;
  els.picker.hidden = false;
}

function hidePicker() {
  els.picker.hidden = true;
  els.pickerError.hidden = true;
}

async function openPicker() {
  showPicker();
  // Bookmarks must load before recents (recents rendering reads state.bookmarkedPaths)
  const [bookmarkData, fsData] = await Promise.all([
    refreshBookmarks(),
    fetchFs(state.fsCurrentPath),
  ]);
  renderPickerBookmarks(bookmarkData);
  renderFsEntries(fsData);
  try {
    const recentsData = await fetch("/api/recents").then((r) => r.json());
    renderPickerRecents(recentsData);
  } catch (_) {}
}

async function fetchFs(dirPath) {
  try {
    const url = dirPath
      ? `/api/fs?path=${encodeURIComponent(dirPath)}`
      : "/api/fs";
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    return { path: dirPath || "", parent: null, entries: [], error: e.message };
  }
}

async function navigateFs(dirPath) {
  const data = await fetchFs(dirPath);
  renderFsEntries(data);
}

function renderFsEntries(data) {
  state.fsCurrentPath = data.path;
  state.fsParent = data.parent;
  state.fsSelectedPath = null;

  // breadcrumb
  const parts = data.path.split(/[/\\]/).filter(Boolean);
  els.pickerBreadcrumb.innerHTML = "";
  // build cumulative paths for breadcrumb
  const sep = data.path.includes("/") ? "/" : "\\";
  let cumulative = data.path.startsWith("/") ? "/" : (parts[0] + sep);
  const crumbs = [];
  if (data.path.startsWith("/")) {
    crumbs.push({ label: "/", path: "/" });
    parts.forEach((part) => {
      cumulative = cumulative === "/" ? "/" + part : cumulative + "/" + part;
      crumbs.push({ label: part, path: cumulative });
    });
  } else {
    // Windows-style or relative — just show the full path as one crumb
    crumbs.push({ label: data.path, path: data.path });
  }
  crumbs.forEach((crumb, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "picker-bc-sep";
      sep.textContent = "/";
      els.pickerBreadcrumb.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.className = "picker-bc-part";
    btn.textContent = crumb.label || sep;
    btn.addEventListener("click", () => navigateFs(crumb.path));
    els.pickerBreadcrumb.appendChild(btn);
  });

  // up button
  els.pickerUpBtn.disabled = !data.parent;

  // update path input
  els.pickerPathInput.value = data.path;

  // entries
  els.pickerEntries.innerHTML = "";
  if (data.error) {
    els.pickerEntries.innerHTML = `<div class="picker-empty">${escapeHtml(data.error)}</div>`;
    return;
  }
  if (!data.entries || data.entries.length === 0) {
    els.pickerEntries.innerHTML = `<div class="picker-empty">No subdirectories</div>`;
    return;
  }
  data.entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "picker-entry" + (entry.is_wiki ? " picker-entry--wiki" : "");
    row.dataset.path = entry.path;
    row.innerHTML = `
      <svg class="picker-entry-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span class="picker-entry-name">${escapeHtml(entry.name)}</span>
      ${entry.is_wiki ? `<span class="picker-entry-badge">wiki</span>` : ""}
      <svg class="picker-entry-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    `;

    // single click: select (if wiki) or navigate
    row.addEventListener("click", (e) => {
      if (entry.is_wiki) {
        // select this entry
        els.pickerEntries.querySelectorAll(".picker-entry").forEach((r) =>
          r.classList.remove("picker-entry--selected"));
        row.classList.add("picker-entry--selected");
        state.fsSelectedPath = entry.path;
        els.pickerPathInput.value = entry.path;
        els.pickerError.hidden = true;
      } else {
        navigateFs(entry.path);
      }
    });

    // double click: open wiki or navigate into dir
    row.addEventListener("dblclick", () => {
      if (entry.is_wiki) {
        doOpenWiki(entry.path);
      } else {
        navigateFs(entry.path);
      }
    });

    els.pickerEntries.appendChild(row);
  });
}

async function doOpenWiki(path) {
  const targetPath = path || els.pickerPathInput.value.trim();
  if (!targetPath) {
    showPickerError("Enter a path to a wiki root directory.");
    return;
  }
  els.pickerOpenBtn.disabled = true;
  els.pickerOpenBtn.textContent = "Opening…";
  try {
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath }),
    });
    const data = await res.json();
    if (!data.ok) {
      showPickerError(data.error || "Failed to open wiki.");
      return;
    }
    // Success — reload so the full app initializes with the new wiki
    window.location.href = "/";
  } catch (e) {
    showPickerError(e.message);
  } finally {
    els.pickerOpenBtn.disabled = false;
    els.pickerOpenBtn.textContent = "Open";
  }
}

function showPickerError(msg) {
  els.pickerError.textContent = msg;
  els.pickerError.hidden = false;
}

// ============================================================
// init
// ============================================================
async function init() {
  initTheme();
  els.themeToggle.addEventListener("click", toggleTheme);
  els.homeLink.addEventListener("click", (e) => { e.preventDefault(); goHome(); });
  els.whoLink.addEventListener("click", (e) => {
    e.preventDefault();
    const name = prompt("Your name (used for audit comments):", getAuthor());
    if (name !== null) setAuthor(name.trim());
  });
  setAuthor(getAuthor());

  els.hamburger.addEventListener("click", toggleSidebar);
  els.openWikiBtn.addEventListener("click", openPicker);
  els.bookmarkBtn.addEventListener("click", async () => {
    if (!state.wikiPath) return;
    await toggleBookmark(state.wikiPath);
    updateBookmarkBtn();
  });

  // Picker interactions
  els.pickerUpBtn.addEventListener("click", () => {
    if (state.fsParent) navigateFs(state.fsParent);
  });
  els.pickerOpenBtn.addEventListener("click", () => doOpenWiki(null));
  els.pickerPathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doOpenWiki(null);
  });
  els.pickerPathInput.addEventListener("input", () => {
    state.fsSelectedPath = null;
    els.pickerEntries.querySelectorAll(".picker-entry--selected").forEach((r) =>
      r.classList.remove("picker-entry--selected"));
  });

  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(() => doSearch(q), 120);
  });
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      els.searchInput.value = "";
      els.searchResults.hidden = true;
      els.searchInput.blur();
      return;
    }
    if (els.searchResults.hidden) return;
    const items = els.searchResults.querySelectorAll(".search-result[data-path]");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.searchFocusIndex = Math.min(items.length - 1, state.searchFocusIndex + 1);
      updateSearchFocus(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.searchFocusIndex = Math.max(0, state.searchFocusIndex - 1);
      updateSearchFocus(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = state.searchFocusIndex >= 0 ? state.searchFocusIndex : 0;
      if (items[idx]) items[idx].click();
    }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
    if (e.key === "Escape") {
      if (!els.modalBackdrop.hidden) closeAuditModal();
      if (!els.inboxBackdrop.hidden) closeInbox();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".sidebar-search")) {
      els.searchResults.hidden = true;
    }
  });

  document.addEventListener("mouseup", onSelectionChange);
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey) onSelectionChange();
  });
  els.auditBtn.addEventListener("click", openAuditModal);

  els.modalClose.addEventListener("click", closeAuditModal);
  els.modalCancel.addEventListener("click", closeAuditModal);
  els.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeAuditModal();
  });
  els.severityRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".sev-btn");
    if (btn) setSeverity(btn.dataset.sev);
  });
  els.modalSubmit.addEventListener("click", submitAudit);

  // inbox
  els.inboxBtn.addEventListener("click", (e) => { e.preventDefault(); openInbox(); });
  els.inboxClose.addEventListener("click", closeInbox);
  els.inboxBackdrop.addEventListener("click", (e) => {
    if (e.target === els.inboxBackdrop) closeInbox();
  });
  els.inboxFilterRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".inbox-filter-btn");
    if (!btn) return;
    state.auditFilter = btn.dataset.filter;
    els.inboxFilterRow.querySelectorAll(".inbox-filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === state.auditFilter);
    });
    loadInboxAudits();
  });

  window.addEventListener("popstate", () => {
    if (!els.picker.hidden) return; // ignore popstate while picker is open
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) loadPage(p);
    else goHome(false);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem("lwv-theme")) initTheme();
  });

  // Health check → picker or wiki
  try {
    const res = await fetch("/api/health");
    const health = await res.json();
    if (!health.has_wiki) {
      // No wiki loaded — show picker immediately
      const fsRes = await fetch("/api/home");
      const { path: home } = await fsRes.json();
      state.fsCurrentPath = home;
      openPicker();
      return;
    }
    state.wikiPath = health.wiki_open_path;
    els.bookmarkBtn.hidden = false;
  } catch (_) {}

  // Wiki is loaded — normal init
  await Promise.all([loadWelcome(), loadTree(), refreshBookmarks()]);
  updateBookmarkBtn();
  const params = new URLSearchParams(window.location.search);
  const p = params.get("p");
  if (p) loadPage(p);
}

document.addEventListener("DOMContentLoaded", () => { init(); });
