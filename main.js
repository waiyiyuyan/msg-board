// ===================== 全局常量 =====================
const API_BASE = "https://mbapi.lovefree.de5.net";
const UPLOAD_API = `${API_BASE}/proxyUpload`;
const PROXY_PREFIX = "https://imgvideop.lovefree.de5.net/?url=";
const WS_URL = "wss://mbapi.lovefree.de5.net/ws";
const HEARTBEAT_INTERVAL = 25000;
const ALLOW_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
const IMG_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// ===================== 全局状态 =====================
let currentMediaUrl = "";
let lastData = [];
let notifyList = [];
let isUploading = false;
let lastCursor = "";
let isLoading = false;
let hasMore = true;
let userAvatar = "";
let userNick = "";
let ws = null;
let heartbeatTimer = null;
let wsReconnectTimer = null;
let currentView = "list";
let prevView = "list";
let currentViewPid = null;
let showEditor = false;

// ===================== DOM 缓存 =====================
const mainView = document.getElementById("mainView");
const loadTip = document.getElementById("loadTip");
const backLink = document.getElementById("backLink");
const viewTitle = document.getElementById("viewTitle");
const notifyLink = document.getElementById("notifyLink");
const publishForm = document.getElementById("publishForm");
const contentInput = document.getElementById("contentInput");
const uploadBtn = document.getElementById("uploadBtn");
const fileSelector = document.getElementById("fileSelector");
const mediaInput = document.getElementById("mediaInput");
const mediaPreviewBox = document.getElementById("mediaPreviewBox");
const mediaStatus = document.getElementById("mediaStatus");
const uploadProgressWrap = document.getElementById("uploadProgressWrap");
const uploadProgressBar = document.getElementById("uploadProgressBar");
const progressText = document.getElementById("progressText");
const hidPid = document.getElementById("hidPid");
const hidRid = document.getElementById("hidRid");
const hidNick = document.getElementById("hidNick");
const targetUserDom = document.getElementById("targetUser");
const topPostBtn = document.getElementById("topPostBtn");
const editorWrap = document.getElementById("editorWrap");

// ===================== 通用工具函数 =====================
async function req(url, opt = {}) {
  return await fetch(url, { credentials: "include", ...opt });
}

