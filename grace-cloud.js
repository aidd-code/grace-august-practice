import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vtykowjeuwrplrzzprnz.supabase.co";
const SUPABASE_KEY = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let scoreRows = [];
let practiceRows = [];
let editingPracticeId = null;
let currentSession = null;
let isAdmin = false;

const style = document.createElement("style");
style.textContent = `
  .score-shell{position:fixed;z-index:40;inset:0;display:none;background:#f5eff6;color:#312b3a}
  .score-shell.show{display:grid;grid-template-columns:minmax(330px,38%) 1fr}
  .score-sidebar{overflow:auto;padding:24px;background:#fffdf9;border-right:1px solid rgba(80,62,96,.14)}
  .score-viewer{display:flex;flex-direction:column;min-width:0;background:#ddd7df}
  .score-viewer iframe{width:100%;height:100%;border:0;background:white}
  .score-toolbar{display:flex;gap:10px;align-items:center;min-height:66px;padding:10px 16px;background:#725c8f;color:white}
  .score-toolbar strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .score-toolbar .spacer{flex:1}
  .score-toolbar button,.score-toolbar a{display:grid;place-items:center;min-height:42px;padding:0 14px;border:0;border-radius:12px;color:#57436f;background:white;font-weight:750;text-decoration:none;cursor:pointer}
  .library-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.library-head h2{margin:0;font-family:Georgia,"Songti SC",serif;font-weight:500}.library-head .spacer{flex:1}
  .library-head button{width:42px;height:42px;border:0;border-radius:50%;font-size:24px;background:#f0eaf1;color:#57436f;cursor:pointer}
  .cloud-tabs{display:flex;gap:8px;margin:0 0 18px;padding:4px;border-radius:14px;background:#f0eaf1}.cloud-tabs button{flex:1;min-height:42px;border:0;border-radius:11px;background:transparent;color:#756d7d;font-weight:800;cursor:pointer}.cloud-tabs button.active{color:white;background:#725c8f}
  .cloud-pane{display:none}.cloud-pane.active{display:block}.cloud-card{margin:10px 0;padding:15px;border:1px solid rgba(80,62,96,.12);border-radius:16px;background:#fff}.cloud-card h3{margin:0 0 5px;font-size:16px}.cloud-meta{color:#756d7d;font-size:12px;line-height:1.5}.cloud-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.cloud-actions button,.cloud-actions a{min-height:38px;padding:0 12px;border:0;border-radius:11px;color:#57436f;background:#eee8f1;font-weight:750;text-decoration:none;cursor:pointer}.cloud-actions .open-score{color:white;background:#725c8f}
  .cloud-empty{padding:30px 12px;color:#756d7d;text-align:center}.cloud-form{display:grid;gap:12px;margin:14px 0;padding:16px;border-radius:16px;background:#f7f3f7}.cloud-form label{display:grid;gap:6px;color:#57436f;font-size:13px;font-weight:800}.cloud-form input,.cloud-form select,.cloud-form textarea{width:100%;min-height:44px;padding:10px 12px;border:1px solid rgba(80,62,96,.15);border-radius:11px;background:white}.cloud-form textarea{min-height:86px}.cloud-form button{min-height:44px;border:0;border-radius:12px;color:white;background:#725c8f;font-weight:800;cursor:pointer}.cloud-form .secondary{color:#57436f;background:#e9e2ec}.cloud-status{min-height:22px;color:#756d7d;font-size:13px}.admin-only{display:none}.admin-only.show{display:block}.cloud-inline{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cloud-badge{display:inline-block;padding:4px 8px;border-radius:8px;background:#edf3ee;color:#567361;font-size:11px;font-weight:800}
  @media(max-width:760px){.score-shell.show{display:block}.score-sidebar{height:100%;border:0}.score-viewer{position:fixed;z-index:2;inset:0;display:none}.score-viewer.show{display:flex}.cloud-inline{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

document.body.insertAdjacentHTML("beforeend", `
  <section class="score-shell" id="scoreShell" aria-label="Grace 乐谱库">
    <div class="score-sidebar">
      <div class="library-head"><h2>Grace 乐谱库</h2><span class="spacer"></span><button id="closeScoreShell" type="button" aria-label="关闭">×</button></div>
      <div class="cloud-tabs">
        <button class="active" data-cloud-tab="library" type="button">浏览乐谱</button>
        <button data-cloud-tab="admin" type="button">管理内容</button>
      </div>
      <div class="cloud-pane active" data-cloud-pane="library">
        <input id="scoreSearch" type="search" placeholder="搜索作曲家或乐谱名称" style="width:100%;min-height:46px;padding:0 14px;border:1px solid rgba(80,62,96,.15);border-radius:13px">
        <div id="scoreList"><div class="cloud-empty">正在读取乐谱库…</div></div>
      </div>
      <div class="cloud-pane" data-cloud-pane="admin">
        <div id="loginArea">
          <p style="line-height:1.65;color:#756d7d">管理员通过邮箱验证码登录后，可以上传 PDF、管理历史乐谱和修改练习内容。</p>
          <form class="cloud-form" id="loginForm">
            <label>管理员邮箱<input id="adminEmail" type="email" value="aiddchen@gmail.com" required></label>
            <button type="submit">发送登录邮件</button>
            <div class="cloud-status" id="loginStatus"></div>
          </form>
        </div>
        <div class="admin-only" id="adminArea">
          <p><span class="cloud-badge">管理员已登录</span> <span id="adminIdentity"></span></p>
          <div class="cloud-actions"><button id="showUpload" type="button">上传 PDF</button><button id="showPractice" type="button">编辑练习内容</button><button id="showAdmins" type="button">添加老师</button><button id="logoutAdmin" type="button">退出登录</button></div>
          <form class="cloud-form" id="uploadForm" hidden>
            <label>乐谱名称<input id="scoreTitle" required placeholder="例如：帕格尼尼第5号随想曲"></label>
            <label>作曲家<input id="scoreComposer" placeholder="例如：Paganini"></label>
            <label>选择 PDF（最大 25 MB）<input id="scoreFile" type="file" accept="application/pdf" required></label>
            <label>备注<textarea id="scoreNotes" placeholder="版本、乐章或老师的说明"></textarea></label>
            <button type="submit">上传到乐谱库</button><div class="cloud-status" id="uploadStatus"></div>
          </form>
          <section id="practiceAdmin" hidden>
            <div class="cloud-actions"><button id="newPractice" type="button">新增练习</button><button id="seedPractice" type="button">导入当前 A/B 计划</button></div>
            <form class="cloud-form" id="practiceForm" hidden>
              <div class="cloud-inline"><label>计划<select id="practiceType"><option>A</option><option>B</option></select></label><label>顺序<input id="practiceOrder" type="number" min="1" value="1"></label></div>
              <label>练习名称<input id="practiceTitle" required></label>
              <label>目标时间（分钟）<input id="practiceMinutes" type="number" min="0" value="15"></label>
              <label>练习说明<textarea id="practiceTranslation"></textarea></label>
              <label>具体要求（每行一条）<textarea id="practiceTasks"></textarea></label>
              <label>研究问题<textarea id="practiceQuestion"></textarea></label>
              <label>关联乐谱<select id="practiceScore"><option value="">暂不关联</option></select></label>
              <button type="submit">保存练习内容</button><button class="secondary" id="cancelPractice" type="button">取消</button><div class="cloud-status" id="practiceStatus"></div>
            </form>
            <div id="practiceListAdmin"></div>
          </section>
          <form class="cloud-form" id="adminForm" hidden>
            <label>老师的登录邮箱<input id="teacherEmail" type="email" required placeholder="teacher@example.com"></label>
            <button type="submit">添加为管理员</button><div class="cloud-status" id="adminStatus"></div>
          </form>
        </div>
      </div>
    </div>
    <div class="score-viewer" id="scoreViewer">
      <div class="score-toolbar"><button id="backToLibrary" type="button">返回</button><strong id="viewerTitle">请选择乐谱</strong><span class="spacer"></span><a id="openScoreNew" href="#" target="_blank" rel="noopener">新窗口</a><button id="closeViewer" type="button">关闭</button></div>
      <iframe id="scoreFrame" title="PDF 乐谱阅读器"></iframe>
    </div>
  </section>
