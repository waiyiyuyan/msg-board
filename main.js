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
    if (file.size > 50 * 1024 * 1024) return { ok: false, msg: "文件不能超过25MB" };
    return { ok: true };
  }

  async function uploadFile(file) {
    clearMedia();
    mediaPreview.innerHTML = "<span>文件上传中，请稍候...</span>";
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

// 全局数据缓存（仅由 WS 推送更新，不再主动查库）
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

// 渲染通知列表 + 按钮状态（保留光标/禁用逻辑）
function renderNotify() {
  const totalNotify = notifyList.length;
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
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

  // 通知角标
  setTimeout(() => {
    unReadBadge.style.display = unReadCount > 0 ? 'grid' : 'none';
    unReadBadge.innerText = unReadCount > 99 ? '99+' : unReadCount;
  }, 20);
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
    if (res.ok) {
      // 数据由 WS 自动推送，无需手动拉取
    }
  } catch (err) {
    console.error("全部已读出错：", err);
    alert("网络异常");
  } finally {
    readAllBtn.disabled = false;
  }
}

// 清空通知
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
    if (res.ok) {
      // 数据由 WS 自动推送，无需手动拉取
    }
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

// 渲染帖子列表（纯前端渲染，数据来自 WS）
function renderPosts(data) {
  lastData = data;
  const keepFoldIds = [...foldReplyIds];
  listBox.innerHTML = "";

  data.forEach(post => {
    const html = buildPostHtml(post);
    listBox.insertAdjacentHTML('afterbegin', html);
  });

  // 还原展开状态
  foldReplyIds = keepFoldIds;
  foldReplyIds.forEach(pid => {
    const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
    const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
    if (wrap) wrap.style.display = "block";
    if (btn) btn.innerText = `${wrap.querySelectorAll(".reply-item").length}条回复 ▼`;
  });
  bindFoldBtn();
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

// ===================== 核心：WebSocket 初始化 + 心跳 + 重连 =====================
let ws = null;
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 20000; // 20秒心跳（低于CF 30s空闲限制）

function initWebSocket() {
  const wsUrl = "wss://mbapi.lovefree.de5.net/ws";
  ws = new WebSocket(wsUrl);

  // 连接成功
  ws.onopen = () => {
    console.log("WebSocket 连接成功");
    // 上报当前用户昵称，用于后端推送个人通知
    if (userNick) {
      ws.send(JSON.stringify({
        type: "USER_UID",
        uid: userNick
      }));
    }
    // 启动心跳保活
    startHeartbeat();
  };

  // 接收后端推送消息
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      switch (data.type) {
        // 首屏初始化数据
        case "INIT_DATA":
          lastData = data.posts || [];
          renderPosts(lastData);
          notifyList = data.notify || [];
          renderNotify();
          break;
        // 帖子/回复/删帖 更新
        case "POST_DATA":
          renderPosts(data.posts || []);
          break;
        // 个人通知 更新
        case "NOTIFY_DATA":
          notifyList = data.notify || [];
          renderNotify();
          break;
      }
    } catch (err) {
      console.error("WS 消息解析失败", err);
    }
  };

  // 连接关闭，自动重连
  ws.onclose = () => {
    clearInterval(heartbeatTimer);
    console.log("WebSocket 连接断开，3秒后重连");
    setTimeout(initWebSocket, 3000);
  };

  // 连接错误，自动重连
  ws.onerror = () => {
    clearInterval(heartbeatTimer);
    setTimeout(initWebSocket, 3000);
  };
}

// 心跳保活（防止 Cloudflare 30s 空闲断开）
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
  // 初始化昵称
  if (!userNick) {
    userNick = await createNewNick();
    popNick.value = userNick;
  } else {
    popNick.value = userNick;
  }
  // 启动 WebSocket
  initWebSocket();
  bindMediaEvents(document);
});