function setCookie(name, val, day = 30) {
  const d = new Date();
  d.setTime(d.getTime() + day * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax;Secure`;
}

function getCookie(name) {
  return document.cookie.split("; ").reduce((v, item) => {
    const [k, val] = item.split("=");
    return k === name ? decodeURIComponent(val) : v;
  }, "");
}

function parseLink(text) {
  if (!text) return "";
  const escaped = text.replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]
  );
  return escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function getAvatarUrl(nick) {
  if (!nick) return "";
  return `https://api.dicebear.com/10.x/avataaars/svg?seed=${encodeURIComponent(nick)}`;
}

async function fetchRandomNick() {
  return Math.random().toString(36).slice(2, 7);
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getReplyHeadText(r, myNick) {
  const rawContent = parseLink(r.r_content);
  let headText = r.r_name;
  let showContent = rawContent;
  if (r.to_user) {
    const s = r.r_name, t = r.to_user;
    headText = s === myNick ? `你 回复了 ${t}` : t === myNick ? `${s} 回复了你` : `${s} 回复了 ${t}`;
  } else {
    const match = rawContent.match(/^回复\s+(.+?)：/);
    if (match) {
      const oldT = match[1], s = r.r_name;
      headText = s === myNick ? `你 回复了 ${oldT}` : oldT === myNick ? `${s} 回复了你` : `${s} 回复了 ${oldT}`;
      showContent = rawContent.replace(/^回复\s+(.+?)：/, "");
    }
  }
  return { headText, showContent };
}

// ===================== 编辑器控制 =====================
function openEditor(mode, pid = null, rid = null, targetName = "") {
  showEditor = true;
  editorWrap.classList.add("show");
  document.querySelector(".main-container").classList.add("editor-open");
  setInputMode(mode, pid, rid, targetName);
}

function closeEditor() {
  showEditor = false;
  editorWrap.classList.remove("show");
  document.querySelector(".main-container").classList.remove("editor-open");
  clearMedia();
  contentInput.value = "";
}

function handleClickOutsideEditor(e) {
  if (!showEditor) return;
  if (
    topPostBtn.contains(e.target) ||
    editorWrap.contains(e.target) ||
    e.target.matches(".reply-small-btn")
  ) return;
  closeEditor();
}

function handleEscClose(e) {
  if (e.key === "Escape" && showEditor) closeEditor();
}

// ===================== 媒体渲染 =====================
function renderMedia(mediaUrl) {
  if (!mediaUrl) return "";
  const lowerUrl = mediaUrl.toLowerCase();
  const proxySrc = PROXY_PREFIX + encodeURIComponent(mediaUrl);
  if (IMG_EXTS.some(ext => lowerUrl.endsWith(ext))) {
    return `<div class="msg-media-wrap">
      <img class="msg-media-img" loading="lazy" decoding="async" style="width:100%;" src="${proxySrc}" alt="">
    </div>`;
  }
  if (lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".webm")) {
    const type = lowerUrl.endsWith(".webm") ? "video/webm" : "video/mp4";
    return `<div class="msg-media-wrap">
      <video class="msg-media-video" style="width:100%;" controls playsinline webkit-playsinline preload="none">
        <source src="${proxySrc}" type="${type}">浏览器不支持该视频
      </video>
    </div>`;
  }
  return "";
}

mainView.addEventListener("click", e => {
  const img = e.target.closest(".msg-media-img");
  if (img) window.open(img.src, "_blank");
});

mainView.addEventListener("error", e => {
  const t = e.target;
  if (t.matches(".msg-media-img, .msg-media-video")) {
    t.closest(".msg-media-wrap").style.display = "none";
  }
}, true);

mainView.addEventListener("play", e => {
  const vid = e.target.closest(".msg-media-video");
  if (!vid) return;
  document.querySelectorAll(".msg-media-video").forEach(v => { if (v !== vid) v.pause(); });
}, true);

// ===================== 上传模块 =====================
function clearMedia() {
  currentMediaUrl = "";
  mediaInput.value = "";
  mediaStatus.innerHTML = "";
  mediaPreviewBox.innerHTML = "";
  uploadProgressWrap.style.display = "none";
  uploadBtn.disabled = false;
}

function checkFile(file) {
  if (!ALLOW_MIME.includes(file.type)) return { ok: false, msg: "仅支持 JPG/PNG/GIF/WEBP 图片、MP4/WEBM 视频" };
  if (file.size === 0) return { ok: false, msg: "文件无效，请重新选择" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, msg: "文件不能超过20MB，请压缩后重试" };
  return { ok: true };
}

async function uploadFile(file) {
  clearMedia();
  uploadBtn.disabled = true;
  isUploading = true;
  const submitBtn = publishForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  uploadProgressWrap.style.display = "block";
  uploadProgressBar.style.width = "0%";
  progressText.innerText = "0%";

  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", UPLOAD_API);
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const p = Math.round((e.loaded / e.total) * 100);
          uploadProgressBar.style.width = p + "%";
          progressText.innerText = p + "%";
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("返回数据异常")); }
        } else {
          reject(new Error("图床服务异常"));
        }
      };
      xhr.onerror = () => reject(new Error("网络请求失败"));
      xhr.send(formData);
    });

    if (!result.url) throw new Error("返回数据异常");
    currentMediaUrl = result.url;
    mediaInput.value = result.url;

    const lowerUrl = result.url.toLowerCase();
    const isImg = IMG_EXTS.some(ext => lowerUrl.endsWith(ext));
    mediaPreviewBox.innerHTML = isImg
      ? `<img src="${PROXY_PREFIX + encodeURIComponent(result.url)}" alt="">`
      : `<span style="font-size:14px;color:var(--text-second)">[视频文件]</span>`;

    mediaStatus.innerHTML = `<div style="display:inline-flex;align-items:center;gap:8px;">
      <span style="color:#34c759;font-size:14px;">上传成功</span>
      <button class="reply-small-btn del-btn" onclick="clearMedia()" style="margin-top:0;font-size:14px;">移除</button>
    </div>`;
  } catch (err) {
    let errMsg = "上传失败，请重试";
    if (err.message.includes("1101") || err.message.includes("Worker threw exception")) {
      errMsg = "文件过大，上传失败，请压缩后重试";
    }
    mediaStatus.innerHTML = `<span style="color:var(--red);font-size:14px;">${errMsg}</span>`;
    console.error("上传错误：", err);
  } finally {
    uploadProgressWrap.style.display = "none";
    uploadBtn.disabled = false;
    isUploading = false;
    submitBtn.disabled = false;
  }
}

