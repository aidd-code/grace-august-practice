(function () {
  "use strict";
  const base = "https://vtykowjeuwrplrzzprnz.supabase.co";
  const key = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
  // A publishable key is an API key, not an Auth access-token JWT.
  const headers = {apikey:key};
  const recordId = "grace-2026-08";
  const outboxKey = "grace-practice-sync-outbox-v2";
  const recoveryKey = "grace-practice-before-sync-v2";
  const table = "/rest/v1/practice_progress";
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  let observed = window.graceGetPracticeState?.() || {days:{}, typeOverrides:{}};
  let pending = readOutbox();
  let initialLocal = clone(observed);
  let initialized = false;
  let recoveredLocal = false;
  let active = null;
  let again = false;
  let applying = false;
  let saveTimer = null;
  let sequence = 0;
  let storageWarning = false;

  function readOutbox() {
    try {
      const entries = JSON.parse(localStorage.getItem(outboxKey) || "[]");
      return new Map(entries.filter(validOperation).map(op => [JSON.stringify(op.path), op]));
    } catch { return new Map(); }
  }
  function validOperation(op) {
    return Array.isArray(op?.path) && op.path.length &&
      op.path.every(part => typeof part === "string" && !["__proto__","prototype","constructor"].includes(part));
  }
  function persistOutbox() {
    try {
      if (pending.size) localStorage.setItem(outboxKey, JSON.stringify([...pending.values()]));
      else localStorage.removeItem(outboxKey);
      storageWarning = false;
    } catch { storageWarning = true; }
  }
  function operations(before, after, path = [], result = []) {
    if (same(before, after)) return result;
    // A newly created item includes empty UI defaults. Those are not edits
    // and must not erase another device's notes/checkboxes on the same item.
    if (before === undefined && !meaningful(after) && after !== undefined) return result;
    if (isObject(after) && (isObject(before) || before === undefined)) {
      const previous = before || {};
      for (const name of new Set([...Object.keys(previous), ...Object.keys(after)])) {
        operations(previous[name], after[name], [...path, name], result);
      }
    } else if (path.length) {
      const op = {path, remove:after === undefined, ...(after === undefined ? {} : {value:clone(after)})};
      if (path.at(-1) === "seconds" && typeof after === "number") op.delta = after - Number(before || 0);
      result.push(op);
    }
    return result;
  }
  function addOperations(entries) {
    for (const op of entries) {
      if (!validOperation(op)) continue;
      const pathKey = JSON.stringify(op.path);
      // Parent replacement/deletion supersedes earlier child edits.
      for (const [otherKey, other] of pending) {
        if (other.path.length > op.path.length && op.path.every((part, i) => part === other.path[i])) pending.delete(otherKey);
      }
      const previous = pending.get(pathKey);
      if (op.delta !== undefined && previous?.delta !== undefined) op.delta += previous.delta;
      op.id = Date.now() + "-" + (++sequence) + "-" + Math.random().toString(36).slice(2,8);
      pending.set(pathKey, op);
    }
    persistOutbox();
  }
  function captureLocalChanges() {
    if (applying) return;
    const current = window.graceGetPracticeState?.();
    if (!current) return;
    const changes = operations(observed, current);
    observed = clone(current);
    if (changes.length) addOperations(changes);
  }
  function overlay(state, entries) {
    const result = clone(state || {days:{}, typeOverrides:{}});
    for (const op of entries) {
      if (!validOperation(op)) continue;
      let target = result;
      for (const part of op.path.slice(0,-1)) {
        if (!isObject(target[part]) && !Array.isArray(target[part])) target[part] = {};
        target = target[part];
      }
      const name = op.path.at(-1);
      if (op.remove) delete target[name];
      else if (op.delta !== undefined) target[name] = Math.max(0, Number(target[name] || 0) + op.delta);
      else target[name] = clone(op.value);
    }
    return result;
  }
  function acknowledge(sent) {
    for (const op of sent) {
      const pathKey = JSON.stringify(op.path), current = pending.get(pathKey);
      if (!current) continue;
      if (current.id === op.id) pending.delete(pathKey);
      else if (op.delta !== undefined && current.delta !== undefined) {
        current.delta -= op.delta;
        if (!current.delta) pending.delete(pathKey);
      }
    }
    persistOutbox();
  }
  function meaningful(value) {
    if (isObject(value)) return Object.entries(value).some(([name, child]) => name !== "planSnapshot" && meaningful(child));
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== false && value !== 0 && value !== "";
  }
  function preserveInitialLocal() {
    if (!meaningful(initialLocal.days)) return;
    try { if (!localStorage.getItem(recoveryKey)) localStorage.setItem(recoveryKey, JSON.stringify(initialLocal)); }
    catch { storageWarning = true; }
  }
  function recoverMissingRecords(local, cloud) {
    // Upgrade recovery only adds records absent from cloud. Conflicting old
    // copies are backed up, not allowed to replace a current cloud value.
    const merged = clone(cloud);
    for (const [day, dayData] of Object.entries(local.days || {})) {
      for (const [type, plan] of Object.entries(dayData.plans || {})) {
        if (!meaningful(plan.items) && !meaningful(plan.journal)) continue;
        merged.days ||= {};
        merged.days[day] ||= {plans:{}};
        merged.days[day].plans ||= {};
        const target = merged.days[day].plans[type];
        if (!target) { merged.days[day].plans[type] = clone(plan); continue; }
        const aligned = same(plan.planSnapshot?.map(item => item.title), target.planSnapshot?.map(item => item.title));
        if (aligned) {
          target.items ||= {};
          for (const [index, item] of Object.entries(plan.items || {})) {
            if (!Object.hasOwn(target.items, index) && meaningful(item)) target.items[index] = clone(item);
            else if (isObject(target.items[index]) && isObject(item)) {
              // Rendering an unpractised day can create empty item objects in
              // cloud. They must not prevent recovery of local-only notes and
              // ticks; existing substantive cloud values still take priority.
              recoverBlankFields(target.items[index], item);
            }
          }
        }
        target.journal ||= {};
        for (const [name, value] of Object.entries(plan.journal || {})) {
          if (!meaningful(target.journal[name]) && meaningful(value)) target.journal[name] = clone(value);
        }
      }
    }
    return merged;
  }
  function recoverBlankFields(target, local) {
    for (const [name, value] of Object.entries(local)) {
      if (["__proto__", "prototype", "constructor"].includes(name)) continue;
      if (isObject(target[name]) && isObject(value)) recoverBlankFields(target[name], value);
      else if (!meaningful(target[name]) && meaningful(value)) target[name] = clone(value);
    }
  }
  function setStatus(state, message) {
    if (storageWarning) message += " · 本机空间不足，请导出备份后再关闭";
    for (const id of ["cloudSaveText", "syncStatusText"]) {
      const text = document.getElementById(id); if (text) text.textContent = message;
    }
    for (const id of ["cloudSaveStatus", "syncStatusPanel"]) {
      const box = document.getElementById(id); if (box) box.dataset.state = state;
    }
    for (const id of ["cloudSaveRetry", "syncRefresh"]) {
      const button = document.getElementById(id);
      if (button) {
        button.hidden = state !== "error";
        button.disabled = false;
        button.textContent = "重试连接";
      }
    }
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(base + url, {...options, signal:controller.signal, cache:"no-store", headers:{...headers, ...(options.headers || {})}});
      if (!response.ok) throw new Error("HTTP " + response.status + ": " + (await response.text()).slice(0,200));
      return response.status === 204 ? null : await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function readRow() {
    const rows = await request(table + "?id=eq." + recordId + "&select=state,updated_at");
    return rows?.[0] || null;
  }
  function applyToPage(remote) {
    captureLocalChanges();
    const desired = overlay(remote, [...pending.values()]);
    if (same(desired, window.graceGetPracticeState?.())) return true;
    if (window.gracePracticeSyncBusy?.()) return false;
    applying = true;
    let accepted;
    try { accepted = window.graceApplyPracticeState?.(desired); }
    finally { applying = false; }
    if (accepted === false) return false;
    const actual = window.graceGetPracticeState?.() || desired;
    observed = clone(actual);
    // Preserve one-time application migrations as local changes too.
    if (window.graceIsLoggedIn?.()) addOperations(operations(desired, actual));
    return true;
  }
  async function runSync() {
    captureLocalChanges();
    if (!initialized || pending.size) setStatus("saving", pending.size ? "正在合并并同步双方的修改…" : "正在连接共享打卡记录…");
    try {
      let row = await readRow();
      captureLocalChanges();
      if (!initialized) { preserveInitialLocal(); initialized = true; }
      if (!recoveredLocal && window.graceIsLoggedIn?.()) {
          const remote = row?.state || {days:{}, typeOverrides:{}};
          const recovered = recoverMissingRecords(initialLocal || {days:{}, typeOverrides:{}}, remote);
          const savedPending = [...pending.values()];
          addOperations(operations(remote, recovered));
          for (const op of savedPending) pending.set(JSON.stringify(op.path), op);
          persistOutbox();
        initialLocal = null;
        recoveredLocal = true;
      }
      for (let attempt = 0; pending.size && window.graceIsLoggedIn?.(); attempt++) {
        if (attempt >= 6) throw new Error("同时修改较多，稍后会继续同步");
        captureLocalChanges();
        const alreadyApplied = new Set(row?.state?._syncApplied || []);
        acknowledge([...pending.values()].filter(op => alreadyApplied.has(op.id)));
        if (!pending.size) break;
        const sent = clone([...pending.values()]);
        const merged = overlay(row?.state, sent);
        merged._syncApplied = [...(merged._syncApplied || []), ...sent.map(op => op.id)].slice(-1000);
        const stamp = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at || "") || 0) + 1)).toISOString();
        let committed;
        if (row) {
          // Optimistic locking: if another device saves first, re-read and merge.
          committed = await request(table + "?id=eq." + recordId + "&updated_at=eq." + encodeURIComponent(row.updated_at) + "&select=state,updated_at", {
            method:"PATCH", headers:{"Content-Type":"application/json", Prefer:"return=representation"},
            body:JSON.stringify({state:merged, updated_at:stamp})
          });
        } else {
          committed = await request(table + "?on_conflict=id&select=state,updated_at", {
            method:"POST", headers:{"Content-Type":"application/json", Prefer:"resolution=ignore-duplicates,return=representation"},
            body:JSON.stringify({id:recordId, state:merged, updated_at:stamp})
          });
        }
        captureLocalChanges();
        if (!committed?.length) { row = await readRow(); continue; }
        acknowledge(sent);
        row = committed[0];
      }
      const remote = row?.state || {days:{}, typeOverrides:{}};
      const applied = applyToPage(remote);
      const time = new Date().toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
      if (pending.size) {
        setStatus("local", window.graceIsLoggedIn?.() ? "本机修改已保留，正在继续同步…" : "有本机修改尚未上传 · 登录后自动同步");
        if (window.graceIsLoggedIn?.()) scheduleSync();
      } else if (!applied) setStatus("saved", "已收到云端更新 · 结束输入、计时或录音后显示 · " + time);
      else setStatus("saved", "双方记录已同步 · 自动保存，无需手动操作 · " + time);
    } catch (error) {
      console.warn("Practice shared sync failed", error);
      // Keep the local outbox intact. A missing/paused Supabase project is
      // different from an ordinary offline moment: every device would be
      // isolated until the project endpoint is restored.
      const detail = String(error?.message || "");
      const projectUnavailable = /Failed to fetch|NetworkError|aborted|SSL|ENOTFOUND|DNS|HTTP 404|HTTP 5\d\d/i.test(detail);
      let message = projectUnavailable
        ? (pending.size
          ? "共享云端暂时不可用 · 本机修改已保留，恢复云端后会自动同步"
          : "共享云端暂时不可用 · 当前仅显示本机记录")
        : (pending.size
          ? "网络或云端连接失败 · 本机修改已保留，联网后重试"
          : "云端连接失败 · 当前仅显示本机记录，请重试");
      if (/HTTP (401|403)/.test(detail)) message = "云端权限配置未完成 · 请检查 API 密钥及打卡表访问权限 · 本机记录保留";
      else if (/PGRST205|42P01/.test(detail)) message = "云端打卡表尚未配置 · 请建立 practice_progress 表 · 本机记录保留";
      setStatus("error", message);
    }
  }
  function sync() {
    if (active) { again = true; return active; }
    active = runSync().finally(() => {
      active = null;
      if (again) { again = false; scheduleSync(200); }
    });
    return active;
  }
  function scheduleSync(delay = 700) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(sync, delay);
  }
  window.addEventListener("grace:practice-state-changed", () => {
    if (applying) return;
    captureLocalChanges();
    if (!pending.size) return;
    setStatus("local", "本机修改已保留 · 等待同步到双方设备…");
    if (window.graceIsLoggedIn?.()) scheduleSync();
  });
  window.addEventListener("grace:practice-save-retry", sync);
  window.addEventListener("grace:auth-changed", () => { captureLocalChanges(); scheduleSync(0); });
  window.addEventListener("DOMContentLoaded", sync);
  window.addEventListener("online", sync);
  window.addEventListener("focus", () => { if (!document.hidden) scheduleSync(0); });
  window.addEventListener("pagehide", captureLocalChanges);
  document.addEventListener("visibilitychange", () => { captureLocalChanges(); sync(); });
  document.addEventListener("focusout", () => scheduleSync(200));
  setInterval(() => { if (!document.hidden) sync(); }, 5000);
})();
