const currentUser = JSON.parse(localStorage.getItem('chat_user') || 'null');
if (!currentUser) {
    window.location.href = '/';
}

const socket = io();
let currentChatTarget = 'group'; // 'group' أو بريد المستخدم المستهدف
let allUsers = {};
let onlineEmails = [];
let allMessages = [];

function loadUserProfile() {
    document.getElementById('prof-name').value = currentUser.name || '';
    document.getElementById('prof-birth').value = currentUser.birthday || '';
    if (currentUser.avatar) document.getElementById('prof-avatar').src = currentUser.avatar;
}
loadUserProfile();

socket.on('connect', () => {
    socket.emit('go-online', currentUser.email);
});

socket.on('update-users-list', (data) => {
    allUsers = data.users;
    onlineEmails = data.onlineEmails;
    renderUsersList();
});

function renderUsersList() {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    usersList.innerHTML = '';
    Object.values(allUsers).forEach(user => {
        if (user.email === currentUser.email) return;
        const isOnline = onlineEmails.includes(user.email);
        const card = document.createElement('div');
        card.className = 'user-grid-card';
        card.onclick = () => openPrivateChat(user.name, user.email);
        card.innerHTML = `
            ${isOnline ? '<div class="online-badge"></div>' : ''}
            <img src="${user.avatar || '/uploads/default-avatar.png'}" alt="${user.name}">
            <div class="user-grid-info">
                <span class="name">${user.name}</span>
                <span class="age">${user.birthday || ''}</span>
            </div>`;
        usersList.appendChild(card);
    });
}

socket.on('load-past-messages', (data) => {
    allMessages = data.allPastMessages || [];
    renderCurrentChat();
});

function renderCurrentChat() {
    const box = document.getElementById('messages-box');
    if (!box) return;
    box.innerHTML = '';
    const relevant = allMessages.filter(msg => {
        if (currentChatTarget === 'group') return !msg.to;
        return (msg.fromEmail === currentUser.email && msg.to === currentChatTarget) ||
               (msg.fromEmail === currentChatTarget && msg.to === currentUser.email);
    });
    relevant.forEach(msg => appendMessage(msg.text, msg.fromEmail === currentUser.email ? 'mine' : 'others'));
}

function openPrivateChat(username, email) {
    currentChatTarget = email;
    document.getElementById('screen-users').style.display = 'none';
    document.getElementById('screen-chats').style.display = 'none';
    document.getElementById('main-chat-screen').style.display = 'flex';
    document.getElementById('chat-title').innerText = `🔐 محادثة خاصة مع: ${username}`;
    renderCurrentChat();
}

function backToGroup() {
    currentChatTarget = 'group';
    renderCurrentChat();
}

function sendMessageDirectly() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const msgData = { text, fromEmail: currentUser.email, fromName: currentUser.name };

    if (currentChatTarget === 'group') {
        socket.emit('group-message', msgData);
    } else {
        socket.emit('private-message', { ...msgData, to: currentChatTarget });
    }
    input.value = '';
}

socket.on('group-message', (data) => {
    if (currentChatTarget === 'group') {
        appendMessage(data.text, data.fromEmail === currentUser.email ? 'mine' : 'others');
    }
});

socket.on('private-message', (data) => {
    const belongs = (data.fromEmail === currentChatTarget && data.to === currentUser.email) ||
                    (data.fromEmail === currentUser.email && data.to === currentChatTarget);
    if (belongs) appendMessage(data.text, data.fromEmail === currentUser.email ? 'mine' : 'others');
});

function appendMessage(text, type) {
    const box = document.getElementById('messages-box');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `message ${type}`;
    if (text.startsWith('data:image')) {
        div.innerHTML = `<img src="${text}" style="max-width:200px;border-radius:8px;">`;
    } else if (text.startsWith('data:audio')) {
        div.innerHTML = `<audio controls src="${text}" style="max-width:200px;"></audio>`;
    } else {
        div.innerText = text;
    }
    box.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const box = document.getElementById('messages-box');
    if (box) box.scrollTop = box.scrollHeight;
}

