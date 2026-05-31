const STORAGE_KEY = "hinomoto_pwa_state_v25";
const STORAGE_KEY_V2 = "hinomoto_pwa_state_v2";
const STORAGE_KEY_V1 = "hinomoto_pwa_state_v1";
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

  const v2Saved = localStorage.getItem(STORAGE_KEY_V2);
  if (v2Saved) {
    appState = JSON.parse(v2Saved);
    normalizeState();
    saveState("v0.2から引継ぎ");
    return;
  }

  const v1Saved = localStorage.getItem(STORAGE_KEY_V1);
  if (v1Saved) {
    appState = JSON.parse(v1Saved);
    normalizeState();
    saveState("v0.1から引継ぎ");
    return;
  }

  const response = await fetch("./initial-state.json");
  appState = await response.json();
  normalizeState();
  saveState("初期状態を保存");
}

function normalizeState() {
  appState.meta = appState.meta || {};
  appState.meta.appVersion = "0.25.0-extension-ready";
  appState.world = appState.world || {};
  appState.protagonist = appState.protagonist || {};
  appState.artifacts = appState.artifacts || {};
  appState.communications = appState.communications || {};
  appState.combat = appState.combat || {};
  appState.story = appState.story || {};
  appState.ai = appState.ai || {};
  appState.story.canonLog = appState.story.canonLog || [];
  appState.story.rejectedLog = appState.story.rejectedLog || [];
  appState.story.actionHistory = appState.story.actionHistory || [];
  appState.story.actionCandidates = appState.story.actionCandidates || [];
  appState.ai.sendQueue = appState.ai.sendQueue || [];
  appState.ai.pendingAction = appState.ai.pendingAction || "";
  appState.ai.responseAutoCheck = true;
  appState.ai.extensionMode = true;
  appState.ai.extensionStatus = appState.ai.extensionStatus || "未接続";
  appState.ai.lastRequestId = appState.ai.lastRequestId || "";
  appState.ai.lastExtensionEvent = appState.ai.lastExtensionEvent || "";
  appState.ai.outbox = appState.ai.outbox || null;
  appState.ai.inbox = appState.ai.inbox || null;
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

function renderStatus() {
  const items = [
    ["日時", `${appState.world.date}（${appState.world.weekday}）${appState.world.timeOfDay}`],
    ["現在地", appState.world.currentLocation],
    ["広輝", `${appState.protagonist.mode} / 所持：${(appState.protagonist.currentHeldItems || []).join("、")}`],
    ["富士割", `${appState.artifacts.fujiwari?.location || "不明"} / 携行：${appState.artifacts.fujiwari?.carriedByHiroki ? "あり" : "なし"}`],
    ["富士抜き", `${appState.artifacts.fujinuki?.location || "不明"} / 携行：${appState.artifacts.fujinuki?.carriedByHiroki ? "あり" : "なし"}`],
    ["戦闘状態", `${appState.combat.enemyState} / 戦闘UI：${appState.combat.combatUiAllowed ? "可" : "不可"}`],
    ["政宗", `${appState.communications.masamune?.thread || "個チャ"}：${appState.communications.masamune?.state || "不明"}`],
    ["輝統", `${appState.communications.terumoto?.thread || "個チャ"}：${appState.communications.terumoto?.state || "不明"}`],
    ["作戦室", `新規確認：${appState.communications.operationRoom?.newCheck ? "あり" : "なし"} / 受諾：${appState.communications.operationRoom?.normalMissionAccepted ? "あり" : "なし"}`],
  ];
  $("statusGrid").innerHTML = items.map(([k, v]) => `<div class="status-item"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`).join("");
}

function renderExtensionStatus() {
  const status = appState.ai.extensionStatus || "未接続";
  $("extensionStatus").textContent = status;
  $("requestIdLabel").textContent = appState.ai.lastRequestId || "なし";
  $("extensionEventLabel").textContent = appState.ai.lastExtensionEvent || "なし";

  let outbox = appState.ai.outbox;
  if (!outbox) {
    try {
      outbox = JSON.parse(localStorage.getItem(BRIDGE_OUTBOX_KEY) || "null");
    } catch {}
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
    ? list.slice(-5).reverse().map((item) => `
      <div class="mini-log-item">
        <small>${escapeHtml(item.sentAt)} / ${escapeHtml(item.status || "送信済み")}</small>
        ${escapeHtml(item.text)}
      </div>
    `).join("")
    : `<div class="mini-log-item">まだ送信履歴はありません。</div>`;
}

function renderLogs() {
  const logs = appState.story.canonLog || [];
  $("canonLog").innerHTML = logs.length
    ? logs.slice().reverse().map((log) => `
      <div class="log-item">
        <small>${escapeHtml(log.adoptedAt)}</small>
        ${escapeHtml(log.text)}
      </div>`).join("")
    : `<div class="log-item">まだ正史ログはありません。</div>`;
}

function renderStateEditor() {
  $("stateEditor").value = JSON.stringify(appState, null, 2);
}

function render() {
  if (!appState) return;
  renderStatus();
  renderExtensionStatus();
  renderStory();
  renderActionHistory();
  renderLogs();
  renderStateEditor();
  $("promptBox").value = appState.ai.lastPrompt || "";
  $("responseBox").value = appState.ai.lastResponse || "";
  $("actionInput").value = appState.ai.pendingAction || "";
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

function buildPrompt(actionText = "") {
  const s = appState;
  const actionSection = actionText.trim()
    ? `\n【今回のプレイヤー行動】\n${actionText.trim()}\n`
    : "";
  return `あなたは「日ノ本異聞録：歴史の継承者」の文章案作成AIです。
ただし、正史確定・状態保存・Drive反映済み扱いは禁止です。
この返答はPWA側で検査され、ユーザーが採用するまで正史ではありません。

【現在状態】
日付：${s.world.date}（${s.world.weekday}）${s.world.timeOfDay}
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

【出力形式】
1. 事故防止チェック
2. 本文案
3. **行動候補**
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
  const entry = {
    sentAt: nowLabel(),
    text: actionText,
    status: "AIプロンプト生成済み",
    requestId
  };

  appState.ai.pendingAction = actionText;
  appState.ai.lastPrompt = prompt;
  appState.ai.lastRequestId = requestId;
  appState.ai.lastExtensionEvent = "PWA_SEND_READY";
  appState.ai.extensionStatus = "送信待ち";
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
  saveState("送信準備OK");

  copyText(prompt, false);
  $("saveStatus").textContent = "送信プロンプト生成・コピー済み";
}

function receiveExtensionResponse(payload) {
  if (!payload || !payload.responseText) return;
  appState.ai.extensionStatus = "返答受信";
  appState.ai.lastExtensionEvent = payload.type || "AI_RESPONSE";
  appState.ai.inbox = payload;
  appState.ai.lastResponse = payload.responseText;

  localStorage.setItem(BRIDGE_INBOX_KEY, JSON.stringify(payload));

  const outbox = appState.ai.outbox || {};
  outbox.status = "response_received";
  appState.ai.outbox = outbox;
  localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(outbox));

  $("responseBox").value = payload.responseText;
  const result = runChecks(payload.responseText);
  appState.ai.lastCheck = result;
  displayChecks(result);
  saveState(result.ok ? "拡張返答・検査OK" : "拡張返答・検査注意");
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

function runChecks(text) {
  const warnings = [];
  const dangers = [];
  const checkText = extractMainTextForChecks(text);

  const fujiwariAbsent = !appState.artifacts.fujiwari.carriedByHiroki;
  if (fujiwariAbsent) {
    const fujiwariPattern = /(富士割|宝刀)[\s\S]{0,24}(柄に触|抜刀|抜く|抜いた|構え|構える|握|握る|振る|納刀|斬|切|突)/;
    if (fujiwariPattern.test(checkText)) {
      dangers.push("富士割が現在地にないのに、手元・抜刀・構え・攻撃に見える描写があります。");
    }
  }

  if (appState.combat.enemyState !== "ENEMY-CONFIRMED") {
    if (/(敵HP|HP[:：]\s*\d|討伐報酬|撃破報酬|戦闘開始|ターン処理|第\d+ターン)/.test(checkText) || hasUnsafeCombatUi(checkText)) {
      dangers.push("未接敵なのに戦闘UI・敵HP・討伐報酬・ターン処理らしき語があります。");
    }
    if (/(妖魔が現れた|敵が現れた|敵影が姿を現した|襲いかかってきた|襲撃してきた)/.test(checkText)) {
      dangers.push("NO-CONTACTなのに敵出現が確定している可能性があります。");
    }
  }

  const masamuneAutoReplyPattern = /(伊達政宗|政宗)[\s\S]{0,60}(返信が届いた|返事が届いた|返ってきた|通知が届いた|メッセージが届いた)|:::writing\{variant="chat_message"[\s\S]{0,120}(伊達政宗|政宗)/;
  if (!appState.communications.masamune.aiMayAutoReply && masamuneAutoReplyPattern.test(checkText)) {
    warnings.push("政宗は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  const terumotoAutoReplyPattern = /(足利輝統|輝統)[\s\S]{0,60}(返信が届いた|返事が届いた|返ってきた|通知が届いた|メッセージが届いた)|:::writing\{variant="chat_message"[\s\S]{0,120}(足利輝統|輝統)/;
  if (!appState.communications.terumoto.aiMayAutoReply && terumotoAutoReplyPattern.test(checkText)) {
    warnings.push("足利輝統は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  if (/4月8日|居間|玄関前/.test(checkText) && !/旧境界|巻き戻し禁止/.test(checkText)) {
    warnings.push("旧境界（4月8日居間・玄関前）への巻き戻しに見える語があります。");
  }

  const gatePattern = /(死亡|死んだ|片腕を失|欠損|裏切|離反|婚姻|結婚|妊娠|子供|後継者|神様契約|神器継承|富士抜き正式使用|武具喪失|家の公式承認|関係が確定|大移動|武家秩序)/;
  if (gatePattern.test(checkText) && !/(不可逆ゲート|確認カード|ここで停止|確定しない|候補|保留)/.test(checkText)) {
    dangers.push("不可逆事項らしき内容が、確認停止なしに出ています。");
  }

  if (/保存しました|Drive反映済み|正史確定|確定保存/.test(text)) {
    dangers.push("AI返答内で保存済み・Drive反映済み・正史確定扱いにしています。");
  }

  const notificationLike = /(DM|グルチャ|作戦室通知|任務通知|送信済み|返信済み|通知が届いた|メッセージが届いた)/.test(checkText);
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
  if (result.ok) {
    parts.push(`<div class="check-item ok"><b>検査OK</b><br>重大警告はありません。採用前に本文内容だけ目視確認してください。</div>`);
  }
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
    const result = runChecks(text);
    appState.ai.lastCheck = result;
    displayChecks(result);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState, null, 2));
    $("saveStatus").textContent = result.ok ? "自動検査OK" : "自動検査注意";
  }, 500);
}

function adoptResponse() {
  const text = $("responseBox").value.trim();
  if (!text) return;
  const check = runChecks(text);
  if (check.dangers.length > 0) {
    displayChecks(check);
    alert("重大警告があります。採用できません。");
    return;
  }
  const entry = {
    adoptedAt: nowLabel(),
    playerAction: appState.ai.pendingAction || "",
    requestId: appState.ai.lastRequestId || "",
    text,
    check
  };
  appState.story.canonLog.push(entry);
  appState.story.currentText = text;
  appState.ai.lastResponse = text;
  appState.ai.lastCheck = check;
  if (appState.ai.pendingAction) {
    appState.story.actionHistory.push({
      sentAt: nowLabel(),
      text: appState.ai.pendingAction,
      status: "返答採用済み",
      requestId: appState.ai.lastRequestId || ""
    });
  }
  if (appState.ai.outbox) {
    appState.ai.outbox.status = "adopted";
    localStorage.setItem(BRIDGE_OUTBOX_KEY, JSON.stringify(appState.ai.outbox));
  }
  saveState("採用済み");
}

function rejectResponse() {
  const text = $("responseBox").value.trim();
  if (!text) return;
  appState.story.rejectedLog.push({
    rejectedAt: nowLabel(),
    playerAction: appState.ai.pendingAction || "",
    requestId: appState.ai.lastRequestId || "",
    text,
    check: runChecks(text)
  });
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
  if (!raw) {
    alert("outboxは空です。先に行動を送信してください。");
    return;
  }
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

  const payload = {
    source: "HINOMOTO_EXTENSION",
    type: "AI_RESPONSE",
    requestId: appState.ai.lastRequestId || makeRequestId(),
    receivedAt: new Date().toISOString(),
    responseText
  };
  window.postMessage(payload, location.origin);
}

function setupEvents() {
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
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
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
    const result = runChecks(text);
    appState.ai.lastCheck = result;
    displayChecks(result);
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
    try {
      await navigator.serviceWorker.register("./service-worker.js?v=025");
    } catch (err) {
      console.warn("Service Worker registration failed", err);
    }
  }
}

(async function init() {
  await loadInitialState();
  setupEvents();
  startBridgeListeners();
  render();
  registerServiceWorker();
})();
