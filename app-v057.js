const STORAGE_KEY = "hinomoto_pwa_state_v57";
const STORAGE_KEYS_OLD = [
  "hinomoto_pwa_state_v56",
  "hinomoto_pwa_state_v55",
  "hinomoto_pwa_state_v54",
  "hinomoto_pwa_state_v53",
  "hinomoto_pwa_state_v52",
  "hinomoto_pwa_state_v51",
  "hinomoto_pwa_state_v50",
  "hinomoto_pwa_state_v49",
  "hinomoto_pwa_state_v48",
  "hinomoto_pwa_state_v47",
  "hinomoto_pwa_state_v46",
  "hinomoto_pwa_state_v45",
  "hinomoto_pwa_state_v44",
  "hinomoto_pwa_state_v43",
  "hinomoto_pwa_state_v42",
  "hinomoto_pwa_state_v41",
  "hinomoto_pwa_state_v40",
  "hinomoto_pwa_state_v39",
  "hinomoto_pwa_state_v38",
  "hinomoto_pwa_state_v37",
  "hinomoto_pwa_state_v36",
  "hinomoto_pwa_state_v35",
  "hinomoto_pwa_state_v34",
  "hinomoto_pwa_state_v33",
  "hinomoto_pwa_state_v32",
  "hinomoto_pwa_state_v31",
  "hinomoto_pwa_state_v30",
  "hinomoto_pwa_state_v29",
  "hinomoto_pwa_state_v28",
  "hinomoto_pwa_state_v26",
  "hinomoto_pwa_state_v25",
  "hinomoto_pwa_state_v2",
  "hinomoto_pwa_state_v1"
];
const BRIDGE_OUTBOX_KEY = "hinomoto_bridge_outbox";
const BRIDGE_INBOX_KEY = "hinomoto_bridge_inbox";

let appState = null;
let deferredInstallPrompt = null;
let responseCheckTimer = null;
let bridgePollTimer = null;

const $ = (id) => document.getElementById(id);

async function loadInitialState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    appState = JSON.parse(saved);
    normalizeState();
    return;
  }

  for (const key of STORAGE_KEYS_OLD) {
    const old = localStorage.getItem(key);
    if (old) {
      appState = JSON.parse(old);
      normalizeState();
      saveState(`${key.replace("hinomoto_pwa_state_", "v")}から引継ぎ`);
      return;
    }
  }

  const response = await fetch("./initial-state.json");
  appState = await response.json();
  normalizeState();
  saveState("初期状態を保存");
}

function normalizeState() {
  appState.meta = appState.meta || {};
  appState.meta.appVersion = "0.57.0-v03-extension-compatible";
  appState.world = appState.world || {};
  appState.protagonist = appState.protagonist || {};
  appState.artifacts = appState.artifacts || {};
  appState.artifacts.fujiwari = appState.artifacts.fujiwari || { location: "不明", carriedByHiroki: false };
  appState.artifacts.fujinuki = appState.artifacts.fujinuki || { location: "不明", carriedByHiroki: false };
  appState.communications = appState.communications || {};
  appState.communications.masamune = appState.communications.masamune || { thread: "個チャ", state: "不明" };
  appState.communications.terumoto = appState.communications.terumoto || { thread: "個チャ", state: "不明" };
  appState.communications.operationRoom = appState.communications.operationRoom || { newCheck: false, normalMissionAccepted: false, sortie: false };
  appState.combat = appState.combat || { enemyState: "NO-CONTACT", combatUiAllowed: false };
  appState.story = appState.story || {};
  appState.ai = appState.ai || {};

  appState.story.currentText = appState.story.currentText || "";
  appState.story.actionCandidates = appState.story.actionCandidates || [];
  appState.story.canonLog = appState.story.canonLog || [];
  appState.story.rejectedLog = appState.story.rejectedLog || [];
  appState.story.actionHistory = appState.story.actionHistory || [];

  appState.ai.sendQueue = appState.ai.sendQueue || [];
  appState.ai.pendingAction = appState.ai.pendingAction || "";
  appState.ai.responseAutoCheck = true;
  appState.ai.extensionMode = true;
  appState.ai.extensionStatus = appState.ai.extensionStatus || "未接続";
  appState.ai.lastRequestId = appState.ai.lastRequestId || "";
  appState.ai.lastExtensionEvent = appState.ai.lastExtensionEvent || "";
  appState.ai.outbox = appState.ai.outbox || null;
  appState.ai.inbox = appState.ai.inbox || null;
  appState.ai.lastAdoptedRequestId = appState.ai.lastAdoptedRequestId || "";
  appState.ai.lastAdoptedTextHash = appState.ai.lastAdoptedTextHash || "";
  appState.ai.lastParsedResponse = appState.ai.lastParsedResponse || null;
}

function nowLabel() {
  return new Date().toLocaleString("ja-JP", { hour12: false });
}

