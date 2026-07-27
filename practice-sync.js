(function () {
  const base = "https://vtykowjeuwrplrzzprnz.supabase.co";
  const key = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
  const headers = {apikey:key, Authorization:`Bearer ${key}`};
  const recordId = "grace-2026-08";
  let saveTimer = null;
  let saving = false;
  let queued = false;
  let applyingCloud = false;
  let dirty = false;

  function setStatus(state, message) {
    const box = document.getElementById("cloudSaveStatus");
    const text = document.getElementById("cloudSaveText");
    if (!box || !text) return;
    box.dataset.state = state;
    text.textContent = message;
    const button = document.getElementById("cloudSaveRetry");
    if (button) {
      button.disabled = state === "saving" || !window.graceIsLoggedIn?.();
      button.textContent = state === "error" ? "重新保存" : "立即保存";
    }
  }

  function hasMeaningfulData(state) {
    if (!state) return false;
    if (Object.keys(state.typeOverrides || {}).length) return true;
    return Object.values(state.days || {}).some(day => {
      if (Object.values(day.journal || {}).some(value => String(value || "").trim())) return true;
      return Object.values(day.items || {}).some(item =>
        item.done || item.seconds > 0 || String(item.note || "").trim() ||
        String(item.answer || "").trim() || Object.values(item.checks || {}).some(Boolean)
      );
    });
  }

  async function request(url, options = {}) {
    const response = await fetch(`${base}${url}`, {...options, headers:{...headers, ...(options.headers || {})}});
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  function queueSave(delay = 700) {
    if (applyingCloud || !window.graceIsLoggedIn?.()) return;
    dirty = true;
    clearTimeout(saveTimer);
    setStatus("saving", "正在保存到云端…");
    saveTimer = setTimeout(saveNow, delay);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    if (!window.graceIsLoggedIn?.()) {
      setStatus("saved", "只读模式 · 登录后可以保存修改");
      return;
    }
    if (saving) { queued = true; return; }
    const state = window.graceGetPracticeState?.();
    if (!state) return setStatus("error", "云端保存未启动");
    saving = true;
    setStatus("saving", "正在保存到云端…");
    try {
      await request("/rest/v1/practice_progress?on_conflict=id", {
        method:"POST",
        headers:{"Content-Type":"application/json", Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({id:recordId, state, updated_at:new Date().toISOString()})
      });
      dirty = false;
      setStatus("saved", `已保存到云端 · ${new Date().toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit"})}`);
    } catch (error) {
      console.warn("Practice cloud save failed", error);
      setStatus("error", "云端保存失败 · 本机副本仍在");
    } finally {
      saving = false;
      if (queued) { queued = false; saveNow(); }
    }
  }

  async function loadCloud() {
    if (dirty || saving) return;
    setStatus("saving", "正在读取云端记录…");
    try {
      const rows = await request(`/rest/v1/practice_progress?id=eq.${recordId}&select=state,updated_at`);
      const row = rows?.[0];
      if (row?.state) {
        const localState = window.graceGetPracticeState?.();
        if (window.graceIsLoggedIn?.() && !hasMeaningfulData(row.state) && hasMeaningfulData(localState)) {
          dirty = true;
          await saveNow();
          return;
        }
        applyingCloud = true;
        window.graceApplyPracticeState?.(row.state);
        applyingCloud = false;
        const savedAt = new Date(row.updated_at).toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit"});
        setStatus("saved", `已从云端同步 · ${savedAt}`);
      } else if (window.graceIsLoggedIn?.()) {
        await saveNow();
      } else {
        setStatus("saved", "只读模式 · 登录后可以保存修改");
      }
    } catch (error) {
      applyingCloud = false;
      console.warn("Practice cloud load failed", error);
      setStatus("error", "云端连接失败 · 当前使用本机副本");
    }
  }

  window.addEventListener("grace:practice-state-changed", () => queueSave());
  window.addEventListener("grace:practice-save-retry", saveNow);
  window.addEventListener("grace:auth-changed", event => {
    if (event.detail.loggedIn) {
      clearTimeout(saveTimer);
      dirty = false;
      loadCloud();
    }
    else setStatus("saved", "只读模式 · 登录后可以保存修改");
  });
  window.addEventListener("DOMContentLoaded", loadCloud);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dirty) saveNow();
    else if (!document.hidden) loadCloud();
  });
})();
