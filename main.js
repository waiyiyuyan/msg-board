// ===================== 【重要】替换为你自己的 Workers 域名 =====================
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

    // 【修复1：补充 credentials，和全站接口保持一致，解决跨域凭证问题】
    const res = await fetch(UPLOAD_API, {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    if (!res.ok) throw new Error("图床服务异常");

    // 【修复2：增加解析捕获 + 日志，方便调试】
    let json;
    try {
      json = await res.json();
      console.log("接口原始返回数据：", json); // 浏览器控制台查看真实返回
    } catch (parseErr) {
      console.error("JSON解析失败：", parseErr);
      throw new Error("接口返回格式错误");
    }

    // 校验 url 字段
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
let refreshTimer = null;
    // ========== 新增：回复展开/收起 通用函数 =========
function toggleReplyFold(pid) {
  const pidNum = Number(pid);
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const btn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if (!wrap || !btn) return;

  const total = wrap.querySelectorAll(".reply-item").length;
  if (total === 0) return;

  // 切换展开/收起状态
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
// ========== 阶段三：刷新频率常量 ==========
const NORMAL_INTERVAL = 15000;    // 前台激活：15秒刷新
const BACKGROUND_INTERVAL = 30000; // 切后台/最小化：30秒刷新
// 图片上传状态标记：防止上传中提交表单
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

// 缓存通知栏按钮DOM（页面仅查询一次）
const readAllBtn = document.getElementById('readAllBtn');
const clearNotifyBtn = document.getElementById('clearNotifyBtn');

// ========= 新增：textarea 自动高度函数 =========
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
// 监听输入，实时自适应高度
textareaDom.addEventListener('input', () => autoResize(textareaDom));

let userNick=getCookie('userNick');
const adj = ['晚风','青禾','屿鹿','星眠','浅墨','雾野','秋辞','南栀','枕雪','临江'];
const noun = ['清茶','星河','孤岛','落日','白舟','云笺','寒川','青衫','暮雪','闲舟'];

// ========= 修复：昵称生成防无限循环 =========
async function createNewNick(){
  const maxTry = 20; // 最多尝试20次
  let tryCount = 0;
  while(tryCount < maxTry){
    tryCount++;
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
  // 兜底昵称，防止页面卡死
  const fallbackName = "访客_" + Math.random().toString(36).slice(2,8);
  setCookie('userNick', fallbackName);
  return fallbackName;
}

if(!userNick){
  ;(async ()=>{
    userNick = await createNewNick();
    popNick.value = userNick;
    await updateList();
  })();
}else{
  popNick.value = userNick;
  getMyNotify(); // 新增：页面加载立即拉取通知、渲染角标
}

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
  autoResize(textareaDom); // 打开弹窗重置输入框高度
}
function openSubReplyPop(pid,rid,atName){
  clearMedia();
  hidPid.value=pid;
  hidRid.value=rid;
  targetUserDom.value=atName;
  textareaDom.value='';
  textareaDom.placeholder='输入回复内容';
  replyTip.textContent='回复：@'+atName;
  replyTip.style.display='block';
  maskDom.style.display='flex';
  autoResize(textareaDom); // 打开弹窗重置输入框高度
}

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
    let extraBtn = index === post.replys.length - 1 
      ? `<button class="reply-small-btn" style="margin-right:8px;" onclick="closeReply(${post.id})">收起</button>` 
      : "";

    const myNick = userNick?.trim() || "";
    const rawContent = parseLink(r.r_content);
    let headText = r.r_name;
    let showContent = rawContent;

    // 1. 新数据：使用后端 to_user 字段判断（首选）
    if (r.to_user) {
      const replySender = r.r_name;
      const replyTarget = r.to_user;
      // 自己发的回复 → 替换为「你」
      if (replySender === myNick) {
        headText = `你 回复了 ${replyTarget}`;
      }
      // 别人回复我
      else if (replyTarget === myNick) {
        headText = `${r.r_name} 回复了你`;
      }
      // 别人回复其他人
      else {
        headText = `${r.r_name} 回复了 ${r.to_user}`;
      }
    }
    // 2. 历史旧数据兜底：正则解析旧前缀
    else {
      const reg = /^回复\s+(.+?)：/;
      const match = rawContent.match(reg);
      if (match) {
        const oldTarget = match[1];
        const replySender = r.r_name;
        // 旧数据同步规则：自己回复别人显示「你」
        if (replySender === myNick) {
          headText = `你 回复了 ${oldTarget}`;
        } else if (oldTarget === myNick) {
          headText = `${r.r_name} 回复了你`;
        } else {
          headText = `${r.r_name} 回复了 ${oldTarget}`;
        }
        showContent = rawContent.replace(reg, "");
      }
    }

    // 兼容纯图片、无文字回复
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
    <!-- <button class="btn del-btn" onclick="delPost(${post.id})">删除帖子</button> -->
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

async function getMyNotify(){
  try{
    const uid = encodeURIComponent(userNick);
    const res = await fetch(`${API_BASE}/getNotify?uid=${uid}`, {
      credentials: "include"
    });
    notifyList = await res.json();

    const unReadCount = notifyList.filter(item => Number(item.is_read) !== 1).length;

    // 延迟赋值，解决异步渲染被覆盖
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
  // 按钮状态控制
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

  // 只操作【列表子容器】，永远不修改父容器 notifyWrap（保护顶部按钮）
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

  // 动态内容只写入列表容器，按钮完全保留
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
  // 先拉取最新数据并渲染
  await updateList();
  getMyNotify(); // 新增：单独刷新通知，角标立即变化

  const pidNum = Number(pid);
  // 强制标记为展开
  if(!foldReplyIds.includes(pidNum)){
    foldReplyIds.push(pidNum);
  }
  // 强制修改DOM显隐和按钮文字
  const wrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  const foldBtn = document.querySelector(`.fold-btn[data-fold-pid="${pid}"]`);
  if(wrap) wrap.style.display = "block";
  if(foldBtn){
    const total = wrap ? wrap.querySelectorAll('.reply-item').length : 0;
    foldBtn.innerText = `${total}条回复 ▼`;
  }

  // 滚动到帖子
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

// 全部标记为已读
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
    } else {
      alert("操作失败，请重试");
    }
  } catch (err) {
    console.error("全部已读出错：", err);
    alert("网络异常");
  } finally {
    readAllBtn.disabled = false;
  }
}

// 清空通知（无二次确认，点击直接执行）
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
    } else {
      alert("清空失败，请重试");
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
    if (!popOpen) {
      startRefreshTimer();
    }
  }else{
    if(popOpen){
      maskDom.style.display = 'none';
      popForm.reset();
      popOpen = false;
    }
    renderNotify();
    notifyMask.style.display = 'flex';
    if (refreshTimer) clearInterval(refreshTimer);
  }
}

