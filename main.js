// ===================== 接口地址 =====================
const API_BASE = "https://mbapi.lovefree.de5.net";
const UPLOAD_API = API_BASE + "/proxyUpload";

let currentMediaUrl = "";
const uploadBtn = document.getElementById("uploadBtn");
const fileSelector = document.getElementById("fileSelector");
const mediaPreview = document.getElementById("mediaBox");
const mediaInput = document.getElementById("mediaInput");

function clearMedia() {
  currentMediaUrl = "";
  mediaInput.value = "";
  mediaPreview.innerHTML = "";
  uploadBtn.disabled = false;
}

if (uploadBtn && fileSelector) {
  uploadBtn.addEventListener("click", function () {
    fileSelector.click();
  });

  function checkFile(file) {
    const allowMime = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowMime.includes(file.type)) return { ok: false, msg: "仅支持 JPG/PNG/GIF/WEBP 图片" };
    if (file.size === 0) return { ok: false, msg: "文件无效，请重新选择" };
    if (file.size > 50 * 1024 * 1024) return { ok: false, msg: "文件不能超过50MB" };
    return { ok: true };
  }

  async function uploadFile(file) {
    clearMedia();
    mediaPreview.innerHTML = `<div class="spin-loader"></div>`;
    uploadBtn.disabled = true;
    isUploading = true;
    const submitBtn = popForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(UPLOAD_API, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("图床服务异常");
      const json = await res.json();
      if (!json.url) throw new Error("返回数据异常");

      currentMediaUrl = json.url;
      mediaInput.value = json.url;
      mediaPreview.innerHTML = `
        <span style="color:#34c759; font-size:14px;">上传成功</span>
        <button class="btn del-btn" onclick="clearMedia()" style="padding:4px 10px; font-size:12px;">移除</button>
      `;
    } catch (err) {
      let errMsg = "上传失败，请重试";
      if (err.message.includes("1101") || err.message.includes("Worker threw exception")) errMsg = "文件过大，上传失败，请压缩后重试";
      mediaPreview.innerHTML = `<span class='err-text'>${errMsg}</span>`;
      console.error("上传错误：", err);
    } finally {
      uploadBtn.disabled = false;
      isUploading = false;
      const submitBtn = popForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  fileSelector.addEventListener("change", async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const checkRes = checkFile(file);
    if (!checkRes.ok) {
      mediaPreview.innerHTML = `<span class='err-text'>${checkRes.msg}</span>`;
      fileSelector.value = "";
      return;
    }
    await uploadFile(file);
    fileSelector.value = "";
  });
}

