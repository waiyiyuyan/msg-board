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
let popOpen = false;
let isUploading = false;
let postDataList = [];
let lastCursor = "";
let isLoading = false;
let hasMore = true;
let userAvatar = "";
let userNick = "";
let ws = null;
let heartbeatTimer = null;
let prevHash = "";

// ===================== DOM 缓存 =====================
const uploadBtn = document.getElementById("uploadBtn");
const fileSelector = document.getElementById("fileSelector");
const mediaInput = document.getElementById("mediaInput");
const maskDom = document.getElementById('popMask');
const popForm = document.getElementById('popForm');
const textareaDom = popForm.querySelector('textarea');
const hidPid = document.getElementById('hidPid');
const hidRid = document.getElementById('hidRid');
const popNick = document.getElementById('popNick');
const replyTip = document.getElementById('replyTip');
const targetUserDom = document.getElementById('targetUser');
const bellBtn = document.getElementById('bellBtn');
const unReadBadge = document.getElementById('unReadBadge');
const notifyMask = document.getElementById('notifyMask');
const notifyListContent = document.getElementById('notifyListContent');
const readAllBtn = document.getElementById('readAllBtn');
const clearNotifyBtn = document.getElementById('clearNotifyBtn');
const listBox = document.getElementById('listBox');
const noticeFullModal = document.getElementById('noticeFullModal');
const noticeModalContent = document.getElementById('noticeModalContent');
const loadTip = document.getElementById("loadTip");

const pageReadAll = document.getElementById("pageReadAll");
const pageClearAll = document.getElementById("pageClearAll");
const pageNotifyList = document.getElementById("pageNotifyList");
const notifyEmptyTip = document.getElementById("notifyEmptyTip");
// ===================== 通用工具函数 =====================
/** 统一请求封装 */
async function req(url, opt = {}) {
  const baseOpt = { credentials: "include", ...opt };
  const res = await fetch(url, baseOpt);
  return res;
}
/** Cookie 工具 */
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
/** 链接转义 */
function parseLink(text) {
  if (!text) return "";
  const escapeTxt = text.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" })[m]);
  return escapeTxt.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
// 生成头像
function getAvatarUrl(nick) {
  if (!nick) return "";
  return `https://api.dicebear.com/10.x/avataaars/svg?seed=${encodeURIComponent(nick)}`;
}
/** 生成访客昵称 */
async function fetchRandomNick() {
  const randomStr = Math.random().toString(36).slice(2, 7);
  return randomStr;
}
/** 自动缩放输入框 */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
/** 滚动到顶部 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}
/** 获取回复头部文案 */
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
// 全局统一媒体事件委托
listBox.addEventListener("click", function(e) {
  const img = e.target.closest(".msg-media-img");
  if(img) window.open(img.src, "_blank");
});
listBox.addEventListener("error", function(e) {
  const target = e.target;
  if(target.matches(".msg-media-img, .msg-media-video")) {
    target.closest(".msg-media-wrap").style.display = "none";
  }
}, true);
// 视频互斥播放委托
listBox.addEventListener("play", function(e) {
  const vid = e.target.closest(".msg-media-video");
  if(!vid) return;
  document.querySelectorAll(".msg-media-video").forEach(v => {
    if(v !== vid) v.pause();
  });
}, true);

// ===================== 上传模块 =====================
function clearMedia() {
  currentMediaUrl = "";
  mediaInput.value = "";
  const statusEl = document.getElementById('mediaStatus');
  if (statusEl) statusEl.innerHTML = "";
  const progressWrap = document.getElementById('uploadProgressWrap');
  if (progressWrap) progressWrap.style.display = "none";
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
  const submitBtn = popForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  const statusEl = document.getElementById('mediaStatus');
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('progressText');
  if (progressWrap) {
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.innerText = '0%';
  }
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
          progressBar.style.width = p + "%";
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
    if (statusEl) statusEl.innerHTML = `<div style="display: inline-flex; align-items: center; gap: 8px;"><span style="color:#34c759; font-size:14px; line-height: 1;">上传成功</span><button class="reply-small-btn del-btn" onclick="clearMedia()" style="margin-top: 0;">移除</button></div>`;
  } catch (err) {
    let errMsg = "上传失败，请重试";
    if (err.message.includes("1101") || err.message.includes("Worker threw exception")) errMsg = "文件过大，上传失败，请压缩后重试";
    if (statusEl) statusEl.innerHTML = `<span class='err-text'>${errMsg}</span>`;
    console.error("上传错误：", err);
  } finally {
    if (progressWrap) progressWrap.style.display = 'none';
    uploadBtn.disabled = false;
    isUploading = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}
if (uploadBtn && fileSelector) {
  uploadBtn.addEventListener("click", () => fileSelector.click());
  fileSelector.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const checkRes = checkFile(file);
    if (!checkRes.ok) {
      const statusEl = document.getElementById('mediaStatus');
      if (statusEl) statusEl.innerHTML = `<span class='err-text'>${checkRes.msg}</span>`;
      fileSelector.value = "";
      return;
    }
    await uploadFile(file);
    fileSelector.value = "";
  });
}

