// ===================== 全局常量 =====================
const API_BASE = "https://mbapi.lovefree.de5.net";
const UPLOAD_API = `${API_BASE}/proxyUpload`;
const PROXY_PREFIX = "https://imgvideop.lovefree.de5.net/?url=";
const WS_URL = "wss://mbapi.lovefree.de5.net/ws";
const HEARTBEAT_INTERVAL = 20000;
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

// 视图状态：替代原复杂路由栈
let currentView = "list"; // list / detail / notify
let prevView = "list";    // 记录上一级视图，用于返回
let currentViewPid = null;
let replyTarget = null;
let showEditor = false; // 控制底部编辑器滑入/滑出

// ===================== DOM 缓存 =====================
const mainView = document.getElementById("mainView");
const loadTip = document.getElementById("loadTip");
const backLink = document.getElementById("backLink");
const viewTitle = document.getElementById("viewTitle");
const notifyLink = document.getElementById("notifyLink");

// 底部输入区
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
  const baseOpt = { credentials: "include", ...opt };
  const res = await fetch(url, baseOpt);
  return res;
}

function setCookie(name, val, day = 30) {
  const d = new Date();
  d.setTime(d.getTime() + day * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax;Secure`;
}

function getCookie(name) {
  return document.cookie.split('; ').reduce((v, item) => {
    const [k, val] = item.split('=');
    return k === name ? decodeURIComponent(val) : v;
  }, "");
}

function parseLink(text) {
  if (!text) return "";
  const escapeTxt = text.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" })[m]);
  return escapeTxt.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

function getAvatarUrl(nick) {
  if (!nick) return "";
  return `https://api.dicebear.com/10.x/avataaars/svg?seed=${encodeURIComponent(nick)}`;
}

async function fetchRandomNick() {
  const randomStr = Math.random().toString(36).slice(2, 7);
  return randomStr;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
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
      const oldT = match[1];
      const s = r.r_name;
      headText = s === myNick ? `你 回复了 ${oldT}` : oldT === myNick ? `${s} 回复了你` : `${s} 回复了 ${oldT}`;
      showContent = rawContent.replace(/^回复\s+(.+?)：/, "");
    }
  }
  return { headText, showContent };
}

// 打开底部编辑器，设置编辑模式
function openEditor(mode, pid = null, rid = null, targetName = "") {
  showEditor = true;
  editorWrap.classList.add("show");
  document.querySelector(".main-container").classList.add("editor-open");
  setInputMode(mode, pid, rid, targetName);
}

// 关闭编辑器，清空输入与媒体
function closeEditor() {
  showEditor = false;
  editorWrap.classList.remove("show");
  document.querySelector(".main-container").classList.remove("editor-open");
  clearMedia();
  contentInput.value = "";
}
// 点击页面空白关闭编辑器
function handleClickOutsideEditor(e) {
  if (!showEditor) return;
  // 点击顶部发帖按钮、编辑器内部、回复按钮 不关闭
  const clickOnTopPostBtn = topPostBtn.contains(e.target);
  const clickInsideEditor = editorWrap.contains(e.target);
  const clickReplyBtn = e.target.matches(".reply-small-btn");
  if (!clickOnTopPostBtn && !clickInsideEditor && !clickReplyBtn) {
    closeEditor();
  }
}
// ESC键关闭编辑器
function handleEscClose(e) {
  if (e.key === "Escape" && showEditor) {
    closeEditor();
  }
}
// ===================== 媒体渲染 & 媒体事件 =====================
function renderMedia(mediaUrl) {
  if (!mediaUrl) return "";
  const lowerUrl = mediaUrl.toLowerCase();
  const proxySrc = PROXY_PREFIX + encodeURIComponent(mediaUrl);
  if (IMG_EXTS.some(ext => lowerUrl.endsWith(ext))) {
    return `<div class="msg-media-wrap">
      <img class="msg-media-img" style="width:100%;" src="${proxySrc}" alt="">
    </div>`;
  }
  if (lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".webm")) {
    return `<div class="msg-media-wrap">
      <video class="msg-media-video" style="width:100%;" controls playsinline webkit-playsinline preload="metadata">
        <source src="${proxySrc}" type="video/mp4">浏览器不支持该视频
      </video>
    </div>`;
  }
  return "";
}