uploadBtn.addEventListener("click", () => fileSelector.click());
fileSelector.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const checkRes = checkFile(file);
  if (!checkRes.ok) {
    mediaStatus.innerHTML = `<span style="color:var(--red);font-size:14px;">${checkRes.msg}</span>`;
    fileSelector.value = "";
    return;
  }
  await uploadFile(file);
  fileSelector.value = "";
});

// ===================== 帖子 & 回复渲染 =====================

// 单条回复 HTML（抽成独立函数，列表页/详情页/WS推送都复用）
function buildReplyItemHtml(r, postId) {
  const { headText, showContent } = getReplyHeadText(r, (userNick || "").trim());
  return `<div class="reply-item" data-rid="${r.id}" data-pid="${r.msg_id}">
    <div class="reply-head">
      <div class="reply-avatar-row">
        <img class="reply-avatar" loading="lazy" decoding="async"
          src="${getAvatarUrl(r.r_name)}" alt="头像" onerror="this.style.display='none'">
        <div class="reply-name">${headText}</div>
      </div>
    </div>
    <div class="reply-time">${r.create_time.slice(0, 16)}</div>
    <div class="reply-text">${showContent}</div>
    ${renderMedia(r.media_urls || "")}
    <div style="text-align:right;margin-top:4px;">
      <button class="reply-small-btn" onclick="openSubReply(${postId},${r.id},'${r.r_name}')">回复</button>
    </div>
  </div>`;
}

// 帖子卡片 HTML
// showReplies = false：列表页，不渲染回复 DOM（性能关键）
// showReplies = true：详情页，渲染完整回复
function buildPostHtml(post, showReplies = false) {
  const replyCount = post.replys ? post.replys.length : 0;
  let rHtml = "";
  if (showReplies && post.replys && post.replys.length > 0) {
    rHtml = post.replys.map(r => buildReplyItemHtml(r, post.id)).join("");
  }

  return `<div class="post-card" data-pid="${post.id}">
    <div class="post-info">
      <div class="post-avatar-row" style="display:flex;align-items:center;gap:8px;">
        <img class="post-avatar" loading="lazy" decoding="async"
          src="${getAvatarUrl(post.name)}" alt="头像" onerror="this.style.display='none'">
        <span class="post-author">${post.name}</span>
      </div>
      <span class="post-time">${post.create_time.slice(0, 16)}</span>
    </div>
    <div class="post-content">${parseLink(post.content)}</div>
    ${renderMedia(post.media_urls || "")}
    <div class="post-action-row">
      <div class="toggle-wrapper ${replyCount === 0 ? "toggle-wrapper-empty" : ""}" data-pid="${post.id}">
        <button class="fold-btn" data-fold-pid="${post.id}" data-reply-count="${replyCount}"></button>
      </div>
      <div class="post-btn-group">
        <button class="reply-small-btn" onclick="openReply(${post.id},'${post.name}')">回复</button>
        <button class="reply-small-btn" onclick="sharePost(${post.id})">分享</button>
      </div>
    </div>
    ${showReplies
      ? `<div class="reply-wrap" data-wrap-pid="${post.id}" style="display:none">${rHtml}</div>`
      : ""}
  </div>`;
}

// 列表页渲染（不渲染回复）
function renderPosts(data) {
  lastData = data;
  mainView.innerHTML = data.map(p => buildPostHtml(p, false)).join("");
  console.log(`[前端] 列表渲染完成，共 ${data.length} 条`);
}