// Cookie 工具
function setCookie(name, val, day = 30) {
  const d = new Date();
  d.setTime(d.getTime() + day * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax;Secure`;
}
function getCookie(name) {
  const arr = document.cookie.split('; ');
  for (const item of arr) {
    const kv = item.split('=');
    if (kv[0] === name) return decodeURIComponent(kv[1]);
  }
  return '';
}

// 链接转义
function parseLink(text) {
  if (!text) return "";
  let escapeTxt = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const linkReg = /(https?:\/\/[^\s<>"]+)/g;
  return escapeTxt.replace(linkReg, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// 全局数据缓存
let foldReplyIds = [];
let lastData = [];
let notifyList = [];
let popOpen = false;
let isUploading = false;

// DOM 节点缓存
const imgPreviewMask = document.getElementById('imgPreviewMask');
const previewImg = document.getElementById('previewImg');
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

// textarea 自适应高度
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
textareaDom.addEventListener('input', () => autoResize(textareaDom));

// 昵称生成
let userNick = getCookie('userNick');
const adj = ['晚风', '青禾', '屿鹿', '星眠', '浅墨', '雾野', '秋辞', '南栀', '枕雪', '临江'];
const noun = ['清茶', '星河', '孤岛', '落日', '白舟', '云笺', '寒川', '青衫', '暮雪', '闲舟'];
async function createNewNick() {
  const maxTry = 20;
  let tryCount = 0;
  while (tryCount < maxTry) {
    tryCount++;
    const randName = adj[Math.floor(Math.random() * adj.length)] + "_" + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 900 + 100);
    const res = await fetch(`${API_BASE}/checkNick?nick=${encodeURIComponent(randName)}`, { credentials: "include" });
    const json = await res.json();
    if (!json.exist) {
      setCookie('userNick', randName);
      return randName;
    }
  }
  const fallbackName = "访客_" + Math.random().toString(36).slice(2, 8);
  setCookie('userNick', fallbackName);
  return fallbackName;
}

// 回复展开/收起
function toggleReplyFold(pid) {
  const pidNum = Number(pid);
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (!wrap || !btn) return;
  const total = wrap.querySelectorAll(".reply-item").length;
  if (foldReplyIds.includes(pidNum)) {
    foldReplyIds = foldReplyIds.filter(x => x !== pidNum);
    wrap.style.display = 'none';
    btn.innerText = total + '条回复 ▶';
  } else {
    foldReplyIds.push(pidNum);
    wrap.style.display = 'block';
    btn.innerText = total + '条回复 ▼';
  }
}

// 渲染单条帖子HTML
function buildPostHtml(post) {
  let rHtml = '';
  if (post.replys && post.replys.length > 0) {
    post.replys.forEach((r, index) => {
      let extraBtn = index === post.replys.length - 1
        ? `<button class="reply-small-btn" style="margin-right:8px;" onclick="closeReply(${post.id})">收起</button>`
        : "";
      const myNick = userNick?.trim() || "";
      const rawContent = parseLink(r.r_content);
      let headText = r.r_name;
      let showContent = rawContent;

      if (r.to_user) {
        const replySender = r.r_name;
        const replyTarget = r.to_user;
        if (replySender === myNick) headText = `你 回复了 ${replyTarget}`;
        else if (replyTarget === myNick) headText = `${r.r_name} 回复了你`;
        else headText = `${r.r_name} 回复了 ${r.to_user}`;
      } else {
        const reg = /^回复\s+(.+?)：/;
        const match = rawContent.match(reg);
        if (match) {
          const oldTarget = match[1];
          const replySender = r.r_name;
          if (replySender === myNick) headText = `你 回复了 ${oldTarget}`;
          else if (oldTarget === myNick) headText = `${r.r_name} 回复了你`;
          else headText = `${r.r_name} 回复了 ${oldTarget}`;
          showContent = rawContent.replace(reg, "");
        }
      }

      showContent = showContent || '';
      rHtml += `<div class="reply-item" data-rid="${r.id}">
        <div class="reply-head">
          <div class="reply-name">${headText}</div>
          <div class="reply-time">${r.create_time}</div>
        </div>
        <div class="reply-text">${showContent}</div>
        ${renderMedia(r.media_urls || "")}
        <div style="text-align:right;margin-top:4px;">
          ${extraBtn}
          <button class="reply-small-btn" onclick="openSubReplyPop(${post.id},${r.id},'${r.r_name}')">回复</button>
        </div>
      </div>`;
    });
  }
  return `<div class="post-card" data-pid="${post.id}">
    <div class="post-info">
      <span class="post-author">${post.name}</span>
      <span class="post-time">${post.create_time}</span>
    </div>
    <div class="post-content">${parseLink(post.content)}</div>
    ${renderMedia(post.media_urls || "")}
    <div class="post-btn-group">
      <button class="reply-small-btn" onclick="openReplyPop(${post.id},'${post.name}')">回复</button>
    </div>
    <div class="divider"></div>
    <div class="toggle-wrapper" data-pid="${post.id}" style="${post.replys.length === 0 ? 'cursor:default;' : 'cursor:pointer;'}">
      <button class="fold-btn" data-fold-pid="${post.id}" style="${post.replys.length === 0 ? 'color:#999;cursor:default;' : ''}">
        ${post.replys.length}条回复 ${post.replys.length > 0 ? (foldReplyIds.includes(post.id) ? '▼' : '▶') : ''}
      </button>
    </div>
    <div class="reply-wrap" data-wrap-pid="${post.id}" style="${!foldReplyIds.includes(post.id) || post.replys.length === 0 ? 'display:none' : ''}">${rHtml}</div>
  </div>`;
}

// 渲染图片
function renderMedia(mediaUrl) {
  if (!mediaUrl) return "";
  const lowerUrl = mediaUrl.toLowerCase();
  if (lowerUrl.endsWith(".png") || lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg") || lowerUrl.endsWith(".gif") || lowerUrl.endsWith(".webp")) {
    return `<img class="msg-media-img" src="${mediaUrl}" alt="">`;
  }
  return "";
}

// 渲染通知列表 + 按钮状态
function renderNotify() {
  const totalNotify = notifyList.length;
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;

  setTimeout(() => {
    unReadBadge.style.display = unReadCount > 0 ? 'grid' : 'none';
    unReadBadge.innerText = unReadCount > 99 ? '99+' : unReadCount;
  }, 20);
  
  if (readAllBtn && clearNotifyBtn) {
    if (totalNotify === 0) {
      readAllBtn.disabled = true;
      clearNotifyBtn.disabled = true;
      readAllBtn.style.cursor = "not-allowed";
      clearNotifyBtn.style.cursor = "not-allowed";
    } else if (unReadCount === 0) {
      readAllBtn.disabled = true;
      clearNotifyBtn.disabled = false;
      readAllBtn.style.cursor = "not-allowed";
      clearNotifyBtn.style.cursor = "pointer";
    } else {
      readAllBtn.disabled = false;
      clearNotifyBtn.disabled = false;
      readAllBtn.style.cursor = "pointer";
      clearNotifyBtn.style.cursor = "pointer";
    }
  }

  if (notifyList.length === 0) {
    notifyListContent.innerHTML = '<div class="empty-tip">暂无消息通知</div>';
    return;
  }
  let html = '';
  notifyList.forEach(item => {
    const isRead = item.is_read === 1;
    const textStyle = isRead ? 'style="color:#999"' : '';
    const dot = isRead ? '' : '● ';
    html += `<div class="notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
      <div>
        <div class="notify-txt" ${textStyle}>${dot}${item.reply_name}@了你：${item.reply_preview}</div>
        <div class="notify-time">${item.create_time}</div>
      </div>
    </div>`;
  });
  notifyListContent.innerHTML = html;

  
}

// 跳转帖子 + 标记已读
async function jumpPost(nid, pid, rid) {
  const fd = new FormData();
  fd.append('nid', nid);
  const uid = encodeURIComponent(userNick);
  await fetch(`${API_BASE}/setRead?uid=${uid}`, {
    method: "POST",
    body: fd,
    credentials: "include"
  });

  notifyMask.style.display = 'none';
  const pidNum = Number(pid);
  if (!foldReplyIds.includes(pidNum)) foldReplyIds.push(pidNum);

  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const foldBtn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (wrap) wrap.style.display = "block";
  if (foldBtn) foldBtn.innerText = `${wrap.querySelectorAll(".reply-item").length}条回复 ▼`;

  const postDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
  if (postDom) postDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    const replyDom = document.querySelector(`.reply-item[data-rid="${rid}"]`);
    if (replyDom) {
      replyDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
      replyDom.classList.add('flash');
      replyDom.addEventListener('animationend', () => replyDom.classList.remove('flash'), { once: true });
    }
  }, 120);
}

// 全部标记通知已读
async function readAllNotify() {
  const readAllBtn = document.getElementById('readAllBtn');
  const uid = encodeURIComponent(userNick);
  readAllBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/readAllNotify?uid=${uid}`, {
      method: "POST",
      credentials: "include"
    });
    // 本地更新：把所有通知标记为已读，即时刷新UI
    notifyList.forEach(item => {
      item.is_read = 1;
    });
    renderNotify();
  } catch (err) {
    console.error("全部已读出错：", err);
    alert("网络异常");
  } finally {
    readAllBtn.disabled = false;
  }
}