function makeRequestId() {
  return `hnm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveState(label = "保存しました") {
  normalizeState();
  appState.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState, null, 2));
  $("saveStatus").textContent = label;
  render();
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[s]);
}

function setTab(tabName) {
  if (tabName !== "settings") document.body.classList.remove("settings-override");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}


function stripCandidatePrefix(candidate) {
  return String(candidate || "")
    .replace(/^-\s*/, "")
    .replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, (m) => m.trim() + " ")
    .trim();
}

function fillActionInputFromCandidate(candidate) {
  const text = stripCandidatePrefix(candidate);
  $("actionInput").value = text;
  appState.ai.pendingAction = text;
  saveState("候補を入力");
  const card = $("actionCard");
  if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("actionInput").focus(), 350);
}

function renderCandidateButtons() {
  const box = $("quickCandidateButtons");
  if (!box) return;
  const candidates = appState.story.actionCandidates || [];
  if (!candidates.length) {
    box.innerHTML = `<div class="hint">採用後の行動候補がまだありません。自由に行動を書けます。</div>`;
    return;
  }
  box.innerHTML = `<div class="candidate-preview-title">行動候補をタップして入力</div>` + candidates.map((candidate) => {
    const clean = stripCandidatePrefix(candidate);
    return `<button type="button" class="candidate-button" data-candidate="${escapeHtml(clean)}">${escapeHtml(clean)}</button>`;
  }).join("");
}

function renderLatestCandidatePreview() {
  const box = $("latestCandidatePreview");
  if (!box) return;
  // v0.49では候補を本文内に表示するため、別枠プレビューは隠す。
  box.classList.add("hidden", "inline-hidden");
  box.innerHTML = "";
}


function renderHero() {
  $("heroLocation").textContent = appState.world.currentLocation || "不明";
  $("heroMode").textContent = appState.protagonist.mode || "状態不明";

  const chips = [
    { text: `${appState.world.date || ""} ${appState.world.timeOfDay || ""}`, cls: "safe" },
    { text: `富士割：${appState.artifacts.fujiwari.carriedByHiroki ? "携行" : "祭壇"}`, cls: appState.artifacts.fujiwari.carriedByHiroki ? "warn" : "safe" },
    { text: `敵：${appState.combat.enemyState || "不明"}`, cls: appState.combat.enemyState === "NO-CONTACT" ? "safe" : "warn" },
    { text: `拡張：${appState.ai.extensionStatus || "未接続"}`, cls: appState.ai.extensionStatus === "返答受信" || appState.ai.extensionStatus === "接続済み" ? "safe" : "" }
  ];
  $("quickChips").innerHTML = chips.map(c => `<span class="chip ${c.cls}">${escapeHtml(c.text)}</span>`).join("");

  const response = Boolean((appState.ai.lastResponse || "").trim());
  const checked = Boolean(appState.ai.lastCheck);
  const adopted = Boolean(appState.ai.lastAdoptedRequestId || appState.ai.lastAdoptedTextHash);

  setStep("stepSend", true, true);
  setStep("stepResponse", response, response);
  setStep("stepCheck", checked, checked);
  setStep("stepAdopt", adopted, adopted);
}

function setStep(id, active, done) {
  const el = $(id);
  el.classList.toggle("active", Boolean(active && !done));
  el.classList.toggle("done", Boolean(done));
}



function renderReaderText() {
  const readerText = $("readerText");
  const readerAdoptButton = $("readerAdoptButton");
  if (!readerText) return;

  const rawText = (appState.ai.lastResponse || "").trim();
  const parsed = rawText ? (appState.ai.lastParsedResponse || parseAiResponse(rawText)) : null;
  const displayText = parsed ? buildDisplayTextWithCandidates(parsed) : "";

  readerText.textContent = displayText || "まだAI返答はありません。";
  const adoptedHash = appState.ai.lastAdoptedTextHash || "";
  const isAdopted = Boolean(rawText && adoptedHash && adoptedHash === simpleHash(rawText));
  const hasDanger = appState.ai.lastCheck && appState.ai.lastCheck.dangers && appState.ai.lastCheck.dangers.length > 0;
  if (readerAdoptButton) readerAdoptButton.disabled = Boolean(!rawText || isAdopted || hasDanger);
}


function updateReadingPriorityMode() {
  const text = (appState.ai.lastResponse || "").trim();
  const adoptedHash = appState.ai.lastAdoptedTextHash || "";
  const currentHash = simpleHash(text);
  const isAdopted = Boolean(text && adoptedHash && adoptedHash === currentHash);
  document.body.classList.toggle("reading-priority", Boolean(text && !isAdopted));
  document.body.style.overflow = "";
}


function renderStatus() {
  const items = [
    ["日時", `${appState.world.date}（${appState.world.weekday || ""}）${appState.world.timeOfDay || ""}`],
    ["現在地", appState.world.currentLocation],
    ["広輝", `${appState.protagonist.mode || ""} / 所持：${(appState.protagonist.currentHeldItems || []).join("、")}`],
    ["富士割", `${appState.artifacts.fujiwari.location} / 携行：${appState.artifacts.fujiwari.carriedByHiroki ? "あり" : "なし"}`],
    ["富士抜き", `${appState.artifacts.fujinuki.location} / 携行：${appState.artifacts.fujinuki.carriedByHiroki ? "あり" : "なし"}`],
    ["戦闘状態", `${appState.combat.enemyState} / 戦闘UI：${appState.combat.combatUiAllowed ? "可" : "不可"}`],
    ["政宗", `${appState.communications.masamune.thread || "個チャ"}：${appState.communications.masamune.state || "不明"}`],
    ["輝統", `${appState.communications.terumoto.thread || "個チャ"}：${appState.communications.terumoto.state || "不明"}`],
    ["作戦室", `新規確認：${appState.communications.operationRoom.newCheck ? "あり" : "なし"} / 受諾：${appState.communications.operationRoom.normalMissionAccepted ? "あり" : "なし"}`],
  ];
  $("statusGrid").innerHTML = items.map(([k, v]) => `<div class="status-item"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`).join("");
}

function renderExtensionStatus() {
  $("extensionStatus").textContent = appState.ai.extensionStatus || "未接続";
  $("requestIdLabel").textContent = appState.ai.lastRequestId || "なし";
  $("extensionEventLabel").textContent = appState.ai.lastExtensionEvent || "なし";

  let outbox = appState.ai.outbox;
  if (!outbox) {
    try { outbox = JSON.parse(localStorage.getItem(BRIDGE_OUTBOX_KEY) || "null"); } catch {}
  }
  $("outboxLabel").textContent = outbox ? `${outbox.status || "待機"} / ${outbox.requestId || "IDなし"}` : "なし";
}

function renderStory() {
  $("storyText").textContent = appState.story.currentText || "";
  $("candidateList").innerHTML = (appState.story.actionCandidates || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
}

function renderActionHistory() {
  const list = appState.story.actionHistory || [];
  $("actionHistory").innerHTML = list.length
    ? list.slice(-6).reverse().map((item) => `<div class="mini-log-item"><small>${escapeHtml(item.sentAt)} / ${escapeHtml(item.status || "送信済み")}</small>${escapeHtml(item.text)}</div>`).join("")
    : `<div class="mini-log-item">まだ送信履歴はありません。</div>`;
}

function renderLogs() {
  const logs = appState.story.canonLog || [];
  $("logCount").textContent = `${logs.length}件`;
  $("canonLog").innerHTML = logs.length
    ? logs.slice().reverse().map((log) => `<div class="log-item"><small>${escapeHtml(log.adoptedAt)} / 行動：${escapeHtml(log.playerAction || "未記録")}</small>${escapeHtml(log.bodyText || log.text)}</div>`).join("")
    : `<div class="log-item">まだ正史ログはありません。</div>`;
}



function normalizeCandidateLine(line) {
  let s = String(line || "").trim();
  if (!s) return "";

  // 見出しや余計な記号を除外
  if (/^(?:\*\*)?行動候補(?:\*\*)?$/.test(s)) return "";
  if (/^[-・]\s*$/.test(s)) return "";

  // 箇条書き記号を整える
  s = s.replace(/^[-・]\s*/, "");

  // 1. / 1) / ① などをできるだけ ① に寄せる
  const map = { "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤", "6": "⑥", "7": "⑦", "8": "⑧", "9": "⑨" };
  const numMatch = s.match(/^([1-9])[\.\)．、:\s]+(.+)$/);
  if (numMatch) {
    s = `${map[numMatch[1]]} ${numMatch[2].trim()}`;
  }

  if (!/^[①②③④⑤⑥⑦⑧⑨]/.test(s)) {
    // 候補らしくない行は捨てる
    if (!/(自由行動|進む|確認|観察|見る|向かう|戻る|話す|連絡|調べる|待つ)/.test(s)) return "";
  }

  return `- ${s}`;
}

function findSectionHeading(text, key) {
  const patterns = {
    safety: [
      /(?:^|\n)\s*(?:#{1,4}\s*)?(?:1[\.．]?\s*)?事故防止チェック\s*\n/,
      /(?:^|\n)\s*(?:#{1,4}\s*)?安全確認\s*\n/
    ],
    body: [
      /(?:^|\n)\s*(?:#{1,4}\s*)?(?:2[\.．]?\s*)?本文案\s*\n/,
      /(?:^|\n)\s*(?:#{1,4}\s*)?本文\s*\n/
    ],
    candidates: [
      /(?:^|\n)\s*(?:#{1,4}\s*)?(?:3[\.．]?\s*)?\*{0,2}行動候補\*{0,2}\s*\n/,
      /(?:^|\n)\s*(?:#{1,4}\s*)?\*{0,2}行動候補\*{0,2}\s*\n/
    ]
  };

  for (const re of patterns[key] || []) {
    const m = re.exec(text);
    if (m) {
      return { index: m.index, end: m.index + m[0].length, match: m[0] };
    }
  }
  return null;
}


function extractTagContent(raw, tagName) {
  const re = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i");
  const match = re.exec(String(raw || ""));
  return match ? match[1].trim() : "";
}

function hasRequiredResponseTags(raw) {
  const text = String(raw || "");
  return /<check>[\s\S]*?<\/check>/i.test(text) &&
         /<body>[\s\S]*?<\/body>/i.test(text) &&
         /<candidates>[\s\S]*?<\/candidates>/i.test(text);
}

function hasUnknownOuterText(raw) {
  const text = String(raw || "").trim();
  if (!text) return false;
  const stripped = text
    .replace(/<check>[\s\S]*?<\/check>/ig, "")
    .replace(/<body>[\s\S]*?<\/body>/ig, "")
    .replace(/<candidates>[\s\S]*?<\/candidates>/ig, "")
    .trim();
  return stripped.length > 0;
}


function parseAiResponse(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) {
    return {
      rawText: "",
      safetyText: "",
      bodyText: "",
      candidatesText: "",
      actionCandidates: [],
      hasBody: false,
      hasCandidates: false,
      formatOk: false,
      formatError: "empty"
    };
  }

  // v0.54: タグ形式を最優先で読む
  const tagged = /<check>|<body>|<candidates>/i.test(raw);
  if (tagged) {
    const safetyText = extractTagContent(raw, "check");
    const bodyText = extractTagContent(raw, "body");
    const candidatesText = extractTagContent(raw, "candidates");

    let actionCandidates = [];
    if (candidatesText) {
      actionCandidates = candidatesText
        .split("\n")
        .map(normalizeCandidateLine)
        .filter(Boolean);
    }

    const formatOk = Boolean(
      safetyText &&
      bodyText &&
      actionCandidates.length > 0 &&
      hasRequiredResponseTags(raw) &&
      !hasUnknownOuterText(raw)
    );

    return {
      rawText: raw,
      safetyText,
      bodyText: bodyText || raw,
      candidatesText,
      actionCandidates,
      hasBody: Boolean(bodyText),
      hasCandidates: actionCandidates.length > 0,
      formatOk,
      formatError: formatOk ? "" : "tag_format_error"
    };
  }

  // 旧形式フォールバック：表示はできるが、v0.54以降は形式エラー扱い
  const safety = findSectionHeading(raw, "safety");
  const body = findSectionHeading(raw, "body");
  const candidates = findSectionHeading(raw, "candidates");

  let safetyText = "";
  let bodyText = "";
  let candidatesText = "";

  if (safety) {
    const end = body ? body.index : (candidates ? candidates.index : raw.length);
    safetyText = raw.slice(safety.end, end).trim();
  }

  if (body) {
    const end = candidates ? candidates.index : raw.length;
    bodyText = raw.slice(body.end, end).trim();
  } else if (candidates) {
    bodyText = raw.slice(0, candidates.index).trim();
  } else {
    bodyText = raw;
  }

  if (candidates) {
    candidatesText = raw.slice(candidates.end).trim();
  }

  let actionCandidates = [];
  if (candidatesText) {
    actionCandidates = candidatesText
      .split("\n")
      .map(normalizeCandidateLine)
      .filter(Boolean);
  }

  return {
    rawText: raw,
    safetyText,
    bodyText: bodyText || raw,
    candidatesText,
    actionCandidates,
    hasBody: Boolean(bodyText),
    hasCandidates: actionCandidates.length > 0,
    formatOk: false,
    formatError: "missing_tags"
  };
}


function buildDisplayTextWithCandidates(parsed) {
  if (!parsed) return "";
  const body = (parsed.bodyText || parsed.rawText || "").trim();
  const candidates = parsed.actionCandidates || [];
  if (!candidates.length) return body;

  const lines = candidates.map((candidate) => {
    const clean = stripCandidatePrefix(candidate);
    return `- ${clean}`;
  });

  return `${body}\n\n**行動候補**\n${lines.join("\n")}`;
}



function updateReviewButtons() {
  const text = (appState.ai.lastResponse || "").trim();
  const hasText = Boolean(text);

  const buttons = [
    $("quickAdoptButton"),
    $("rejectLatestButton"),
    $("adoptButton"),
    $("rejectButton")
  ].filter(Boolean);

  for (const button of buttons) {
    button.disabled = !hasText;
    button.dataset.empty = hasText ? "false" : "true";
  }
}


function renderLatestResponse() {
  const box = $("latestResponseText");
  const card = $("latestResponseCard");
  const badge = $("latestResponseBadge");
  const info = $("parsedResponseInfo");
  if (!box || !badge) return;

  const rawText = (appState.ai.lastResponse || "").trim();
  const parsed = rawText ? (appState.ai.lastParsedResponse || parseAiResponse(rawText)) : null;
  const displayText = parsed ? buildDisplayTextWithCandidates(parsed) : "";
  const adoptedHash = appState.ai.lastAdoptedTextHash || "";
  const currentHash = simpleHash(rawText);
  const isAdopted = Boolean(rawText && adoptedHash && adoptedHash === currentHash);

  box.classList.remove("empty", "unadopted", "adopted");
  if (card) card.classList.remove("adopted-compact");

  const readerText = $("readerText");
  const readerAdoptButton = $("readerAdoptButton");

  if (!rawText) {
    if (appState.ai.outbox && appState.ai.outbox.status && !["adopted", "rejected", "cleared"].includes(appState.ai.outbox.status)) {
      box.textContent = "AI返答待ちです。ChatGPTで本文生成が終わると、ここに表示されます。\n\nこの画面のまま待てます。";
      box.classList.add("waiting");
      badge.textContent = "返答待ち";
    } else {
      box.textContent = "まだAI返答はありません。行動を送信すると、ChatGPTで作られた本文がここに表示されます。";
      box.classList.remove("waiting");
      badge.textContent = "未受信";
    }
    if (readerText) readerText.textContent = "まだAI返答はありません。";
    if (info) info.textContent = "本文案と行動候補を自動分解します。";
    box.classList.add("empty");
    $("quickAdoptButton").disabled = true;
    if ($("rejectLatestButton")) $("rejectLatestButton").disabled = true;
    if ($("rejectLatestButton")) $("rejectLatestButton").disabled = true;
    if (readerAdoptButton) readerAdoptButton.disabled = true;
    return;
  }

  box.classList.remove("waiting");
  box.classList.remove("waiting");
  box.textContent = displayText;
  if (readerText) readerText.textContent = displayText;

  if (info && parsed) {
    const candidateCount = parsed.actionCandidates ? parsed.actionCandidates.length : 0;
    info.classList.remove("format-ok", "format-error");
    if (parsed.formatOk) {
      info.classList.add("format-ok");
      info.textContent = `タグ形式OK：本文案あり / 行動候補 ${candidateCount}件`;
    } else {
      info.classList.add("format-error");
      info.textContent = `形式エラー：<check> <body> <candidates> の3タグだけで返答してください`;
    }
  }

  if (isAdopted) {
    box.classList.add("adopted");
    if (card) card.classList.add("adopted-compact");
    badge.textContent = "採用済み";
    $("quickAdoptButton").disabled = true;
    if (readerAdoptButton) readerAdoptButton.disabled = true;
  } else {
    box.classList.add("unadopted");
    badge.textContent = "未採用";
    const hasDanger = appState.ai.lastCheck && appState.ai.lastCheck.dangers && appState.ai.lastCheck.dangers.length > 0;
    $("quickAdoptButton").disabled = Boolean(hasDanger);
    if ($("rejectLatestButton")) $("rejectLatestButton").disabled = false;
    if (readerAdoptButton) readerAdoptButton.disabled = Boolean(hasDanger);
  }
}

function renderStateEditor() {
  $("stateEditor").value = JSON.stringify(appState, null, 2);
}

function render() {
  if (!appState) return;
  renderHero();
  updateReadingPriorityMode();
  renderStatus();
  renderExtensionStatus();
  renderStory();
  renderCandidateButtons();
  renderLatestCandidatePreview();
  renderLatestResponse();
  updateReviewButtons();
  renderActionHistory();
  renderLogs();
  renderStateEditor();
  updateReviewButtons();

  $("promptBox").value = appState.ai.lastPrompt || "";
  $("responseBox").value = appState.ai.lastResponse || "";
  $("actionInput").value = appState.ai.pendingAction || "";
}

function buildPrompt(actionText = "") {
  const s = appState;
  const actionSection = actionText.trim()
    ? `\n【今回のプレイヤー行動】\n${actionText.trim()}\n`
    : "";
  return `あなたは「日ノ本異聞録：歴史の継承者」の文章案作成AIです。
ただし、正史確定・状態保存・Drive反映済み扱いは禁止です。
この返答はPWA側で検査され、ユーザーが採用するまで正史ではありません。

【現在状態】
日付：${s.world.date}（${s.world.weekday || ""}）${s.world.timeOfDay}
現在地：${s.world.currentLocation}
旧境界：${s.world.previousBoundary}
広輝状態：${s.protagonist.mode}
広輝の現在所持品：${(s.protagonist.currentHeldItems || []).join("、")}
富士割：${s.artifacts.fujiwari.location}（携行：${s.artifacts.fujiwari.carriedByHiroki ? "あり" : "なし"}）
富士抜き：${s.artifacts.fujinuki.location}（通常携行なし）
政宗：${s.communications.masamune.state}
足利輝統：${s.communications.terumoto.state}
作戦室：新規確認なし／通常任務受諾なし／出動なし
敵状態：${s.combat.enemyState}

【絶対ルール】
- 本文案だけを作る。保存済み・Drive反映済み・正史確定と言わない。
- 現在地を巻き戻さない。
- 富士割は仙台住居の富士割祭壇。日常外出中の手元描写、柄に触れる、抜く、構える、納刀する描写は禁止。
- 富士抜きは本道神社本社奉納。正式使用は不可逆ゲート。
- ENEMY-CONFIRMED以外では戦闘UIを出さない。敵HP、討伐報酬、戦闘結果を出さない。
- 政宗・足利輝統は返信待ち。ユーザー選択なしに勝手な返信を発生させない。
- スマホ通知、DM、グルチャ、作戦室通知、任務通知、送信済み、返信済み、報告は必ずwriting blockのchat_message形式。
- 死亡、重傷、婚姻、子供、神様契約、神器継承、富士抜き正式使用、武具喪失、家承認、関係不可逆確定、大移動、武家秩序変更は不可逆ゲートで止める。
- 行動候補は「**行動候補**」の下に「- ① 行動：短い補足」形式。候補同士の空行は禁止。自由行動は最後。
- ユーザーが明示するまで移動・返信・受諾・出動・支払い・戦闘開始を確定しない。
${actionSection}
【現在本文】
${s.story.currentText}

【現在の行動候補】
${(s.story.actionCandidates || []).map(x => "- " + x).join("\n")}

【出力形式：絶対厳守】
以下の3タグだけで返答する。
タグ外の説明文、前置き、補足、Markdown見出しは禁止。

<check>
OK、注意、重大警告なし等を短く書く。
事故防止チェックの内容を本文に混ぜない。
</check>

<body>
本文案だけを書く。
ここには事故防止チェックや行動候補を入れない。
保存済み・Drive反映済み・正史確定と言わない。
</body>

<candidates>
- ① 行動：短い補足
- ② 行動：短い補足
- ③ 行動：短い補足
- ④ 自由行動：自分の言葉で指定する
</candidates>
`;
}

function sendAction() {
  const actionText = $("actionInput").value.trim();
  if (!actionText) {
    alert("先に行動を書いてください。例：③ 周辺を観察：人通りや街の違和感を見る");
    return;
  }

  const prompt = buildPrompt(actionText);
  const requestId = makeRequestId();
  const entry = { sentAt: nowLabel(), text: actionText, status: "AIプロンプト生成済み", requestId };

  appState.ai.pendingAction = actionText;
  appState.ai.lastPrompt = prompt;
  appState.ai.lastRequestId = requestId;
  appState.ai.lastExtensionEvent = "PWA_SEND_READY";
  appState.ai.extensionStatus = "送信待ち";
  appState.ai.lastResponse = "";
  appState.ai.lastCheck = null;
  appState.ai.lastAdoptedRequestId = "";
  appState.ai.lastAdoptedTextHash = "";

  appState.ai.sendQueue.push(entry);
  appState.story.actionHistory.push(entry);

  const outbox = {
    source: "HINOMOTO_PWA",
    type: "PROMPT_READY",
    requestId,
    createdAt: new Date().toISOString(),
    actionText,
    prompt,
    status: "waiting_for_extension"
  };

  appState.ai.outbox = outbox;
  localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(outbox));
  window.postMessage(outbox, location.origin);

  $("promptBox").value = prompt;
  $("responseBox").value = "";
  $("checkResults").innerHTML = "";
  $("adoptButton").disabled = true;
  $("rejectButton").disabled = true;

  saveState("送信準備OK");
  // v0.57: 拡張v0.3では送信直後にPWAへ戻さない。返答完了後だけ戻る。
  copyText(prompt, false);
  $("saveStatus").textContent = "送信プロンプト生成";
  setTab("ai");
}

function receiveExtensionResponse(payload) {
  if (!payload || !payload.responseText) return;
  appState.ai.extensionStatus = "返答受信";
  appState.ai.lastExtensionEvent = payload.type || "AI_RESPONSE";
  appState.ai.inbox = payload;
  appState.ai.lastResponse = payload.responseText;
  updateParsedResponse(payload.responseText);

  localStorage.setItem(BRIDGE_INBOX_KEY, JSON.stringify(payload));

  const outbox = appState.ai.outbox || {};
  outbox.status = "response_received";
  appState.ai.outbox = outbox;
  localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(outbox));

  $("responseBox").value = payload.responseText;
  const result = runChecks(payload.responseText);
  appState.ai.lastCheck = result;
  displayChecks(result);
  updateReviewButtons();
  saveState(result.ok ? "拡張返答・検査OK" : "拡張返答・検査注意");
  setTimeout(focusLatestResponseAfterReceive, 250);
  setTab("play");
  
}

function pollBridgeInbox() {
  try {
    const raw = localStorage.getItem(BRIDGE_INBOX_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload || !payload.responseText) return;
    if (appState.ai.inbox && appState.ai.inbox.requestId === payload.requestId && appState.ai.inbox.receivedAt === payload.receivedAt) return;
    receiveExtensionResponse(payload);
  } catch (err) {
    console.warn("bridge inbox parse failed", err);
  }
}

function startBridgeListeners() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "HINOMOTO_EXTENSION") return;

    if (data.type === "EXTENSION_HELLO") {
      appState.ai.extensionStatus = "接続済み";
      appState.ai.lastExtensionEvent = "EXTENSION_HELLO";
      saveState("拡張接続");
      return;
    }

    if (data.type === "AI_RESPONSE") {
      receiveExtensionResponse(data);
      return;
    }

    if (data.type === "BRIDGE_ERROR") {
      appState.ai.extensionStatus = "エラー";
      appState.ai.lastExtensionEvent = data.error || "BRIDGE_ERROR";
      saveState("拡張エラー");
    }
  });

  bridgePollTimer = setInterval(pollBridgeInbox, 1500);
}

function extractMainTextForChecks(text) {
  const match = text.match(/(?:^|\n)##?\s*2[.．]?\s*本文案\s*\n([\s\S]*)/);
  if (match) return match[1];
  const matchPlain = text.match(/(?:^|\n)2[.．]\s*本文案\s*\n([\s\S]*)/);
  if (matchPlain) return matchPlain[1];
  return text;
}

function hasUnsafeCombatUi(text) {
  const lines = text.split(/\n+/);
  return lines.some((line) => {
    if (!/戦闘UI/.test(line)) return false;
    if (/(不可|禁止|出さない|出していない|出しません|なし|無し|未使用|不使用)/.test(line)) return false;
    return true;
  });
}


function normalizeForCheck(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function lineHasSafeNegation(line) {
  return /(出さない|出していない|出しません|出ていない|現れていない|来ていない|届いていない|返ってきていない|発生させない|確定しない|しない|していない|禁止|不可|なし|無し|未使用|未確認|携行なし|手元にない|祭壇にある|沈黙している|返信待ち)/.test(line);
}

function getBodyOnlyForCheck(text) {
  const raw = normalizeForCheck(text);
  if (!raw) return "";

  try {
    const parsed = parseAiResponse(raw);
    if (parsed && parsed.bodyText) {
      const candidates = parsed.candidatesText ? "\n" + parsed.candidatesText : "";
      return normalizeForCheck(parsed.bodyText + candidates);
    }
  } catch (_) {}

  let cleaned = raw;
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:1[\.．]?\s*)?事故防止チェック\s*\n[\s\S]*?(?=\n\s*(?:#{1,4}\s*)?(?:2[\.．]?\s*)?本文案\s*\n|$)/, "\n");
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:2[\.．]?\s*)?本文案\s*\n/, "\n");
  return normalizeForCheck(cleaned);
}

function dangerousLineExists(text, regex, options = {}) {
  const lines = normalizeForCheck(text).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return lines.some((line) => {
    if (!regex.test(line)) return false;
    regex.lastIndex = 0;
    if (options.ignoreSafeNegation !== false && lineHasSafeNegation(line)) return false;
    if (options.ignore && options.ignore.test(line)) return false;
    return true;
  });
}

function hasUnsafeCombatUiV053(text) {
  const lines = normalizeForCheck(text).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return lines.some((line) => {
    if (!/(戦闘UI|敵HP|討伐報酬|撃破報酬|戦闘開始|ターン処理|第\d+ターン|ENEMY-CONFIRMED)/.test(line)) return false;
    if (lineHasSafeNegation(line)) return false;
    return true;
  });
}


function runChecks(text) {
  const warnings = [];
  const dangers = [];
  const checkText = getBodyOnlyForCheck(text);
  const parsedForFormat = parseAiResponse(text);
  if (text && !parsedForFormat.formatOk) {
    dangers.push("AI返答形式エラー：<check> <body> <candidates> の3タグだけで返答してください。タグ外の文章は禁止です。");
  }

  if (!appState.artifacts.fujiwari.carriedByHiroki) {
    const fujiwariDanger = dangerousLineExists(
      checkText,
      /(富士割|宝刀)[\s\S]{0,36}(手に取|手元|柄に触|抜刀|抜く|抜いた|構え|構える|握|握る|振る|納刀|斬|切|突)/,
      { ignore: /(祭壇|携行なし|手元にない|手元描写はしない|描写は禁止|禁止|しない|ない)/ }
    );
    if (fujiwariDanger) {
      dangers.push("富士割が現在地にないのに、手元・抜刀・構え・攻撃に見える描写があります。");
    }
  }

  if (appState.combat.enemyState !== "ENEMY-CONFIRMED") {
    if (hasUnsafeCombatUiV053(checkText)) {
      dangers.push("未接敵なのに戦闘UI・敵HP・討伐報酬・ターン処理らしき語があります。");
    }

    const enemyAppears = dangerousLineExists(
      checkText,
      /(妖魔が現れた|敵が現れた|敵影が姿を現した|敵が姿を現した|襲いかかってきた|襲撃してきた|戦闘に入った|戦闘が始まった)/,
      { ignore: /(現れていない|出ていない|確定しない|まだない|まだ出ない|気配だけ|痕跡だけ|違和感だけ)/ }
    );
    if (enemyAppears) {
      dangers.push("NO-CONTACTなのに敵出現が確定している可能性があります。");
    }
  }

  const masamuneAutoReply = dangerousLineExists(
    checkText,
    /(伊達政宗|政宗)[\s\S]{0,80}(返信が届いた|返事が届いた|返ってきた|通知が届いた|メッセージが届いた|着信した)/,
    { ignore: /(返信待ち|来ていない|届いていない|沈黙|発生させない|確認できるのは返信待ち)/ }
  ) || /:::writing\{variant="chat_message"[\s\S]{0,140}(伊達政宗|政宗)/.test(checkText);

  if (!appState.communications.masamune.aiMayAutoReply && masamuneAutoReply) {
    warnings.push("政宗は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  const terumotoAutoReply = dangerousLineExists(
    checkText,
    /(足利輝統|輝統)[\s\S]{0,80}(返信が届いた|返事が届いた|返ってきた|通知が届いた|メッセージが届いた|着信した)/,
    { ignore: /(返信待ち|来ていない|届いていない|沈黙|発生させない|確認できるのは返信待ち)/ }
  ) || /:::writing\{variant="chat_message"[\s\S]{0,140}(足利輝統|輝統)/.test(checkText);

  if (!appState.communications.terumoto.aiMayAutoReply && terumotoAutoReply) {
    warnings.push("足利輝統は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  if (/4月8日|居間|玄関前/.test(checkText) && !/旧境界|巻き戻し禁止/.test(checkText)) {
    warnings.push("旧境界（4月8日居間・玄関前）への巻き戻しに見える語があります。");
  }

  const irreversible = dangerousLineExists(
    checkText,
    /(死亡|死んだ|片腕を失|欠損|裏切|離反|婚姻|結婚|妊娠|子供|後継者|神様契約|神器継承|富士抜き正式使用|武具喪失|家の公式承認|関係が確定|大移動|武家秩序)/,
    { ignore: /(不可逆ゲート|確認カード|ここで停止|確定しない|候補|保留|話題|相談|兆候|しない|なし)/ }
  );
  if (irreversible) {
    dangers.push("不可逆事項らしき内容が、確認停止なしに出ています。");
  }

  const savedClaim = dangerousLineExists(
    text,
    /(保存しました|Drive反映済み|正史確定|確定保存)/,
    { ignore: /(言わない|禁止|扱いは禁止|しない)/ }
  );
  if (savedClaim) {
    dangers.push("AI返答内で保存済み・Drive反映済み・正史確定扱いにしています。");
  }

  const notificationLike = dangerousLineExists(
    checkText,
    /(DM|グルチャ|作戦室通知|任務通知|送信済み|返信済み|通知が届いた|メッセージが届いた|着信した)/,
    { ignore: /(沈黙|来ていない|届いていない|確認できるのは|スマホの重み|ポケット)/ }
  );
  if (notificationLike && !/:::writing\{variant="chat_message"/.test(checkText)) {
    warnings.push("通知・DM・作戦室通知らしき内容がありますが、chat_message writing block形式が見当たりません。");
  }

  if (checkText.includes("---")) {
    warnings.push("薄い区切り線「---」が含まれています。日ノ本本編形式では避ける対象です。");
  }

  return { warnings, dangers, ok: warnings.length === 0 && dangers.length === 0 };
}


function displayChecks(result) {
  const box = $("checkResults");
  const parts = [];
  if (result.ok) parts.push(`<div class="check-item ok"><b>検査OK</b><br>重大警告はありません。採用前に本文内容だけ目視確認してください。</div>`);
  result.dangers.forEach((x) => parts.push(`<div class="check-item danger"><b>重大警告</b><br>${escapeHtml(x)}</div>`));
  result.warnings.forEach((x) => parts.push(`<div class="check-item warning"><b>注意</b><br>${escapeHtml(x)}</div>`));
  box.innerHTML = parts.join("");
  $("adoptButton").disabled = result.dangers.length > 0;
  $("rejectButton").disabled = false;
}

function autoCheckResponseSoon() {
  clearTimeout(responseCheckTimer);
  responseCheckTimer = setTimeout(() => {
    const text = $("responseBox").value.trim();
    if (!text) return;
    appState.ai.lastResponse = text;
    updateParsedResponse(text);
    const result = runChecks(text);
    appState.ai.lastCheck = result;
    displayChecks(result);
    updateReviewButtons();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState, null, 2));
    $("saveStatus").textContent = result.ok ? "自動検査OK" : "自動検査注意";
    renderHero();
    renderLatestResponse();
  }, 500);
}

function simpleHash(text) {
  let hash = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return String(hash);
}

function isDuplicateCanonEntry(requestId, text) {
  const textHash = simpleHash(text);
  const logs = appState.story.canonLog || [];
  return logs.some((log) => {
    if (requestId && log.requestId && log.requestId === requestId) return true;
    return simpleHash(log.text || "") === textHash;
  });
}

function dedupeCanonLog(silent = false) {
  const logs = appState.story.canonLog || [];
  const seen = new Set();
  const deduped = [];
  let removed = 0;

  for (const log of logs) {
    const key = (log.requestId ? `req:${log.requestId}` : "") + "|text:" + simpleHash(log.text || "");
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    deduped.push(log);
  }

  appState.story.canonLog = deduped;
  saveState(removed ? `重複${removed}件整理` : "重複なし");
  if (!silent) alert(removed ? `重複ログを${removed}件整理しました。` : "重複ログは見つかりませんでした。");
}

function adoptResponse() {
  const button = $("quickAdoptButton") || $("adoptButton");
  const text = $("responseBox").value.trim() || (appState.ai.lastResponse || "").trim();
  if (!text) {
    alert("採用するAI本文がありません。");
    updateReviewButtons();
    return;
  }

  if (button) {
    button.classList.add("processing");
    button.textContent = "再検査中...";
  }

  try {
    // 採用ボタンは常に押せる。ここで必ず最新本文を再検査する。
    const check = runChecks(text);
    appState.ai.lastCheck = check;
    updateParsedResponse(text);
    displayChecks(check);
    updateReviewButtons();

    if (check.dangers && check.dangers.length > 0) {
      alert("重大警告があります。この本文は採用できません。採用しないを押して、同じ行動に補足を足して再送してください。");
      updateReviewButtons();
      return;
    }

    const requestId = appState.ai.lastRequestId || "";
    if (isDuplicateCanonEntry(requestId, text)) {
      displayChecks({ warnings: ["この返答はすでに正史ログへ採用済みです。重複採用は止めました。"], dangers: [], ok: false });
      alert("この返答はすでに採用済みです。重複追加はしません。");
      updateReviewButtons();
      return;
    }

    const parsed = updateParsedResponse(text);
    const cleanBody = (parsed.bodyText || text).trim();
    const nextCandidates = parsed.actionCandidates || [];

    const entry = {
      adoptedAt: nowLabel(),
      playerAction: appState.ai.pendingAction || "",
      requestId,
      text: parsed.rawText || text,
      bodyText: cleanBody,
      safetyText: parsed.safetyText || "",
      actionCandidates: nextCandidates,
      check
    };

    appState.story.canonLog.push(entry);
    appState.story.currentText = cleanBody;

    if (nextCandidates.length > 0) {
      appState.story.actionCandidates = nextCandidates;
    }

    appState.ai.lastResponse = text;
    appState.ai.lastCheck = check;
    appState.ai.lastAdoptedRequestId = requestId;
    appState.ai.lastAdoptedTextHash = simpleHash(text);

    if (appState.ai.pendingAction) {
      appState.story.actionHistory.push({
        sentAt: nowLabel(),
        text: appState.ai.pendingAction,
        status: "返答採用済み",
        requestId
      });
    }

    if (appState.ai.outbox) {
      appState.ai.outbox.status = "adopted";
      localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(appState.ai.outbox));
    }

    saveState(nextCandidates.length > 0 ? "採用済み・候補更新" : "採用済み");
    displayChecks({ warnings: [], dangers: [], ok: true });
    document.body.classList.remove("reading-priority");
    setTab("play");
    setTimeout(scrollToActionCard, 250);
  } finally {
    if (button) {
      setTimeout(() => {
        button.classList.remove("processing");
        button.textContent = "この本文を採用";
        updateReviewButtons();
      }, 400);
    }
  }
}

function rejectLatestResponse() {
  const text = $("responseBox").value.trim() || (appState.ai.lastResponse || "").trim();
  if (!text) return;

  appState.story.rejectedLog.push({
    rejectedAt: nowLabel(),
    playerAction: appState.ai.pendingAction || "",
    requestId: appState.ai.lastRequestId || "",
    text,
    check: runChecks(text)
  });

  if (appState.ai.outbox) {
    appState.ai.outbox.status = "rejected";
    localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(appState.ai.outbox));
  }

  appState.ai.lastResponse = "";
  appState.ai.lastCheck = null;
  appState.ai.lastParsedResponse = null;
  appState.ai.lastAdoptedRequestId = "";
  appState.ai.lastAdoptedTextHash = "";

  $("responseBox").value = "";
  $("checkResults").innerHTML = "";
  saveState("採用せず却下");
  document.body.classList.remove("reading-priority");
  setTab("play");
  setTimeout(scrollToActionCard, 250);
}


function rejectResponse() {
  const text = $("responseBox").value.trim();
  if (!text) return;
  appState.story.rejectedLog.push({ rejectedAt: nowLabel(), playerAction: appState.ai.pendingAction || "", requestId: appState.ai.lastRequestId || "", text, check: runChecks(text) });
  appState.ai.lastResponse = text;
  if (appState.ai.outbox) {
    appState.ai.outbox.status = "rejected";
    localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(appState.ai.outbox));
  }
  saveState("却下済み");
  $("responseBox").value = "";
  $("checkResults").innerHTML = "";
}

function exportState() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hinomoto-state-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyText(text, showStatus = true) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    if (showStatus) $("saveStatus").textContent = "コピーしました";
  }).catch(() => {
    if (showStatus) alert("コピーに失敗しました。手動で選択してください。");
  });
}

function copyOutbox() {
  const raw = localStorage.getItem(BRIDGE_OUTBOX_KEY);
  if (!raw) return alert("outboxは空です。先に行動を送信してください。");
  copyText(raw);
}

function clearBridgeQueue() {
  localStorage.removeItem(BRIDGE_OUTBOX_KEY);
  localStorage.removeItem(BRIDGE_INBOX_KEY);
  appState.ai.outbox = null;
  appState.ai.inbox = null;
  appState.ai.extensionStatus = "未接続";
  appState.ai.lastExtensionEvent = "BRIDGE_CLEARED";
  saveState("連携キュー削除");
}

function simulateExtensionResponse() {
  const responseText = `## 1. 事故防止チェック

現在地は2026年4月11日（土）朝／仙台城方面へ徒歩移動中のまま。
富士割は仙台住居の富士割祭壇にあり、広輝は日常外出中のため手元描写はしない。
富士抜きは本道神社本社奉納のまま扱う。
政宗・足利輝統の返信は発生させない。
敵状態はNO-CONTACTのため、戦闘処理・敵情報・報酬処理は出さない。
不可逆事項は確定しない。

## 2. 本文案

これは拡張連携テスト用の仮返答です。
実際の本編案ではなく、PWAが拡張から返答を受け取り、自動検査できるかを確認するための文章です。

**行動候補**
- ① 仙台城方面へ進む：周囲を観察しながら歩く
- ② スマホを確認：返信待ち状態だけ確認する
- ③ 周辺をさらに観察：人通りと街路樹の違和感を見る
- ④ 自由行動：自分の言葉で指定する`;

  const payload = { source: "HINOMOTO_EXTENSION", type: "AI_RESPONSE", requestId: appState.ai.lastRequestId || makeRequestId(), receivedAt: new Date().toISOString(), responseText };
  window.postMessage(payload, location.origin);
}


function flashLatestResponseCard() {
  const card = $("latestResponseCard");
  if (!card) return;
  card.classList.remove("response-preview-highlight");
  void card.offsetWidth;
  card.classList.add("response-preview-highlight");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}


function scrollToActionCard() {
  const card = $("actionCard");
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    const input = $("actionInput");
    if (input) input.focus();
  }, 450);
}

function openReader() {
  flashLatestResponseCard();
}

function closeReader() {
  document.body.classList.remove("reading-priority");
  document.body.style.overflow = "";
}


function openSettingsDuringReview() {
  document.body.classList.add("settings-override");
  document.body.classList.remove("reading-priority");
  setTab("settings");
  setTimeout(() => {
    const settings = $("tab-settings");
    if (settings) settings.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

function returnToReviewFromSettings() {
  document.body.classList.remove("settings-override");
  updateReadingPriorityMode();
  setTab("play");
  setTimeout(() => {
    const latest = $("latestResponseCard");
    if (latest) latest.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}




function focusPlayAfterSend() {
  document.body.classList.remove("settings-override");
  document.body.classList.remove("reading-priority");
  setTab("play");
  render();

  setTimeout(() => {
    const latest = $("latestResponseCard");
    if (latest) latest.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);
}


function focusLatestResponseAfterReceive() {
  // AIタブや設定タブにいても、返答が来たら必ず本文画面へ戻す。
  document.body.classList.remove("settings-override");
  setTab("play");
  updateReadingPriorityMode();
  render();

  setTimeout(() => {
    const latest = $("latestResponseCard");
    if (latest) {
      latest.classList.remove("response-preview-highlight");
      void latest.offsetWidth;
      latest.classList.add("response-preview-highlight");
      latest.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, 250);
}


function setupEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  if ($("quickCandidateButtons")) $("quickCandidateButtons").addEventListener("click", (event) => {
    const button = event.target.closest(".candidate-button");
    if (!button) return;
    fillActionInputFromCandidate(button.dataset.candidate || button.textContent);
  });

  if ($("goNextActionButton")) $("goNextActionButton").addEventListener("click", scrollToActionCard);
  if ($("closeReaderButton")) if ($("closeReaderButton")) if ($("closeReaderButton")) if ($("closeReaderButton")) if ($("closeReaderButton")) if ($("closeReaderButton")) $("closeReaderButton").addEventListener("click", closeReader);
  if ($("readerAdoptButton")) if ($("readerAdoptButton")) if ($("readerAdoptButton")) if ($("readerAdoptButton")) if ($("readerAdoptButton")) if ($("readerAdoptButton")) $("readerAdoptButton").addEventListener("click", adoptResponse);
  if ($("readerJumpButton")) if ($("readerJumpButton")) if ($("readerJumpButton")) if ($("readerJumpButton")) if ($("readerJumpButton")) if ($("readerJumpButton")) $("readerJumpButton").addEventListener("click", () => {
    closeReader();
    $("responseBox").scrollIntoView({ behavior: "smooth", block: "start" });
    $("responseBox").focus();
  });

  if ($("jumpToResponseButton")) $("jumpToResponseButton").addEventListener("click", () => {
    $("responseBox").scrollIntoView({ behavior: "smooth", block: "start" });
    $("responseBox").focus();
  });

  $("quickAdoptButton").addEventListener("click", adoptResponse);
  if ($("rejectLatestButton")) $("rejectLatestButton").addEventListener("click", rejectLatestResponse);
  if ($("backupDuringReviewButton")) $("backupDuringReviewButton").addEventListener("click", exportState);
  if ($("settingsDuringReviewButton")) $("settingsDuringReviewButton").addEventListener("click", openSettingsDuringReview);

  $("saveNowButton").addEventListener("click", () => saveState("保存しました"));
  $("exportButton").addEventListener("click", exportState);

  $("importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    appState = JSON.parse(text);
    normalizeState();
    saveState("読込保存");
  });

  $("resetButton").addEventListener("click", async () => {
    if (!confirm("初期状態へ戻します。現在のローカル保存は上書きされます。")) return;
    localStorage.removeItem(STORAGE_KEY);
    STORAGE_KEYS_OLD.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(BRIDGE_OUTBOX_KEY);
    localStorage.removeItem(BRIDGE_INBOX_KEY);
    const response = await fetch("./initial-state.json", { cache: "no-store" });
    appState = await response.json();
    normalizeState();
    saveState("初期化");
  });

  $("sendActionButton").addEventListener("click", sendAction);
  $("copyPromptAfterSendButton").addEventListener("click", () => copyText($("promptBox").value));
  $("clearActionButton").addEventListener("click", () => {
    $("actionInput").value = "";
    appState.ai.pendingAction = "";
    saveState("行動入力クリア");
  });

  $("copyOutboxButton").addEventListener("click", copyOutbox);
  $("clearBridgeButton").addEventListener("click", clearBridgeQueue);
  $("simulateResponseButton").addEventListener("click", simulateExtensionResponse);

  $("generatePromptButton").addEventListener("click", () => {
    const prompt = buildPrompt();
    appState.ai.lastPrompt = prompt;
    $("promptBox").value = prompt;
    saveState("プロンプト生成");
  });

  $("copyPromptButton").addEventListener("click", () => copyText($("promptBox").value));

  $("checkButton").addEventListener("click", () => {
    const text = $("responseBox").value;
    appState.ai.lastResponse = text;
    updateParsedResponse(text);
    const result = runChecks(text);
    appState.ai.lastCheck = result;
    displayChecks(result);
    updateReviewButtons();
    saveState(result.ok ? "検査OK" : "検査注意");
  });

  $("responseBox").addEventListener("input", autoCheckResponseSoon);
  $("responseBox").addEventListener("paste", autoCheckResponseSoon);

  $("adoptButton").addEventListener("click", adoptResponse);
  $("rejectButton").addEventListener("click", rejectResponse);

  $("copyLogButton").addEventListener("click", () => {
    const text = (appState.story.canonLog || []).map((log, i) => `#${i + 1} ${log.adoptedAt}\n行動：${log.playerAction || "未記録"}\n${log.text}`).join("\n\n");
    copyText(text);
  });

  $("dedupeLogButton").addEventListener("click", () => dedupeCanonLog(false));

  $("clearRejectedButton").addEventListener("click", () => {
    if (!confirm("却下ログを削除しますか？")) return;
    appState.story.rejectedLog = [];
    saveState("却下ログ削除");
  });

  $("applyStateButton").addEventListener("click", () => {
    try {
      appState = JSON.parse($("stateEditor").value);
      normalizeState();
      saveState("JSON適用");
    } catch (err) {
      alert("JSONとして読めません: " + err.message);
    }
  });

  $("refreshStateButton").addEventListener("click", renderStateEditor);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("installButton").classList.remove("hidden");
  });

  $("installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installButton").classList.add("hidden");
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./service-worker.js?v=057"); }
    catch (err) { console.warn("Service Worker registration failed", err); }
  }
}

(async function init() {
  await loadInitialState();
  setupEvents();
  startBridgeListeners();
  render();
  registerServiceWorker();
})();
