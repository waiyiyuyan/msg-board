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
let isNoticeModalOpen = false; // 通知全屏弹窗状态锁
// ===================== 新增：昵称&头像 全局变量 + 工具函数 =====================
// 当前用户头像地址
let userAvatar = "";

/**
 * 根据昵称生成头像链接（Picsum 官方标准，固定头像）
 * @param {string} nick 用户名/昵称
 * @returns {string} 头像地址
 */
function getAvatarUrl(nick) {
  if (!nick) return "";
  const seed = encodeURIComponent(nick);
  // 官方标准，同昵称=同一张图
  return `https://picsum.photos/seed/${seed}/200/200`;
}

/**
 * 本地生成随机访客昵称（无外部接口）
 * 格式：访客_ + 18位随机字符，加长字符降低重复概率
 * @returns {Promise<string>} 随机访客昵称字符串
 */
async function fetchRandomNick() {
  try {
    // 生成 18 位随机字符（36进制：数字+小写字母）
    const randomStr = Math.random().toString(36).slice(2, 20);
    const nickName = "访客_" + randomStr;

    console.log("【生成本地访客昵称】", nickName);
    return nickName;

  } catch (err) {
    console.error("【生成昵称异常】", err);
    // 极端异常兜底（最短随机串）
    return "访客_" + Math.random().toString(36).slice(2, 8);
  }
}
// ==============================================================================

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
// 新增：通知详情全屏弹窗 DOM 节点
const noticeFullModal = document.getElementById('noticeFullModal');
const noticeModalContent = document.getElementById('noticeModalContent');

// textarea 自适应高度
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
textareaDom.addEventListener('input', () => autoResize(textareaDom));

// 昵称生成
let userNick = getCookie('userNick');
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
      rHtml += `<div class="reply-item" data-rid="${r.id}" data-pid="${r.msg_id}">
        <div class="reply-head">
        <div class="reply-avatar-row" style="display: flex; align-items: center; gap: 6px;">
          <img class="reply-avatar" 
               src="${getAvatarUrl(r.r_name)}" 
               alt="头像"
               onerror="this.style.display='none'">
          <div class="reply-name">${headText}</div>
        </div>
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
      <!-- 头像 + 昵称 组合容器 -->
      <div class="post-avatar-row" style="display: flex; align-items: center; gap: 8px;">
        <img class="post-avatar" 
             src="${getAvatarUrl(post.name)}" 
             alt="头像"
             onerror="this.style.display='none'">
        <span class="post-author">${post.name}</span>
      </div>
      <span class="post-time">${post.create_time}</span>
    </div>
    <div class="post-content">${parseLink(post.content)}</div>
    ${renderMedia(post.media_urls || "")}
    <!-- 合并后的操作行：回复按钮 + 展开折叠按钮 同行显示 -->
    <div class="post-action-row">
      <div class="toggle-wrapper" data-pid="${post.id}" style="${post.replys.length === 0 ? 'cursor:default;' : 'cursor:pointer;'}">
        <button class="fold-btn" data-fold-pid="${post.id}" style="${post.replys.length === 0 ? 'color:#999;cursor:default;' : ''}">
          ${post.replys.length}条回复 ${post.replys.length > 0 ? (foldReplyIds.includes(post.id) ? '▼' : '▶') : ''}
        </button>
      </div>
      
      <div class="post-btn-group">
        <button class="reply-small-btn" onclick="openReplyPop(${post.id},'${post.name}')">回复</button>
      </div>
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
        <div class="notify-txt" ${textStyle}>${dot}${item.reply_name} 回复了你：${item.reply_preview}</div>
        <div class="notify-time">${item.create_time}</div>
      </div>
    </div>`;
  });
  notifyListContent.innerHTML = html;

  
}

