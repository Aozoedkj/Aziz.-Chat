// 🌐 ربط الـ Socket.io وتحديد المتغيرات الأساسية للمستخدم
const socket = io();
let currentChatTarget = 'group'; // الافتراضي الشات الجماعي
let currentUserId = localStorage.getItem('userId') || ''; // معرف المستخدم الحالي من الـ LocalStorage

// ----------------------------------------------------
// 👥 1. تحديث قائمة المستخدمين الحقيقيين بالشبكة الثلاثية (Grid)
// ----------------------------------------------------
socket.on('updateUsers', (users) => {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = ''; // تنظيف القائمة لاستقبال البيانات الحية

    users.forEach(user => {
        // تخطي حسابك الشخصي حتى لا تظهر في قائمة أصدقائك
        if (user._id === currentUserId) return; 

        // بناء كرت المستخدم الشبكي الحقيقي بناءً على بيانات السيرفر
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

// ----------------------------------------------------
// 🔐 2. فتح المحادثات الخاصة وجلب الأرشيف الحقيقي من السيرفر
// ----------------------------------------------------
function openPrivateChat(username, userId) {
    currentChatTarget = userId; // تغيير الوجهة لمعرف الشخص المختار
    
    // التبديل البصري للواجهات
    document.getElementById('screen-users').style.display = 'none';
    document.getElementById('screen-chats').style.display = 'none';
    document.getElementById('main-chat-screen').style.display = 'flex';
    
    // تحديث الهيدر العلوي باسم الصديق
    document.getElementById('chat-title').innerText = `🔐 محادثة خاصة مع: ${username}`;
    
    // تنظيف صندوق الرسائل القديم
    const box = document.getElementById('messages-box');
    box.innerHTML = `<div style="text-align:center; color:#94a3b8; font-size:12px; margin: 10px 0;">بداية المحادثة الآمنة مع ${username}</div>`;
    
    // جلب أرشيف الخاص بينك وبينه عبر الـ API الحقيقي في مشروعك
    fetch(`/api/messages/private/${userId}`)
        .then(res => res.json())
        .then(messages => {
            messages.forEach(msg => {
                const type = (msg.senderId === currentUserId) ? 'mine' : 'others';
                appendMessage(msg.text, type);
            });
            scrollToBottom();
        })
        .catch(err => console.error("خطأ في جلب أرشيف الخاص:", err));
}

// ----------------------------------------------------
// 💬 3. معالجة إرسال واستقبال الرسائل النصية والوسائط
// ----------------------------------------------------
function sendMessageDirectly() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    const messageText = input.value.trim();
    if (!messageText) return;

    // عرض الرسالة في شاشتك فوراً لسرعة الاستجابة اللحظية
    appendMessage(messageText, 'mine');

    // إرسال البيانات للسيرفر عبر السوكيت
    socket.emit('chatMessage', { 
        text: messageText, 
        to: currentChatTarget,
        isPrivate: currentChatTarget !== 'group'
    });

    input.value = '';
    setTimeout(scrollToBottom, 50);
}

// استقبال كافة الرسائل الحية من السيرفر وعرضها فوراً
socket.on('message', (msg) => {
    if (msg.from === currentChatTarget || (currentChatTarget === 'group' && !msg.isPrivate)) {
        appendMessage(msg.text, 'others');
    } else {
        // تحديث تنبيهات قائمة المحادثات الجارية إذا كانت النافذة مغلقة
        updateActiveChatsList(msg);
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

function scrollToBottom() {
    const box = document.getElementById('messages-box');
    if (box) box.scrollTop = box.scrollHeight;
}

// ----------------------------------------------------
// 📷 4. ميزة إرسال الصور والكاميرا المباشرة
// ----------------------------------------------------
const sendImageInput = document.getElementById('send-image');
if (sendImageInput) {
    sendImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);
        formData.append('to', currentChatTarget);

        // رفع الصورة للسيرفر عبر الـ API وإرسالها عبر السوكيت
        fetch('/api/messages/upload-image', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // عرض الصورة في صندوق الرسائل كمرفق
                appendMessage(`📷 صورة: ${data.imageUrl}`, 'mine');
                socket.emit('chatMessage', { text: `📷 صورة: ${data.imageUrl}`, to: currentChatTarget });
            }
        })
        .catch(err => console.error("خطأ في رفع الصورة:", err));
    });
}

// ----------------------------------------------------
// 🎤 5. ميزة الفوكال (تسجيل وإرسال المقاطع الصوتية)
// ----------------------------------------------------
const voiceBtn = document.getElementById('voiceBtn');
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!isRecording) {
            // بدء التسجيل الصوتي
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.start();
                    isRecording = true;
                    voiceBtn.style.color = '#ef4444'; // تغيير لون المايك للأحمر أثناء التسجيل
                    audioChunks = [];

                    mediaRecorder.addEventListener("dataavailable", event => {
                        audioChunks.push(event.data);
                    });

                    mediaRecorder.addEventListener("stop", () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                        const formData = new FormData();
                        formData.append('audio', audioBlob);
                        formData.append('to', currentChatTarget);

                        // رفع الفوكال للسيرفر
                        fetch('/api/messages/upload-audio', {
                            method: 'POST',
                            body: formData
                        })
                        .then(res => res.json())
                        .then(data => {
                            if (data.success) {
                                appendMessage(`🎵 فوكال صوتي`, 'mine');
                                socket.emit('chatMessage', { text: `🎵 فوكال صوتي: ${data.audioUrl}`, to: currentChatTarget });
                            }
                        });
                    });
                })
                .catch(err => console.error("لم يتم العثور على صلاحيات المايك:", err));
        } else {
            // إيقاف التسجيل وإرساله
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.style.color = '#94a3b8'; // إعادة اللون الافتراضي
        }
    });
}

