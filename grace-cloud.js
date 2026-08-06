import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://vtykowjeuwrplrzzprnz.supabase.co";
const SUPABASE_KEY = "sb_publishable_WF5o9sLcoRuur5eIvL-J-g_qt350-ye";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let scoreRows = [];
let viewerFiles = [];
let viewerIndex = 0;
let viewerGroupTitle = "乐谱";
let viewerPdf = null;
let viewerPdfUrl = "";
let viewerPdfPage = 1;
let pdfjsPromise = null;

const style = document.createElement("style");
style.textContent = `
  .score-shell{position:fixed;z-index:40;inset:0;display:none;background:#f5eff6;color:#312b3a}
  .score-shell.show,.score-shell:target{display:grid;grid-template-columns:minmax(330px,38%) 1fr}
  .score-sidebar{overflow:auto;padding:24px;background:#fffdf9;border-right:1px solid rgba(80,62,96,.14)}
  .score-viewer{display:flex;flex-direction:column;min-width:0;background:#ddd7df}
  .score-viewer iframe{display:none;width:100%;height:100%;border:0;background:white}.score-canvas-wrap{display:flex;flex:1;min-height:0;align-items:center;justify-content:center;overflow:auto;padding:18px;background:#211f22}.score-canvas-wrap canvas{display:block;max-width:100%;height:auto;background:white;box-shadow:0 5px 18px rgba(0,0,0,.28)}.score-viewer-image{display:none;box-sizing:border-box;width:100%;height:100%;padding:20px;object-fit:contain;background:#211f22}.score-loading{display:none;color:#fff;font-size:16px;text-align:center}.score-pdf-position{display:none;font-size:13px;white-space:nowrap}
  .score-toolbar{display:flex;gap:10px;align-items:center;min-height:66px;padding:10px 16px;background:#725c8f;color:white}
  .score-toolbar strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score-toolbar .spacer{flex:1}.score-position{font-size:13px;white-space:nowrap}
  .score-toolbar button,.score-toolbar a{display:grid;place-items:center;min-height:42px;padding:0 14px;border:0;border-radius:12px;color:#57436f;background:white;font-weight:750;text-decoration:none;cursor:pointer}
  .library-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}.library-head h2{margin:0;font-family:Georgia,"Songti SC",serif;font-weight:500}.library-head .spacer{flex:1}
  .library-upload{min-height:40px;padding:0 13px;border:0;border-radius:11px;color:white;background:#725c8f;font-weight:800;cursor:pointer}
  .library-close{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;font-size:24px;background:#f0eaf1;color:#57436f;text-decoration:none}
  .library-intro{margin:0 0 18px;color:#756d7d;font-size:13px;line-height:1.65}
  .cloud-card{margin:10px 0;padding:15px;border:1px solid rgba(80,62,96,.12);border-radius:16px;background:#fff}.cloud-card h3{margin:0 0 5px;font-size:16px}
  .cloud-meta{color:#756d7d;font-size:12px;line-height:1.5}.cloud-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .cloud-actions button,.cloud-actions a{min-height:38px;padding:0 12px;border:0;border-radius:11px;color:#57436f;background:#eee8f1;font-weight:750;text-decoration:none;cursor:pointer}.cloud-actions .open-score{color:white;background:#725c8f}.cloud-actions .danger-btn{color:#8a4e4e;background:#f5e8e8}
  .cloud-empty{padding:30px 12px;color:#756d7d;text-align:center}.cloud-form{display:grid;gap:12px;margin:14px 0;padding:16px;border-radius:16px;background:#f7f3f7}.cloud-form label{display:grid;gap:6px;color:#57436f;font-size:13px;font-weight:800}.cloud-form input,.cloud-form select,.cloud-form textarea{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;border:1px solid rgba(80,62,96,.15);border-radius:11px;background:white}.cloud-form textarea{min-height:86px}.cloud-form button{min-height:44px;border:0;border-radius:12px;color:white;background:#725c8f;font-weight:800;cursor:pointer}.cloud-form .secondary{color:#57436f;background:#e9e2ec}.cloud-status{min-height:22px;color:#756d7d;font-size:13px}
  .practice-score-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 18px;padding:10px 12px;border-radius:12px;background:#f3edf4}.practice-score-label{color:#57436f;font-size:13px;font-weight:850}.practice-score-meta{color:#756d7d;font-size:12px}.danger-btn{color:#8a4e4e!important;background:#f5e8e8!important}
  @media(max-width:760px){.score-shell.show,.score-shell:target{display:block}.score-sidebar{height:100%;box-sizing:border-box;border:0}.score-viewer{position:fixed;z-index:2;inset:0;display:none}.score-viewer.show{display:flex}.score-toolbar{flex-wrap:wrap;padding:8px}.score-toolbar strong{order:-1;width:100%;text-align:center}.score-toolbar .spacer,.score-toolbar #openScoreNew{display:none}.score-toolbar button{flex:1;padding:0 8px}}
`;
document.head.appendChild(style);