// ===================== 分页逻辑 =====================
function updateLoadTip() {
  if (!loadTip) return;
  if (currentView !== "list") { loadTip.style.display = "none"; return; }
  loadTip.style.display = "block";
  if (!hasMore) {
    loadTip.innerText = "-- 回到顶部 --";
    loadTip.style.color = "#007aff";
    loadTip.style.cursor = "pointer";
  } else if (isLoading) {
    loadTip.innerText = "加载中...";
    loadTip.style.color = "#86868b";
    loadTip.style.cursor = "default";
  } else {
    loadTip.innerText = "-- 加载更多 --";
    loadTip.style.color = "#007aff";
    loadTip.style.cursor = "pointer";
  }
}

async function initLoadPosts() {
  if (isLoading) return;
  isLoading = true;
  updateLoadTip();
  try {
    const res = await req(`${API_BASE}/initPosts`);
    const data = await res.json();
    if (data.code === 0) {
      lastData = [...data.list];
      lastCursor = data.lastCursor;
      hasMore = data.hasMore;
      // 只在列表视图下渲染
      if (currentView === "list") renderPosts(lastData);
    }
  } catch (e) {
    console.error("[分页] 初始化失败", e);
    if (loadTip) loadTip.innerText = "加载失败，刷新重试";
  } finally {
    isLoading = false;
    updateLoadTip();
  }
}

async function loadMorePosts() {
  if (isLoading || !hasMore || currentView !== "list") return;
  isLoading = true;
  updateLoadTip();
  try {
    const res = await req(`${API_BASE}/loadMorePosts?cursor=${lastCursor}`);
    const data = await res.json();
    if (data.code === 0 && data.list.length > 0) {
      lastData.push(...data.list);
      lastCursor = data.lastCursor;
      hasMore = data.hasMore;
      mainView.insertAdjacentHTML("beforeend",
        data.list.map(p => buildPostHtml(p, false)).join("")
      );
    } else {
      hasMore = false;
    }
  } catch (e) {
    console.error("[分页] 加载更多失败", e);
    loadTip.innerText = "加载失败，上滑重试";
  } finally {
    isLoading = false;
    updateLoadTip();
  }
}

loadTip.addEventListener("click", () => hasMore ? loadMorePosts() : scrollToTop());

mainView.addEventListener("click", e => {
  const foldBtn = e.target.closest(".fold-btn");
  if (foldBtn) {
    e.stopPropagation();
    goPostDetail(foldBtn.dataset.foldPid);
    return;
  }
  const wrapper = e.target.closest(".toggle-wrapper");
  if (wrapper) goPostDetail(wrapper.dataset.pid);
});

// ===================== 通知模块 =====================
function updateNotifyBadge() {
  const unread = notifyList.filter(item => Number(item.is_read) !== 1).length;
  notifyLink.textContent = `通知(${unread > 99 ? "99+" : unread})`;
}

function renderNotifyList() {
  updateNotifyBadge();
  if (notifyList.length === 0) {
    mainView.innerHTML = `<div class="empty-tip">暂无消息通知</div>`;
    return;
  }
  const unread = notifyList.filter(item => Number(item.is_read) !== 1).length;
  mainView.innerHTML = notifyList.map(item => {
    const isRead = Number(item.is_read) === 1;
    return `<div class="page-notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
      <div class="page-notify-text ${isRead ? "" : "unread"}">${item.reply_name} 回复了你：${item.reply_preview}</div>
      <div class="page-notify-time">${item.create_time.slice(0, 16)}</div>
    </div>`;
  }).join("") + `<div class="notify-op-row">
    <button class="text-btn" ${unread === 0 ? "disabled" : ""} onclick="readAllNotify()">全部已读</button>
    <button class="text-btn" onclick="clearAllNotify()">清空所有通知</button>
  </div>`;
}

