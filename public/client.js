// 🌐 ربط الـ Socket.io وتحديد المتغيرات الأساسية للمستخدم
const socket = io();
let currentChatTarget = 'group'; // الافتراضي هو الشات الجماعي
let currentUserId = localStorage.getItem('userId') || ''; // معرف المستخدم الحالي المخزن

// 1️⃣ تحديث قائمة المستخدمين المتصلين بالشبكة الثلاثية (Grid) فوراً من قاعدة البيانات
socket.on('updateUsers', (users) => {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;
    
    usersList.innerHTML = ''; // مسح القائمة القديمة

    users.forEach(user => {
        // تخطي حسابك الشخصي حتى لا تظهر وتدردش مع نفسك
        if (user._id === currentUserId) return; 

        // إنشاء كرت المستخدم الشبكي الاحترافي (3 أعمدة)
        const userCard = `
            <div class="user-grid-card" onclick="openPrivateChat('${user.name}', '${user._id}')">
                <div class="online-badge"></div>
                <img src="${user.avatar || 'https://via.placeholder.com/150'}" alt="${user.name}">
                <div class="user-grid-info">
                    <span class="name">${user.name}</span>
                    <span class="age">${user.age || ''}</span>
                </div>
            </div>
        `;
        usersList.innerHTML += userCard;
    });
});

// 2️⃣ استقبال كافة الرسائل الحية (سواء عامة أو خاصة) وعرضها فوراً دون ريفريش
socket.on('message', (msg) => {
    // التأكد من أن الرسالة تخص المحادثة المفتوحة حالياً أمامك
    if (msg.from === currentChatTarget || (currentChatTarget === 'group' && !msg.isPrivate)) {
        appendMessage(msg.text, 'others');
    } else {
        // إذا جاءتك رسالة من صديق والنافذة مغلقة، يتم تحديث قائمة المحادثات النشطة
        updateActiveChatsList(msg);
    }
});

// 3️⃣ دالة جلب وعرض رسائل الخاص الفورية عند الضغط على أي مستخدم (مثل فلات)
function openPrivateChat(username, userId) {
    currentChatTarget = userId; // تحويل وجهة الإرسال إلى معرف هذا الشخص
    
    // التبديل البصري الفوري بين الواجهات
    document.getElementById('screen-users').style.display = 'none';
    document.getElementById('screen-chats').style.display = 'none';
    document.getElementById('main-chat-screen').style.display = 'flex';
    
    // تحديث هيدر الشات باسم الصديق
    document.getElementById('chat-title').innerText = `🔐 محادثة خاصة مع: ${username}`;
    
    // تنظيف صندوق الرسائل القديم وجلب الأرشيف من السيرفر
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
        .catch(err => console.error("خطأ في جلب أرشيف الخاص:", err));
}

// 4️⃣ دالة إرسال الرسالة المباشرة من حقل الإدخال
function sendMessageDirectly() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    const messageText = input.value.trim();
    if (!messageText) return;

    // عرض رسالتك في شاشتك فوراً لسرعة الاستجابة اللحظية
    appendMessage(messageText, 'mine');

    // إرسال الإشارة للسيرفر عبر السوكيت
    socket.emit('chatMessage', { 
        text: messageText, 
        to: currentChatTarget,
        isPrivate: currentChatTarget !== 'group'
    });

    input.value = '';
    setTimeout(scrollToBottom, 50);
}

// 5️⃣ إضافة الرسائل هيكلياً داخل الصندوق والنزول لأسفل الشاشة
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

// 6️⃣ حفظ تعديلات الملف الشخصي (الاسم الكامل والعمر النصي المرن)
const saveProfileBtn = document.getElementById('saveProfileBtn');
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', () => {
        const name = document.getElementById('prof-name').value;
        const age = document.getElementById('prof-birth').value; // يدعم نصوص مثل "16-17"

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
                alert('حدث خطأ أثناء حفظ البيانات.');
            }
        })
        .catch(err => console.error("خطأ في تحديث الملف الشخصي:", err));
    });
}

// دالة مرجعية لتحديث المحادثات الجارية في القائمة الجانبية
function updateActiveChatsList(msg) {
    const chatsList = document.getElementById('active-chats-list');
    if (!chatsList) return;
    // هنا يتم تكرار وتحديث المحادثات النشطة حسب الرغبة لاحقاً
}

// عند تحميل الصفحة تأكد من النزول لأسفل الشات التلقائي
window.onload = () => {
    scrollToBottom();
};