document.body.insertAdjacentHTML("beforeend", `
  <section class="score-shell" id="scoreShell" aria-label="Grace 乐谱库">
    <div class="score-sidebar">
      <div class="library-head"><h2>Grace 乐谱库</h2><span class="spacer"></span><button class="library-upload edit-only" id="libraryUpload" type="button">上传新乐谱</button><a class="library-close" href="#" id="closeScoreShell" aria-label="关闭">×</a></div>
      <p class="library-intro">这里可以保存与当前练习暂时无关的 PDF 或图片乐谱。登录后可一次上传多个文件；上传后会留在乐谱库中，随时搜索和浏览。</p>
      <input id="scoreSearch" type="search" placeholder="搜索作曲家或乐谱名称" style="box-sizing:border-box;width:100%;min-height:46px;padding:0 14px;border:1px solid rgba(80,62,96,.15);border-radius:13px">
      <div id="scoreList"><div class="cloud-empty">正在读取乐谱库…</div></div>
    </div>
    <div class="score-viewer" id="scoreViewer">
      <div class="score-toolbar"><button id="backToLibrary" type="button">返回</button><button id="previousScore" type="button">上一份</button><strong id="viewerTitle">请选择乐谱</strong><span class="spacer"></span><span class="score-position" id="scorePosition"></span><span class="score-pdf-position" id="pdfPosition"></span><button id="pdfPreviousPage" type="button">上一页</button><button id="pdfNextPage" type="button">下一页</button><button id="nextScore" type="button">下一份</button><a id="openScoreNew" href="#" target="_blank" rel="noopener">新窗口</a><button id="closeViewer" type="button">关闭</button></div>
      <div class="score-canvas-wrap" id="scoreCanvasWrap"><canvas id="scoreCanvas"></canvas><div class="score-loading" id="scoreLoading">正在加载乐谱…</div></div><iframe id="scoreFrame" title="PDF 乐谱阅读器"></iframe><img class="score-viewer-image" id="scoreImage" alt="乐谱图片">
    </div>
  </section>
`);

const $ = id => document.getElementById(id);
const shell = $("scoreShell");

function escapeText(value = "") {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function publicUrl(path) {
  return supabase.storage.from("scores").getPublicUrl(path).data.publicUrl;
}

function isImagePath(path = "") {
  return /\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(path.split("?")[0]);
}

function parseScoreData(row) {
  try {
    const parsed = JSON.parse(row.notes || "{}");
    if (Array.isArray(parsed.graceFiles) && parsed.graceFiles.length) {
      return {files:parsed.graceFiles, notes:parsed.notes || ""};
    }
  } catch {}
  return {files:[{path:row.file_path, name:row.title, pages:row.page_count}], notes:row.notes || ""};
}

function scoreFiles(row) {
  return parseScoreData(row).files.map(file => ({...file, url:publicUrl(file.path)}));
}

function notify(message) {
  if (typeof window.showToast === "function") window.showToast(message);
  else alert(message);
}

function openShell() {
  shell.classList.add("show");
  document.body.style.overflow = "hidden";
  loadScores();
}

function closeShell(event) {
  event?.preventDefault();
  shell.classList.remove("show");
  $("scoreViewer").classList.remove("show");
  $("scoreFrame").src = "about:blank";
  $("scoreCanvas").width = 1; $("scoreCanvas").height = 1;
  $("scoreImage").removeAttribute("src");
  document.body.style.overflow = "";
  if (location.hash === "#scoreShell") history.replaceState(null, "", location.pathname + location.search);
}

window.openGraceLibrary = openShell;
async function loadPdfJs() {
  if (!pdfjsPromise) pdfjsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs").then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    return pdfjs;
  });
  return pdfjsPromise;
}