// 媒体点击新窗口、错误隐藏、视频单例播放
mainView.addEventListener("click", function(e) {
  const img = e.target.closest(".msg-media-img");
  if(img) window.open(img.src, "_blank");
});

mainView.addEventListener("error", function(e) {
  const target = e.target;
  if(target.matches(".msg-media-img, .msg-media-video")) {
    target.closest(".msg-media-wrap").style.display = "none";
  }
}, true);

mainView.addEventListener("play", function(e) {
  const vid = e.target.closest(".msg-media-video");
  if(!vid) return;
  document.querySelectorAll(".msg-media-video").forEach(v => {
    if(v !== vid) v.pause();
  });
}, true);

// ===================== 上传模块（完整保留原逻辑，迁移到底部） =====================
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

  uploadProgressWrap.style.display = 'block';
  uploadProgressBar.style.width = '0%';
  progressText.innerText = '0%';

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
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("返回数据异常")); }
        } else reject(new Error("图床服务异常"));
      };
      xhr.onerror = () => reject(new Error("网络请求失败"));
      xhr.send(formData);
    });
    if (!result.url) throw new Error("返回数据异常");
    currentMediaUrl = result.url;
    mediaInput.value = result.url;

    // 预览图
    const lowerUrl = result.url.toLowerCase();
    const isImg = IMG_EXTS.some(ext => lowerUrl.endsWith(ext));
    mediaPreviewBox.innerHTML = isImg
      ? `<img src="${PROXY_PREFIX + encodeURIComponent(result.url)}" alt="">`
      : `<span style="font-size:14px;color:var(--text-second)">[视频文件]</span>`;
    
    mediaStatus.innerHTML = `<div style="display: inline-flex; align-items: center; gap: 8px;"><span style="color:#34c759; font-size:14px; line-height: 1;">上传成功</span><button class="reply-small-btn del-btn" onclick="clearMedia()" style="margin-top: 0;">移除</button></div>`;
  } catch (err) {
    let errMsg = "上传失败，请重试";
    if (err.message.includes("1101") || err.message.includes("Worker threw exception")) errMsg = "文件过大，上传失败，请压缩后重试";
    mediaStatus.innerHTML = `<span style="color:var(--red);font-size:14px;">${errMsg}</span>`;
    console.error("上传错误：", err);
  } finally {
    uploadProgressWrap.style.display = 'none';
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
function buildPostHtml(post) {
  let rHtml = '';
  const myNick = userNick?.trim() || "";
  if (post.replys && post.replys.length > 0) {
    post.replys.forEach((r) => {
      const { headText, showContent } = getReplyHeadText(r, myNick);
      rHtml += `<div class="reply-item" data-rid="${r.id}" data-pid="${r.msg_id}">
        <div class="reply-head">
          <div class="reply-avatar-row">
            <img class="reply-avatar" src="${getAvatarUrl(r.r_name)}" alt="头像" onerror="this.style.display='none'">
            <div class="reply-name">${headText}</div>
          </div>
        </div>
        <div class="reply-time">${r.create_time.slice(0,16)}</div>
        <div class="reply-text">${showContent}</div>
        ${renderMedia(r.media_urls || "")}
        <div style="text-align:right;margin-top:4px;"><button class="reply-small-btn" onclick="openSubReply(${post.id},${r.id},'${r.r_name}')">回复</button></div>
      </div>`;
    });
  }
  return `<div class="post-card" data-pid="${post.id}">
    <div class="post-info">
      <div class="post-avatar-row" style="display: flex; align-items: center; gap: 8px;">
        <img class="post-avatar" src="${getAvatarUrl(post.name)}" alt="头像" onerror="this.style.display='none'">
        <span class="post-author">${post.name}</span>
      </div>
      <span class="post-time">${post.create_time.slice(0,16)}</span>
    </div>
    <div class="post-content">${parseLink(post.content)}</div>
    ${renderMedia(post.media_urls || "")}
    <div class="post-action-row">
      <div class="toggle-wrapper ${post.replys.length === 0 ? 'toggle-wrapper-empty' : ''}" data-pid="${post.id}">
        <button class="fold-btn" 
          data-fold-pid="${post.id}" 
          data-reply-count="${post.replys.length}">
        </button>
      </div>
      <div class="post-btn-group"><button class="reply-small-btn" onclick="openReply(${post.id},'${post.name}')">回复</button></div>
      <button class="reply-small-btn" onclick="sharePost(${post.id})">分享</button>
    </div>
    <div class="reply-wrap" data-wrap-pid="${post.id}" style="display:none">${rHtml}</div>
  </div>`;
}

function renderPosts(data) {
  lastData = data;
  mainView.innerHTML = data.map(post => buildPostHtml(post)).join("");
  console.log(`[前端] 帖子渲染完成，共 ${data.length} 条，最新ID：${data[0]?.id}`);
}

// ===================== 分页逻辑 =====================
function updateLoadTip() {
  if (!loadTip) return;
  // 只有列表视图显示加载提示
  if (currentView !== "list") {
    loadTip.style.display = "none";
    return;
  }
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
      renderPosts(lastData);
      console.log("[分页] 初始化完成，加载", data.list.length, "条");
    }
  } catch (e) {
    console.error("[分页] 初始化加载失败", e);
    loadTip.innerText = "加载失败，刷新重试";
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
      const newHtml = data.list.map(post => buildPostHtml(post)).join("");
      mainView.insertAdjacentHTML("beforeend", newHtml);
      console.log("[分页] 追加加载完成，新增", data.list.length, "条");
    } else hasMore = false;
  } catch (e) {
    console.error("[分页] 加载更多失败", e);
    loadTip.innerText = "加载失败，上滑重试";
  } finally {
    isLoading = false;
    updateLoadTip();
  }
}

