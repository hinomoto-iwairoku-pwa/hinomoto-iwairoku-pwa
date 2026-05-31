const STORAGE_KEY = "hinomoto_pwa_state_v1";
let appState = null;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

async function loadInitialState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    appState = JSON.parse(saved);
    return;
  }
  const response = await fetch("./initial-state.json");
  appState = await response.json();
  saveState("初期状態を保存");
}

function nowLabel() {
  return new Date().toLocaleString("ja-JP", { hour12: false });
}

function saveState(label = "保存しました") {
  appState.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState, null, 2));
  $("saveStatus").textContent = label;
  render();
}

function renderStatus() {
  const items = [
    ["日時", `${appState.world.date}（${appState.world.weekday}）${appState.world.timeOfDay}`],
    ["現在地", appState.world.currentLocation],
    ["広輝", `${appState.protagonist.mode} / 所持：${appState.protagonist.currentHeldItems.join("、")}`],
    ["富士割", `${appState.artifacts.fujiwari.location} / 携行：${appState.artifacts.fujiwari.carriedByHiroki ? "あり" : "なし"}`],
    ["富士抜き", `${appState.artifacts.fujinuki.location} / 携行：${appState.artifacts.fujinuki.carriedByHiroki ? "あり" : "なし"}`],
    ["戦闘状態", `${appState.combat.enemyState} / 戦闘UI：${appState.combat.combatUiAllowed ? "可" : "不可"}`],
    ["政宗", `${appState.communications.masamune.thread}：${appState.communications.masamune.state}`],
    ["輝統", `${appState.communications.terumoto.thread}：${appState.communications.terumoto.state}`],
    ["作戦室", `新規確認：${appState.communications.operationRoom.newCheck ? "あり" : "なし"} / 受諾：${appState.communications.operationRoom.normalMissionAccepted ? "あり" : "なし"}`],
  ];
  $("statusGrid").innerHTML = items.map(([k, v]) => `<div class="status-item"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span></div>`).join("");
}

function renderStory() {
  $("storyText").textContent = appState.story.currentText || "";
  $("candidateList").innerHTML = (appState.story.actionCandidates || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
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
  renderStory();
  renderLogs();
  renderStateEditor();
  $("promptBox").value = appState.ai.lastPrompt || "";
  $("responseBox").value = appState.ai.lastResponse || "";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[s]);
}