async function jumpPost(nid, pid, rid) {
  const fd = new FormData();
  fd.append("nid", nid);
  try {
    await req(`${API_BASE}/setRead?uid=${encodeURIComponent(userNick)}`, { method: "POST", body: fd });
    // 乐观更新本地状态（WS 会推送最终状态）
    const target = notifyList.find(n => n.id === nid);
    if (target) target.is_read = 1;
    updateNotifyBadge();
  } catch (e) {
    console.error("标记已读失败", e);
  }

  prevView = "notify";
  location.hash = `post/${pid}`;
  setTimeout(() => {
    const el = document.querySelector(`.reply-item[data-rid="${rid}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      el.addEventListener("animationend", () => el.classList.remove("flash"), { once: true });
    }
  }, 150);
}

async function readAllNotify() {
  try {
    await req(`${API_BASE}/readAllNotify?uid=${encodeURIComponent(userNick)}`, { method: "POST" });
    // WS 会推送最终状态，这里做乐观更新
    notifyList.forEach(item => { item.is_read = 1; });
    renderNotifyList();
  } catch (err) {
    console.error("全部已读失败:", err);
    alert("网络异常");
  }
}

async function clearAllNotify() {
  if (notifyList.length === 0) return;
  try {
    await req(`${API_BASE}/clearAllNotify?uid=${encodeURIComponent(userNick)}`, { method: "POST" });
    // WS 会推送最终状态，这里做乐观更新
    notifyList = [];
    renderNotifyList();
  } catch (err) {
    console.error("清空通知失败:", err);
    alert("网络异常");
  }
}

notifyLink.addEventListener("click", () => {
  prevView = currentView;
  location.hash = "notify";
});

// ===================== 输入区 =====================
function setInputMode(mode, pid = null, rid = null, targetName = "") {
  hidPid.value = pid || "";
  hidRid.value = rid || "";
  targetUserDom.value = targetName;
  clearMedia();
  contentInput.value = "";
  if (mode === "newPost") {
    contentInput.placeholder = "有什么新鲜事？";
  } else if (mode === "replyPost") {
    contentInput.placeholder = `回复 @${targetName}`;
  } else if (mode === "replyFloor") {
    contentInput.placeholder = `回复 @${targetName} 的评论`;
  }
  autoResize(contentInput);
}

function openReply(pid, targetName) {
  openEditor("replyPost", pid, null, targetName);
}

function openSubReply(pid, rid, targetName) {
  openEditor("replyFloor", pid, rid, targetName);
}

// ===================== 发布提交 =====================
publishForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  if (isUploading) { alert("图片正在上传，请稍后再发布！"); return; }
  const content = contentInput.value.trim();
  const hasImg = mediaInput.value.trim() !== "";
  if (!content && !hasImg) { alert("请输入内容或上传图片"); return; }

  const fd = new FormData(this);
  const pid = hidPid.value;
  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = pid
      ? await req(`${API_BASE}/addReply`, {
          method: "POST",
          body: (() => { fd.append("targetUser", targetUserDom.value); fd.append("pid", pid); return fd; })()
        })
      : await req(`${API_BASE}/add`, { method: "POST", body: fd });

    if (res.ok) {
      const result = await res.json();
      if (result.code === 0) {
        contentInput.value = "";
        clearMedia();
        closeEditor();
        // 不主动刷新，等待 WS 推送 NEW_POST 或 NEW_REPLY
        if (pid) setInputMode("replyPost", pid, null, "");
      } else {
        alert("发布失败：" + (result.msg || "未知错误"));
      }
    } else {
      alert("网络错误，请重试");
    }
  } catch (err) {
    console.error("提交失败:", err);
    alert("提交失败，请稍后重试");
  } finally {
    submitBtn.disabled = false;
  }
});

// ===================== 分享功能 =====================
async function copyPostUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast("帖子链接已复制");
  } catch {
    showToast("复制失败，请手动复制链接");
  }
}

let toastTimer = null;
function showToast(text) {
  const toast = document.querySelector(".toast-tip");
  if (!toast) return;
  toast.innerText = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

async function sharePost(pid) {
  document.activeElement?.blur();
  closeEditor();
  const shareUrl = location.origin + location.pathname + "#post/" + pid;
  const isMobile = navigator.userAgentData?.mobile
    ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!isMobile || !navigator.share) { copyPostUrl(shareUrl); return; }
  try {
    await navigator.share({ title: "留言帖子", url: shareUrl });
  } catch (err) {
    if (err.name === "AbortError") return;
    copyPostUrl(shareUrl);
  }
}

// ===================== WebSocket 模块 =====================
function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "HEARTBEAT" }));
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function handleWsMessage(data) {
  switch (data.type) {
    case "NOTIFY_DATA": {
      notifyList = data.notify || [];
      updateNotifyBadge();
      if (currentView === "notify") renderNotifyList();
      break;
    }

    case "NEW_POST": {
      const newItem = data.item;
      // 去重
      if (lastData.find(p => Number(p.id) === Number(newItem.id))) break;
      newItem.replys = newItem.replys || [];
      lastData.unshift(newItem);
      if (currentView === "list") {
        mainView.insertAdjacentHTML("afterbegin", buildPostHtml(newItem, false));
      }
      break;
    }

    case "NEW_REPLY": {
      const targetPid = String(data.targetPid);
      const replyItem = data.item;

      // 更新内存缓存
      const cachePost = lastData.find(p => Number(p.id) === Number(targetPid));
      if (cachePost) {
        cachePost.replys = cachePost.replys || [];
        if (!cachePost.replys.find(r => Number(r.id) === Number(replyItem.id))) {
          cachePost.replys.push(replyItem);
        }
      }

      // 更新 DOM
      const postCard = document.querySelector(`.post-card[data-pid="${targetPid}"]`);
      if (!postCard) break;

      const foldBtn = postCard.querySelector(".fold-btn");
      const toggleWrapper = postCard.querySelector(".toggle-wrapper");
      const replyWrap = postCard.querySelector(".reply-wrap");

      // 更新回复数
      const newCount = cachePost ? cachePost.replys.length : Number(foldBtn?.dataset.replyCount || 0) + 1;
      if (foldBtn) foldBtn.dataset.replyCount = newCount;
      if (toggleWrapper && newCount > 0) toggleWrapper.classList.remove("toggle-wrapper-empty");

      // 只有详情页才有 replyWrap，向其中插入新回复
      if (replyWrap) {
        if (replyWrap.querySelector(`.reply-item[data-rid="${replyItem.id}"]`)) break;
        replyWrap.insertAdjacentHTML("beforeend", buildReplyItemHtml(replyItem, targetPid));
      }
      break;
    }

    case "DELETE_POST": {
      const pid = String(data.targetPid);
      const el = document.querySelector(`.post-card[data-pid="${pid}"]`);
      if (el) el.remove();
      const idx = lastData.findIndex(p => Number(p.id) === Number(pid));
      if (idx !== -1) lastData.splice(idx, 1);
      break;
    }

    default:
      break;
  }
}

function initWebSocket() {
  // 清理旧连接
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
    ws = null;
  }
  clearTimeout(wsReconnectTimer);
  stopHeartbeat();

  console.log("[WS] 正在连接...");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[WS] 连接成功");
    // 上报用户昵称，让后端推送历史通知
    if (userNick) {
      ws.send(JSON.stringify({ type: "USER_UID", uid: userNick }));
    }
    startHeartbeat();
  };

  ws.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      handleWsMessage(data);
    } catch (err) {
      console.error("[WS] 消息解析失败:", err);
    }
  };

  ws.onclose = () => {
    stopHeartbeat();
    console.log("[WS] 连接断开，5 秒后重连");
    wsReconnectTimer = setTimeout(initWebSocket, 5000);
  };

  ws.onerror = err => {
    console.error("[WS] 连接错误:", err);
    stopHeartbeat();
    ws.close();
  };
}

// ===================== 路由与视图控制 =====================
function goPostDetail(pid) {
  prevView = currentView;
  location.hash = `post/${pid}`;
}

function goBack() {
  if (currentView === "detail") {
    location.hash = prevView === "notify" ? "notify" : "";
  } else if (currentView === "notify") {
    location.hash = "";
  }
}

function updateTopBar() {
  if (currentView === "list") {
    backLink.textContent = "";
    viewTitle.textContent = "帖子列表";
    notifyLink.style.display = "inline-flex";
  } else if (currentView === "notify") {
    backLink.textContent = "← 返回帖子列表";
    viewTitle.textContent = "通知列表";
    notifyLink.style.display = "none";
  } else if (currentView === "detail") {
    backLink.textContent = prevView === "notify" ? "← 返回通知列表" : "← 返回帖子列表";
    viewTitle.textContent = "帖子详情";
    notifyLink.style.display = "inline-flex";
  }
  topPostBtn.style.display = currentView === "notify" ? "none" : "inline-flex";
}

async function renderSinglePost(pid) {
  let targetPost = lastData.find(p => Number(p.id) === Number(pid));

  if (!targetPost) {
    try {
      const res = await req(`${API_BASE}/getPostDetail?id=${pid}`);
      const resData = await res.json();
      if (resData.code === 0 && resData.data) {
        targetPost = resData.data;
        lastData.push(targetPost);
      } else {
        mainView.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--text-second);">
          <p>帖子不存在或已删除</p>
          <button class="text-btn" onclick="goBack()">返回列表</button>
        </div>`;
        return;
      }
    } catch {
      mainView.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--text-second);">
        <p>帖子加载失败</p>
        <button class="text-btn" onclick="goBack()">返回列表</button>
      </div>`;
      return;
    }
  }

  // 详情页：渲染回复内容
  mainView.innerHTML = buildPostHtml(targetPost, true);

  const replyWrap = mainView.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if (replyWrap) replyWrap.style.display = "block";

  setInputMode("replyPost", pid, null, targetPost.name);
}

function renderRouteView() {
  closeEditor();
  const hashStr = location.hash.slice(1);
  const pidMatch = hashStr.match(/^post\/(\d+)$/);
  document.activeElement?.blur();

  if (hashStr === "notify") {
    currentView = "notify";
    currentViewPid = null;
    renderNotifyList();
    uploadBtn.disabled = true;
    publishForm.querySelector('button[type="submit"]').disabled = true;
    contentInput.disabled = true;
    contentInput.placeholder = "浏览通知时无法发布内容";
  } else if (pidMatch) {
    currentView = "detail";
    currentViewPid = pidMatch[1];
    renderSinglePost(currentViewPid);
    uploadBtn.disabled = false;
    publishForm.querySelector('button[type="submit"]').disabled = false;
    contentInput.disabled = false;
  } else {
    currentView = "list";
    currentViewPid = null;
    renderPosts(lastData);
    uploadBtn.disabled = false;
    publishForm.querySelector('button[type="submit"]').disabled = false;
    contentInput.disabled = false;
    setInputMode("newPost");
  }

  updateTopBar();
  updateLoadTip();
  scrollToTop();
}

backLink.addEventListener("click", goBack);
window.addEventListener("hashchange", renderRouteView);

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userNick) return;
  // 重新拉取通知（兜底，WS 断线期间可能错过推送）
  try {
    const res = await req(`${API_BASE}/getNotify?uid=${encodeURIComponent(userNick)}`);
    const data = await res.json();
    notifyList = data;
    updateNotifyBadge();
    if (currentView === "notify") renderNotifyList();
  } catch (e) {
    console.error("刷新通知失败", e);
  }
});

contentInput.addEventListener("input", () => autoResize(contentInput));

// ===================== 页面初始化 =====================
async function bootApp() {
  userNick = getCookie("userNick");
  if (!userNick) {
    const newNick = await fetchRandomNick();
    userNick = newNick;
    setCookie("userNick", newNick);
  }
  hidNick.value = userNick;
  userAvatar = getAvatarUrl(userNick);

  // 先加载帖子数据，再渲染视图
  await initLoadPosts();
  renderRouteView();

  // WebSocket 延迟初始化，避免和首屏请求抢带宽
  setTimeout(initWebSocket, 1000);

  topPostBtn.addEventListener("click", () => {
    if (currentView === "notify") return;
    if (showEditor) closeEditor();
    else openEditor("newPost");
  });

  document.addEventListener("click", handleClickOutsideEditor);
  document.addEventListener("keydown", handleEscClose);
  editorWrap.addEventListener("click", e => e.stopPropagation());

  const toastBox = document.createElement("div");
  toastBox.className = "toast-tip";
  document.body.appendChild(toastBox);

  console.log("[Init] 初始化完成，当前视图:", currentView);
}

// ==================== 执行初始化 ====================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  bootApp();
}