`);

const $ = id => document.getElementById(id);
const shell = $("scoreShell");

function notify(message) {
  if (typeof window.showToast === "function") window.showToast(message);
  else alert(message);
}

function openShell(tab = "library") {
  shell.classList.add("show");
  document.body.style.overflow = "hidden";
  switchTab(tab);
  loadScores();
}

window.openGraceLibrary = () => openShell("library");

function closeShell() {
  shell.classList.remove("show");
  $("scoreViewer").classList.remove("show");
  document.body.style.overflow = "";
}

function switchTab(name) {
  document.querySelectorAll("[data-cloud-tab]").forEach(button => button.classList.toggle("active", button.dataset.cloudTab === name));
  document.querySelectorAll("[data-cloud-pane]").forEach(pane => pane.classList.toggle("active", pane.dataset.cloudPane === name));
}

function publicUrl(path) {
  return supabase.storage.from("scores").getPublicUrl(path).data.publicUrl;
}

window.openGraceScore = (url, title = "PDF 乐谱") => {
  openShell("library");
  $("scoreFrame").src = url;
  $("viewerTitle").textContent = title;
  $("openScoreNew").href = url;
  $("scoreViewer").classList.add("show");
};

async function loadScores() {
  const { data, error } = await supabase.from("scores").select("*").order("created_at", { ascending: false });
  if (error) { $("scoreList").innerHTML = `<div class="cloud-empty">乐谱库暂时无法读取：${escapeText(error.message)}</div>`; return; }
  scoreRows = data || [];
  renderScores();
  updateScoreSelect();
}

function escapeText(value = "") {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function renderScores() {
  const term = $("scoreSearch").value.trim().toLowerCase();
  const rows = scoreRows.filter(row => `${row.title} ${row.composer} ${row.notes}`.toLowerCase().includes(term));
  $("scoreList").innerHTML = rows.length ? rows.map(row => {
    const url = publicUrl(row.file_path);
    return `<article class="cloud-card"><h3>${escapeText(row.title)}</h3><div class="cloud-meta">${escapeText(row.composer || "未填写作曲家")} · ${row.page_count ? `${row.page_count} 页 · ` : ""}${new Date(row.created_at).toLocaleDateString("zh-CN")}</div>${row.notes ? `<p style="line-height:1.55">${escapeText(row.notes)}</p>` : ""}<div class="cloud-actions"><button class="open-score" data-open-score="${escapeText(url)}" data-title="${escapeText(row.title)}" type="button">阅读乐谱</button><a href="${escapeText(url)}" target="_blank" rel="noopener">新窗口打开</a>${isAdmin ? `<button data-delete-score="${row.id}" data-path="${escapeText(row.file_path)}" type="button">删除</button>` : ""}</div></article>`;
  }).join("") : `<div class="cloud-empty">${term ? "没有找到匹配的乐谱" : "乐谱库还是空的，管理员可以上传第一份 PDF。"}</div>`;
  $("scoreList").querySelectorAll("[data-open-score]").forEach(button => button.addEventListener("click", () => window.openGraceScore(button.dataset.openScore, button.dataset.title)));
  $("scoreList").querySelectorAll("[data-delete-score]").forEach(button => button.addEventListener("click", () => deleteScore(button.dataset.deleteScore, button.dataset.path)));
}

async function countPdfPages(file) {
  try {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    return pdf.numPages;
  } catch { return null; }
}

function safeFileName(name) {
  const extension = name.toLowerCase().endsWith(".pdf") ? ".pdf" : "";
  const base = name.replace(/\.pdf$/i, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "score";
  return `${Date.now()}-${base}${extension || ".pdf"}`;
}

async function deleteScore(id, path) {
  if (!confirm("确定删除这份乐谱吗？已经关联的练习将保留，但不再显示乐谱。")) return;
  const storageResult = await supabase.storage.from("scores").remove([path]);
  if (storageResult.error) return notify(`文件删除失败：${storageResult.error.message}`);
  const { error } = await supabase.from("scores").delete().eq("id", id);
  if (error) return notify(`记录删除失败：${error.message}`);
  await loadScores(); await loadRemotePractice();
}

async function checkSession() {
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  if (!currentSession) return setAdminState(false);
  const { data: adminCheck } = await supabase.rpc("is_admin");
  setAdminState(Boolean(adminCheck));
}

function setAdminState(value) {
  isAdmin = value;
  $("loginArea").style.display = value ? "none" : "block";
  $("adminArea").classList.toggle("show", value);
  $("adminIdentity").textContent = value ? currentSession?.user?.email || "" : "";
  renderScores();
  if (value) { loadPracticeAdmin(); loadAdmins(); }
}

async function loadRemotePractice() {
  const { data, error } = await supabase.from("practice_items").select("*, scores(title,file_path)").eq("active", true).order("plan_type").order("sort_order");
  if (error || !data?.length || !window.gracePlans) return;
  for (const type of ["A", "B"]) {
    const rows = data.filter(row => row.plan_type === type);
    if (rows.length) window.gracePlans[type] = rows.map(row => ({
      id: row.id, title: row.title, minutes: row.minutes, target: row.target,
      translation: row.translation, tasks: row.tasks || [], question: row.question,
      scoreId: row.score_id, scoreUrl: row.scores?.file_path ? publicUrl(row.scores.file_path) : null
    }));
  }
  window.graceRender?.();
}

async function loadPracticeAdmin() {
  const { data, error } = await supabase.from("practice_items").select("*").order("plan_type").order("sort_order");
  if (error) { $("practiceListAdmin").innerHTML = `<div class="cloud-empty">${escapeText(error.message)}</div>`; return; }
  practiceRows = data || [];
  renderPracticeAdmin();
}

function renderPracticeAdmin() {
  $("practiceListAdmin").innerHTML = practiceRows.length ? practiceRows.map(row => `<article class="cloud-card"><h3>${row.plan_type} 日 · ${escapeText(row.title)}</h3><div class="cloud-meta">顺序 ${row.sort_order} · ${row.minutes} 分钟${row.active ? "" : " · 已停用"}</div><div class="cloud-actions"><button data-edit-practice="${row.id}" type="button">编辑</button><button data-delete-practice="${row.id}" type="button">删除</button></div></article>`).join("") : `<div class="cloud-empty">还没有云端练习内容。点击“导入当前 A/B 计划”即可开始在网页上管理。</div>`;
  $("practiceListAdmin").querySelectorAll("[data-edit-practice]").forEach(button => button.addEventListener("click", () => editPractice(button.dataset.editPractice)));
  $("practiceListAdmin").querySelectorAll("[data-delete-practice]").forEach(button => button.addEventListener("click", () => deletePractice(button.dataset.deletePractice)));
}

function updateScoreSelect() {
  const selected = $("practiceScore")?.value || "";
  if (!$("practiceScore")) return;
  $("practiceScore").innerHTML = `<option value="">暂不关联</option>${scoreRows.map(row => `<option value="${row.id}">${escapeText(row.title)}</option>`).join("")}`;
  $("practiceScore").value = selected;
}

function showPracticeForm(row = null) {
  editingPracticeId = row?.id || null;
  $("practiceForm").hidden = false;
  $("practiceType").value = row?.plan_type || "A";
  $("practiceOrder").value = row?.sort_order || practiceRows.filter(item => item.plan_type === "A").length + 1;
  $("practiceTitle").value = row?.title || "";
  $("practiceMinutes").value = row?.minutes ?? 15;
  $("practiceTranslation").value = row?.translation || "";
  $("practiceTasks").value = (row?.tasks || []).join("\n");
  $("practiceQuestion").value = row?.question || "";
  $("practiceScore").value = row?.score_id || "";
}

function editPractice(id) { showPracticeForm(practiceRows.find(row => row.id === id)); }

async function deletePractice(id) {
  if (!confirm("确定删除这项练习吗？")) return;
  const { error } = await supabase.from("practice_items").delete().eq("id", id);
  if (error) return notify(error.message);
  await loadPracticeAdmin(); await loadRemotePractice();
}

async function seedPractice() {
  if (practiceRows.length && !confirm("云端已经有练习内容。继续导入可能造成重复，确定继续吗？")) return;
  const payload = [];
  for (const type of ["A", "B"]) (window.gracePlans?.[type] || []).forEach((item, index) => payload.push({plan_type:type,sort_order:index+1,title:item.title,minutes:item.minutes||0,target:item.target||null,translation:item.translation||"",tasks:item.tasks||[],question:item.question||null,active:true}));
  const { error } = await supabase.from("practice_items").insert(payload);
  if (error) return notify(`导入失败：${error.message}`);
  notify("A/B 计划已导入云端"); await loadPracticeAdmin(); await loadRemotePractice();
}

async function loadAdmins() {
  const { data } = await supabase.from("admins").select("email").order("created_at");
  if (data) $("adminStatus").textContent = `当前管理员：${data.map(item => item.email).join("、")}`;
}

$("scoreLibraryBtn")?.addEventListener("click", () => openShell("library"));
$("closeScoreShell").addEventListener("click", closeShell);
$("closeViewer").addEventListener("click", () => $("scoreViewer").classList.remove("show"));
$("backToLibrary").addEventListener("click", () => $("scoreViewer").classList.remove("show"));
$("scoreSearch").addEventListener("input", renderScores);
document.querySelectorAll("[data-cloud-tab]").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.cloudTab)));

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("loginStatus").textContent = "正在发送登录邮件…";
  const email = $("adminEmail").value.trim();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $("loginStatus").textContent = error ? `发送失败：${error.message}` : "登录链接已发送，请在这台设备上打开邮件并点击链接。";
});

$("logoutAdmin").addEventListener("click", async () => { await supabase.auth.signOut(); currentSession = null; setAdminState(false); });
$("showUpload").addEventListener("click", () => { $("uploadForm").hidden = !$("uploadForm").hidden; });
$("showPractice").addEventListener("click", () => { $("practiceAdmin").hidden = !$("practiceAdmin").hidden; if (!$("practiceAdmin").hidden) loadPracticeAdmin(); });
$("showAdmins").addEventListener("click", () => { $("adminForm").hidden = !$("adminForm").hidden; });

$("uploadForm").addEventListener("submit", async event => {
  event.preventDefault();
  const file = $("scoreFile").files[0];
  if (!file || file.type !== "application/pdf") return notify("请选择 PDF 文件");
  if (file.size > 25 * 1024 * 1024) return notify("PDF 不能超过 25 MB");
  $("uploadStatus").textContent = "正在读取页数并上传…";
  const path = safeFileName(file.name);
  const pages = await countPdfPages(file);
  const upload = await supabase.storage.from("scores").upload(path, file, { contentType: "application/pdf" });
  if (upload.error) { $("uploadStatus").textContent = `上传失败：${upload.error.message}`; return; }
  const insert = await supabase.from("scores").insert({title:$("scoreTitle").value.trim(),composer:$("scoreComposer").value.trim(),notes:$("scoreNotes").value.trim(),file_path:path,page_count:pages,uploaded_by:currentSession.user.id});
  if (insert.error) { await supabase.storage.from("scores").remove([path]); $("uploadStatus").textContent = `保存失败：${insert.error.message}`; return; }
  $("uploadForm").reset(); $("uploadStatus").textContent = `上传成功${pages ? `，共 ${pages} 页` : ""}`; await loadScores();
});

$("newPractice").addEventListener("click", () => showPracticeForm());
$("cancelPractice").addEventListener("click", () => { $("practiceForm").hidden = true; editingPracticeId = null; });
$("seedPractice").addEventListener("click", seedPractice);
$("practiceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {plan_type:$("practiceType").value,sort_order:Number($("practiceOrder").value),title:$("practiceTitle").value.trim(),minutes:Number($("practiceMinutes").value),translation:$("practiceTranslation").value.trim(),tasks:$("practiceTasks").value.split("\n").map(x=>x.trim()).filter(Boolean),question:$("practiceQuestion").value.trim()||null,score_id:$("practiceScore").value||null,active:true,updated_at:new Date().toISOString()};
  const result = editingPracticeId ? await supabase.from("practice_items").update(payload).eq("id", editingPracticeId) : await supabase.from("practice_items").insert(payload);
  if (result.error) { $("practiceStatus").textContent = `保存失败：${result.error.message}`; return; }
  $("practiceForm").hidden = true; editingPracticeId = null; await loadPracticeAdmin(); await loadRemotePractice(); notify("练习内容已更新");
});

$("adminForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("teacherEmail").value.trim().toLowerCase();
  const { error } = await supabase.from("admins").insert({ email });
  $("adminStatus").textContent = error ? `添加失败：${error.message}` : `已添加 ${email}。老师可以在管理页面用这个邮箱登录。`;
  if (!error) { $("teacherEmail").value = ""; loadAdmins(); }
});

supabase.auth.onAuthStateChange((_event, session) => { currentSession = session; setTimeout(checkSession, 0); });
await Promise.all([loadScores(), loadRemotePractice(), checkSession()]);