// 📷 إرسال صورة (base64 مباشرة عبر السوكيت، بدون رفع للسيرفر)
const sendImageInput = document.getElementById('send-image');
if (sendImageInput) {
    sendImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const msgData = { text: reader.result, fromEmail: currentUser.email, fromName: currentUser.name };
            if (currentChatTarget === 'group') socket.emit('group-message', msgData);
            else socket.emit('private-message', { ...msgData, to: currentChatTarget });
        };
        reader.readAsDataURL(file);
    });
}

// 🎤 تسجيل صوتي
const voiceBtn = document.getElementById('voiceBtn');
let mediaRecorder, audioChunks = [], isRecording = false;

if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.start();
                isRecording = true;
                voiceBtn.style.color = '#ef4444';
                audioChunks = [];
                mediaRecorder.addEventListener("dataavailable", e => audioChunks.push(e.data));
                mediaRecorder.addEventListener("stop", () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = () => {
                        const msgData = { text: reader.result, fromEmail: currentUser.email, fromName: currentUser.name };
                        if (currentChatTarget === 'group') socket.emit('group-message', msgData);
                        else socket.emit('private-message', { ...msgData, to: currentChatTarget });
                    };
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach(t => t.stop());
                });
            }).catch(() => alert("يرجى تفعيل صلاحية الوصول إلى المايك."));
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.style.color = '#94a3b8';
        }
    });
}

// ☎️ مكالمات صوت/فيديو حقيقية عبر WebRTC (متوافقة مع أحداث server.js)
let peerConnection = null;
let localStream = null;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startCall(type) {
    if (currentChatTarget === 'group') {
        alert('الاتصال متاح فقط داخل محادثة خاصة. افتح محادثة مع شخص أولاً.');
        return;
    }
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', { to: currentChatTarget, candidate: e.candidate });
    };
    peerConnection.ontrack = (e) => playRemoteStream(e.streams[0]);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call-user', { to: currentChatTarget, offer, type });
}

document.getElementById('audioCallBtn').addEventListener('click', () => startCall('audio'));
document.getElementById('videoCallBtn').addEventListener('click', () => startCall('video'));

socket.on('incoming-call', async (data) => {
    const accept = confirm(`مكالمة ${data.type === 'video' ? 'فيديو' : 'صوتية'} واردة من ${data.from}. الرد؟`);
    if (!accept) return;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: data.type === 'video' });
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', { to: data.from, candidate: e.candidate });
    };
    peerConnection.ontrack = (e) => playRemoteStream(e.streams[0]);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer-call', { to: data.from, answer });
});

socket.on('call-answered', async (data) => {
    if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); }
        catch (e) { console.error(e); }
    }
});

function playRemoteStream(stream) {
    let audioEl = document.getElementById('remote-audio');
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'remote-audio';
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
    }
    audioEl.srcObject = stream;
}

// 👤 حفظ البروفايل (يستعمل /api/update-profile الحقيقي في server.js)
const updateAvatarInput = document.getElementById('update-avatar');
let pendingAvatar = null;
if (updateAvatarInput) {
    updateAvatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            pendingAvatar = reader.result;
            document.getElementById('prof-avatar').src = pendingAvatar;
        };
        reader.readAsDataURL(file);
    });
}

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const name = document.getElementById('prof-name').value;
    const birthday = document.getElementById('prof-birth').value;
    const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email, name, avatar: pendingAvatar || currentUser.avatar, birthday })
    });
    const data = await res.json();
    if (data.success) {
        currentUser.name = data.user.name;
        currentUser.avatar = data.user.avatar;
        currentUser.birthday = data.user.birthday;
        localStorage.setItem('chat_user', JSON.stringify(currentUser));
        alert('تم حفظ التعديلات بنجاح! 🎉');
    }
});