function buildPrompt() {
  const s = appState;
  return `あなたは「日ノ本異聞録：歴史の継承者」の文章案作成AIです。
ただし、正史確定・状態保存・Drive反映済み扱いは禁止です。
この返答はPWA側で検査され、ユーザーが採用するまで正史ではありません。

【現在状態】
日付：${s.world.date}（${s.world.weekday}）${s.world.timeOfDay}
現在地：${s.world.currentLocation}
旧境界：${s.world.previousBoundary}
広輝状態：${s.protagonist.mode}
広輝の現在所持品：${s.protagonist.currentHeldItems.join("、")}
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

function runChecks(text) {
  const warnings = [];
  const dangers = [];

  const fujiwariAbsent = !appState.artifacts.fujiwari.carriedByHiroki;
  if (fujiwariAbsent) {
    const fujiwariPattern = /(富士割|宝刀)[\s\S]{0,24}(柄|抜|抜刀|構え|構える|握|握る|振る|納刀|斬|切|突)/;
    if (fujiwariPattern.test(text)) {
      dangers.push("富士割が現在地にないのに、手元・抜刀・構え・攻撃に見える描写があります。");
    }
  }

  if (appState.combat.enemyState !== "ENEMY-CONFIRMED") {
    const combatPatterns = [
      { pattern: /(ENEMY-CONFIRMED|敵HP|HP[:：]|戦闘UI|討伐報酬|撃破|戦闘開始|ターン)/, msg: "未接敵なのに戦闘UI・敵HP・討伐報酬・ターン処理らしき語があります。" },
      { pattern: /(妖魔が現れた|敵が現れた|襲いかか|襲撃してきた)/, msg: "NO-CONTACTなのに敵出現が確定している可能性があります。" }
    ];
    combatPatterns.forEach(({pattern, msg}) => {
      if (pattern.test(text)) dangers.push(msg);
    });
  }

  if (!appState.communications.masamune.aiMayAutoReply && /伊達政宗[\s\S]{0,40}(返信|届いた|通知|メッセージ|返ってきた|chat_message)/.test(text)) {
    warnings.push("政宗は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  if (!appState.communications.terumoto.aiMayAutoReply && /足利輝統[\s\S]{0,40}(返信|届いた|通知|メッセージ|返ってきた|chat_message)/.test(text)) {
    warnings.push("足利輝統は返信待ちです。ユーザー選択なしの返信発生に見える箇所があります。");
  }

  if (/4月8日|居間|玄関前/.test(text) && !/旧境界|巻き戻し禁止/.test(text)) {
    warnings.push("旧境界（4月8日居間・玄関前）への巻き戻しに見える語があります。");
  }

  const gatePattern = /(死亡|死んだ|片腕を失|欠損|裏切|離反|婚姻|結婚|妊娠|子供|後継者|神様契約|神器継承|富士抜き正式使用|武具喪失|家の公式承認|関係が確定|大移動|武家秩序)/;
  if (gatePattern.test(text) && !/(不可逆ゲート|確認カード|ここで停止|確定しない)/.test(text)) {
    dangers.push("不可逆事項らしき内容が、確認停止なしに出ています。");
  }

  if (/保存しました|Drive反映済み|正史確定|確定保存/.test(text)) {
    dangers.push("AI返答内で保存済み・Drive反映済み・正史確定扱いにしています。");
  }

  if (/スマホ|通知|DM|グルチャ|作戦室通知|任務通知|返信済み|送信済み/.test(text) && !/:::writing\{variant="chat_message"/.test(text)) {
    warnings.push("通知・DM・作戦室通知らしき内容がありますが、chat_message writing block形式が見当たりません。");
  }

  if (text.includes("---")) {
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
    text,
    check
  };
  appState.story.canonLog.push(entry);
  appState.story.currentText = text;
  appState.ai.lastResponse = text;
  appState.ai.lastCheck = check;
  saveState("採用済み");
}

function rejectResponse() {
  const text = $("responseBox").value.trim();
  if (!text) return;
  appState.story.rejectedLog.push({
    rejectedAt: nowLabel(),
    text,
    check: runChecks(text)
  });
  appState.ai.lastResponse = text;
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

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    $("saveStatus").textContent = "コピーしました";
  }).catch(() => {
    alert("コピーに失敗しました。手動で選択してください。");
  });
}

function setupEvents() {
  $("saveNowButton").addEventListener("click", () => saveState("保存しました"));
  $("exportButton").addEventListener("click", exportState);

  $("importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    appState = JSON.parse(text);
    saveState("読込保存");
  });

  $("resetButton").addEventListener("click", async () => {
    if (!confirm("初期状態へ戻します。現在のローカル保存は上書きされます。")) return;
    localStorage.removeItem(STORAGE_KEY);
    const response = await fetch("./initial-state.json", { cache: "no-store" });
    appState = await response.json();
    saveState("初期化");
  });

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

  $("adoptButton").addEventListener("click", adoptResponse);
  $("rejectButton").addEventListener("click", rejectResponse);

  $("copyLogButton").addEventListener("click", () => {
    const text = (appState.story.canonLog || []).map((log, i) => `#${i + 1} ${log.adoptedAt}\n${log.text}`).join("\n\n");
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
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (err) {
      console.warn("Service Worker registration failed", err);
    }
  }
}

(async function init() {
  await loadInitialState();
  setupEvents();
  render();
  registerServiceWorker();
})();