loadTip.addEventListener("click", () => hasMore ? loadMorePosts() : scrollToTop());

// 列表点击事件：进入详情
mainView.addEventListener("click", e => {
  const foldBtn = e.target.closest(".fold-btn");
  if(foldBtn) {
    e.stopPropagation();
    const pid = foldBtn.dataset.foldPid;
    goPostDetail(pid);
    return;
  }
  const wrapper = e.target.closest(".toggle-wrapper");
  if (wrapper) {
    const pid = wrapper.dataset.pid;
    goPostDetail(pid);
  }
});

// ===================== 通知模块（删除弹窗，仅保留列表视图） =====================
function updateNotifyBadge() {
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
  notifyLink.textContent = `通知(${unReadCount > 99 ? '99+' : unReadCount})`;
}

function renderNotifyList() {
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
  updateNotifyBadge();

  if (notifyList.length === 0) {
    mainView.innerHTML = `
      <div class="empty-tip">暂无消息通知</div>
    `;
    return;
  }

  const listHtml = notifyList.map(item => {
    const isRead = item.is_read === 1;
    return `<div class="page-notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
      <div class="page-notify-text ${isRead ? '' : 'unread'}">${item.reply_name} 回复了你：${item.reply_preview}</div>
      <div class="page-notify-time">${item.create_time.slice(0,16)}</div>
    </div>`;
  }).join("");

  mainView.innerHTML = listHtml + `
    <div class="notify-op-row">
      <button class="text-btn" ${unReadCount === 0 ? 'disabled' : ''} onclick="readAllNotify()">全部已读</button>
      <button class="text-btn" onclick="clearAllNotify()">清空所有通知</button>
    </div>
  `;
}

async function jumpPost(nid, pid, rid) {
  const fd = new FormData();
  fd.append('nid', nid);
  await req(`${API_BASE}/setRead?uid=${encodeURIComponent(userNick)}`, { method: "POST", body: fd });
  
  const targetNotify = notifyList.find(n => n.id === nid);
  if (targetNotify) targetNotify.is_read = 1;
  updateNotifyBadge();

  prevView = "notify";
  location.hash = `post/${pid}`;
  setTimeout(() => {
    const targetReply = document.querySelector(`.reply-item[data-rid="${rid}"]`);
    if (targetReply) {
      targetReply.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetReply.classList.add('flash');
      targetReply.addEventListener('animationend', () => targetReply.classList.remove('flash'), { once: true });
    }
  }, 150);
}