// 跳转帖子 + 标记已读（改造：改为打开全屏弹窗，废弃页面滚动/主页面闪烁）
async function jumpPost(nid, pid, rid) {
  // 1. 保留原有核心：标记该条通知为已读
  const fd = new FormData();
  fd.append('nid', nid);
  const uid = encodeURIComponent(userNick);
  await fetch(`${API_BASE}/setRead?uid=${uid}`, {
    method: "POST",
    body: fd,
    credentials: "include"
  });

  // 2. 保留原有逻辑：关闭通知栏
  notifyMask.style.display = 'none';

  // 3. 调用全屏弹窗，传入帖子ID、回复ID
  openNoticeModal(pid, rid);
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

// ========== 新增：通知全屏弹窗 基础控制函数 ==========
/**
 * 打开通知详情全屏弹窗
 * @param {string|number} postId 帖子ID
 * @param {string|number} replyId 回复ID
 */
async function openNoticeModal(postId, replyId) {
  // 状态锁：弹窗已打开则直接拦截，禁止重复弹出
  if (isNoticeModalOpen) return;

  isNoticeModalOpen = true;
  // 显示全屏弹窗
  noticeFullModal.style.display = 'block';
  // 锁定底层页面：禁止滚动、防止底层误触
  document.body.style.overflow = 'hidden';

  // 临时日志（后续这里会加渲染逻辑，当前仅占位）
  console.log("【打开通知弹窗】帖子ID:", postId, "回复ID:", replyId);
}

/**
 * 关闭通知详情全屏弹窗
 */
function closeNoticeModal() {
  if (!isNoticeModalOpen) return;

  // 隐藏全屏弹窗
  noticeFullModal.style.display = 'none';
  // 恢复底层页面滚动
  document.body.style.overflow = '';
  // 重置弹窗状态锁
  isNoticeModalOpen = false;

  // 按方案优化：关闭弹窗后 自动重新打开通知栏，方便连续查看多条通知
  notifyMask.style.display = 'flex';
}
// =====================================================

// ===================== 【新增】回复弹窗函数（解决onclick未定义错误） =====================
// 回复主帖子
function openReplyPop(pid, targetName) {
  if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
  hidPid.value = pid;
  hidRid.value = '';
  targetUserDom.value = targetName;
  textareaDom.value = '';
  textareaDom.placeholder = '分享你的想法';
  // textareaDom.placeholder = `回复 ${targetName}`;
  replyTip.style.display = 'block';
  replyTip.innerText = `回复 @${targetName}`;
  maskDom.style.display = 'flex';
  popOpen = true;
  autoResize(textareaDom);
  
  // 给弹窗头像、昵称赋值
  const popAvatar = document.getElementById('popupUserAvatar');
  const popNickText = document.getElementById('popupUserNick');
  if (popAvatar) popAvatar.src = userAvatar;
  if (popNickText) popNickText.innerText = userNick;
}

// 回复子回复（楼中楼）
function openSubReplyPop(pid, rid, targetName) {
  if (notifyMask.style.display === 'flex') notifyMask.style.display = 'none';
  hidPid.value = pid;
  hidRid.value = rid;
  targetUserDom.value = targetName;
  textareaDom.value = '';
  textareaDom.placeholder = '分享你的想法';
  // textareaDom.placeholder = `回复 ${targetName}`;
  replyTip.style.display = 'block';
  replyTip.innerText = `回复 @${targetName}`;
  maskDom.style.display = 'flex';
  popOpen = true;
  autoResize(textareaDom);
  // 给弹窗头像、昵称赋值
  const popAvatar = document.getElementById('popupUserAvatar');
  const popNickText = document.getElementById('popupUserNick');
  if (popAvatar) popAvatar.src = userAvatar;
  if (popNickText) popNickText.innerText = userNick;
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
    // 给弹窗头像、昵称赋值
    const popAvatar = document.getElementById('popupUserAvatar');
    const popNickText = document.getElementById('popupUserNick');
    if (popAvatar) popAvatar.src = userAvatar;
    if (popNickText) popNickText.innerText = userNick;
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
          // ========== 新增：增量消息分支 ==========
        // 1. 新帖子：局部追加到列表顶部
        case "NEW_POST":
          console.log("[前端] 解析新帖子增量消息", data.item);
          const newPostHtml = buildPostHtml(data.item);
          // 插入到列表最顶部（帖子倒序，最新在前）
          listBox.insertAdjacentHTML("afterbegin", newPostHtml);
          // 绑定新节点的折叠/图片事件
          bindFoldBtn();
          bindMediaEvents(listBox);
          break;
        // 2. 新回复：追加到对应帖子的回复区
      case "NEW_REPLY":
        console.log("[前端] 解析新回复增量消息，所属帖子ID：", data.targetPid, data.item);
        const targetPid = data.targetPid;
        const replyItem = data.item;
      
        // ========== 核心修复：先找父帖子容器，再从容器内找子元素（绝对不会找错） ==========
        // 1. 先通过唯一PID找到整个帖子容器（全局唯一）
        const postCard = document.querySelector(`.post-card[data-pid="${targetPid}"]`);
        if (!postCard) {
          console.warn("[警告] 未找到目标帖子容器，PID：", targetPid);
          break;
        }
        // 2. 从帖子容器内部找回复容器和折叠按钮（不会受页面其他元素干扰）
        const replyWrap = postCard.querySelector(".reply-wrap");
        const foldBtn = postCard.querySelector(".fold-btn");
        const toggleWrapper = postCard.querySelector(".toggle-wrapper");
        if (!replyWrap || !foldBtn || !toggleWrapper) {
          console.warn("[警告] 帖子内未找到回复容器/折叠按钮，PID：", targetPid);
          break;
        }
        // =================================================================================
      
        // 复用原有回复HTML拼接逻辑，生成单条回复DOM
        const myNick = userNick?.trim() || "";
        const rawContent = parseLink(replyItem.r_content);
        let headText = replyItem.r_name;
        let showContent = rawContent;
      
        if (replyItem.to_user) {
          const replySender = replyItem.r_name;
          const replyTarget = replyItem.to_user;
          if (replySender === myNick) headText = `你 回复了 ${replyTarget}`;
          else if (replyTarget === myNick) headText = `${replyItem.r_name} 回复了你`;
          else headText = `${replyItem.r_name} 回复了 ${replyTarget}`;
        } else {
          const reg = /^回复\s+(.+?)：/;
          const match = rawContent.match(reg);
          if (match) {
            const oldTarget = match[1];
            const replySender = replyItem.r_name;
            if (replySender === myNick) headText = `你 回复了 ${oldTarget}`;
            else if (oldTarget === myNick) headText = `${replyItem.r_name} 回复了你`;
            else headText = `${replyItem.r_name} 回复了 ${oldTarget}`;
            showContent = rawContent.replace(reg, "");
          }
        }
        showContent = showContent || '';
        // 新回复永远是最后一条，显示【收起】按钮
        const extraBtn = `<button class="reply-small-btn" style="margin-right:8px;" onclick="closeReply(${targetPid})">收起</button>`;
        const replyHtml = `<div class="reply-item" data-rid="${replyItem.id}" data-pid="${replyItem.msg_id}">
          <div class="reply-head">
            <!-- 新增：头像+昵称 容器，和静态回复保持一致 -->
            <div class="reply-avatar-row" style="display: flex; align-items: center; gap: 6px;">
              <img class="reply-avatar" 
                   src="${getAvatarUrl(replyItem.r_name)}" 
                   alt="头像"
                   onerror="this.style.display='none'">
              <div class="reply-name">${headText}</div>
            </div>
            <div class="reply-time">${replyItem.create_time}</div>
          </div>
          <div class="reply-text">${showContent}</div>
          ${renderMedia(replyItem.media_urls || "")}
          <div style="text-align:right;margin-top:4px;">
            ${extraBtn}
            <button class="reply-small-btn" onclick="openSubReplyPop(${targetPid},${replyItem.id},'${replyItem.r_name}')">回复</button>
          </div>
        </div>`;
      
        // 追加回复到容器内
        replyWrap.insertAdjacentHTML("beforeend", replyHtml);
        console.log("[调试] 新回复已追加到容器，PID：", targetPid);

          // ========== 新增：只保留最后一条回复的收起按钮 ==========
      const allReplies = replyWrap.querySelectorAll(".reply-item");
      // 如果回复数≥2，移除上一条（倒数第二条）的收起按钮
      if (allReplies.length >= 2) {
        const prevLastReply = allReplies[allReplies.length - 2];
        const prevCloseBtn = prevLastReply.querySelector('button[onclick^="closeReply"]');
        if (prevCloseBtn) prevCloseBtn.remove();
      }
      // ======================================================
      
        // ========== 修复：移除原0条回复残留的禁用样式 ==========
        foldBtn.style.color = "";
        foldBtn.style.cursor = "";
        toggleWrapper.style.cursor = "";
      
        // 更新回复数量文本 + 自动匹配箭头
        const totalReply = replyWrap.querySelectorAll(".reply-item").length;
        const pidNum = Number(targetPid);
        const arrow = foldReplyIds.includes(pidNum) ? '▼' : '▶';
        foldBtn.innerText = totalReply + '条回复 ' + arrow;
        console.log("[调试] 回复数已更新为：", totalReply);
      
        // 绑定图片预览事件
        bindMediaEvents(replyWrap);
        break;

        // 3. 删除帖子：直接移除对应DOM
        case "DELETE_POST":
          console.log("[前端] 解析删帖消息，帖子ID：", data.targetPid);
          const delPid = data.targetPid;
          const postDom = document.querySelector(`.post-card[data-pid="${delPid}"]`);
          if (postDom) {
            postDom.remove();
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

  // 本地已有昵称：直接复用，并生成对应头像
  if (userNick) {
    popNick.value = userNick;
    // 根据已有昵称，自动生成头像地址
    userAvatar = getAvatarUrl(userNick);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "USER_UID",
        uid: userNick
      }));
    }
  } 
  // 无昵称：调用新的本地昵称函数生成
  else {
    const newNick = await fetchRandomNick();
    userNick = newNick;
    // 昵称持久化到 Cookie（30天有效期）
    setCookie("userNick", newNick);
    // 生成对应头像地址
    userAvatar = getAvatarUrl(newNick);
    popNick.value = userNick;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "USER_UID",
        uid: userNick
      }));
    }
  }
});