async function renderPdfPage() {
  if (!viewerPdf) return;
  const page = await viewerPdf.getPage(viewerPdfPage);
  const wrap = $("scoreCanvasWrap");
  const baseViewport = page.getViewport({scale:1});
  const maxWidth = Math.max(280, wrap.clientWidth - 36);
  const maxHeight = Math.max(360, wrap.clientHeight - 36);
  const scale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height, 2.2);
  const viewport = page.getViewport({scale});
  const canvas = $("scoreCanvas");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  await page.render({canvasContext:canvas.getContext("2d"), viewport, transform:ratio !== 1 ? [ratio,0,0,ratio,0,0] : null}).promise;
  $("pdfPosition").textContent = `第 ${viewerPdfPage} / ${viewerPdf.numPages} 页`;
  $("pdfPreviousPage").style.display = viewerPdf.numPages > 1 ? "grid" : "none";
  $("pdfNextPage").style.display = viewerPdf.numPages > 1 ? "grid" : "none";
  $("pdfPreviousPage").disabled = viewerPdfPage <= 1;
  $("pdfNextPage").disabled = viewerPdfPage >= viewerPdf.numPages;
}

async function showViewerFile(index) {
  if (!viewerFiles.length) return;
  viewerIndex = (index + viewerFiles.length) % viewerFiles.length;
  const file = viewerFiles[viewerIndex];
  const url = file.url || publicUrl(file.path);
  const image = isImagePath(file.path || url);
  $("scoreFrame").style.display = "none";
  $("scoreCanvasWrap").style.display = image ? "none" : "flex";
  $("scoreImage").style.display = image ? "block" : "none";
  $("pdfPosition").style.display = image ? "none" : "inline";
  if (image) {
    viewerPdf = null; viewerPdfUrl = "";
    $("scoreImage").src = url;
    $("scoreImage").alt = file.name || viewerGroupTitle;
  } else {
    $("scoreImage").removeAttribute("src");
    $("scoreLoading").style.display = "block";
    $("scoreCanvas").style.display = "none";
    try {
      if (viewerPdfUrl !== url) { viewerPdf = await (await loadPdfJs()).getDocument({url}).promise; viewerPdfUrl = url; }
      viewerPdfPage = Math.min(Math.max(1, viewerPdfPage), viewerPdf.numPages);
      $("scoreCanvas").style.display = "block";
      await renderPdfPage();
      $("scoreLoading").style.display = "none";
    } catch (error) {
      $("scoreLoading").textContent = "PDF 暂时无法在页面内显示，请点击“新窗口”打开";
      console.warn("PDF render failed", error);
    }
  }
  $("viewerTitle").textContent = file.name || viewerGroupTitle;
  $("scorePosition").textContent = `${viewerIndex + 1} / ${viewerFiles.length}`;
  $("openScoreNew").href = url;
  $("previousScore").style.display = viewerFiles.length > 1 ? "grid" : "none";
  $("nextScore").style.display = viewerFiles.length > 1 ? "grid" : "none";
}

window.openGraceScores = (files, title = "乐谱") => {
  openShell();
  viewerFiles = (files || []).filter(file => file?.url || file?.path);
  viewerGroupTitle = title;
  viewerPdf = null; viewerPdfUrl = ""; viewerPdfPage = 1;
  showViewerFile(0);
  $("scoreViewer").classList.add("show");
};
window.openGraceScore = (url, title = "乐谱") => window.openGraceScores([{url, name:title}], title);

async function loadScores() {
  const {data, error} = await supabase.from("scores").select("*").order("created_at", {ascending:false});
  if (error) {
    $("scoreList").innerHTML = `<div class="cloud-empty">乐谱库暂时无法读取：${escapeText(error.message)}</div>`;
    return;
  }
  scoreRows = data || [];
  renderScores();
}