async function readAllNotify() {
  const uid = encodeURIComponent(userNick);
  try {
    await req(`${API_BASE}/readAllNotify?uid=${uid}`, { method: "POST" });
    notifyList.forEach(item => item.is_read = 1);
    renderNotifyList();
  } catch (err) {
    console.error("全部已读出错：", err);
    alert("网络异常");
  }
}

async function clearAllNotify() {
  if (notifyList.length === 0) return;
  const uid = encodeURIComponent(userNick);
  try {
    await req(`${API_BASE}/clearAllNotify?uid=${uid}`, { method: "POST" });
    notifyList = [];
    renderNotifyList();
  } catch (err) {
    console.error("清空通知出错：", err);
    alert("网络异常");
  }
}

// 顶部通知点击
notifyLink.addEventListener("click", () => {
  prevView = currentView;
  location.hash = "notify";
});

// ===================== 回复/发帖 底部输入区切换（替代原弹窗） =====================
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

// ===================== 发布提交（原弹窗提交逻辑完整保留） =====================
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
    let res;
    if (!pid) {
      // 发新帖
      res = await req(`${API_BASE}/add`, { method: "POST", body: fd });
    } else {
      // 回复
      fd.append('targetUser', targetUserDom.value);
      fd.append('pid', pid);
      res = await req(`${API_BASE}/addReply`, { method: "POST", body: fd });
    }
    if (res.ok) {
      contentInput.value = "";
      clearMedia();
      closeEditor();
      // 刷新当前视图
      if(currentView === "detail" && currentViewPid === pid){
        renderSinglePost(currentViewPid);
      } else if (currentView === "list") {
        initLoadPosts();
      }
      // 回复后重置为回复主楼模式
      if (pid) setInputMode("replyPost", pid, null, "");
    }
  } catch (err) {
    alert("提交失败，请稍后重试");
  } finally {
    submitBtn.disabled = false;
  }
});

// ==================== 新增分享功能 开始 ====================
// 分享帖子入口
async function sharePost(pid) {
  closeEditor();
  const baseUrl = location.origin + location.pathname;
  const shareUrl = baseUrl + "#post/" + pid;
  const shareTitle = "留言帖子";

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        url: shareUrl
      });
    } catch (err)
      copyPostUrl(shareUrl);
    }
  } else {
    copyPostUrl(shareUrl);
  }
}

// 复制链接
async function copyPostUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast("帖子链接已复制");
  } catch (err) {
    showToast("复制失败，请手动复制链接");
  }
}

// Toast轻提示控制
let toastTimer = null;
function showToast(text) {
  const toast = document.querySelector(".toast-tip");
  toast.innerText = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}
// ==================== 新增分享功能 结束 ====================

// ===================== WebSocket 心跳 & 连接（原有代码不动） =====================
function startHeartbeat() {
  // ...你原有代码
// ===================== WebSocket 心跳 & 连接（完整保留） =====================
function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "HEARTBEAT" }));
  }, HEARTBEAT_INTERVAL);
}

