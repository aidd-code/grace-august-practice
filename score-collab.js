(function () {
  const base = "https://vtykowjeuwrplrzzprnz.supabase.co";
  const key = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
  const extensions = {"application/pdf":"pdf", "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif"};
  let context = null;

  function safe(value = "") {
    return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  }

  function fileName(file) {
    const baseName = file.name.replace(/\.[^.]+$/i, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "score";
    return `${Date.now()}-${baseName}.${extensions[file.type]}`;
  }

  function publicUrl(path) {
    return `${base}/storage/v1/object/public/scores/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  }

  function ensureModal() {
    if (document.getElementById("collabScoreModal")) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="modal" id="collabScoreModal" role="dialog" aria-modal="true">
      <div class="modal-box"><h3 id="collabScoreHeading">上传练习乐谱</h3><p id="collabScoreHint" style="color:var(--muted);line-height:1.6"></p>
      <form class="cloud-form" id="collabScoreForm">
        <label>乐谱名称<input id="collabScoreTitle" required></label>
        <label>作曲家<input id="collabScoreComposer" placeholder="可选"></label>
        <label>选择 PDF 或图片（最大 25 MB）<input id="collabScoreFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" required></label>
        <label>备注<textarea id="collabScoreNotes" placeholder="版本、乐章或说明"></textarea></label>
        <button type="submit">上传并自动关联</button><button class="secondary" id="collabScoreCancel" type="button">取消</button>
        <div class="cloud-status" id="collabScoreStatus"></div>
      </form></div></div>`);
    document.getElementById("collabScoreCancel").addEventListener("click", closeModal);
    document.getElementById("collabScoreForm").addEventListener("submit", upload);
    document.getElementById("collabScoreModal").addEventListener("click", event => {
      if (event.target.id === "collabScoreModal") closeModal();
    });
  }

  function openModal(detail) {
    context = detail;
    ensureModal();
    document.getElementById("collabScoreHeading").textContent = detail.scoreUrl ? "替换练习乐谱" : "上传练习乐谱";
    document.getElementById("collabScoreHint").textContent = `上传后自动关联到“${detail.title}”，无需再去乐谱库查找。`;
    document.getElementById("collabScoreTitle").value = detail.title || "";
    document.getElementById("collabScoreComposer").value = "";
    document.getElementById("collabScoreNotes").value = "";
    document.getElementById("collabScoreFile").value = "";
    document.getElementById("collabScoreStatus").textContent = "";
    document.getElementById("collabScoreModal").classList.add("show");
  }

  function closeModal() {
    document.getElementById("collabScoreModal")?.classList.remove("show");
  }

  async function request(url, options = {}) {
    const response = await fetch(`${base}${url}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  async function upload(event) {
    event.preventDefault();
    const file = document.getElementById("collabScoreFile").files[0];
    const status = document.getElementById("collabScoreStatus");
    if (!file || !allowedTypes.has(file.type)) return status.textContent = "请选择 PDF、JPG、PNG、WebP 或 GIF 文件";
    if (file.size > 25 * 1024 * 1024) return status.textContent = "文件不能超过 25 MB";
    status.textContent = "正在上传并关联…";
    const path = fileName(file);
    let scoreId = null;
    try {
      await request(`/storage/v1/object/scores/${encodeURIComponent(path)}`, { method:"POST", headers:{"Content-Type":file.type,"x-upsert":"false"}, body:file });
      const pages = file.type === "application/pdf" ? await countPdfPages(file) : null;
      const scores = await request("/rest/v1/scores?select=id", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"return=representation"}, body:JSON.stringify({title:document.getElementById("collabScoreTitle").value.trim(),composer:document.getElementById("collabScoreComposer").value.trim(),notes:document.getElementById("collabScoreNotes").value.trim(),file_path:path,page_count:pages,is_public:true}) });
      const score = scores?.[0];
      if (!score) throw new Error("没有生成乐谱记录");
      scoreId = score.id;
      await request("/rest/v1/practice_score_links?on_conflict=plan_type,sort_order", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({plan_type:context.type,sort_order:context.index+1,score_id:score.id,updated_at:new Date().toISOString()}) });
      if (context.scorePath) await removeOld(context);
      status.textContent = "上传成功，正在刷新当前练习…";
      closeModal();
      await loadLinks();
      window.dispatchEvent(new Event("grace:scores-changed"));
      notify("乐谱已上传，并自动关联到这项练习");
    } catch (error) {
      if (scoreId) await request(`/rest/v1/scores?id=eq.${encodeURIComponent(scoreId)}`, {method:"DELETE"}).catch(()=>{});
      await deleteStoredFile(path).catch(()=>{});
      status.textContent = `上传失败：${readableError(error)}`;
    }
  }

  async function countPdfPages(file) {
    try {
      const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({data: await file.arrayBuffer()}).promise;
      return pdf.numPages;
    } catch { return null; }
  }

  function deleteStoredFile(path) {
    return request("/storage/v1/object/scores", {
      method:"DELETE",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prefixes:[path]})
    });
  }

  async function removeOld(detail) {
    if (detail.scorePath) await deleteStoredFile(detail.scorePath).catch(()=>{});
    if (detail.scoreId) await request(`/rest/v1/scores?id=eq.${encodeURIComponent(detail.scoreId)}`, {method:"DELETE"}).catch(()=>{});
  }

  async function remove(detail) {
    if (!confirm(`确定删除“${detail.title}”当前关联的乐谱吗？`)) return;
    try {
      await request(`/rest/v1/practice_score_links?plan_type=eq.${detail.type}&sort_order=eq.${detail.index+1}`, {method:"DELETE"});
      await removeOld(detail);
      await loadLinks();
      window.dispatchEvent(new Event("grace:scores-changed"));
      notify("这项练习的乐谱已删除");
    } catch (error) { alert(`删除失败：${readableError(error)}`); }
  }

  function readableError(error) {
    try {
      const parsed = JSON.parse(error.message);
      return parsed.message || parsed.error || error.message;
    } catch { return error.message || "请稍后重试"; }
  }

  function notify(message) {
    if (typeof window.showToast === "function") window.showToast(message);
    else alert(message);
  }

  async function loadLinks() {
    try {
      const links = await request("/rest/v1/practice_score_links?select=plan_type,sort_order,score_id,scores(title,file_path,page_count)");
      if (!window.gracePlans) return;
      for (const type of ["A","B"]) window.gracePlans[type].forEach((item,index) => {
        const link = links.find(row => row.plan_type === type && row.sort_order === index + 1);
        delete item.scoreId; delete item.scorePath; delete item.scoreUrl; delete item.scorePages;
        if (link?.scores) { item.scoreId=link.score_id; item.scorePath=link.scores.file_path; item.scoreUrl=publicUrl(link.scores.file_path); item.scorePages=link.scores.page_count; }
      });
      window.graceRender?.();
    } catch (error) { console.warn("Score links unavailable", error); }
  }

  document.addEventListener("grace:score-manage", event => openModal(event.detail));
  document.addEventListener("grace:score-delete", event => remove(event.detail));
  window.graceReloadScoreLinks = loadLinks;
  window.addEventListener("DOMContentLoaded", loadLinks);
})();
