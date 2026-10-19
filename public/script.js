
const $ = selector => document.querySelector(selector);

const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000
});

const NAME_KEY = "narenj-lobby-name";

const nameModal = $("#nameModal");
const nameForm = $("#nameForm");
const nameInput = $("#nameInput");
const nameError = $("#nameError");
const messagesArea = $("#messagesArea");
const messagesList = $("#messagesList");
const messageInput = $("#messageInput");
const sendButton = $("#sendButton");
const messageForm = $("#messageForm");
const toastElement = $("#toast");

let myName = "";
let mySocketId = "";
let joined = false;
let toastTimer;
let renderedIds = new Set();

function persianDigits(value) {
  return String(value).replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[digit]);
}

function getInitial(name) {
  return Array.from(name.trim())[0] || "؟";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatTime(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function updateProfile() {
  $("#myName").textContent = myName || "مهمان";
  $("#myAvatar").textContent = getInitial(myName || "؟");
}

function setConnection(status, text) {
  const dot = $("#connectionDot");

  dot.classList.remove("connected", "disconnected");

  if (status === "connected") {
    dot.classList.add("connected");
  } else if (status === "disconnected") {
    dot.classList.add("disconnected");
  }

  $("#connectionText").textContent = text;
  updateComposer();
}

function updateComposer() {
  const ready = socket.connected && joined;

  messageInput.disabled = !ready;
  sendButton.disabled = !ready;

  $("#messageCounter").textContent =
    `${persianDigits(messageInput.value.length)}/۱۰۰۰`;

  messageInput.style.height = "auto";
  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 130) + "px";
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 2600);
}

function openNameModal() {
  nameInput.value = myName;
  nameError.textContent = "";
  nameModal.classList.remove("hidden");

  setTimeout(() => nameInput.focus(), 50);
}

function closeNameModal() {
  nameModal.classList.add("hidden");
}

function joinLobby(name) {
  myName = name;
  joined = false;
  mySocketId = "";

  updateProfile();
  updateComposer();

  if (socket.connected) {
    socket.emit("user:join", myName);
  } else {
    setConnection("disconnected", "در حال اتصال مجدد...");
  }
}

nameForm.addEventListener("submit", event => {
  event.preventDefault();

  const name = nameInput.value.trim();

  if (!name) {
    nameError.textContent = "لطفاً اسمت رو وارد کن.";
    nameInput.focus();
    return;
  }

  if (Array.from(name).length > 24) {
    nameError.textContent = "اسمت حداکثر ۲۴ کاراکتر باشه.";
    return;
  }

  const previousName = myName;

  localStorage.setItem(NAME_KEY, name);
  myName = name;
  updateProfile();
  closeNameModal();

  if (socket.connected && joined) {
    if (previousName === name) return;

    // Reconnect so the server associates this connection
    // with the new display name.
    socket.disconnect();
    socket.connect();
  } else {
    joinLobby(name);
  }
});

$("#changeName").addEventListener("click", openNameModal);

socket.on("connect", () => {
  setConnection("connected", "اتصال برقرار شد");

  if (myName) {
    socket.emit("user:join", myName);
  } else {
    openNameModal();
  }
});

socket.on("disconnect", () => {
  joined = false;
  mySocketId = "";

  setConnection("disconnected", "ارتباط قطع شد؛ در حال اتصال مجدد...");
});

socket.on("connect_error", () => {
  setConnection("disconnected", "اتصال به سرور برقرار نشد");
});

socket.on("user:ready", data => {
  if (!data || typeof data.id !== "string") return;

  mySocketId = data.id;
  myName = data.name;
  joined = true;

  localStorage.setItem(NAME_KEY, myName);

  updateProfile();
  updateComposer();

  $("#loadingState").classList.add("hidden");

  if (nameModal.classList.contains("hidden")) {
    showToast(`خوش اومدی ${myName} جان!`);
  }

  messageInput.focus();
});

socket.on("lobby:history", history => {
  if (!Array.isArray(history)) return;

  messagesList.replaceChildren();
  renderedIds.clear();

  history.forEach(message => renderMessage(message, false));

  $("#loadingState").classList.add("hidden");
  scrollToBottom();
});

socket.on("lobby:message", message => {
  renderMessage(message, true);
});

socket.on("lobby:users", count => {
  if (typeof count !== "number" || !Number.isFinite(count)) return;

  $("#userCount").textContent = persianDigits(count);
});

socket.on("lobby:error", message => {
  showToast(String(message).slice(0, 200));
});

function renderMessage(message, shouldScroll = true) {
  if (!message || typeof message.id !== "string") return;
  if (renderedIds.has(message.id)) return;

  renderedIds.add(message.id);

  if (message.type === "system") {
    const systemMessage = document.createElement("div");
    systemMessage.className = "system-message";

    const span = document.createElement("span");
    span.textContent = message.text || "";

    systemMessage.appendChild(span);
    messagesList.appendChild(systemMessage);
  } else if (message.type === "chat") {
    const mine = message.userId === mySocketId;

    const row = document.createElement("article");
    row.className = "message-row" + (mine ? " mine" : "");

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = getInitial(message.name || "؟");

    const content = document.createElement("div");
    content.className = "message-content";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = message.name || "مهمان";

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatTime(message.time);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = message.text || "";

    meta.append(name, time);
    content.append(meta, bubble);
    row.append(avatar, content);
    messagesList.appendChild(row);
  } else {
    renderedIds.delete(message.id);
    return;
  }

  while (messagesList.children.length > 150) {
    messagesList.firstElementChild.remove();
  }

  if (shouldScroll) scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  });
}

messageForm.addEventListener("submit", event => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text) return;

  if (!socket.connected || !joined) {
    showToast("هنوز به لابی متصل نیستی.");
    return;
  }

  socket.emit("lobby:send", text);

  messageInput.value = "";
  updateComposer();
  messageInput.focus();
});

messageInput.addEventListener("input", updateComposer);

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

$("#emojiButton").addEventListener("click", () => {
  if (messageInput.disabled) return;

  const emojis = ["😀", "😂", "❤️", "🔥", "👍", "😍", "🎉", "🤝"];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  const value = messageInput.value;

  messageInput.value =
    value.slice(0, start) + emoji + value.slice(end);

  const cursor = start + emoji.length;

  messageInput.focus();
  messageInput.setSelectionRange(cursor, cursor);

  updateComposer();
});

$("#roomInfo").addEventListener("click", () => {
  showToast(
    "این یک لابی عمومی است؛ پیام‌ها برای همه کاربران متصل نمایش داده می‌شوند."
  );
});

// Restore the saved display name. The server still validates
// the name and the connection must be re-established to join.
try {
  const savedName = localStorage.getItem(NAME_KEY);

  if (savedName && savedName.trim()) {
    myName = savedName.trim().slice(0, 24);
    updateProfile();
  }
} catch {
  myName = "";
}

updateProfile();
updateComposer();

if (!myName) {
  openNameModal();
}