function initWebSocket() {
  if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
  clearInterval(heartbeatTimer);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("WebSocket 连接成功");
    if (userNick) ws.send(JSON.stringify({ type: "USER_UID", uid: userNick }));
    startHeartbeat();
    setTimeout(async () => {
      if (!userNick) return;
      const notifyRes = await req(`${API_BASE}/getNotify?uid=${encodeURIComponent(userNick)}`);
      const notifyData = await notifyRes.json();
      notifyList = notifyData;
      updateNotifyBadge();
      console.log("[前端] 重连兜底拉取通知完成，条数：", notifyData.length);
    }, 300);
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      console.log("[WS] 收到消息：", data.type, data);
      switch (data.type) {
        case "INIT_DATA":
          notifyList = data.notify || [];
          updateNotifyBadge();
          break;
        case "POST_DATA":
          if (currentView === "list") renderPosts(data.posts || []);
          break;
        case "NOTIFY_DATA":
          notifyList = data.notify || [];
          updateNotifyBadge();
          if (currentView === "notify") renderNotifyList();
          break;
        case "SYS_LOG":
          console[data.level === "error" ? "error" : "log"]("[后端日志]", data.content);
          break;
        case "NEW_POST":
          if (currentView === "list") {
            mainView.insertAdjacentHTML("afterbegin", buildPostHtml(data.item));
          }
          lastData.unshift(data.item);
          break;
        case "NEW_REPLY": {
          const targetPid = data.targetPid;
          const replyItem = data.item;
          const postCard = document.querySelector(`.post-card[data-pid="${targetPid}"]`);
          if (postCard) {
            const replyWrap = postCard.querySelector(".reply-wrap");
            const foldBtn = postCard.querySelector(".fold-btn");
            const toggleWrapper = postCard.querySelector(".toggle-wrapper");
            const { headText, showContent } = getReplyHeadText(replyItem, userNick?.trim() || "");
            const replyHtml = `<div class="reply-item" data-rid="${replyItem.id}" data-pid="${replyItem.msg_id}">
              <div class="reply-head">
                <div class="reply-avatar-row">
                  <img class="reply-avatar" src="${getAvatarUrl(replyItem.r_name)}" alt="头像" onerror="this.style.display='none'">
                  <div class="reply-name">${headText}</div>
                </div>
              </div>
              <div class="reply-time">${replyItem.create_time}</div>
              <div class="reply-text">${showContent}</div>
              ${renderMedia(replyItem.media_urls || "")}
              <div style="text-align:right;margin-top:4px;"><button class="reply-small-btn" onclick="openSubReply(${targetPid},${replyItem.id},'${replyItem.r_name}')">回复</button></div>
            </div>`;
            replyWrap.insertAdjacentHTML("beforeend", replyHtml);
            const allReplies = replyWrap.querySelectorAll(".reply-item");
            foldBtn.dataset.replyCount = allReplies.length;
            if (allReplies.length > 0) {
              toggleWrapper.classList.remove('toggle-wrapper-empty');
            }
          }

          const cachePost = lastData.find(p => Number(p.id) === Number(targetPid));
          if (cachePost && cachePost.replys) cachePost.replys.push(replyItem);
          break;
        }
        case "DELETE_POST":
          const delDom = document.querySelector(`.post-card[data-pid="${data.targetPid}"]`);
          if (delDom) delDom.remove();
          break;
      }
    } catch (err) {
      console.error("WS 消息解析失败", err);
    }
  };

  ws.onclose = () => {
    clearInterval(heartbeatTimer);
    console.log("WebSocket 连接断开，3秒后重连");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = () => {
    clearInterval(heartbeatTimer);
    setTimeout(initWebSocket, 3000);
  };

  let initDataFallbackTimer = setTimeout(() => { if (lastData.length === 0) initLoadPosts(); }, 2000);
  const rawOnMsg = ws.onmessage;
  ws.onmessage = function (e) {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "INIT_DATA") clearTimeout(initDataFallbackTimer);
      rawOnMsg.call(this, e);
    } catch (err) { console.error("WS 消息解析失败", err); }
  };
}

// ===================== 路由与视图控制（核心重构） =====================
function goPostDetail(pid) {
  prevView = currentView;
  location.hash = `post/${pid}`;
}

function goBack() {
  if (currentView === "detail") {
    // 从详情返回，根据 prevView 决定目标
    if (prevView === "notify") {
      location.hash = "notify";
    } else {
      location.hash = "";
    }
  } else if (currentView === "notify") {
    location.hash = "";
  }
}

function updateTopBar() {
  // 更新顶部状态栏文字
  if (currentView === "list") {
    backLink.textContent = "";
    viewTitle.textContent = "帖子列表";
    notifyLink.style.display = "inline";
  } else if (currentView === "notify") {
    backLink.textContent = "← 返回帖子列表";
    viewTitle.textContent = "通知列表";
    notifyLink.style.display = "none";
  } else if (currentView === "detail") {
    backLink.textContent = prevView === "notify" ? "← 返回通知列表" : "← 返回帖子列表";
    viewTitle.textContent = "帖子详情";
    notifyLink.style.display = "inline";
  }
  // 控制顶部发帖按钮：通知页隐藏，列表/详情显示
  if (currentView === "notify") {
    topPostBtn.style.display = "none";
  } else {
    topPostBtn.style.display = "inline";
  }
}

