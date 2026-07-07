const socket = io();
let currentUser = JSON.parse(localStorage.getItem('chat_user'));
let currentChatTarget = 'group'; 
let cachedMessages = [];
let updatedAvatarBase64 = "";

if (!currentUser) window.location.href = '/index.html';

socket.emit('go-online', currentUser.email);

document.getElementById('prof-name').value = currentUser.name;
document.getElementById('prof-birth').value = currentUser.birthday || '';
document.getElementById('prof-avatar').src = currentUser.avatar || 'https://via.placeholder.com/100';

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`btn-${tabName}`).classList.add('active');
    
    if(tabName === 'group') {
        currentChatTarget = 'group';
        document.getElementById('chat-title').innerText = "الشات الجماعي العام للرفاق";
        document.getElementById('call-actions').classList.add('hidden');
        renderChatArchive();
    }
}

function logout() {
    localStorage.removeItem('chat_user');
    window.location.href = '/index.html';
}

socket.on('update-users-list', ({ users, onlineEmails }) => {
    const listDiv = document.getElementById('users-list');
    const activeChatsDiv = document.getElementById('active-chats-list');
    listDiv.innerHTML = "";
    activeChatsDiv.innerHTML = "";

    Object.keys(users).forEach(email => {
        if(email === currentUser.email) return;
        const user = users[email];
        const isOnline = onlineEmails.includes(email);
        
        const itemHtml = `
            <div class="user-item">
                <img src="${user.avatar || 'https://via.placeholder.com/40'}">
                <div class="user-info">
                    <strong>${user.name}</strong>
                    <span>${isOnline ? 'متصل الآن' : 'غير متصل'}</span>
                </div>
                <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
            </div>
        `;

        const itemNode = document.createElement('div');
        itemNode.innerHTML = itemHtml;
        itemNode.firstElementChild.onclick = () => openUserModal(user, isOnline);
        listDiv.appendChild(itemNode.firstElementChild);

        const activeNode = document.createElement('div');
        activeNode.innerHTML = itemHtml;
        activeNode.firstElementChild.onclick = () => startPrivateChat(user);
        activeChatsDiv.appendChild(activeNode.firstElementChild);
    });
});

function openUserModal(user, isOnline) {
    document.getElementById('modal-name').innerText = user.name;
    document.getElementById('modal-avatar').src = user.avatar || 'https://via.placeholder.com/100';
    
    let ageText = "تاريخ الميلاد غير محدد";
    if(user.birthday) {
        const age = new Date().getFullYear() - new Date(user.birthday).getFullYear();
        ageText = `العمر الحالي: ${age} عام`;
    }
    document.getElementById('modal-age').innerText = ageText;
    
    const chatBtn = document.getElementById('modal-chat-btn');
    chatBtn.onclick = () => {
        startPrivateChat(user);
        closeModal();
    };
    
    document.getElementById('user-modal').classList.remove('hidden');
}

function closeModal() { 
    document.getElementById('user-modal').classList.add('hidden'); 
}

function startPrivateChat(user) {
    currentChatTarget = user.email;
    document.getElementById('chat-title').innerText = `المحادثة السرية مع: ${user.name}`;
    document.getElementById('call-actions').classList.remove('hidden');
    
    document.getElementById('audioCallBtn').onclick = () => startCall(user.email, 'audio');
    document.getElementById('videoCallBtn').onclick = () => startCall(user.email, 'video');
    
    renderChatArchive();
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    if (!input.value.trim()) return;

    const msgData = { from: currentUser.name, text: input.value, type: 'text', to: currentChatTarget };
    if(currentChatTarget === 'group') {
        socket.emit('group-message', msgData);
    } else {
        socket.emit('private-message', msgData);
    }
    input.value = "";
}

socket.on('group-message', (data) => {
    cachedMessages.push(data);
    if(currentChatTarget === 'group') displayMessage(data);
});

socket.on('private-message', (data) => {
    cachedMessages.push(data);
    if(currentChatTarget === data.to || (data.to === currentUser.email && currentChatTarget === data.fromEmail)) {
         displayMessage(data);
    }
});

// استقبال وتحميل الأرشيف القديم من السيرفر وعرضه للهدف الحالي فقط
socket.on('load-past-messages', ({ allPastMessages }) => {
    cachedMessages = allPastMessages;
    renderChatArchive();
});

