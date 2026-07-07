const socket = io();
let currentChatTarget = 'group'; 
let currentUserId = localStorage.getItem('userId') || ''; 

// عند بدء التشغيل: جلب بيانات الملف الشخصي الحالية لعرض الصورة والاسم
function loadUserProfile() {
    fetch('/api/user/profile')
        .then(res => res.json())
        .then(user => {
            if (user) {
                if(document.getElementById('prof-name')) document.getElementById('prof-name').value = user.name || '';
                if(document.getElementById('prof-birth')) document.getElementById('prof-birth').value = user.age || '';
                if(user.avatar && document.getElementById('prof-avatar')) {
                    document.getElementById('prof-avatar').src = user.avatar;
                }
            }
        })
        .catch(err => console.error("خطأ في جلب بيانات الملف الشخصي:", err));
}
loadUserProfile();

// 👥 تحديث قائمة المستخدمين المتصلين ديناميكياً بالشكل الشبكي
socket.on('updateUsers', (users) => {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = ''; 

    users.forEach(user => {
        if (user._id === currentUserId) return; 

        const userCard = `
            <div class="user-grid-card" onclick="openPrivateChat('${user.name}', '${user._id}')">
                <div class="online-badge"></div>
                <img src="${user.avatar || '/uploads/default-avatar.png'}" alt="${user.name}">
                <div class="user-grid-info">
                    <span class="name">${user.name}</span>
                    <span class="age">${user.age || ''}</span>
                </div>
            </div>
        `;
        usersList.innerHTML += userCard;
    });
});

// 🔐 فتح محادثة خاصة وجلب الأرشيف
function openPrivateChat(username, userId) {
    currentChatTarget = userId; 
    
    document.getElementById('screen-users').style.display = 'none';
    document.getElementById('screen-chats').style.display = 'none';
    document.getElementById('main-chat-screen').style.display = 'flex';
    
    document.getElementById('chat-title').innerText = `🔐 محادثة خاصة مع: ${username}`;
    
    const box = document.getElementById('messages-box');
    box.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; margin: 10px 0;">بداية المحادثة الآمنة مع ${username}</div>`;
    
    fetch(`/api/messages/private/${userId}`)
        .then(res => res.json())
        .then(messages => {
            messages.forEach(msg => {
                const type = (msg.senderId === currentUserId) ? 'mine' : 'others';
                appendMessage(msg.text, type);
            });
            scrollToBottom();
        })
        .catch(err => console.error("خطأ في جلب الأرشيف:", err));
}

// 💬 دالة الإرسال الفوري للرسائل النصية والربط عبر السوكيت
function sendMessageDirectly() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    const messageText = input.value.trim();
    if (!messageText) return;

    appendMessage(messageText, 'mine');

    socket.emit('chatMessage', { 
        text: messageText, 
        to: currentChatTarget,
        isPrivate: currentChatTarget !== 'group'
    });

    input.value = '';
    setTimeout(scrollToBottom, 50);
}

// استقبال الرسائل الحية من السيرفر
socket.on('message', (msg) => {
    if (msg.from === currentChatTarget || (currentChatTarget === 'group' && !msg.isPrivate)) {
        appendMessage(msg.text, 'others');
    }
});

function appendMessage(text, type) {
    const box = document.getElementById('messages-box');
    if (!box) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.innerText = text;
    box.appendChild(msgDiv);
    scrollToBottom();
}

// 📷 رفع وإرسال الصور من الكاميرا أو المعرض
const sendImageInput = document.getElementById('send-image');
if (sendImageInput) {
    sendImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);
        formData.append('to', currentChatTarget);

        fetch('/api/messages/upload-image', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                appendMessage(`📷 صورة المرفق`, 'mine');
                socket.emit('chatMessage', { text: `📷 صورة المرفق`, to: currentChatTarget });
            }
        });
    });
}

// 🎤 تسجيل وإرسال الفوكال الصوتي المباشر عبر المايك
const voiceBtn = document.getElementById('voiceBtn');
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.start();
                    isRecording = true;
                    voiceBtn.style.color = '#ef4444'; 
                    audioChunks = [];

                    mediaRecorder.addEventListener("dataavailable", event => {
                        audioChunks.push(event.data);
                    });

                    mediaRecorder.addEventListener("stop", () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                        const formData = new FormData();
                        formData.append('audio', audioBlob);
                        formData.append('to', currentChatTarget);

                        fetch('/api/messages/upload-audio', {
                            method: 'POST',
                            body: formData
                        })
                        .then(res => res.json())
                        .then(data => {
                            if (data.success) {
                                appendMessage(`🎵 فوكال صوتي`, 'mine');
                            }
                        });
                    });
                })
                .catch(err => alert("يرجى تفعيل صلاحية الوصول إلى المايك لتسجيل الفوكال."));
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.style.color = '#94a3b8';
        }
    });
}

// 📞 أزرار الاتصال الصوتي والمرئي (WebRTC)
document.getElementById('audioCallBtn').addEventListener('click', () => {
    socket.emit('callUser', { userToCall: currentChatTarget, type: 'audio' });
});
document.getElementById('videoCallBtn').addEventListener('click', () => {
    socket.emit('callUser', { userToCall: currentChatTarget, type: 'video' });
});

// 👤 حفظ تعديلات الملف الشخصي ورفع الصورة الجديدة للبروفايل الشخصي فوراً
const updateAvatarInput = document.getElementById('update-avatar');
if(updateAvatarInput) {
    updateAvatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const formData = new FormData();
        formData.append('avatar', file);

        fetch('/api/user/upload-avatar', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                document.getElementById('prof-avatar').src = data.avatarUrl;
                alert('تم تحديث الصورة الشخصية بنجاح! 📸');
            }
        });
    });
}

document.getElementById('saveProfileBtn').addEventListener('click', () => {
    const name = document.getElementById('prof-name').value;
    const age = document.getElementById('prof-birth').value; 

    fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) alert('تم حفظ التعديلات بنجاح! 🎉');
    });
});