async function updateList(){
  console.log('🔄 执行自动刷新');
  try{
    const res = await fetch(`${API_BASE}/listAll`, {
      credentials: "include"
    });
    const newData = await res.json();
    const listBox = document.getElementById('listBox');
    const keepFoldIds = [...foldReplyIds];

    // 数据完全无变化，直接跳过渲染，优化性能
    if(JSON.stringify(newData) === JSON.stringify(lastData)){
      await getMyNotify();
      return;
    }

    const oldIdSet = new Set(lastData.map(item => item.id));
    const newIdSet = new Set(newData.map(item => item.id));

    // 删除已被移除的帖子
    oldIdSet.forEach(pid => {
      if (!newIdSet.has(pid)) {
        const delDom = document.querySelector(`.post-card[data-pid="${pid}"]`);
        if (delDom) delDom.remove();
      }
    });

    // 遍历所有帖子，增量更新
    for (let i = newData.length - 1; i >= 0; i--) {
      const post = newData[i];
      const pid = post.id;
      const existDom = document.querySelector(`.post-card[data-pid="${pid}"]`);

      if (existDom) {
        const oldPostIdx = lastData.findIndex(p => p.id === pid);
        const oldPost = lastData[oldPostIdx];
        // 全量对比回复内容，只要回复有变动就刷新DOM（彻底修复刷新失效）
        const replyChanged = JSON.stringify(oldPost.replys) !== JSON.stringify(post.replys);
        if (replyChanged) {
          existDom.outerHTML = buildPostHtml(post);
          if (oldPostIdx > -1) {
            lastData[oldPostIdx] = JSON.parse(JSON.stringify(post));
          }
        }
      } else {
        // 全新帖子，插入页面顶部
        const postHtml = buildPostHtml(post);
        listBox.insertAdjacentHTML('afterbegin', postHtml);
      }
    }

    // 还原回复区 展开/收起 状态
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

    // 重新绑定按钮、图片事件
    bindFoldBtn();
    bindMediaEvents(listBox);

    // 更新本地缓存
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

function bindFoldBtn() {
  document.querySelectorAll('.fold-btn:not([data-btn-bound])').forEach(btn => {
    btn.dataset.btnBound = "true";
    btn.onclick = function (e) {
      // 仅阻止按钮自身事件向外干扰，不影响外层空白区
      e.stopPropagation();
      const pid = this.dataset.foldPid;
      // 调用通用折叠方法
      toggleReplyFold(pid);
    };
  });
}

// 整行空白区域点击 → 调用通用折叠函数
document.querySelector("#listBox").addEventListener("click", function(e){
  const wrapper = e.target.closest(".toggle-wrapper");
  if(!wrapper) return;

  const pid = wrapper.dataset.pid;
  const replyWrap = document.querySelector(`.reply-wrap[data-wrap-pid="${pid}"]`);
  if(!replyWrap) return;

  const total = replyWrap.querySelectorAll(".reply-item").length;
  if(total === 0) return;

  // 直接调用公共方法，不再模拟按钮点击
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
// 删帖函数：删除帖子 + 对应回复 + 对应通知
async function delPost(postId) {
  // 二次确认，防止误删
  if (!confirm("确定要删除该帖子吗？\n帖子、所有回复、相关通知都会一并清空！")) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/del?id=${postId}`, {
      method: "GET",
      credentials: "include"
    });
    if (res.ok) {
      // 删除成功，刷新页面数据
      await updateList();
      getMyNotify();
    } else {
      alert("删除失败，请重试");
    }
  } catch (err) {
    console.error("删帖出错：", err);
    alert("网络异常，删除失败");
  }
}

document.getElementById('openPopBtn').onclick=()=>{
  if(popOpen){
    maskDom.style.display = 'none';
    popForm.reset();
    popOpen = false;
  }else{
    if(notifyMask.style.display === 'flex'){
      notifyMask.style.display = 'none';
    }
    hidPid.value='';
    hidRid.value='';
    targetUserDom.value='';
    textareaDom.value='';
    textareaDom.placeholder='有什么新鲜事？';
    replyTip.style.display='none';
    maskDom.style.display='flex';
    if (refreshTimer) clearInterval(refreshTimer);
    popOpen = true;
    autoResize(textareaDom); // 打开弹窗重置输入框高度
  }
}

popForm.onsubmit=async function(e){
  e.preventDefault();
    // ========= 核心拦截：图片正在上传，禁止提交 =========
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
    // 防重复提交：禁用发布按钮
  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    if(!pid){
      // 新建帖子
      res = await fetch(`${API_BASE}/add`,{
          method:'POST',
          body:fd,
          credentials: "include"
        });
    }else{
      // ========= 核心修改：移除前端拼接@昵称，只传原始内容 =========
        fd.append('targetUser', targetUserDom.value); 
      fd.append('pid',pid);
      res = await fetch(`${API_BASE}/addReply`,{
          method:'POST',
          body:fd,
          credentials: "include"
        });
    }

    // 接口正常返回
    if(res.ok){
      // 关闭弹窗、清空表单
      maskDom.style.display='none';
      popForm.reset();
      clearMedia();
      popOpen = false;
      // 立即刷新列表
      if(refreshTimer) clearInterval(refreshTimer);
      await updateList();
      startRefreshTimer();
    }
  } catch (err) {
    console.error("提交失败：", err);
    alert("提交失败，请稍后重试");
  } finally {
    // 无论成功/失败，恢复按钮
    submitBtn.disabled = false;
  }
}

maskDom.addEventListener('click', function(e) {
  if (e.target === maskDom) {
    maskDom.style.display = 'none';
    popForm.reset();
    clearMedia();
    popOpen = false;
    startRefreshTimer();
  }
});
notifyMask.addEventListener('click', function(e) {
  if (e.target === notifyMask) {
    notifyMask.style.display = 'none';
    if (!popOpen) {
      startRefreshTimer();
    }
  }
});

function bindMediaEvents(container) {
  console.log('开始绑定媒体事件，容器：', container);
  container.querySelectorAll('.msg-media-img:not([data-event-bound])').forEach(img => {
    img.dataset.eventBound = "true";
    // 图片加载失败兜底
    img.onerror = function () {
      this.style.display = 'none';
    };
    // 点击图片 → 放大预览 + 禁止底层滚动
    img.style.cursor = "zoom-in";
    img.addEventListener('click', function () {
      previewImg.src = this.src;
      imgPreviewMask.style.display = 'flex';
      document.body.style.overflow = 'hidden'; 
    });
  });
}

/**
 * 启动自动刷新定时器（支持动态间隔）
 * @param {number} interval 刷新间隔(毫秒)
 */
function startRefreshTimer(interval = NORMAL_INTERVAL) {
  // 先清空旧定时器，避免多个定时器并发
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(updateList, interval);
  console.log(`✅ 启动定时器，当前间隔：${interval / 1000} 秒`);
}
// ========== 阶段三：监听标签页 前台 / 后台 切换 ==========
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden') {
    console.log('📴 页面切后台，切换为 30 秒刷新');
    startRefreshTimer(BACKGROUND_INTERVAL);
  } else if (document.visibilityState === 'visible') {
    console.log('📱 页面切回前台，立即刷新并恢复 15 秒频率');
    // 先关闭旧定时器，再刷新，避免并发
    if (refreshTimer) clearInterval(refreshTimer);
    updateList();
    startRefreshTimer(NORMAL_INTERVAL);
  }
});

startRefreshTimer();
    
// 关闭图片预览 + 恢复页面滚动
imgPreviewMask.addEventListener('click', function (e) {
  // 点击图片本身不关闭，只点击空白区域关闭
  if (e.target !== previewImg) {
    imgPreviewMask.style.display = 'none';
    previewImg.src = ""; 
    document.body.style.overflow = ''; 
  }
});
(async function init() {
  await updateList();
  bindMediaEvents(document);
})(); 
