(() => {
  "use strict";

  if (globalThis.__rumbleTranscriptCopier) {
    return;
  }
  globalThis.__rumbleTranscriptCopier = true;

  const BUTTON_ID = "rumble-transcript-copier-btn";
  const STYLE_ID = "rumble-transcript-copier-style";
  const LABEL = "Copy transcript";

  const HOST_SELECTORS = [
    ".media-by-actions-container",
    ".media-heading-info",
    ".media-by-wrap",
  ];

  let ensureTimer = 0;
  let resetTimer = 0;

  // ---------- Embed id ----------

  const EMBED_ID = /\/embed\/(v[a-z0-9]+)/i;

  function embedIdFromPage() {
    // 1. oembed <link> — its url param is the embed URL.
    const oembed = document.querySelector('link[type*="oembed"]')?.href;
    if (oembed) {
      try {
        const target = new URL(oembed).searchParams.get("url") || "";
        const m = target.match(EMBED_ID);
        if (m) return m[1];
      } catch {
        // fall through
      }
    }
    // 2. JSON-LD embedUrl / og:video / embedded iframe.
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const m = (script.textContent || "").match(EMBED_ID);
      if (m) return m[1];
    }
    const candidates = [
      document.querySelector('meta[property="og:video"]')?.content,
      document.querySelector('meta[property="og:video:url"]')?.content,
      document.querySelector('iframe[src*="/embed/"]')?.src,
    ];
    for (const value of candidates) {
      const m = String(value || "").match(EMBED_ID);
      if (m) return m[1];
    }
    // 3. Embed page itself.
    return location.pathname.match(EMBED_ID)?.[1] || null;
  }

  function isVideoPage() {
    return Boolean(embedIdFromPage());
  }

  // ---------- VTT parsing ----------

  function formatTimestamp(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `[${h}:${pad(m)}:${pad(s)}]` : `[${m}:${pad(s)}]`;
  }

  function parseVttTime(raw) {
    const parts = raw.trim().replace(",", ".").split(":").map(Number);
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  function decodeEntities(text) {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  function parseVtt(vtt) {
    const blocks = String(vtt || "")
      .replace(/\r/g, "")
      .split(/\n{2,}/);
    const lines = [];
    let previous = "";
    for (const block of blocks) {
      const rows = block.split("\n");
      const timeIdx = rows.findIndex((r) => r.includes("-->"));
      if (timeIdx === -1) continue;
      const start = parseVttTime(rows[timeIdx].split("-->")[0]);
      const text = decodeEntities(
        rows
          .slice(timeIdx + 1)
          .join(" ")
          .replace(/<[^>]+>/g, "")
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!text || text === previous) continue;
      previous = text;
      lines.push(`${formatTimestamp(start)} ${text}`);
    }
    return lines.join("\n");
  }

  // ---------- Track selection ----------

  function pickTrack(cc) {
    const entries = Object.entries(cc || {}).filter(([, t]) => t && t.path);
    if (!entries.length) return null;
    const rank = ([code, track]) => {
      const isAuto =
        /auto/i.test(code) || /auto/i.test(String(track.language || ""));
      const isEnglish = /^en\b/i.test(code);
      return [isAuto ? 1 : 0, isEnglish ? 0 : 1];
    };
    entries.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1];
    });
    return entries[0][1];
  }

  // ---------- Fetch ----------

  async function getTranscriptText() {
    const id = embedIdFromPage();
    if (!id) {
      throw new Error("Open a Rumble video to copy its transcript.");
    }

    const apiUrl = `${location.origin}/embedJS/u3/?request=video&ver=2&v=${encodeURIComponent(id)}`;
    const apiRes = await fetch(apiUrl, { credentials: "include" });
    if (!apiRes.ok) {
      throw new Error("Couldn’t load video data. Try again.");
    }
    const data = await apiRes.json();

    const track = pickTrack(data.cc);
    if (!track) {
      throw new Error("This video has no captions.");
    }

    const vttRes = await fetch(new URL(track.path, location.origin).toString());
    if (!vttRes.ok) {
      throw new Error("Couldn’t load captions. Try again.");
    }
    const text = parseVtt(await vttRes.text());
    if (!text) {
      throw new Error("The captions were empty.");
    }
    return text;
  }

  // ---------- Button ----------

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        box-sizing: border-box;
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        height: 36px;
        padding: 0 16px;
        margin: 0 0 0 8px;
        border: 1px solid rgba(128, 128, 128, 0.35);
        border-radius: 18px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        vertical-align: middle;
      }
      #${BUTTON_ID}:hover { background: rgba(128, 128, 128, 0.18); }
      #${BUTTON_ID}:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      #${BUTTON_ID}.is-error { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setLabel(button, label, className) {
    button.textContent = label;
    button.classList.remove("is-copied", "is-error");
    if (className) button.classList.add(className);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(
      () => {
        button.textContent = LABEL;
        button.classList.remove("is-copied", "is-error");
      },
      className === "is-error" ? 2500 : 1500
    );
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = LABEL;
    button.setAttribute("aria-label", LABEL);
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.busy === "1") return;
      button.dataset.busy = "1";
      try {
        const text = await getTranscriptText();
        await navigator.clipboard.writeText(text);
        setLabel(button, "Copied!", "is-copied");
      } catch (err) {
        const message = err?.message || "Couldn’t copy";
        setLabel(button, message.length > 28 ? "Couldn’t copy" : message, "is-error");
      } finally {
        button.dataset.busy = "0";
      }
    });
    return button;
  }

  function ensureButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (!isVideoPage()) {
      existing?.remove();
      return;
    }
    let host = null;
    for (const selector of HOST_SELECTORS) {
      host = document.querySelector(selector);
      if (host) break;
    }
    if (!host) return;
    ensureStyles();
    const button = existing || createButton();
    if (button.parentElement !== host) {
      host.appendChild(button);
    }
  }

  function scheduleEnsure() {
    clearTimeout(ensureTimer);
    ensureTimer = setTimeout(ensureButton, 100);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "getTranscript") return;
    return getTranscriptText()
      .then((text) => ({ ok: true, text }))
      .catch((err) => ({
        ok: false,
        error: err?.message || "Couldn’t get the transcript.",
      }));
  });

  new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) scheduleEnsure();
  }).observe(document.documentElement, { childList: true, subtree: true });

  ensureButton();
})();