function renderChatArchive() {
    const box = document.getElementById('messages-box');
    box.innerHTML = "";
    
    cachedMessages.forEach(data => {
        if (data.to === 'group' && currentChatTarget === 'group') {
            displayMessage(data);
        } else if (currentChatTarget !== 'group' && 
                ((data.to === currentChatTarget && data.fromEmail === currentUser.email) || 
                 (data.to === currentUser.email && data.fromEmail === currentChatTarget))) {
            displayMessage(data);
        }
    });
}

function displayMessage(data) {
    const box = document.getElementById('messages-box');
    const msgEl = document.createElement('div');
    msgEl.className = `message ${data.from === currentUser.name ? 'mine' : ''}`;
    
    if (data.type === 'text') {
        msgEl.innerText = `${data.from}: ${data.text}`;
    } else if (data.type === 'image') {
        msgEl.innerHTML = `${data.from}: <br><img src="${data.file}" style="max-width:220px; border-radius:8px; margin-top:5px;">`;
    } else if (data.type === 'audio') {
        msgEl.innerHTML = `${data.from}: <br><audio src="${data.file}" controls style="margin-top:5px; max-width: 100%;"></audio>`;
    }
    
    box.appendChild(msgEl);
    box.scrollTop = box.scrollHeight;
}

function sendImageMessage(event) {
    const file = event.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function() {
        const msgData = { from: currentUser.name, file: reader.result, type: 'image', to: currentChatTarget };
        if(currentChatTarget === 'group') socket.emit('group-message', msgData);
        else socket.emit('private-message', msgData);
    }
    reader.readAsDataURL(file);
}

let mediaRecorder;
let audioChunks = [];
function triggerAudioRecord() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/ogg' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const msgData = { from: currentUser.name, file: reader.result, type: 'audio', to: currentChatTarget };
                    if(currentChatTarget === 'group') socket.emit('group-message', msgData);
                    else socket.emit('private-message', msgData);
                };
                reader.readAsDataURL(audioBlob);
                audioChunks = [];
            };
            mediaRecorder.start();
            alert("بدأ تسجيل رسالتك الصوتية الآن 🎤.. اضغط على زر المايك مرة أخرى لإنهائها وإرسالها فوراً.");
        }).catch(() => alert("يرجى إعطاء صلاحية الميكروفون للموقع"));
    } else {
        mediaRecorder.stop();
    }
}

function previewUpdateAvatar(e) {
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('prof-avatar').src = reader.result;
        updatedAvatarBase64 = reader.result;
    }
    if(e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
}

async function updateProfile() {
    const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            email: currentUser.email,
            name: document.getElementById('prof-name').value,
            birthday: document.getElementById('prof-birth').value,
            avatar: updatedAvatarBase64 || currentUser.avatar
        })
    });
    const data = await res.json();
    if(data.success) {
        localStorage.setItem('chat_user', JSON.stringify(data.user));
        currentUser = data.user;
        alert("تم تحديث بيانات حسابك!");
    }
}

// --- منظومة الاتصالات WebRTC ---
let localStream, peerConnection;
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startCall(targetEmail, type) {
    document.getElementById('video-container').classList.remove('hidden');
    localStream = await navigator.mediaDevices.getUserMedia({ video: type==='video', audio: true });
    document.getElementById('localVideo').srcObject = localStream;

    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = e => {
        if(e.candidate) socket.emit('ice-candidate', { to: targetEmail, candidate: e.candidate });
    };
    peerConnection.ontrack = e => {
        document.getElementById('remoteVideo').srcObject = e.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('call-user', { to: targetEmail, offer, type });
}

socket.on('incoming-call', async (data) => {
    if(confirm(`لديك اتصال وارد من ${data.from} (${data.type === 'video' ? 'مرئي' : 'صوتي'}). هل تود القبول؟`)) {
        document.getElementById('video-container').classList.remove('hidden');
        localStream = await navigator.mediaDevices.getUserMedia({ video: data.type==='video', audio: true });
        document.getElementById('localVideo').srcObject = localStream;

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = e => {
            if(e.candidate) socket.emit('ice-candidate', { to: data.from, candidate: e.candidate });
        };
        peerConnection.ontrack = e => {
            document.getElementById('remoteVideo').srcObject = e.streams[0];
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer-call', { to: data.from, answer });
    }
});

socket.on('call-answered', async (data) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', async (data) => {
    if(peerConnection && data.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
});

function endCall() {
    if(localStream) localStream.getTracks().forEach(track => track.stop());
    document.getElementById('video-container').classList.add('hidden');
    alert("تم إنهاء المكالمة الحالية.");
}
