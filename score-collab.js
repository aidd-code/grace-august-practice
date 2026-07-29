(function () {
  const base = "https://vtykowjeuwrplrzzprnz.supabase.co";
  const key = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const extensions = {"application/pdf":"pdf", "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif", "image/heic":"heic", "image/heif":"heif"};
  let context = null;

  function requireEditAccess() {
    if (typeof window.graceRequireLogin === "function") return window.graceRequireLogin();
    // The auth script can finish just after this module; the read-only class is the safe fallback.
    return !document.body.classList.contains("read-only");
  }

  function safe(value = "") {
    return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  }

  function fileName(file) {
    const baseName = file.name.replace(/\.[^.]+$/i, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "score";
    return `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${baseName}.${fileExtension(file)}`;
  }

  function fileExtension(file) {
    return extensions[file.type] || file.name.split(".").pop()?.toLowerCase() || "file";
  }

  function isAllowedFile(file) {
    const extension = fileExtension(file);
    return file.type === "application/pdf" || file.type.startsWith("image/") || ["pdf","jpg","jpeg","png","webp","gif","heic","heif"].includes(extension);
  }

  function uploadContentType(file) {
    if (file.type) return file.type;
    return fileExtension(file) === "pdf" ? "application/pdf" : `image/${fileExtension(file) === "jpg" ? "jpeg" : fileExtension(file)}`;
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
        <label>选择 PDF 或图片（可多选，每个最大 25 MB）<input id="collabScoreFile" type="file" accept="application/pdf,image/*,.heic,.heif" multiple required></label>
        <label>备注<textarea id="collabScoreNotes" placeholder="版本、乐章或说明"></textarea></label>
        <button id="collabScoreSubmit" type="submit">上传并自动关联</button><button class="secondary" id="collabScoreCancel" type="button">取消</button>
        <div class="cloud-status" id="collabScoreStatus"></div>
      </form></div></div>`);
    document.getElementById("collabScoreCancel").addEventListener("click", closeModal);
    document.getElementById("collabScoreForm").addEventListener("submit", upload);
    document.getElementById("collabScoreFile").addEventListener("change", event => {
      const files = [...event.currentTarget.files];
      document.getElementById("collabScoreStatus").textContent = files.length ? `已选择 ${files.length} 个文件：${files.map(file => file.name).join("、")}` : "";
    });
    document.getElementById("collabScoreModal").addEventListener("click", event => {
      if (event.target.id === "collabScoreModal") closeModal();
    });
  }

  function openModal(detail) {
    if (!requireEditAccess()) return;
    context = detail;
    ensureModal();
    const appending = detail.mode === "append";
    const libraryOnly = detail.mode === "library";
    document.getElementById("collabScoreHeading").textContent = libraryOnly ? "上传到乐谱库" : (appending ? "继续添加乐谱文件" : (detail.scoreId ? "替换整组乐谱" : "上传练习乐谱"));
    document.getElementById("collabScoreHint").textContent = libraryOnly
      ? "可以一次选择多张图片或多个 PDF。这份乐谱暂时不关联某条练习，会独立保存在乐谱库中。"
      : `可以一次选择多张图片或多个 PDF。上传后自动关联到“${detail.title}”，打开时可左右切换浏览。`;
    document.getElementById("collabScoreSubmit").textContent = libraryOnly ? "上传到乐谱库" : (appending ? "添加到现有乐谱" : "上传并自动关联");
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
    if (!requireEditAccess()) return;
    const files = [...document.getElementById("collabScoreFile").files];
    const status = document.getElementById("collabScoreStatus");
    const submitButton = document.getElementById("collabScoreSubmit");
    if (!files.length) return status.textContent = "请至少选择一个 PDF 或图片文件";
    const unsupported = files.filter(file => !isAllowedFile(file));
    if (unsupported.length) return status.textContent = `不支持这些文件：${unsupported.map(file => file.name).join("、")}`;
    if (files.some(file => file.size > 25 * 1024 * 1024)) return status.textContent = "每个文件不能超过 25 MB（约 25 × 1024 × 1024 字节）";
    submitButton.disabled = true;
    status.textContent = `正在上传 0 / ${files.length}…`;
    const uploaded = [];
    let scoreId = null;
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const path = fileName(file);
        const contentType = uploadContentType(file);
        await request(`/storage/v1/object/scores/${encodeURIComponent(path)}`, { method:"POST", headers:{"Content-Type":contentType,"x-upsert":"false"}, body:file });
        const pages = file.type === "application/pdf" ? await countPdfPages(file) : null;
        uploaded.push({path, name:file.name, type:contentType, pages});
        status.textContent = `正在上传 ${index + 1} / ${files.length}…`;
      }
      const oldFiles = context.mode === "append" ? normalizeFiles(context) : [];
      const allFiles = [...oldFiles, ...uploaded].map(file => ({path:file.path, name:file.name, type:file.type, pages:file.pages || null}));
      let oldScore = null;
      if (context.mode === "append" && context.scoreId) {
        oldScore = (await request(`/rest/v1/scores?id=eq.${encodeURIComponent(context.scoreId)}&select=composer,notes`))?.[0] || null;
      }
      const oldNotes = oldScore ? parseScoreNotes(oldScore.notes) : "";
      const notes = document.getElementById("collabScoreNotes").value.trim() || oldNotes;
      const composer = document.getElementById("collabScoreComposer").value.trim() || oldScore?.composer || "";
      const metadata = JSON.stringify({graceFiles:allFiles, notes});
      const scoreData = {title:document.getElementById("collabScoreTitle").value.trim(),composer,notes:metadata,file_path:allFiles[0].path,page_count:allFiles.reduce((sum,file) => sum + (file.pages || (String(file.type).startsWith("image/") || /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(file.path) ? 1 : 0)), 0) || null,is_public:true};
      if (context.mode === "append" && context.scoreId) {
        await request(`/rest/v1/scores?id=eq.${encodeURIComponent(context.scoreId)}`, {method:"PATCH", headers:{"Content-Type":"application/json",Prefer:"return=minimal"}, body:JSON.stringify(scoreData)});
        scoreId = context.scoreId;
      } else {
        const scores = await request("/rest/v1/scores?select=id", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"return=representation"}, body:JSON.stringify(scoreData) });
        const score = scores?.[0];
        if (!score) throw new Error("没有生成乐谱记录");
        scoreId = score.id;
        if (context.mode !== "library") {
          await request("/rest/v1/practice_score_links?on_conflict=plan_type,sort_order", { method:"POST", headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({plan_type:context.type,sort_order:context.index+1,score_id:score.id,updated_at:new Date().toISOString()}) });
        }
        if (context.scoreId) await removeOld(context);
      }
      status.textContent = "上传成功，正在刷新当前练习…";
      closeModal();
      await loadLinks();
      window.dispatchEvent(new Event("grace:scores-changed"));
      notify(context.mode === "library" ? `${files.length} 个文件已保存到乐谱库` : `${files.length} 个乐谱文件已上传，并自动关联到这项练习`);
    } catch (error) {
      if (scoreId && scoreId !== context.scoreId) await request(`/rest/v1/scores?id=eq.${encodeURIComponent(scoreId)}`, {method:"DELETE"}).catch(()=>{});
      await Promise.all(uploaded.map(file => deleteStoredFile(file.path).catch(()=>{})));
      status.textContent = `上传失败：${readableError(error)}`;
    } finally {
      submitButton.disabled = false;
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

  function parseFiles(notes) {
    try {
      const parsed = JSON.parse(notes || "{}");
      return Array.isArray(parsed.graceFiles) ? parsed.graceFiles : [];
    } catch { return []; }
  }

  function parseScoreNotes(notes) {
    try {
      const parsed = JSON.parse(notes || "{}");
      return Array.isArray(parsed.graceFiles) ? (parsed.notes || "") : (notes || "");
    } catch { return notes || ""; }
  }

  function normalizeFiles(detail) {
    if (detail.scoreFiles?.length) return detail.scoreFiles.map(file => ({path:file.path, name:file.name, type:file.type, pages:file.pages}));
    return detail.scorePath ? [{path:detail.scorePath, name:detail.title, type:"", pages:detail.scorePages}] : [];
  }

  async function removeOld(detail) {
    await Promise.all(normalizeFiles(detail).map(file => deleteStoredFile(file.path).catch(()=>{})));
    if (detail.scoreId) await request(`/rest/v1/scores?id=eq.${encodeURIComponent(detail.scoreId)}`, {method:"DELETE"}).catch(()=>{});
  }

  async function remove(detail) {
    if (!requireEditAccess()) return;
    if (!confirm(`确定删除“${detail.title}”关联的全部乐谱文件吗？`)) return;
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
      const links = await request("/rest/v1/practice_score_links?select=plan_type,sort_order,score_id,scores(title,file_path,page_count,notes)");
      if (!window.gracePlans) return;
      for (const type of ["A","B"]) window.gracePlans[type].forEach((item,index) => {
        const link = links.find(row => row.plan_type === type && row.sort_order === index + 1);
        delete item.scoreId; delete item.scorePath; delete item.scoreUrl; delete item.scorePages; delete item.scoreFiles;
        if (link?.scores) {
          const storedFiles = parseFiles(link.scores.notes);
          const files = storedFiles.length ? storedFiles : [{path:link.scores.file_path, name:link.scores.title, type:"", pages:link.scores.page_count}];
          item.scoreId=link.score_id; item.scorePath=link.scores.file_path; item.scoreUrl=publicUrl(link.scores.file_path); item.scorePages=link.scores.page_count;
          item.scoreFiles=files.map(file => ({...file, url:publicUrl(file.path)}));
        }
      });
      window.graceRender?.();
    } catch (error) { console.warn("Score links unavailable", error); }
  }

  document.addEventListener("grace:score-manage", event => openModal(event.detail));
  document.addEventListener("grace:score-delete", event => remove(event.detail));
  window.graceReloadScoreLinks = loadLinks;
  window.addEventListener("DOMContentLoaded", loadLinks);
})();