// ===================== 帖子 & 回复渲染 =====================
function buildPostHtml(post, isModal = false) {
  let rHtml = '';
  const myNick = userNick?.trim() || "";
  if (post.replys && post.replys.length > 0) {
    post.replys.forEach((r, index) => {
      const extraBtn = "";
      const { headText, showContent } = getReplyHeadText(r, myNick);
      rHtml += `<div class="reply-item" data-rid="${r.id}" data-pid="${r.msg_id}">
        <div class="reply-head">
          <div class="reply-avatar-row" style="display: flex; align-items: center; gap: 6px;">
            <img class="reply-avatar" src="${getAvatarUrl(r.r_name)}" alt="头像" onerror="this.style.display='none'">
            <div class="reply-name">${headText}</div>
          </div>
        </div>
        <div class="reply-time">${r.create_time.slice(0,16)}</div>
        <div class="reply-text">${showContent}</div>
        ${renderMedia(r.media_urls || "")}
        <div style="text-align:right;margin-top:4px;">${extraBtn}<button class="reply-small-btn" onclick="openSubReplyPop(${post.id},${r.id},'${r.r_name}')">回复</button></div>
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
      <div class="post-btn-group"><button class="reply-small-btn" onclick="openReplyPop(${post.id},'${post.name}')">回复</button></div>
    </div>
    <div class="reply-wrap" data-wrap-pid="${post.id}" style="display:none">${rHtml}</div>
  </div>`;
}
function renderPosts(data) {
  lastData = data;
  listBox.innerHTML = data.map(post => buildPostHtml(post)).join("");
  console.log(`[前端] 帖子渲染完成，共 ${data.length} 条，最新ID：${data[0]?.id}`);
}

// ===================== 分页逻辑 =====================
function updateLoadTip() {
  if (!loadTip) return;
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
      postDataList = data.list;
      lastData = [...data.list];
      lastCursor = data.lastCursor;
      hasMore = data.hasMore;
      renderPosts(lastData);
      console.log("[分页] 初始化完成，加载", data.list.length, "条");
    }
  } catch (e) {
    console.error("[分页] 初始化加载失败", e);
    if (loadTip) loadTip.innerText = "加载失败，刷新重试";
  } finally {
    isLoading = false;
    updateLoadTip();
  }
}
async function loadMorePosts() {
  if (isLoading || !hasMore) return;
  isLoading = true;
  updateLoadTip();
  try {
    const res = await req(`${API_BASE}/loadMorePosts?cursor=${lastCursor}`);
    const data = await res.json();
    if (data.code === 0 && data.list.length > 0) {
      postDataList.push(...data.list);
      lastData.push(...data.list);
      lastCursor = data.lastCursor;
      hasMore = data.hasMore;
      const newHtml = data.list.map(post => buildPostHtml(post)).join("");
      listBox.insertAdjacentHTML("beforeend", newHtml);
      console.log("[分页] 追加加载完成，新增", data.list.length, "条");
    } else hasMore = false;
  } catch (e) {
    console.error("[分页] 加载更多失败", e);
    if (loadTip) loadTip.innerText = "加载失败，上滑重试";
  } finally {
    isLoading = false;
    updateLoadTip();
  }
}
document.addEventListener("DOMContentLoaded", () => {
  if (loadTip) loadTip.addEventListener("click", () => hasMore ? loadMorePosts() : scrollToTop());
});
// 全局委托折叠按钮点击
listBox.addEventListener("click", e => {
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

// ===================== 通知模块 =====================
function renderNotify() {
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
  unReadBadge.style.display = unReadCount > 0 ? 'inline' : 'none';
  unReadBadge.innerText = unReadCount > 99 ? '99+' : unReadCount;
  if (readAllBtn && clearNotifyBtn) {
    readAllBtn.disabled = notifyList.length === 0 || unReadCount === 0;
    clearNotifyBtn.disabled = notifyList.length === 0;
    readAllBtn.style.cursor = readAllBtn.disabled ? "not-allowed" : "pointer";
    clearNotifyBtn.style.cursor = clearNotifyBtn.disabled ? "not-allowed" : "pointer";
  }
  notifyListContent.innerHTML = notifyList.length === 0
    ? '<div class="empty-tip">暂无消息通知</div>'
    : notifyList.map(item => {
        const isRead = item.is_read === 1;
        return `<div class="notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
          <div><div class="notify-txt" ${isRead ? 'style="color:#999"' : ''}>${isRead ? '' : '● '}${item.reply_name} 回复了你：${item.reply_preview}</div><div class="notify-time">${item.create_time.slice(0,16)}</div></div>
        </div>`;
      }).join("");
}

function renderPageNotify() {
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
  // 原来错误：const opBar = document.getElementById("notifyOpBar");
  // 修正为页面上真实ID notifyOpBarPage
  const opBar = document.getElementById("notifyOpBarPage");

  // 列表为空 → 隐藏按钮栏
  if (notifyList.length === 0) {
    opBar.style.display = "none";
    pageNotifyList.innerHTML = "";
    notifyEmptyTip.style.display = "block";
    return;
  }

  // 有通知时显示按钮栏，并控制按钮禁用
  opBar.style.display = "flex";
  pageReadAll.disabled = unReadCount === 0;
  pageClearAll.disabled = false;

  notifyEmptyTip.style.display = "none";
  pageNotifyList.innerHTML = notifyList.map(item => {
    const isRead = item.is_read === 1;
    return `<div class="page-notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
      <div class="page-notify-text ${isRead ? '' : 'unread'}">${item.reply_name} 回复了你：${item.reply_preview}</div>
      <div class="page-notify-time">${item.create_time.slice(0,16)}</div>
    </div>`;
  }).join("");
}
async function jumpPost(nid, pid, rid) {
  const fd = new FormData();
  fd.append('nid', nid);
  await req(`${API_BASE}/setRead?uid=${encodeURIComponent(userNick)}`, { method: "POST", body: fd });
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
  readAllBtn.disabled = true;
  try {
    await req(`${API_BASE}/readAllNotify?uid=${uid}`, { method: "POST" });
    notifyList.forEach(item => item.is_read = 1);
    renderNotify();
  } catch (err) {
    console.error("全部已读出错：", err);
    alert("网络异常");
  } finally {
    readAllBtn.disabled = false;
  }
}
async function clearAllNotify() {
  if (notifyList.length === 0) return;
  const uid = encodeURIComponent(userNick);
  clearNotifyBtn.disabled = true;
  try {
    await req(`${API_BASE}/clearAllNotify?uid=${uid}`, { method: "POST" });
    notifyList = [];
    renderNotify();
  } catch (err) {
    console.error("清空通知出错：", err);
    alert("网络异常");
  } finally {
    clearNotifyBtn.disabled = false;
  }
}

bellBtn.onclick = () => {
  // 关闭所有弹窗
  if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
  if (popOpen) { maskDom.style.display = 'none'; popForm.reset(); popOpen = false; }
  // 跳转到通知路由页
  location.hash = "notify";
};
notifyMask.addEventListener('click', e => { if (e.target === notifyMask) notifyMask.style.display = 'none'; });

// ===================== 回复弹窗 =====================
function fillReplyPopup(pid, rid, targetName) {
  hidPid.value = pid;
  hidRid.value = rid || "";
  targetUserDom.value = targetName;
  textareaDom.value = '';
  textareaDom.placeholder = '分享你的想法';
  replyTip.style.display = 'block';
  replyTip.innerText = `回复 @${targetName}`;
  maskDom.style.display = 'flex';
  popOpen = true;
  autoResize(textareaDom);
  const popAvatar = document.getElementById('popupUserAvatar');
  const popNickText = document.getElementById('popupUserNick');
  if (popAvatar) popAvatar.src = userAvatar;
  if (popNickText) popNickText.innerText = userNick;
}
function openReplyPop(pid, targetName) {
  
  fillReplyPopup(pid, "", targetName);
}
function openSubReplyPop(pid, rid, targetName) {
  
  fillReplyPopup(pid, rid, targetName);
}

// ===================== 发帖弹窗 & 提交 =====================
document.getElementById('openPopBtn').onclick = () => {
  if (popOpen) {
    maskDom.style.display = 'none';
    popForm.reset();
    popOpen = false;
  } else {
    hidPid.value = '';
    hidRid.value = '';
    targetUserDom.value = '';
    textareaDom.value = '';
    textareaDom.placeholder = '有什么新鲜事？';
    replyTip.style.display = 'none';
    maskDom.style.display = 'flex';
    popOpen = true;
    autoResize(textareaDom);
    const popAvatar = document.getElementById('popupUserAvatar');
    const popNickText = document.getElementById('popupUserNick');
    if (popAvatar) popAvatar.src = userAvatar;
    if (popNickText) popNickText.innerText = userNick;
  }
};
popForm.onsubmit = async function (e) {
  e.preventDefault();
  if (isUploading) { alert("图片正在上传，请稍后再发布！"); return; }
  const content = textareaDom.value.trim();
  const hasImg = mediaInput.value.trim() !== "";
  if (!content && !hasImg) { alert("请输入内容或上传图片"); return; }
  const fd = new FormData(this);
  const pid = hidPid.value;
  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    let res;
    if (!pid) res = await req(`${API_BASE}/add`, { method: "POST", body: fd });
    else {
      fd.append('targetUser', targetUserDom.value);
      fd.append('pid', pid);
      res = await req(`${API_BASE}/addReply`, { method: "POST", body: fd });
    }
    if (res.ok) {
      maskDom.style.display = 'none';
      popForm.reset();
      clearMedia();
      popOpen = false;
      textareaDom.placeholder = '';
      // 新增：如果当前在该帖子详情，重新渲染页面立刻显示新回复
      if(currentViewPid && currentViewPid === pid){
        renderSinglePost(pid);
      }
    }
  } catch (err) {
    alert("提交失败，请稍后重试");
  } finally {
    submitBtn.disabled = false;
  }
};
maskDom.addEventListener('click', e => {
  if (e.target === maskDom) {
    maskDom.style.display = 'none';
    popForm.reset();
    clearMedia();
    popOpen = false;
    textareaDom.placeholder = '';
  }
});
async function delPost(postId) {
  if (!confirm("确定要删除该帖子吗？\n帖子、所有回复、相关通知都会一并清空！")) return;
  try { await req(`${API_BASE}/del?id=${postId}`); } catch (err) { console.error("删帖出错：", err); alert("网络异常"); }
}

// ===================== WebSocket 心跳 & 连接 =====================
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
      renderNotify();
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
          renderNotify();
          break;
        case "POST_DATA":
          renderPosts(data.posts || []);
          break;
        case "NOTIFY_DATA":
          notifyList = data.notify || [];
          renderNotify();
          if (location.hash.slice(1) === "notify") {
            renderPageNotify();
          }
          break;
        case "SYS_LOG":
          console[data.level === "error" ? "error" : "log"]("[后端日志]", data.content);
          break;
        case "NEW_POST":
          listBox.insertAdjacentHTML("afterbegin", buildPostHtml(data.item));
          lastData.unshift(data.item);
          break;
        case "NEW_REPLY": {
          const targetPid = data.targetPid;
          const replyItem = data.item;
          const postCard = document.querySelector(`.post-card[data-pid="${targetPid}"]`);
          if (!postCard) break;
          const replyWrap = postCard.querySelector(".reply-wrap");
          const foldBtn = postCard.querySelector(".fold-btn");
          const toggleWrapper = postCard.querySelector(".toggle-wrapper");
          const { headText, showContent } = getReplyHeadText(replyItem, userNick?.trim() || "");
          const extraBtn = "";
          const replyHtml = `<div class="reply-item" data-rid="${replyItem.id}" data-pid="${replyItem.msg_id}">
            <div class="reply-head">
              <div class="reply-avatar-row" style="display: flex; align-items: center; gap: 6px;">
                <img class="reply-avatar" src="${getAvatarUrl(replyItem.r_name)}" alt="头像" onerror="this.style.display='none'">
                <div class="reply-name">${headText}</div>
              </div>
            </div>
            <div class="reply-time">${replyItem.create_time}</div>
            <div class="reply-text">${showContent}</div>
            ${renderMedia(replyItem.media_urls || "")}
            <div style="text-align:right;margin-top:4px;">${extraBtn}<button class="reply-small-btn" onclick="openSubReplyPop(${targetPid},${replyItem.id},'${replyItem.r_name}')">回复</button></div>
          </div>`;
          replyWrap.insertAdjacentHTML("beforeend", replyHtml);
          const allReplies = replyWrap.querySelectorAll(".reply-item");
          foldBtn.style.color = "";
          foldBtn.style.cursor = "";
          toggleWrapper.style.cursor = "";
        
          // 【先更新首页回复数字】
          foldBtn.dataset.replyCount = allReplies.length;
          if (allReplies.length > 0) {
            toggleWrapper.classList.remove('toggle-wrapper-empty');
          }
        
          // 同步更新详情页评论区
          if (currentViewPid && currentViewPid == targetPid) {
            const detailWrap = document.querySelector(`#noticeFullModal .reply-wrap[data-wrap-pid="${targetPid}"]`);
            if(detailWrap){
              const { headText, showContent } = getReplyHeadText(replyItem, userNick?.trim() || "");
              const extraBtn = "";
              const replyHtml = `<div class="reply-item" data-rid="${replyItem.id}" data-pid="${replyItem.msg_id}">
                <div class="reply-head">
                  <div class="reply-avatar-row" style="display: flex; align-items: center; gap: 6px;">
                    <img class="reply-avatar" src="${getAvatarUrl(replyItem.r_name)}" alt="头像" onerror="this.style.display='none'">
                    <div class="reply-name">${headText}</div>
                  </div>
                </div>
                <div class="reply-time">${replyItem.create_time}</div>
                <div class="reply-text">${showContent}</div>
                ${renderMedia(replyItem.media_urls || "")}
                <div style="text-align:right;margin-top:4px;">${extraBtn}<button class="reply-small-btn" onclick="openSubReplyPop(${targetPid},${replyItem.id},'${replyItem.r_name}')">回复</button></div>
              </div>`;
              detailWrap.insertAdjacentHTML("beforeend", replyHtml);
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

// ===================== 页面初始化入口 =====================
textareaDom.addEventListener('input', () => autoResize(textareaDom));
window.addEventListener("load", async () => {
  initLoadPosts();
  initWebSocket();
  userNick = getCookie('userNick');
  if (userNick) {
    popNick.value = userNick;
    userAvatar = getAvatarUrl(userNick);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "USER_UID", uid: userNick }));
  } else {
    const newNick = await fetchRandomNick();
    userNick = newNick;
    setCookie("userNick", newNick);
    userAvatar = getAvatarUrl(newNick);
    popNick.value = newNick;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "USER_UID", uid: newNick }));
  }
  renderRouteView();
});

