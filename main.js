// ===================== 【全局常量 & 新增WS相关变量】=====================
const API_BASE = "https://mbapi.lovefree.de5.net";
const UPLOAD_API = API_BASE + "/proxyUpload";
// WebSocket 地址（CF强制wss，不可用ws）
const WS_URL = "wss://mbapi.lovefree.de5.net"; // 正确变量名
// 心跳约定（和后端保持一致）
const PING_MSG = "ping";
const PONG_MSG = "pong";
// 心跳间隔：20秒（小于CF 30秒空闲超时，防止被强制断开）
const PING_INTERVAL = 20000;
// 心跳超时：25秒（未收到pong判定连接失效）
const PONG_TIMEOUT = 25000;
// 重连间隔：5秒
const RECONNECT_INTERVAL = 5000;

// WS实例、心跳定时器、重连定时器
let ws = null;
let pingTimer = null;
let pongTimer = null;
let reconnectTimer = null;
// 标记：是否主动关闭连接（区分手动关闭/异常断开）
let isManualClose = false;

let currentMediaUrl = "";
const uploadBtn = document.getElementById("uploadBtn");
const fileSelector = document.getElementById("fileSelector");
const mediaPreview = document.getElementById("mediaBox");
const mediaInput = document.getElementById("mediaInput");

// ===================== 原有函数：清空图片（完全保留）=====================
function clearMedia() {
  currentMediaUrl = "";
  mediaInput.value = "";
  mediaPreview.innerHTML = "";
  uploadBtn.disabled = false;
}

if (uploadBtn && fileSelector) {
  uploadBtn.addEventListener("click", function() {
    fileSelector.click();
  });

  function checkFile(file) {
    const allowMime = ["image/jpeg","image/png","image/gif","image/webp"];
    if (!allowMime.includes(file.type)) {
      return { ok: false, msg: "仅支持 JPG/PNG/GIF/WEBP 图片" };
    }
    if (file.size === 0) {
      return { ok: false, msg: "文件无效，请重新选择" };
    }
    if (file.size > 50 * 1024 * 1024) {
      return { ok: false, msg: "文件不能超过25MB" };
    }
    return { ok: true };
  }

  async function uploadFile(file) {
  clearMedia();
  mediaPreview.innerHTML = "<span>文件上传中，请稍候...</span>";
  uploadBtn.disabled = true;
  // 标记：开始上传，禁用发布按钮
  isUploading = true;
  const submitBtn = popForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(UPLOAD_API, {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    if (!res.ok) throw new Error("图床服务异常");

    let json;
    try {
      json = await res.json();
      console.log("接口原始返回数据：", json);
    } catch (parseErr) {
      console.error("JSON解析失败：", parseErr);
      throw new Error("接口返回格式错误");
    }

    if (typeof json !== 'object' || json === null || !json.url) {
      console.error("数据缺少 url 字段：", json);
      throw new Error("返回数据异常");
    }

    const fullUrl = json.url;
    currentMediaUrl = fullUrl;
    mediaInput.value = fullUrl;
    
    mediaPreview.innerHTML = `
      <span style="color:#34c759; font-size:14px;">上传成功</span>
      <button class="btn del-btn" onclick="clearMedia()" style="padding:4px 10px; font-size:12px;">移除</button>
    `;
      
  } catch (err) {
    let errMsg = "上传失败，请重试";
    if (err.message.includes("1101") || err.message.includes("Worker threw exception")) {
      errMsg = "文件过大，上传失败，请压缩后重试";
    }
    mediaPreview.innerHTML = "<span class='err-text'>" + errMsg + "</span>";
    console.error("上传错误：", err);
  } finally {
    uploadBtn.disabled = false;
    // 标记：上传结束，恢复发布按钮
    isUploading = false;
    const submitBtn = popForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = false;
  }
}
  fileSelector.addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const checkRes = checkFile(file);
    if (!checkRes.ok) {
      mediaPreview.innerHTML = "<span class='err-text'>" + checkRes.msg + "</span>";
      fileSelector.value = "";
      return;
    }
    await uploadFile(file);
    fileSelector.value = "";
  });
}

