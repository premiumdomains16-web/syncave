(function () {
  if (window.__SyncaveLoaded__) return;
  window.__SyncaveLoaded__ = true;

  // Preview mode (Syncave simulator): the page hands us the bot config directly
  // instead of us fetching the published one. No history is kept and orders are
  // never submitted. Shape: { bot, container?: Element }.
  const PREVIEW = window.SyncavePreview && typeof window.SyncavePreview === "object" ? window.SyncavePreview : null;
  // Owner's simulator: save the chat to the Inbox as a test conversation (same-origin, uses the owner's login).
  const TEST = !!(PREVIEW && PREVIEW.testLog);

  const script =
    document.currentScript ||
    Array.from(document.scripts).find((s) => /\/widget\.js(\?|$)/.test(s.src || ""));
  if (!script && !PREVIEW) return;

  const url = new URL(script ? script.src : location.href, location.href);
  const API = url.origin;
  const botId = PREVIEW ? (PREVIEW.bot && PREVIEW.bot.id) || "preview" : url.searchParams.get("id");
  if (!botId) {
    console.warn("[Syncave] Missing bot id in script URL");
    return;
  }

  const STORE_KEY = `__syncave_history_${botId}`;
  const CONV_KEY = `__syncave_conv_${botId}`;
  const VISITOR_KEY = "__syncave_visitor";
  let history = [];
  // Conversation sync: a stable per-browser visitor id and a per-tab conversation id.
  const rid = (n) => { let s = ""; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); };
  let visitorId = "";
  let convId = null;
  if (!PREVIEW) {
    try { visitorId = localStorage.getItem(VISITOR_KEY) || ""; if (!visitorId) { visitorId = "v" + rid(11); localStorage.setItem(VISITOR_KEY, visitorId); } } catch { visitorId = "v" + rid(11); }
    try { convId = sessionStorage.getItem(CONV_KEY) || null; } catch {}
  }
  if (!PREVIEW) {
    try {
      history = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    } catch {}
  }

  // ---- Helpers ----
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "style") Object.assign(node.style, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function md(text) {
    // Quotes are escaped too, so a link like [x](https://a"onclick="…) can't break out of href="…".
    const esc = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return esc
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n/g, "<br>");
  }

  function hexToRgb(hex) {
    const m = String(hex).trim().replace("#", "");
    const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
    const n = parseInt(full, 16);
    if (isNaN(n) || full.length !== 6) return "79, 70, 229";
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function fmtTime(d, labels) {
    d = d || new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const am = h < 12 ? (labels ? labels.am : "AM") : (labels ? labels.pm : "PM");
    h = h % 12 || 12;
    return `${h}:${m} ${am}`;
  }

  // Tokenize (English + Arabic) and remove common stop words.
  // Mirrors src/lib/matcher.ts — change both together.
  const STOP = new Set([
    ..."a an the is are was were do does did how what when where why who which can could would should i my me you your we our this that of to in on at for with and or but if it its please tell know want much many".split(" "),
    ..."في من علي الي عن ما ماذا كيف هل متي اين لماذا هو هي انا انت انتم نحن هذا هذه ذلك تلك التي الذي و او ثم مع كم عند لو ان يا اي لا لم لن قد كل بعض".split(" "),
    ..."ازاي فين امتي ليه ايه عايز عاوزه عايزه عاوز عايزين عاوزين ممكن انا احنا ده دي دا بتاع بتاعكم عندكم كام بكام اعرف نعرف اسال سمحت حضرتك لو سمحت طيب بس برضه".split(" "),
  ]);
  function normalizeArabic(s) {
    return s
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  }
  function stripArabicPrefix(t) {
    for (const p of ["وال", "بال", "كال", "فال", "لل", "ال"]) {
      if (t.startsWith(p) && t.length - p.length >= 2) return t.slice(p.length);
    }
    if (t.length > 3 && (t[0] === "و" || t[0] === "ف")) return t.slice(1);
    return t;
  }
  function tokens(s) {
    return normalizeArabic(String(s).toLowerCase())
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t))
      .map(stripArabicPrefix)
      .filter((t) => t && !STOP.has(t));
  }

  function bestMatch(query, qa) {
    const q = tokens(query);
    if (!q.length) return null;
    let best = null;
    let bestScore = 0;
    for (const item of qa) {
      const t = tokens(item.question);
      if (!t.length) continue;
      const set = new Set(t);
      let hits = 0;
      for (const w of q) if (set.has(w)) hits++;
      const score = hits / Math.max(t.length, q.length);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore >= 0.34 ? best : null;
  }

  // ---- Boot ----
  if (PREVIEW) {
    mount(PREVIEW.bot || {});
    return;
  }
  fetch(`${API}/api/bot/${encodeURIComponent(botId)}/public`)
    .then(async (r) => {
      if (r.status === 404) {
        const data = await r.json().catch(() => ({}));
        console.warn("[Syncave] Not loaded:", data.error || "Bot not found");
        return null;
      }
      if (!r.ok) throw new Error("Failed to fetch bot config");
      return r.json();
    })
    .then((bot) => bot && mount(bot))
    .catch((err) => console.warn("[Syncave] Failed to load:", err));

  function mount(bot) {
    const theme = bot.themeColor || "#4f46e5";
    const themeRGB = hexToRgb(theme);
    const qa = bot.qa || [];
    const enableOrders = bot.enableOrders || false;

    // Built-in labels follow the bot's language: Arabic if most of its text is Arabic.
    const sample = [bot.welcomeMessage || ""].concat(qa.map((q) => q.question)).join(" ");
    const arabicChars = (sample.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (sample.match(/[A-Za-z]/g) || []).length;
    const AR = arabicChars > latinChars;
    const T = AR
      ? {
          placeholder: "اكتب سؤالك...", message: "رسالة", send: "إرسال", close: "إغلاق", openChat: "افتح المحادثة",
          online: "متصل الآن", poweredBy: "مدعوم من", order: "اطلب الآن", name: "الاسم", email: "البريد الإلكتروني",
          phone: "رقم الموبايل (اختياري)", details: "تفاصيل الطلب", submit: "إرسال الطلب", submitting: "جارٍ الإرسال...",
          thanks: "شكراً لطلبك! هنتواصل معاك قريب.", failed: "للأسف ماقدرناش نبعت الطلب. حاول تاني.",
          fallback: "معنديش إجابة على السؤال ده لسه.", welcome: "أهلاً! إزاي أقدر أساعدك؟", am: "ص", pm: "م", team: "رد من فريق الموقع",
          previewOrder: "(معاينة) على موقعك الحقيقي، الطلب ده هيوصلك في لوحة التحكم.",
          menuTitle: "اختار سؤال", menuMore: "أسئلة تانية", menuBack: "ارجع لأول الأسئلة", resume: "نكمل من حيث وقفنا، اختار سؤال:",
          teamOption: "ابعت رسالة للفريق", teamPrompt: "أكيد! اكتب رسالتك تحت، وحد من الفريق هيرد عليك هنا في نفس المحادثة.",
          teamPlaceholder: "اكتب رسالتك للفريق...", teamBar: "رسالة للفريق", cancel: "إلغاء",
          teamSent: "شكراً! رسالتك وصلت للفريق، وهيردوا عليك هنا في نفس المحادثة.", teamForwarded: "بعت رسالتك للفريق، وهيردوا عليك هنا.",
        }
      : {
          placeholder: "Type a question...", message: "Message", send: "Send", close: "Close", openChat: "Open chat",
          online: "Online", poweredBy: "Powered by", order: "Place an order", name: "Your name", email: "Your email",
          phone: "Phone (optional)", details: "Order details", submit: "Submit order", submitting: "Submitting...",
          thanks: "Thank you for your order! We'll get back to you soon.", failed: "Sorry, we couldn't submit your order. Please try again.",
          fallback: "I don't have an answer for that yet.", welcome: "Hi! How can I help?", am: "AM", pm: "PM", team: "Reply from the team",
          previewOrder: "(Preview) On your live site, this order would arrive in your dashboard.",
          menuTitle: "Choose a question", menuMore: "More questions", menuBack: "Back to the first questions", resume: "Here's where we left off. Pick a question to continue:",
          teamOption: "Message the team", teamPrompt: "Sure! Write your message below and someone from the team will reply right here.",
          teamPlaceholder: "Write your message to the team...", teamBar: "Message to the team", cancel: "Cancel",
          teamSent: "Thanks! Your message was sent to the team. They'll reply right here in this chat.", teamForwarded: "I've passed your message to the team, and they'll reply here.",
        };

    const style = el("style");
    style.textContent = `
      .sb-root, .sb-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      .sb-root { position: fixed; bottom: 20px; right: 20px; z-index: 2147483000; --sb-theme: ${theme}; --sb-theme-rgb: ${themeRGB}; }

      @keyframes sb-pulse-ring {
        0% { transform: scale(1); opacity: 0.55; }
        80%, 100% { transform: scale(1.7); opacity: 0; }
      }
      @keyframes sb-msg-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes sb-typing {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-4px); opacity: 1; }
      }
      @keyframes sb-dot-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); }
        50% { box-shadow: 0 0 0 5px rgba(74,222,128,0); }
      }

      .sb-bubble-wrap { position: relative; }
      .sb-bubble-wrap::before {
        content: ""; position: absolute; inset: 0; border-radius: 50%;
        background: var(--sb-theme); opacity: 0; pointer-events: none;
        animation: sb-pulse-ring 2.4s ease-out infinite;
      }
      .sb-bubble {
        position: relative;
        width: 60px; height: 60px; border-radius: 50%;
        background: linear-gradient(135deg, var(--sb-theme), rgba(var(--sb-theme-rgb), 0.85));
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 12px 30px rgba(var(--sb-theme-rgb), 0.35), 0 4px 12px rgba(0,0,0,0.12);
        transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .2s ease; color: white;
      }
      .sb-bubble:hover { transform: translateY(-3px) scale(1.06); box-shadow: 0 16px 36px rgba(var(--sb-theme-rgb), 0.45); }
      .sb-bubble:active { transform: scale(0.94); }
      .sb-bubble svg { width: 26px; height: 26px; }
      .sb-bubble-badge {
        position: absolute; top: -2px; right: -2px;
        min-width: 18px; height: 18px; padding: 0 5px;
        background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
        border-radius: 9px; display: none; align-items: center; justify-content: center;
        border: 2px solid #fff;
      }
      .sb-bubble-badge.sb-show { display: flex; }
      .sb-owner { border: 1px solid rgba(var(--sb-theme-rgb), 0.35) !important; }
      .sb-owner-tag { font-size: 10.5px; font-weight: 700; color: var(--sb-theme); margin-bottom: 4px; letter-spacing: .01em; }

      .sb-panel {
        position: absolute; bottom: 76px; right: 0;
        width: min(380px, calc(100vw - 40px)); height: min(600px, calc(100vh - 120px));
        /* --sb-avail = height of the box the widget lives in (set when embedded in a preview frame); dvh ignores mobile browser bars. */
        height: min(600px, calc(var(--sb-avail, 100dvh) - 110px));
        background: #fff; border-radius: 22px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.20), 0 8px 20px rgba(0,0,0,0.10);
        display: flex; flex-direction: column;
        opacity: 0; transform: translateY(16px) scale(.96); pointer-events: none;
        transition: opacity .22s ease, transform .28s cubic-bezier(.34,1.56,.64,1);
        border: 1px solid rgba(0,0,0,0.06);
      }
      .sb-panel.sb-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

      .sb-header {
        background: linear-gradient(135deg, var(--sb-theme) 0%, rgba(var(--sb-theme-rgb), 0.85) 100%);
        color: #fff; padding: 18px 20px; display: flex; align-items: center; gap: 12px;
        position: relative; overflow: hidden;
      }
      .sb-header::after {
        content: ""; position: absolute; right: -40px; top: -40px; width: 140px; height: 140px;
        background: radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%);
        pointer-events: none;
      }
      .sb-header-logo { width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; overflow: hidden; backdrop-filter: blur(8px); }
      .sb-header-logo img { width: 100%; height: 100%; object-fit: cover; }
      .sb-avatar { width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(8px); }
      .sb-avatar svg { width: 22px; height: 22px; color: #fff; }
      .sb-title { font-weight: 700; font-size: 15px; line-height: 1.2; letter-spacing: -0.01em; }
      .sb-sub { font-size: 11.5px; opacity: 0.92; display: flex; align-items: center; gap: 6px; margin-top: 3px; }
      .sb-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; animation: sb-dot-pulse 2s infinite; }
      .sb-close { margin-left: auto; background: rgba(255,255,255,0.18); border: 0; color: #fff; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s, transform .15s; position: relative; z-index: 1; }
      .sb-close:hover { background: rgba(255,255,255,0.32); transform: rotate(90deg); }
      .sb-close svg { width: 16px; height: 16px; }

      .sb-body {
        flex: 1; overflow-y: auto; padding: 18px; background: #f7f8fb;
        scroll-behavior: smooth;
      }
      .sb-body::-webkit-scrollbar { width: 6px; }
      .sb-body::-webkit-scrollbar-track { background: transparent; }
      .sb-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
      .sb-body::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.22); }
      .sb-body-with-bg { background-size: cover; background-position: center; }
      .sb-body-with-bg::before { content: ""; }

      .sb-msg { display: flex; margin-bottom: 10px; align-items: flex-end; gap: 8px; animation: sb-msg-in .25s ease both; }
      .sb-msg.sb-user { justify-content: flex-end; }
      .sb-msg-avatar {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        background: linear-gradient(135deg, var(--sb-theme), rgba(var(--sb-theme-rgb), 0.8));
        display: flex; align-items: center; justify-content: center; color: #fff;
        box-shadow: 0 2px 6px rgba(var(--sb-theme-rgb), 0.3);
      }
      .sb-msg-avatar svg { width: 14px; height: 14px; }
      .sb-msg-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
      .sb-bubble-msg {
        max-width: 78%; padding: 10px 14px; border-radius: 18px; font-size: 13.5px;
        line-height: 1.5; word-wrap: break-word; overflow-wrap: anywhere;
      }
      .sb-bot .sb-bubble-msg {
        background: #fff; color: #1f2937; border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.04);
      }
      .sb-user .sb-bubble-msg {
        background: linear-gradient(135deg, var(--sb-theme), rgba(var(--sb-theme-rgb), 0.88));
        color: #fff; border-bottom-right-radius: 4px;
        box-shadow: 0 2px 8px rgba(var(--sb-theme-rgb), 0.25);
      }
      .sb-bubble-msg a { color: inherit; text-decoration: underline; }
      .sb-bubble-msg code { background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
      .sb-user .sb-bubble-msg code { background: rgba(255,255,255,0.2); }
      .sb-time { font-size: 10px; color: #9ca3af; margin: 2px 4px 8px; padding-left: 34px; }
      .sb-msg.sb-user + .sb-time { text-align: right; padding-left: 0; padding-right: 4px; }

      .sb-typing {
        display: inline-flex; gap: 4px; padding: 14px 16px; background: #fff;
        border-radius: 18px; border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.04);
      }
      .sb-typing span {
        width: 6px; height: 6px; border-radius: 50%; background: #9ca3af;
        animation: sb-typing 1.3s infinite ease-in-out;
      }
      .sb-typing span:nth-child(2) { animation-delay: 0.15s; }
      .sb-typing span:nth-child(3) { animation-delay: 0.3s; }

      .sb-bubble-options {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-top: 10px; padding-top: 10px;
        border-top: 1px dashed rgba(0,0,0,0.08);
      }
      .sb-bubble-chip {
        background: rgba(var(--sb-theme-rgb), 0.08);
        border: 1px solid rgba(var(--sb-theme-rgb), 0.18);
        color: var(--sb-theme);
        padding: 6px 12px; border-radius: 999px; font-size: 12px; cursor: pointer;
        transition: all .18s ease; font-weight: 500; font-family: inherit;
        text-align: left; line-height: 1.3;
      }
      .sb-bubble-chip:hover {
        background: var(--sb-theme); color: #fff; border-color: var(--sb-theme);
        transform: translateY(-1px); box-shadow: 0 4px 10px rgba(var(--sb-theme-rgb), 0.25);
      }
      .sb-bubble-chip:active { transform: translateY(0); }
      .sb-menu { flex-direction: column; flex-wrap: nowrap; gap: 6px; }
      .sb-menu-title { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
      .sb-menu-item {
        display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
        background: #fff; border: 1px solid rgba(var(--sb-theme-rgb), 0.22); color: #1f2937;
        padding: 9px 12px; border-radius: 12px; font-size: 13px; font-weight: 500; font-family: inherit;
        text-align: start; line-height: 1.35; cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease;
      }
      .sb-menu-item:hover { background: rgba(var(--sb-theme-rgb), 0.08); border-color: var(--sb-theme); color: var(--sb-theme); }
      .sb-menu-arrow { display: inline-flex; flex-shrink: 0; width: 14px; height: 14px; color: var(--sb-theme); }
      .sb-menu-arrow svg { width: 14px; height: 14px; }
      .sb-menu-more {
        align-self: flex-start; background: none; border: none; padding: 4px 2px; cursor: pointer;
        color: var(--sb-theme); font-size: 12px; font-weight: 600; font-family: inherit; text-decoration: underline; text-underline-offset: 3px;
      }
      .sb-menu-team {
        display: flex; align-items: center; gap: 8px; width: 100%;
        background: rgba(var(--sb-theme-rgb), 0.08); border: 1px dashed rgba(var(--sb-theme-rgb), 0.45); color: var(--sb-theme);
        padding: 9px 12px; border-radius: 12px; font-size: 13px; font-weight: 600; font-family: inherit; text-align: start; cursor: pointer;
        transition: background .15s ease;
      }
      .sb-menu-team:hover { background: rgba(var(--sb-theme-rgb), 0.14); }
      .sb-menu-team svg { width: 15px; height: 15px; flex-shrink: 0; }
      .sb-team-bar {
        display: none; align-items: center; justify-content: space-between; gap: 8px;
        padding: 7px 14px; font-size: 12px; font-weight: 600; color: var(--sb-theme);
        background: rgba(var(--sb-theme-rgb), 0.08); border-top: 1px solid rgba(var(--sb-theme-rgb), 0.15);
      }
      .sb-team-bar.sb-show { display: flex; }
      .sb-team-bar span { display: inline-flex; align-items: center; gap: 6px; }
      .sb-team-bar svg { width: 14px; height: 14px; }
      .sb-team-cancel { background: none; border: 0; color: #6b7280; font: inherit; font-weight: 500; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .sb-menu-order { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; margin-top: 2px; }
      .sb-bubble-chip:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      .sb-order-form {
        background: #fff; border: 1px solid #e5e7eb; border-radius: 14px;
        padding: 14px; margin: 4px 0; max-width: 100%; flex: 1;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      }
      .sb-order-title { font-size: 13px; font-weight: 600; color: #1f2937; margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
      .sb-order-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .sb-order-form input, .sb-order-form textarea {
        width: 100%; padding: 9px 12px; margin: 4px 0; border: 1px solid #e5e7eb;
        border-radius: 8px; font-size: 12.5px; outline: none; transition: border-color .15s, box-shadow .15s;
        font-family: inherit; resize: vertical;
      }
      .sb-order-form input:focus, .sb-order-form textarea:focus {
        border-color: var(--sb-theme); box-shadow: 0 0 0 3px rgba(var(--sb-theme-rgb), 0.12);
      }
      .sb-order-form .sb-order-error { border-color: #ef4444; }
      .sb-order-form button {
        width: 100%; padding: 10px;
        background: linear-gradient(135deg, var(--sb-theme), rgba(var(--sb-theme-rgb), 0.88));
        color: #fff; border: 0; border-radius: 8px; font-size: 13px; font-weight: 600;
        cursor: pointer; margin-top: 8px; transition: transform .15s, box-shadow .15s;
      }
      .sb-order-form button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(var(--sb-theme-rgb), 0.3); }
      .sb-order-form button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

      .sb-foot { padding: 12px; background: #fff; border-top: 1px solid #eef0f4; display: flex; gap: 8px; align-items: center; }
      .sb-input {
        flex: 1; border: 1px solid #e5e7eb; background: #f7f8fb;
        border-radius: 14px; padding: 11px 16px; font-size: 13.5px; outline: none;
        transition: border-color .15s, background .15s, box-shadow .15s;
      }
      .sb-input:focus { border-color: var(--sb-theme); background: #fff; box-shadow: 0 0 0 3px rgba(var(--sb-theme-rgb), 0.12); }
      .sb-send {
        width: 40px; height: 40px; border-radius: 12px; border: 0;
        background: linear-gradient(135deg, var(--sb-theme), rgba(var(--sb-theme-rgb), 0.88));
        color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: opacity .15s, transform .15s, box-shadow .15s; flex-shrink: 0;
      }
      .sb-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(var(--sb-theme-rgb), 0.35); }
      .sb-send:active:not(:disabled) { transform: translateY(0); }
      .sb-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
      .sb-send svg { width: 16px; height: 16px; }

      .sb-brand { text-align: center; font-size: 10px; color: #94a3b8; padding: 6px 0 8px; background: #fff; border-top: 1px solid #eef0f4; }
      .sb-brand strong { color: var(--sb-theme); font-weight: 600; }

      @media (max-width: 480px) {
        .sb-root { bottom: 12px; right: 12px; left: 12px; }
        .sb-bubble-wrap { margin-left: auto; width: 60px; }
        .sb-panel { position: fixed; left: 12px; right: 12px; bottom: 88px; width: auto; height: calc(100vh - 120px); height: calc(var(--sb-avail, 100dvh) - 110px); }
      }
      .sb-force-mobile .sb-root { bottom: 12px; right: 12px; left: 12px; }
      .sb-force-mobile .sb-bubble-wrap { margin-left: auto; width: 60px; }
      .sb-force-mobile .sb-panel { position: fixed; left: 12px; right: 12px; bottom: 88px; width: auto; height: calc(100% - 120px); }
    `;
    document.head.appendChild(style);

    const ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    const ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';

    const body = el("div", { class: "sb-body" + (bot.backgroundImageUrl ? " sb-body-with-bg" : ""), style: bot.backgroundImageUrl ? { backgroundImage: `url(${bot.backgroundImageUrl})` } : {} });
    const input = el("input", { class: "sb-input", type: "text", placeholder: T.placeholder, "aria-label": T.message, dir: "auto" });
    const sendBtn = el("button", { class: "sb-send", "aria-label": T.send, html: ICON_SEND });
    const closeBtn = el("button", { class: "sb-close", "aria-label": T.close, html: ICON_CLOSE });
    const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>';
    // Shown while the visitor is writing to the team instead of asking the bot.
    const teamCancel = el("button", { class: "sb-team-cancel", type: "button" }, T.cancel);
    const teamBar = el("div", { class: "sb-team-bar" }, el("span", { html: ICON_MAIL + "<b></b>" }), teamCancel);
    teamBar.querySelector("b").textContent = T.teamBar;

    const panel = el(
      "div",
      { class: "sb-panel", role: "dialog", "aria-label": `${bot.name} chat` },
      el(
        "div",
        { class: "sb-header" },
        bot.logoUrl ? el("div", { class: "sb-header-logo" }, el("img", { src: bot.logoUrl, alt: "Logo" })) : el("div", { class: "sb-avatar", html: ICON_BOT }),
        el(
          "div",
          null,
          el("div", { class: "sb-title" }, bot.name || "Assistant"),
          el("div", { class: "sb-sub" }, el("span", { class: "sb-dot" }), T.online)
        ),
        closeBtn
      ),
      body,
      teamBar,
      el("div", { class: "sb-foot" }, input, sendBtn),
      el("div", { class: "sb-brand", html: T.poweredBy + " <strong>Syncave</strong>" })
    );

    const bubble = el("div", { class: "sb-bubble", role: "button", "aria-label": T.openChat, html: ICON_CHAT });
    const bubbleBadge = el("div", { class: "sb-bubble-badge" }, "1");
    const bubbleWrap = el("div", { class: "sb-bubble-wrap" }, bubble, bubbleBadge);
    const root = el("div", { class: "sb-root" }, panel, bubbleWrap);
    ((PREVIEW && PREVIEW.container) || document.body).appendChild(root);
    // Inside a preview frame the panel must fit the frame, not the browser window.
    if (PREVIEW && PREVIEW.container) {
      const box = PREVIEW.container;
      const fit = () => root.style.setProperty("--sb-avail", box.clientHeight + "px");
      fit();
      if (typeof ResizeObserver === "function") new ResizeObserver(fit).observe(box);
      else window.addEventListener("resize", fit);
    }

    function scrollToBottom() {
      requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    }

    function botAvatar() {
      if (bot.logoUrl) return el("div", { class: "sb-msg-avatar" }, el("img", { src: bot.logoUrl, alt: "" }));
      return el("div", { class: "sb-msg-avatar", html: ICON_BOT });
    }

    function renderText(role, content, opts) {
      opts = opts || {};
      const isUser = role === "user";
      const bubble = el("div", { class: "sb-bubble-msg", dir: "auto", html: md(content) });
      const options = Array.isArray(opts.options) ? opts.options.filter(Boolean) : null;
      if (options && options.length && !isUser) {
        const optsRow = el(
          "div",
          { class: "sb-bubble-options" },
          ...options.map((o) =>
            el("button", { class: "sb-bubble-chip", type: "button", dir: "auto", onclick: o.onclick }, o.label)
          )
        );
        bubble.appendChild(optsRow);
      }
      if (opts.menu && !isUser) {
        const menu = questionMenu();
        if (menu) bubble.appendChild(menu);
      }
      if (opts.owner) {
        bubble.classList.add("sb-owner");
        bubble.insertBefore(el("div", { class: "sb-owner-tag" }, T.team), bubble.firstChild);
      }
      const children = isUser ? [bubble] : [botAvatar(), bubble];
      const wrap = el("div", { class: `sb-msg sb-${isUser ? "user" : "bot"}` }, ...children);
      body.appendChild(wrap);
      if (opts.time) body.appendChild(el("div", { class: "sb-time" }, fmtTime(null, T)));
      scrollToBottom();
      return wrap;
    }

    function showTyping() {
      const node = el(
        "div",
        { class: "sb-msg sb-bot sb-typing-row" },
        botAvatar(),
        el("div", { class: "sb-typing" }, el("span"), el("span"), el("span"))
      );
      body.appendChild(node);
      scrollToBottom();
      return node;
    }

    function persist() {
      if (PREVIEW) return;
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch {}
    }

    // ---- Journey state ----
    const answeredKeys = new Set();
    const keyOf = (it, idx) => it.id || `idx_${idx}`;

    function remainingOptions() {
      return qa
        .map((it, idx) => ({ it, key: keyOf(it, idx) }))
        .filter(({ key, it }) => !answeredKeys.has(key) && it.question);
    }

    // Questions are offered as a short menu (MENU_SIZE at a time) with "More questions"
    // to page through the rest, so a long Q&A never floods the chat.
    const MENU_SIZE = 4;
    const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"' + (AR ? ' style="transform:scaleX(-1)"' : "") + '><polyline points="9 18 15 12 9 6"/></svg>';

    function hasMenu() {
      return true; // "Message the team" is always available
    }

    function questionMenu() {
      const items = remainingOptions();
      const box = el("div", { class: "sb-bubble-options sb-menu" });
      let page = 0;
      function draw() {
        box.textContent = "";
        const pages = Math.ceil(items.length / MENU_SIZE);
        const slice = items.slice(page * MENU_SIZE, (page + 1) * MENU_SIZE);
        if (slice.length) box.appendChild(el("div", { class: "sb-menu-title" }, T.menuTitle));
        slice.forEach(({ it }) => {
          box.appendChild(el("button", { class: "sb-menu-item", type: "button", dir: "auto", onclick: () => answerFromQA(it) },
            el("span", {}, it.question), el("span", { class: "sb-menu-arrow", html: ICON_CHEVRON })));
        });
        if (pages > 1) {
          const last = page >= pages - 1;
          const left = items.length - (page + 1) * MENU_SIZE;
          box.appendChild(el("button", { class: "sb-menu-more", type: "button", onclick: () => { page = last ? 0 : page + 1; draw(); scrollToBottom(); } },
            last ? T.menuBack : T.menuMore + " (" + left + ")"));
        }
        const team = el("button", { class: "sb-menu-team", type: "button", onclick: startTeamMessage });
        team.innerHTML = ICON_MAIL;
        team.appendChild(el("span", {}, T.teamOption));
        box.appendChild(team);
        if (enableOrders) box.appendChild(el("button", { class: "sb-bubble-chip sb-menu-order", type: "button", onclick: showOrderForm }, T.order));
      }
      draw();
      return box;
    }

    // Strip stale clickable chips from previously rendered bubbles so only the latest step is interactive.
    function clearAllOptions() {
      body.querySelectorAll(".sb-bubble-options").forEach((n) => n.remove());
    }

    function botReply(content, after) {
      const typing = showTyping();
      setTimeout(() => {
        typing.remove();
        // Keep "Place an order" available after every answer, not only in the welcome message.
        renderText("model", content, { time: true, menu: true });
        history.push({ role: "model", content });
        persist();
        logMessage("bot", content);
        if (after) after();
      }, 700);
    }

    function markAnswered(item) {
      const idx = qa.indexOf(item);
      answeredKeys.add(keyOf(item, idx >= 0 ? idx : 0));
    }

    function answerFromQA(item) {
      clearAllOptions();
      renderText("user", item.question, { time: true });
      history.push({ role: "user", content: item.question });
      logMessage("visitor", item.question);
      markAnswered(item);
      botReply(item.answer);
    }

    // Tell the dashboard what the bot couldn't answer (text only; never in preview mode).
    function reportUnanswered(text) {
      if (PREVIEW || !text || text.length > 300) return;
      try {
        fetch(`${API}/api/bots/${encodeURIComponent(botId)}/unanswered`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }

    // Writing to the team: the next message goes to a person (flagged "needs reply" in the dashboard).
    let teamMode = false;
    function setTeamMode(on) {
      teamMode = on;
      teamBar.classList.toggle("sb-show", on);
      input.placeholder = on ? T.teamPlaceholder : T.placeholder;
      if (on) input.focus();
    }
    teamCancel.addEventListener("click", () => setTeamMode(false));

    function startTeamMessage() {
      clearAllOptions();
      renderText("model", T.teamPrompt, { time: true });
      history.push({ role: "model", content: T.teamPrompt });
      persist();
      setTeamMode(true);
    }

    function sendToTeam(text) {
      clearAllOptions();
      renderText("user", text, { time: true });
      history.push({ role: "user", content: text });
      logMessage("visitor", text, true);
      setTeamMode(false);
      botReply(T.teamSent);
    }

    function handleQuery(text) {
      if (teamMode) return sendToTeam(text);
      clearAllOptions();
      renderText("user", text, { time: true });
      history.push({ role: "user", content: text });
      const match = bestMatch(text, qa);
      // A typed message the bot can't answer goes to the team too.
      logMessage("visitor", text, !match);
      if (match) {
        markAnswered(match);
        botReply(match.answer);
      } else {
        reportUnanswered(text);
        botReply((bot.fallbackMessage || T.fallback) + "\n\n" + T.teamForwarded);
      }
    }

    function showOrderForm() {
      const ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;color:var(--sb-theme)"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';

      const nameInput = el("input", { type: "text", placeholder: T.name, required: "true", dir: "auto" });
      const emailInput = el("input", { type: "email", placeholder: T.email, required: "true", dir: "ltr" });
      const phoneInput = el("input", { type: "tel", placeholder: T.phone, dir: "ltr" });
      const messageInput = el("textarea", { rows: "2", placeholder: T.details, dir: "auto" });

      const submitBtn = el("button", { type: "button" }, T.submit);

      const row = el("div", { class: "sb-order-row" }, nameInput, emailInput);
      const formDiv = el(
        "div",
        { class: "sb-order-form" },
        el("div", { class: "sb-order-title", html: ICON_CART + "<span>Place an order</span>" }),
        row,
        phoneInput,
        messageInput,
        submitBtn
      );
      const orderDiv = el("div", { class: "sb-msg sb-bot" }, formDiv);
      body.appendChild(orderDiv);
      scrollToBottom();

      function clearError(node) { node.classList.remove("sb-order-error"); }
      [nameInput, emailInput].forEach((n) => n.addEventListener("input", () => clearError(n)));

      submitBtn.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const phone = phoneInput.value.trim();
        const message = messageInput.value.trim();
        let bad = false;
        if (!name) { nameInput.classList.add("sb-order-error"); bad = true; }
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) { emailInput.classList.add("sb-order-error"); bad = true; }
        if (bad) return;

        if (PREVIEW) {
          orderDiv.remove();
          botReply(T.previewOrder);
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = T.submitting;
        fetch(`${API}/api/bots/${encodeURIComponent(botId)}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, message }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data && data.success) {
              orderDiv.remove();
              botReply(T.thanks);
            } else {
              throw new Error("submit-failed");
            }
          })
          .catch(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = T.submit;
            botReply(T.failed);
          });
      });
    }

    // Initial render: replay history (if any), reconstruct answered state, then render welcome with embedded options.
    if (history.length) {
      history.forEach((m) => renderText(m.role === "user" ? "user" : "model", m.content, m.role === "owner" ? { owner: true } : {}));
      history.forEach((m) => {
        if (m.role !== "user") return;
        qa.forEach((it, idx) => {
          if (it.question && it.question === m.content) answeredKeys.add(keyOf(it, idx));
        });
      });
      // Re-render the latest options inside a fresh bubble so they're clickable again on resume.
      if (hasMenu()) renderText("model", T.resume, { menu: true });
    } else {
      const welcome = bot.welcomeMessage || T.welcome;
      renderText("model", welcome, { menu: true });
    }

    function updateSendState() {
      sendBtn.disabled = !input.value.trim();
    }
    updateSendState();
    input.addEventListener("input", updateSendState);

    let open = false;
    function setOpen(v) {
      open = v;
      panel.classList.toggle("sb-open", open);
      bubbleWrap.style.display = open ? "none" : "block";
      lastActivity = Date.now();
      if (open) {
        unseen = 0;
        bubbleBadge.classList.remove("sb-show");
        setTimeout(() => input.focus(), 180);
        scrollToBottom();
        pollOwner();
      }
    }
    bubble.addEventListener("click", () => setOpen(true));
    closeBtn.addEventListener("click", () => setOpen(false));

    // ---- Conversation sync + owner replies ----
    // Visitor and bot messages are batched to the server; owner replies are polled while the
    // visitor is around (every 6s with the panel open, every 30s closed, stops after 30 idle minutes).
    let outbox = [];
    let flushTimer = null;
    let lastActivity = Date.now();
    let unseen = 0;
    let lastOwnerAt = "";
    try { lastOwnerAt = sessionStorage.getItem(CONV_KEY + "_seen") || ""; } catch {}

    function logMessage(role, text, toTeam) {
      if ((PREVIEW && !TEST) || !text) return;
      lastActivity = Date.now();
      if (!convId) { convId = "c" + rid(11); if (!PREVIEW) { try { sessionStorage.setItem(CONV_KEY, convId); } catch {} } }
      outbox.push(Object.assign({ id: "m" + rid(9), role, text: String(text).slice(0, 2000), createdAt: new Date().toISOString() }, toTeam ? { toTeam: true } : {}));
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flushOutbox, 400);
    }
    function flushOutbox() {
      if (!convId || !outbox.length) return;
      const batch = outbox.splice(0, 10);
      const pageUrl = String((PREVIEW && PREVIEW.pageUrl) || location.href).slice(0, 300);
      try {
        fetch(`${API}/api/bots/${encodeURIComponent(botId)}/${TEST ? "test-messages" : "conversations"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(TEST ? { conversationId: convId, pageUrl, messages: batch } : { conversationId: convId, visitorId, pageUrl, messages: batch }),
          keepalive: true,
          credentials: TEST ? "same-origin" : "omit",
        }).catch(function () {});
      } catch (e) {}
      if (outbox.length) flushOutbox();
    }
    function pollOwner() {
      if ((PREVIEW && !TEST) || !convId) return;
      const after = lastOwnerAt ? "after=" + encodeURIComponent(lastOwnerAt) : "";
      const url = TEST
        ? `${API}/api/bots/${encodeURIComponent(botId)}/test-messages/${encodeURIComponent(convId)}?${after}`
        : `${API}/api/bots/${encodeURIComponent(botId)}/conversations/${encodeURIComponent(convId)}/messages?visitor=${encodeURIComponent(visitorId)}${after ? "&" + after : ""}`;
      fetch(url, { credentials: TEST ? "same-origin" : "omit" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !Array.isArray(d.messages) || !d.messages.length) return;
          clearAllOptions();
          d.messages.forEach((m, i) => {
            // The options move under the newest reply, so the visitor can keep going after the team answers.
            const last = i === d.messages.length - 1;
            renderText("model", m.text, { time: true, owner: true, menu: last });
            history.push({ role: "owner", content: m.text });
            lastOwnerAt = m.createdAt;
          });
          persist();
          if (!PREVIEW) { try { sessionStorage.setItem(CONV_KEY + "_seen", lastOwnerAt); } catch {} }
          lastActivity = Date.now();
          if (!open) {
            unseen += d.messages.length;
            bubbleBadge.textContent = String(unseen);
            bubbleBadge.classList.add("sb-show");
          }
        })
        .catch(function () {});
    }
    let pollTick = 0;
    setInterval(() => {
      if (!convId || Date.now() - lastActivity > 30 * 60 * 1000) return;
      pollTick++;
      if (open || pollTick % 5 === 0) pollOwner();
    }, 6000);
    window.addEventListener("pagehide", flushOutbox);

    function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      updateSendState();
      handleQuery(text);
    }
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }
})();