// ========== 路由分页逻辑 ==========
let currentViewPid = null;

function goPostDetail(pid) {
  location.hash = `post/${pid}`;
}
function goHome() {
  if (prevHash === "#notify") {
    location.hash = "notify";
  } else {
    location.hash = "";
  }
}

function renderRouteView() {
  const hashStr = location.hash.slice(1);
  const pidMatch = hashStr.match(/^post\/(\d+)$/);
  const listWrap = document.getElementById("listBox");
  const detailWrap = document.getElementById("noticeFullModal");
  const navBack = document.querySelector(".cli-nav-back");
  const navBtns = document.querySelector(".cli-nav-buttons");
  const notifyPage = document.getElementById("notifyPage");
  const loadTipDom = document.getElementById("loadTip");

  // 保存当前完整hash，作为下一页的来源记录
  const currentHash = location.hash;

  // 通知页面路由 #notify
  if (hashStr === "notify") {
    currentViewPid = null;
    listWrap.style.display = "none";
    detailWrap.style.display = "none";
    notifyPage.style.display = "block";
    navBack.style.display = "block";
    navBtns.style.display = "none";
    loadTipDom.style.display = "none";
    renderPageNotify();
  } else if (pidMatch) {
    // 进入帖子详情，记录上一页hash
    prevHash = currentHash;
    currentViewPid = pidMatch[1];
    listWrap.style.display = "none";
    detailWrap.style.display = "block";
    notifyPage.style.display = "none";
    navBack.style.display = "block";
    navBtns.style.display = "none";
    loadTipDom.style.display = "none";
    renderSinglePost(currentViewPid);
  } else {
    // 首页
    currentViewPid = null;
    listWrap.style.display = "block";
    detailWrap.style.display = "none";
    notifyPage.style.display = "none";
    navBack.style.display = "none";
    navBtns.style.display = "flex";
    loadTipDom.style.display = "block";
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
        noticeModalContent.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:var(--text-second);">
          <p>帖子不存在或已删除</p>
          <button class="btn" onclick="goHome()">返回列表</button>
        </div>`;
        return;
      }
    } catch (err) {
      noticeModalContent.innerHTML = `
        <div style="text-align:center;padding:50px 20px;color:var(--text-second);">
          <p>帖子加载失败</p>
          <button class="btn" onclick="goHome()">返回列表</button>
        </div>`;
      return;
    }
  }

  let html = buildPostHtml(targetPost, true);
  noticeModalContent.innerHTML = html;

  const replyWrap = noticeModalContent.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if (replyWrap) replyWrap.style.display = "block";
  const foldBtn = noticeModalContent.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (foldBtn) foldBtn.setAttribute("aria-expanded", "true");
}

// 通知页按钮绑定
pageReadAll.onclick = async () => {
  await readAllNotify();
  renderPageNotify();
  renderNotify(); // 更新顶部小红点
};
pageClearAll.onclick = async () => {
  await clearAllNotify();
  renderPageNotify();
  renderNotify(); // 更新顶部小红点
};

window.addEventListener("hashchange", renderRouteView);