// ----------------------------------------------------
// 📞 6. ميزة الاتصالات الجارية (صوت وفيديو WebRTC)
// ----------------------------------------------------
const audioCallBtn = document.getElementById('audioCallBtn');
const videoCallBtn = document.getElementById('videoCallBtn');
const endCallBtn = document.getElementById('endCallBtn');

if (audioCallBtn) {
    audioCallBtn.addEventListener('click', () => {
        document.getElementById('video-container').classList.remove('hidden');
        socket.emit('callUser', { userToCall: currentChatTarget, signalData: {}, from: currentUserId, type: 'audio' });
    });
}

if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => {
        document.getElementById('video-container').classList.remove('hidden');
        socket.emit('callUser', { userToCall: currentChatTarget, signalData: {}, from: currentUserId, type: 'video' });
    });
}

if (endCallBtn) {
    endCallBtn.addEventListener('click', () => {
        document.getElementById('video-container').classList.add('hidden');
        socket.emit('endCall', { to: currentChatTarget });
    });
}

// الاستماع لإشارات الاتصال الواردة من السيرفر
socket.on('callIncoming', (data) => {
    if(confirm(`اتصال ${data.type} وارد من مستخدم آخر، هل تقبل؟`)) {
        document.getElementById('video-container').classList.remove('hidden');
        socket.emit('answerCall', { signal: {}, to: data.from });
    }
});

socket.on('callEnded', () => {
    document.getElementById('video-container').classList.add('hidden');
});

// ----------------------------------------------------
// 👤 7. حفظ التعديلات للملَّف الشخصي (العمر النصي المرن)
// ----------------------------------------------------
const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
        const name = document.getElementById('prof-name').value;
        const age = document.getElementById('prof-birth').value; // جلب النص مثل "16-17" أو "22"

        fetch('/api/user/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('تم حفظ التعديلات بنجاح! 🎉');
            } else {
                alert('حدث خطأ أثناء حفظ البيانات القديمة.');
            }
        })
        .catch(err => console.error("خطأ في تحديث البيانات الشخصية:", err));
    });
}

// دالة مرجعية لتحديث قائمة المحادثات الجارية في القائمة الجانبية
function updateActiveChatsList(msg) {
    const chatsList = document.getElementById('active-chats-list');
    if (!chatsList) return;
}

// عند تحميل الصفحة تأكد من النزول لأسفل الشات تلقائياً
window.onload = () => {
    scrollToBottom();
};