async function renderSinglePost(pid) {
  let targetPost = lastData.find(item => Number(item.id) === Number(pid));
  if (!targetPost) {
    try {
      const res = await req(`${API_BASE}/getPostDetail?id=${pid}`);
      const resData = await res.json();
      if (resData.code === 0 && resData.data) {
        targetPost = resData.data;
        lastData.push(targetPost);
      } else {
        mainView.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:var(--text-second);">
          <p>帖子不存在或已删除</p>
          <button class="text-btn" onclick="goBack()">返回列表</button>
        </div>`;
        return;
      }
    } catch (err) {
      mainView.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:var(--text-second);">
          <p>帖子加载失败</p>
          <button class="text-btn" onclick="goBack()">返回列表</button>
        </div>`;
      return;
    }
  }

  let html = buildPostHtml(targetPost);
  mainView.innerHTML = html;

  // 详情页默认展开回复
  const replyWrap = mainView.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if (replyWrap) replyWrap.style.display = "block";
  const foldBtn = mainView.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (foldBtn) foldBtn.setAttribute("aria-expanded", "true");

  // 自动切换输入框为回复模式
  setInputMode("replyPost", pid, null, targetPost.name);
}

function renderRouteView() {
  closeEditor();
  const hashStr = location.hash.slice(1);
  const pidMatch = hashStr.match(/^post\/(\d+)$/);

  // 清除焦点，解决移动端点击残留蓝边
  document.activeElement?.blur();

  if (hashStr === "notify") {
    currentView = "notify";
    currentViewPid = null;
    renderNotifyList();
    // 通知页禁用发布
    uploadBtn.disabled = true;
    publishForm.querySelector('button[type="submit"]').disabled = true;
    contentInput.disabled = true;
    contentInput.placeholder = "浏览通知时无法发布内容";
  } else if (pidMatch) {
    currentView = "detail";
    currentViewPid = pidMatch[1];
    renderSinglePost(currentViewPid);
    // 详情页启用发布
    uploadBtn.disabled = false;
    publishForm.querySelector('button[type="submit"]').disabled = false;
    contentInput.disabled = false;
  } else {
    currentView = "list";
    currentViewPid = null;
    renderPosts(lastData);
    // 列表页启用发布（发新帖）
    uploadBtn.disabled = false;
    publishForm.querySelector('button[type="submit"]').disabled = false;
    contentInput.disabled = false;
    setInputMode("newPost");
  }

  updateTopBar();
  updateLoadTip();
  scrollToTop();
}

// 顶部返回按钮
backLink.addEventListener("click", goBack);
// ===================== 全局事件 =====================
window.addEventListener("hashchange", renderRouteView);

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !userNick) return;
  try {
    const notifyRes = await req(`${API_BASE}/getNotify?uid=${encodeURIComponent(userNick)}`);
    const notifyData = await notifyRes.json();
    notifyList = notifyData;
    updateNotifyBadge();
    if (currentView === "notify") renderNotifyList();
  } catch (e) {
    console.error("刷新通知失败", e);
  }
});

contentInput.addEventListener('input', () => autoResize(contentInput));

// 页面初始化
window.addEventListener("load", async () => {
  userNick = getCookie('userNick');
  if (!userNick) {
    const newNick = await fetchRandomNick();
    userNick = newNick;
    setCookie("userNick", newNick);
  }
  hidNick.value = userNick;
  userAvatar = getAvatarUrl(userNick);
  initLoadPosts();
  initWebSocket();
  renderRouteView();
  // 顶部发帖按钮点击唤起编辑器（禁止通知页打开）
  topPostBtn.addEventListener("click", () => {
    if (currentView === "notify") return;
    // 已打开则关闭，未打开则新建帖子
    if (showEditor) {
      closeEditor();
    } else {
      openEditor("newPost");
    }
  });
  // ========== 下面两行新增监听全部放这里 ==========
  // 全局监听空白点击关闭编辑器
  document.addEventListener("click", handleClickOutsideEditor);
  // ESC快捷键关闭
  document.addEventListener("keydown", handleEscClose);

  // 编辑器内部点击不触发外部关闭（你要找的这一行）
  editorWrap.addEventListener("click", e => e.stopPropagation());
  // 创建toast提示层
  const toastBox = document.createElement("div");
  toastBox.className = "toast-tip";
  document.body.appendChild(toastBox);
});