function renderScores() {
  const term = $("scoreSearch").value.trim().toLowerCase();
  const rows = scoreRows.filter(row => `${row.title || ""} ${row.composer || ""} ${row.notes || ""}`.toLowerCase().includes(term));
  $("scoreList").innerHTML = rows.length ? rows.map(row => {
    const files = scoreFiles(row);
    const displayNotes = parseScoreData(row).notes;
    const date = row.created_at ? new Date(row.created_at).toLocaleDateString("zh-CN") : "";
    const fileKinds = new Set(files.map(file => isImagePath(file.path) ? "图片" : "PDF"));
    const fileType = [...fileKinds].join(" + ");
    const deleteButton = window.graceIsLoggedIn?.() ? `<button class="danger-btn" data-delete-score="${row.id}" data-path="${escapeText(row.file_path)}" data-title="${escapeText(row.title)}" type="button">删除</button>` : "";
    return `<article class="cloud-card"><h3>${escapeText(row.title)}</h3><div class="cloud-meta">${files.length} 个文件 · ${fileType} · ${escapeText(row.composer || "未填写作曲家")}${row.page_count ? ` · 共 ${row.page_count} 页` : ""}${date ? ` · ${date}` : ""}</div>${displayNotes ? `<p style="line-height:1.55">${escapeText(displayNotes)}</p>` : ""}<div class="cloud-actions"><button class="open-score" data-open-score-id="${row.id}" type="button">阅读乐谱</button>${deleteButton}</div></article>`;
  }).join("") : `<div class="cloud-empty">${term ? "没有找到匹配的乐谱" : "乐谱库还是空的。登录后点击“上传新乐谱”，可以一次选择多个 PDF 或图片。"}</div>`;
  $("scoreList").querySelectorAll("[data-open-score-id]").forEach(button => button.addEventListener("click", () => {
    const row = scoreRows.find(score => score.id === button.dataset.openScoreId);
    if (row) window.openGraceScores(scoreFiles(row), row.title);
  }));
  $("scoreList").querySelectorAll("[data-delete-score]").forEach(button => button.addEventListener("click", () => deleteScore(button.dataset.deleteScore, button.dataset.path, button.dataset.title)));
}

async function deleteScore(id, path, title) {
  if (!window.graceRequireLogin?.()) return;
  if (!confirm(`确定删除“${title}”吗？如果它已关联某条练习，那条练习也会变回“尚未上传”。`)) return;
  const row = scoreRows.find(score => score.id === id);
  const paths = row ? scoreFiles(row).map(file => file.path) : [path];
  const storageResult = await supabase.storage.from("scores").remove(paths);
  if (storageResult.error) return notify(`文件删除失败：${storageResult.error.message}`);
  const {error} = await supabase.from("scores").delete().eq("id", id);
  if (error) return notify(`记录删除失败：${error.message}`);
  await loadScores();
  await window.graceReloadScoreLinks?.();
  notify("乐谱已删除");
}

$("scoreLibraryBtn")?.addEventListener("click", event => { event.preventDefault(); openShell(); });
$("libraryUpload").addEventListener("click", () => {
  if (typeof window.graceRequireLogin === "function" && !window.graceRequireLogin()) return;
  if (typeof window.graceRequireLogin !== "function" && document.body.classList.contains("read-only")) return;
  document.dispatchEvent(new CustomEvent("grace:score-manage", {detail:{mode:"library", title:""}}));
});
$("closeScoreShell").addEventListener("click", closeShell);
function closeViewer() {
  $("scoreViewer").classList.remove("show");
  $("scoreFrame").src = "about:blank";
  viewerPdf = null; viewerPdfUrl = ""; viewerPdfPage = 1;
  $("scoreImage").removeAttribute("src");
}

$("closeViewer").addEventListener("click", closeShell);
$("backToLibrary").addEventListener("click", closeViewer);
$("previousScore").addEventListener("click", () => showViewerFile(viewerIndex - 1));
$("nextScore").addEventListener("click", () => showViewerFile(viewerIndex + 1));
$("pdfPreviousPage").addEventListener("click", async () => { if (viewerPdf && viewerPdfPage > 1) { viewerPdfPage--; await renderPdfPage(); } });
$("pdfNextPage").addEventListener("click", async () => { if (viewerPdf && viewerPdfPage < viewerPdf.numPages) { viewerPdfPage++; await renderPdfPage(); } });
let touchStartX = null;
$("scoreViewer").addEventListener("touchstart", event => { touchStartX = event.touches[0]?.clientX ?? null; }, {passive:true});
$("scoreViewer").addEventListener("touchend", event => {
  if (touchStartX === null || viewerFiles.length < 2) return;
  const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
  if (Math.abs(distance) > 45) showViewerFile(viewerIndex + (distance < 0 ? 1 : -1));
  touchStartX = null;
}, {passive:true});
$("scoreSearch").addEventListener("input", renderScores);
window.addEventListener("grace:scores-changed", loadScores);
window.addEventListener("grace:auth-changed", renderScores);

await loadScores();