// ===================== 工具函数（全部保留）=====================
function setCookie(name,val,day=30){
  let d=new Date();
  d.setTime(d.getTime()+day*24*3600*1000);
  document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax;Secure`;
}
function getCookie(name){
  let arr=document.cookie.split('; ');
  for(let item of arr){
    let kv=item.split('=');
    if(kv[0]===name) return decodeURIComponent(kv[1]);
  }
  return '';
}

function parseLink(text) {
  if (!text) return "";
  let escapeTxt = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const linkReg = /(https?:\/\/[^\s<>"]+)/g;
  return escapeTxt.replace(linkReg, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

let foldReplyIds = [];
let lastData = [];
let notifyList = [];
let popOpen = false;
let isUploading = false;

// 图片放大预览 DOM
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
const notifyWrap = document.getElementById('notifyWrap');
const notifyListContent = document.getElementById('notifyListContent');

const readAllBtn = document.getElementById('readAllBtn');
const clearNotifyBtn = document.getElementById('clearNotify');

// textarea 自适应（保留）
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
textareaDom.addEventListener('input', () => autoResize(textareaDom));

// 昵称生成（保留）
let userNick=getCookie('userNick');
const adj = ['晚风','青禾','屿鹿','星眠','浅墨','雾野','秋辞','南栀','枕雪','临江'];
const noun = ['清茶','星河','孤岛','落日','白舟','云笺','寒川','青衫','暮雪','闲舟'];

async function createNewNick(){
  const maxTry = 20;
  let tryCount = 0;
  while(tryCount < maxTry){
    let randName = adj[Math.floor(Math.random()*adj.length)] + "_" + noun[Math.floor(Math.random()*noun.length)] + Math.floor(Math.random()*900+100);
    const res = await fetch(`${API_BASE}/checkNick?nick=` + encodeURIComponent(randName), {
      credentials: "include"
    });
    const json = await res.json();
    if(!json.exist){
      setCookie('userNick', randName);
      return randName;
    }
  }
  const fallbackName = "访客_" + Math.random().toString(36).slice(2,8);
  setCookie('userNick', fallbackName);
  return fallbackName;
}

// 回复展开/收起（保留）
function toggleReplyFold(pid) {
  const pidNum = Number(pid);
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (!wrap || !btn) return;
  const total = wrap.querySelectorAll(".reply-item").length;
  if (total === 0) return;
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

// 打开回复弹窗（保留）
function openReplyPop(pid,authorName){
  clearMedia();
  hidPid.value=pid;
  hidRid.value='';
  targetUserDom.value=authorName;
  textareaDom.value='';
  textareaDom.placeholder='输入回复内容';
  replyTip.textContent='回复：@'+authorName;
  replyTip.style.display='block';
  maskDom.style.display='flex';
  autoResize(textareaDom);
}
function openSubReplyPop(pid,rid,atName){
  clearMedia();
  hidRid.value=rid;
  targetUserDom.value=atName;
  textareaDom.value='';
  textareaDom.placeholder='输入回复内容';
  replyTip.textContent='回复：@'+atName;
  replyTip.style.display='block';
  maskDom.style.display='flex';
  autoResize(textareaDom);
}

// 渲染图片、构建帖子HTML（完全保留）
function renderMedia(mediaUrl) {
  if (!mediaUrl) return "";
  const lowerUrl = mediaUrl.toLowerCase();
  if (lowerUrl.endsWith(".png") || lowerUrl.endsWith(".jpg") || 
      lowerUrl.endsWith(".jpeg") || lowerUrl.endsWith(".gif") || 
      lowerUrl.endsWith(".webp")) {
    return '<img class="msg-media-img" src="' + mediaUrl + '" alt="">';
  }
  return "";
}
function buildPostHtml(post){
  let rHtml = '';
  if(post.replys&&post.replys.length>0){
    post.replys.forEach((r, index)=>{
      let extraBtn = "";
      if(index === post.replys.length - 1){
        extraBtn = `<button class="reply-small-btn" style="margin-right:8px;" onclick="closeReply(${post.id})">收起</button>`;
      }
      rHtml += `<div class="reply-item" data-rid="${r.id}">
        <div class="reply-head">
          <div class="reply-name">${r.r_name}</div>
          <div class="reply-time">${r.create_time}</div>
        </div>
        <div class="reply-text">${parseLink(r.r_content)}</div>
        ${renderMedia(r.media_urls || "")}
        <div style="text-align:right;margin-top:4px;">
          ${extraBtn}
          <button class="reply-small-btn" onclick="openSubReplyPop(${post.id},${r.id},'${r.r_name}')">回复</button>
        </div>
      </div>`
    })
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
    <div class="toggle-wrapper" data-pid="${post.id}" style="${post.replys.length===0 ? 'cursor:default;' : 'cursor:pointer;'}">
      <button class="fold-btn" data-fold-pid="${post.id}" style="${post.replys.length===0?'color:#999;cursor:default;':''}">
        ${post.replys.length}条回复 ${post.replys.length>0?(foldReplyIds.includes(post.id)?'▼':'▶'):''}
      </button>
    </div>
    <div class="reply-wrap" data-wrap-pid="${post.id}" style="${!foldReplyIds.includes(post.id) || post.replys.length===0 ? 'display:none' : ''}">${rHtml}</div>   
  </div>`;
}