async function clearAllNotify() {
  const clearBtn = document.getElementById('clearNotifyBtn');
  const uid = encodeURIComponent(userNick);
  if (notifyList.length === 0) return;

  clearBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/clearAllNotify?uid=${uid}`, {
      method: "POST",
      credentials: "include"
    });
    // 本地清空通知列表，即时刷新UI
    notifyList = [];
    renderNotify();
  } catch (err) {
    console.error("清空通知出错：", err);
    alert("网络异常");
  } finally {
    clearBtn.disabled = false;
  }
}

// 通知铃铛点击
bellBtn.onclick = () => {
  if (notifyMask.style.display === 'flex') {
    notifyMask.style.display = 'none';
  } else {
    if (popOpen) {
      maskDom.style.display = 'none';
      popForm.reset();
      popOpen = false;
    }
    renderNotify();
    notifyMask.style.display = 'flex';
  }
};

// 渲染帖子列表（修复顺序颠倒问题：最新帖子在最顶部）
function renderPosts(data) {
  lastData = data;
  const keepFoldIds = [...foldReplyIds];
  let allHtml = "";

  // 按数组顺序拼接所有帖子（后端已按DESC排序，直接拼接即可）
  data.forEach(post => {
    allHtml += buildPostHtml(post);
  });

  // 一次性赋值，避免多次DOM操作+顺序颠倒
  listBox.innerHTML = allHtml;

  // 还原展开状态（原有逻辑不变）
  foldReplyIds = keepFoldIds;
  foldReplyIds.forEach(pid => {
    const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
    const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
    if (wrap) wrap.style.display = "block";
    if (btn) btn.innerText = `${wrap.querySelectorAll(".reply-item").length}条回复 ▼`;
  });
  bindFoldBtn();
  bindMediaEvents(listBox);

  // 新增：渲染完成后打印日志，确认渲染了多少条
  console.log(`[前端] 帖子渲染完成，共 ${data.length} 条，最新ID：${data[0]?.id}`);
}

function bindFoldBtn() {
  document.querySelectorAll('.fold-btn:not([data-btn-bound])').forEach(btn => {
    btn.dataset.btnBound = "true";
    btn.onclick = function (e) {
      e.stopPropagation();
      toggleReplyFold(this.dataset.foldPid);
    };
  });
}

document.querySelector("#listBox").addEventListener("click", function (e) {
  const wrapper = e.target.closest(".toggle-wrapper");
  if (!wrapper) return;
  const pid = wrapper.dataset.pid;
  const replyWrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if (!replyWrap || replyWrap.querySelectorAll(".reply-item").length === 0) return;
  toggleReplyFold(pid);
});

function closeReply(pid) {
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const foldBtn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  const total = wrap?.querySelectorAll('.reply-item').length || 0;
  foldReplyIds = foldReplyIds.filter(x => x !== pid);
  if (wrap) wrap.style.display = 'none';
  if (foldBtn) foldBtn.innerText = total + '条回复 ▶';
}

// ===================== 【新增】回复弹窗函数（解决onclick未定义错误） =====================
// 回复主帖子
function openReplyPop(pid, targetName) {
  if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
  hidPid.value = pid;
  hidRid.value = '';
  targetUserDom.value = targetName;
  textareaDom.value = '';
  textareaDom.placeholder = '';
  // textareaDom.placeholder = `回复 ${targetName}`;
  replyTip.style.display = 'block';
  replyTip.innerText = `回复 @${targetName}`;
  maskDom.style.display = 'flex';
  popOpen = true;
  autoResize(textareaDom);
  textareaDom.focus();
}

// 回复子回复（楼中楼）
function openSubReplyPop(pid, rid, targetName) {
  if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
  hidPid.value = pid;
  hidRid.value = rid;
  targetUserDom.value = targetName;
  textareaDom.value = '';
  textareaDom.placeholder = '';
  // textareaDom.placeholder = `回复 ${targetName}`;
  replyTip.style.display = 'block';
  replyTip.innerText = `回复 @${targetName}`;
  maskDom.style.display = 'flex';
  popOpen = true;
  autoResize(textareaDom);
  textareaDom.focus();
}
// =====================================================================================

// 删帖
async function delPost(postId) {
  if (!confirm("确定要删除该帖子吗？\n帖子、所有回复、相关通知都会一并清空！")) return;
  try {
    await fetch(`${API_BASE}/del?id=${postId}`, {
      method: "GET",
      credentials: "include"
    });
  } catch (err) {
    console.error("删帖出错：", err);
    alert("网络异常");
  }
}

// 弹窗打开
document.getElementById('openPopBtn').onclick = () => {
  if (popOpen) {
    maskDom.style.display = 'none';
    popForm.reset();
    popOpen = false;
  } else {
    if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
    hidPid.value = '';
    hidRid.value = '';
    targetUserDom.value = '';
    textareaDom.value = '';
    textareaDom.placeholder = '有什么新鲜事？';
    replyTip.style.display = 'none';
    maskDom.style.display = 'flex';
    popOpen = true;
    autoResize(textareaDom);
    // 新增：发帖弹窗打开后，输入框自动获取焦点
    textareaDom.focus();
  }
};

// 发帖/回复提交
popForm.onsubmit = async function (e) {
  e.preventDefault();
  if (isUploading) {
    alert("图片正在上传，请稍后再发布！");
    return;
  }
  const content = textareaDom.value.trim();
  const hasImg = mediaInput.value.trim() !== "";
  if (!content && !hasImg) {
    alert("请输入内容或上传图片");
    return;
  }

  const fd = new FormData(this);
  const pid = hidPid.value;
  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    let res;
    if (!pid) {
      res = await fetch(`${API_BASE}/add`, { method: "POST", body: fd, credentials: "include" });
    } else {
      fd.append('targetUser', targetUserDom.value);
      fd.append('pid', pid);
      res = await fetch(`${API_BASE}/addReply`, { method: "POST", body: fd, credentials: "include" });
    }
    if (res.ok) {
      maskDom.style.display = 'none';
      popForm.reset();
      clearMedia();
      popOpen = false;
      // 提交关闭弹窗，同步清空占位文字
      textareaDom.placeholder = '';
    }
  } catch (err) {
    alert("提交失败，请稍后重试");
  } finally {
    submitBtn.disabled = false;
  }
};

maskDom.addEventListener('click', function (e) {
  if (e.target === maskDom) {
    maskDom.style.display = 'none';
    popForm.reset();
    clearMedia();
    popOpen = false;
    textareaDom.placeholder = '';
  }
});
notifyMask.addEventListener('click', function (e) {
  if (e.target === notifyMask) notifyMask.style.display = 'none';
});

function bindMediaEvents(container) {
  container.querySelectorAll('.msg-media-img:not([data-event-bound])').forEach(img => {
    img.dataset.eventBound = "true";
    img.style.cursor = "zoom-in";
    img.onclick = function () {
      previewImg.src = this.src;
      imgPreviewMask.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    };
    img.onerror = function () { this.style.display = 'none'; };
  });
}

// 图片预览关闭
imgPreviewMask.addEventListener('click', function (e) {
  if (e.target !== previewImg) {
    imgPreviewMask.style.display = 'none';
    previewImg.src = "";
    document.body.style.overflow = '';
  }
});

// ===================== 核心：WebSocket 初始化 + 心跳 + 重连 + 兜底 =====================
let ws = null;
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 20000;

function initWebSocket() {
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    ws.close();
  }
  clearInterval(heartbeatTimer);

  const wsUrl = "wss://mbapi.lovefree.de5.net/ws";
  ws = new WebSocket(wsUrl);

    ws.onopen = () => {
    console.log("WebSocket 连接成功");
    if (userNick) {
      ws.send(JSON.stringify({
        type: "USER_UID",
        uid: userNick
      }));
    }
    startHeartbeat();

    // 延迟执行：同时兜底拉取 帖子 + 通知（双重保险）
    setTimeout(async () => {
      try {
        // 1. 拉取帖子列表（原有逻辑，保留）
        const postRes = await fetch(`${API_BASE}/listAll`, { credentials: "include" });
        if (postRes.ok) {
          const postData = await postRes.json();
          renderPosts(postData);
        }

        // ========== 【新增】兜底拉取个人通知 核心修复 ==========
        if (userNick) {
          const notifyUrl = `${API_BASE}/getNotify?uid=${encodeURIComponent(userNick)}`;
          const notifyRes = await fetch(notifyUrl, { credentials: "include" });
          if (notifyRes.ok) {
            const notifyData = await notifyRes.json();
            notifyList = notifyData;   // 更新全局通知数据
            renderNotify();            // 渲染通知 + 刷新铃铛角标
            console.log("[前端] 重连兜底拉取通知完成，条数：", notifyData.length);
          }
        }
        // =====================================================

      } catch (err) {
        console.warn("重连后刷新数据失败", err);
      }
    }, 300);
  };

  // ========== 【核心修改】新增 SYS_LOG 日志解析 + 全类型消息调试 ==========
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      console.log("[WS] 收到消息：", data.type, data);

      switch (data.type) {
        case "INIT_DATA":
          console.log("[WS] 收到首屏帖子数据");
          lastData = data.posts || [];
          renderPosts(lastData);
          notifyList = data.notify || [];
          renderNotify();
          break;

        case "POST_DATA":
          console.log("[WS] 收到帖子更新广播，开始渲染");
          renderPosts(data.posts || []);
          break;

        case "NOTIFY_DATA":
          console.log("[WS] 收到通知更新");
          notifyList = data.notify || [];
          renderNotify();
          break;

        // 后端系统日志（推送到浏览器控制台）
        case "SYS_LOG":
          if (data.level === "error") {
            console.error("[后端日志]", data.content);
          } else {
            console.log("[后端日志]", data.content);
          }
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

  let initDataFallbackTimer = setTimeout(async () => {
    if (lastData.length === 0) {
      try {
        const res = await fetch(`${API_BASE}/listAll`, { credentials: "include" });
        const data = await res.json();
        renderPosts(data);
      } catch (e) {
        console.log("首屏兜底拉取数据失败", e);
      }
    }
  }, 2000);

  const rawOnMsg = ws.onmessage;
  ws.onmessage = function (e) {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "INIT_DATA") {
        clearTimeout(initDataFallbackTimer);
      }
      rawOnMsg.call(this, e);
    } catch (err) {
      console.error("WS 消息解析失败", err);
    }
  };
}

// 心跳保活
function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "HEARTBEAT" }));
    }
  }, HEARTBEAT_INTERVAL);
}

// 页面加载完成后初始化
window.addEventListener("load", async () => {
  initWebSocket();

  if (!userNick) {
    createNewNick().then(nick => {
      userNick = nick;
      popNick.value = userNick;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "USER_UID",
          uid: userNick
        }));
      }
    });
  } else {
    popNick.value = userNick;
  }
});