// 通知相关函数（完全保留）
async function getMyNotify(){
  try{
    const uid = encodeURIComponent(userNick);
    const res = await fetch(`${API_BASE}/getNotify?uid=${uid}`, {
      credentials: "include"
    });
    notifyList = await res.json();
    const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
    setTimeout(() => {
      unReadBadge.style.display = unReadCount > 0 ? 'grid' : 'none';
      unReadBadge.innerText = unReadCount > 99 ? '99+' : unReadCount;
      unReadBadge.offsetHeight;
    }, 50);
  }catch(e){
    console.error("通知拉取异常：", e);
  }
}
function renderNotify(){
  const totalNotify = notifyList.length;
  const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;
  if (readAllBtn && clearNotifyBtn) {
    if (totalNotify === 0) {
      readAllBtn.disabled = true;
      clearNotifyBtn.disabled = true;
    } else if (unReadCount === 0) {
      readAllBtn.disabled = true;
      clearNotifyBtn.disabled = false;
    } else {
      readAllBtn.disabled = false;
      clearNotifyBtn.disabled = false;
    }
  }
  if(notifyList.length === 0){
    notifyListContent.innerHTML = '<div class="empty-tip">暂无消息通知</div>';
    return;
  }
  let html = '';
  notifyList.forEach(item=>{
    const isRead = item.is_read === 1;
    const textStyle = isRead ? 'style="color:#999"' : '';
    const dot = isRead ? '' : '● ';
    html += `<div class="notify-item" onclick="jumpPost(${item.id},${item.target_msg_id},${item.reply_id})">
      <div>
        <div class="notify-txt" ${textStyle}>${dot}${item.reply_name}@了你：${item.reply_preview}</div>
        <div class="notify-time">${item.create_time}</div>
      </div>
    </div>`
  })
  notifyListContent.innerHTML = html;
}
async function jumpPost(nid,pid,rid){
  const fd=new FormData();
  fd.append('nid',nid);
  await fetch(`${API_BASE}/setRead`,{
  method:'POST',
  body:fd,
  credentials: "include"
  });
  notifyMask.style.display='none';
  await updateList();
  getMyNotify();
  const pidNum = Number(pid);
  if(!foldReplyIds.includes(pidNum)){
    foldReplyIds.push(pidNum);
  }
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const foldBtn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if(wrap) wrap.style.display = "block";
  if(foldBtn){
    const total = wrap ? wrap.querySelectorAll('.reply-item').length : 0;
    foldBtn.innerText = `${total}条回复 ▼`;
  }
  const postDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
  if(!postDom) return;
  postDom.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>{
    const replyDom = document.querySelector('.reply-item[data-rid="' + rid + '"]');
    if(replyDom){
      replyDom.scrollIntoView({behavior:'smooth',block:'center'});
      replyDom.classList.remove('flash');
      void replyDom.offsetWidth;
      replyDom.classList.add('flash');
      replyDom.addEventListener('animationend', () => {
        replyDom.classList.remove('flash');
      }, {once: true});
    }
  },120);
}
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
      await getMyNotify();
      renderNotify();
    }
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
  clearBtn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/clearAllNotify?uid=${uid}`, {
      method: "POST",
      credentials: "include"
    });
    if (res.ok) {
      await getMyNotify();
      renderNotify();
    }
  } catch (err) {
    console.error("清空通知出错：", err);
    alert("网络异常");
  } finally {
    clearBtn.disabled = false;
  }
}

bellBtn.onclick=()=>{
  if(notifyMask.style.display === 'flex'){
    notifyMask.style.display = 'none';
    if (!popOpen) {}
  }else{
    if(popOpen){
      maskDom.style.display = 'none';
      popForm.reset();
      popOpen = false;
    }
    renderNotify();
    notifyMask.style.display = 'flex';
  }
}

// 核心渲染函数（保留，现在由WS推送/初始化调用）
async function updateList(){
  console.log('🔄 刷新列表');
  try{
    const res = await fetch(`${API_BASE}/listAll`, {
      credentials: "include"
    });
    const newData = await res.json();
    const listBox = document.getElementById('listBox');
    const keepFoldIds = [...foldReplyIds];
    if(JSON.stringify(newData) === JSON.stringify(lastData)){
      await getMyNotify();
      return;
    }
    const oldIdSet = new Set(lastData.map(item => item.id));
    const newIdSet = new Set(newData.map(item => item.id));
    oldIdSet.forEach(pid => {
      if (!newIdSet.has(pid)) {
        const delDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
        if (delDom) delDom.remove();
      }
    });
    for (let i = newData.length - 1; i >= 0; i--) {
      const post = newData[i];
      const pid = post.id;
      const existDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
      if (existDom) {
        const oldPostIdx = lastData.findIndex(p => p.id);
        const oldPost = lastData[oldPostIdx];
        const replyChanged = JSON.stringify(oldPost.replys) !== JSON.stringify(post.replys);
        if (replyChanged) {
          existDom.outerHTML = buildPostHtml(post);
          if (oldPostIdx > -1) {
            lastData = JSON.parse(JSON.stringify(newData));
          }
        }
      } else {
        const postHtml = buildPostHtml(post);
        listBox.insertAdjacentHTML('afterbegin', postHtml);
      }
    }
    foldReplyIds = keepFoldIds;
    foldReplyIds.forEach(pid => {
      const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
      const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
      if(wrap) wrap.style.display = "block";
      if(btn) {
        const total = wrap ? wrap.querySelectorAll('.reply-item').length : 0;
        btn.innerText = `${total}条回复 ▼`;
      }
    });
    bindFoldBtn();
    bindMediaEvents(listBox);
    lastData = JSON.parse(JSON.stringify(newData));
    await getMyNotify();
  } catch (err) {
    console.error('列表刷新失败', err);
    const listBox = document.getElementById('listBox');
    listBox.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#86868b;">
        数据加载失败，请检查网络连接
        <br>
        <button class="btn" style="margin-top:12px;" onclick="updateList()">点击重试</button>
      </div>
    `;
  }
}

// 事件绑定（保留）
function bindFoldBtn() {
  document.querySelectorAll('.fold-btn:not([data-btn-bound])').forEach(btn => {
    btn.dataset.btnBound = "true";
    btn.onclick = function (e) {
      e.stopPropagation();
      const pid = this.dataset.foldPid;
      toggleReplyFold(pid);
    };
  });
}
// ========== 修复：选择器缺失 pid 导致点击空白区失效 ==========
document.querySelector("#listBox").addEventListener("click", function(e){
  const wrapper = e.target.closest(".toggle-wrapper");
  if(!wrapper) return;
  const pid = wrapper.dataset.pid;
  const replyWrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if(!replyWrap) return;
  const total = replyWrap.querySelectorAll(".reply-item").length;
  if(total === 0) return;
  toggleReplyFold(pid);
});

function closeReply(pid){
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const foldBtn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  const total = wrap.querySelectorAll('.reply-item').length;
  foldReplyIds = foldReplyIds.filter(x=>x!==pid);
  wrap.style.display='none';
  foldBtn.innerText = total+'条回复 ▶';
}
async function delPost(postId) {
  if (!confirm("确定要删除该帖子吗？\n帖子、所有回复、相关通知都会一并清空！")) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/del?id=${postId}`, {
      method: "GET",
      credentials: "include"
    });
    if (res.ok) {
      await updateList();
      getMyNotify();
    }
  } catch (err) {
    console.error("删帖出错：", err);
    alert("网络异常，删除失败");
  }
}

// 弹窗逻辑（保留）
document.getElementById('openPopBtn').onclick=()=>{
  if(popOpen){
    maskDom.style.display = 'none';
    popForm.reset();
    popOpen = false;
  }else{
    if(notifyMask.style.display === 'none'){
      notifyMask.style.display = 'none';
    }
    hidPid.value='';
    hidRid.value='';
    targetUserDom.value='';
    textareaDom.value='';
    textareaDom.placeholder='有什么新鲜事？';
    replyTip.style.display='none';
    maskDom.style.display='flex';
    popOpen = true;
    autoResize(textareaDom);
  }
}
popForm.onsubmit=async function(e){
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
  const fd=new FormData(this);
  const pid=hidPid.value;
  let res;
  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if(!pid){
      res = await fetch(`${API_BASE}/add`,{
          method:'POST',
          body:fd,
          credentials: "include"
        });
    }else{
      fd.append('targetUser', targetUserDom.value); 
      fd.append('pid',pid);
      res = await fetch(`${API_BASE}/addReply`,{
          method:'POST',
          body:fd,
          credentials: "include"
        });
    }
    if(res.ok){
      maskDom.style.display='none';
      popForm.reset();
      clearMedia();
      popOpen = false;
    }
  } catch (err) {
    console.error("提交失败：", err);
    alert("提交失败，请稍后重试");
  } finally {
    submitBtn.disabled = false;
  }
}
maskDom.addEventListener('click', function(e) {
  if (e.target === maskDom) {
    maskDom.style.display = 'none';
    popForm.reset();
    clearMedia();
    popOpen = false;
  }
});
notifyMask.addEventListener('click', function(e) {
  if (e.target === notifyMask) {
    notifyMask.style.display = 'none';
  }
});

// 图片预览（保留）
function bindMediaEvents(container) {
  console.log('开始绑定媒体事件');
  container.querySelectorAll('.msg-media-img:not([data-event-bound])').forEach(img => {
    img.dataset.eventBound = "true";
    img.onerror = function () {
      this.style.display = 'none';
    };
    img.style.cursor = "zoom-in";
    img.addEventListener('click', function () {
      previewImg.src = this.src;
      imgPreviewMask.style.display = 'flex';
      document.body.style.overflow = 'hidden'; 
    });
  });
}
imgPreviewMask.addEventListener('click', function (e) {
  if (e.target !== previewImg) {
    imgPreviewMask.style.display = 'none';
    previewImg.src = ""; 
    document.body.style.overflow = '';
  }
});

// ===================== 【新增：WebSocket 核心方法】=====================
/** 关闭所有定时器 & WS 连接 */
function closeAllSocket() {
  isManualClose = true;
  // 清空所有定时器
  if (pingTimer) clearInterval(pingTimer);
  if (pongTimer) clearTimeout(pongTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  pingTimer = null;
  pongTimer = null;
  reconnectTimer = null;
  // 关闭WS
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  ws = null;
}

// 【修改】初始化 WebSocket 连接（增强日志 + 错误兜底）
function initWebSocket() {
  // 防止重复创建连接
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log("🔵 WS 连接已存在，跳过重复初始化");
    return;
  }
  isManualClose = false;
  console.log("🔌 开始初始化 WS 连接，地址：", WS_URL);
  
  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error("❌ 创建 WS 实例失败：", err);
    reconnect(); // 创建失败也触发重连
    return;
  }

  // 连接成功
  ws.onopen = function () {
    console.log("✅ WebSocket 连接成功，开始心跳保活");
    // 启动心跳定时器：定时发送 ping
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log("📤 发送心跳 ping");
        ws.send(PING_MSG);
        // 开启pong超时检测
        pongTimer = setTimeout(() => {
          console.log("⚠️ 心跳超时，判定连接断开");
          closeAllSocket();
          reconnect();
        }, PONG_TIMEOUT);
      }
    }, PING_INTERVAL);
  };

  // 接收后端消息（强化日志）
  ws.onmessage = function (e) {
    const msg = e.data;
    console.log("📥 收到 WS 消息：", msg); 
    // 收到pong，清除超时计时器
    if (msg === PONG_MSG) {
      console.log("📥 收到心跳 pong，重置超时");
      if (pongTimer) clearTimeout(pongTimer);
      return;
    }
    // 解析后端推送的JSON数据
    try {
      const resData = JSON.parse(msg);
      console.log("📝 解析推送数据：", resData);
      if (resData.type === "list") {
        console.log("🔄 收到列表推送，开始渲染：", resData.data);
        renderListByPush(resData.data);
        getMyNotify();
      }
    } catch (err) {
      console.warn("⚠️ 非JSON消息/解析失败：", msg, err);
    }
  };

  // 连接关闭（强化日志）
  ws.onclose = function (event) {
    console.log("❌ WebSocket 连接关闭，代码：", event.code, "原因：", event.reason);
    closeAllSocket();
    // 非手动关闭 → 自动重连
    if (!isManualClose) {
      reconnect();
    }
  };

  // 连接异常（强化日志）
  ws.onerror = function (err) {
    console.error("❌ WebSocket 异常：", err);
    closeAllSocket();
    reconnect();
  };
}

// 【新增】页面初始化时强制打印WS状态
(async function init() {
  // 1. 初始化昵称
  if(!userNick){
    userNick = await createNewNick();
    popNick.value = userNick;
  }else{
    popNick.value = userNick;
  }
  // 2. 首次HTTP请求兜底（WS未就绪时展示数据）
  await updateList();
  // 3. 加载通知
  await getMyNotify();
  // 4. 初始化WebSocket长连接（新增日志）
  console.log("🚀 页面初始化完成，开始启动 WS 连接");
  initWebSocket();
  // 新增：5秒后检查WS状态
  setTimeout(() => {
    if (!ws) {
      console.error("❌ 5秒后WS实例仍未创建");
    } else {
      const stateMap = {
        0: "CONNECTING",
        1: "OPEN",
        2: "CLOSING",
        3: "CLOSED"
      };
      console.log("🔍 5秒后WS状态：", stateMap[ws.readyState] || ws.readyState);
    }
  }, 5000);
})();

/** 自动重连 */
function reconnect() {
  console.log(`⏳ ${RECONNECT_INTERVAL/1000}秒后尝试重连...`);
  reconnectTimer = setTimeout(() => {
    initWebSocket();
  }, RECONNECT_INTERVAL);
}

/** 处理WS推送的列表数据（复用原有DOM渲染逻辑） */
function renderListByPush(newData) {
  const listBox = document.getElementById('listBox');
  const keepFoldIds = [...foldReplyIds];
  if(JSON.stringify(newData) === JSON.stringify(lastData)) return;

  const oldIdSet = new Set(lastData.map(item => item.id));
  const newIdSet = new Set(newData.map(item => item.id));
  oldIdSet.forEach(pid => {
    if (!newIdSet.has(pid)) {
      const delDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
      if (delDom) delDom.remove();
    }
  });
  for (let i = newData.length - 1; i >= 0; i--) {
    const post = newData[i];
    const pid = post.id;
    const existDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
    if (existDom) {
      const oldPostIdx = lastData.findIndex(p => p.id === post.id);
      const oldPost = lastData[oldPostIdx];
      const replyChanged = JSON.stringify(oldPost.replys) !== JSON.stringify(post.replys);
      if (replyChanged) {
        existDom.outerHTML = buildPostHtml(post);
        if (oldPostIdx > -1) {
          lastData = JSON.parse(JSON.stringify(newData));
        }
      }
    } else {
      const postHtml = buildPostHtml(post);
      listBox.insertAdjacentHTML('afterbegin', postHtml);
    }
  }
  foldReplyIds = keepFoldIds;
  foldReplyIds.forEach(pid => {
    const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
    const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
    if(wrap) wrap.style.display = "block";
    if(btn) {
      const total = wrap ? wrap.querySelectorAll('.reply-item').length : 0;
      btn.innerText = `${total}条回复 ▼`;
    }
  });
  bindFoldBtn();
  bindMediaEvents(listBox);
  lastData = JSON.parse(JSON.stringify(newData));
}

// 页面卸载：关闭连接&定时器
window.addEventListener("beforeunload", closeAllSocket);

// ===================== 【页面初始化逻辑】=====================
(async function init() {
  // 1. 初始化昵称
  if(!userNick){
    userNick = await createNewNick();
    popNick.value = userNick;
  }else{
    popNick.value = userNick;
  }
  // 2. 首次HTTP请求兜底（WS未就绪时展示数据）
  await updateList();
  // 3. 加载通知
  await getMyNotify();
  // 4. 初始化WebSocket长连接
  initWebSocket();
})();
