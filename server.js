const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// رفع سعة نقل البيانات إلى 15 ميجابايت من أجل استيعاب الفويسات والصور المرفوعة
const io = new Server(server, { 
    maxHttpBufferSize: 1e7,
    cors: { origin: "*" }
}); 

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// قراءة بيانات المستخدمين من ملف الـ JSON
function getUsers() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return {}; }
}

// حفظ بيانات المستخدمين
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// قراءة الرسائل المحفوظة من قبل
function getMessages() {
    if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
    try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch (e) { return []; }
}

// حفظ الرسائل الجديدة في الأرشيف
function saveMessage(msg) {
    const messages = getMessages();
    messages.push({ ...msg, timestamp: new Date().getTime() });
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

let onlineUsers = {}; // لتتبع المتصلين { socketId: email }

// مسار إنشاء حساب جديد
app.post('/api/register', (req, res) => {
    const { name, email, password, avatar, birthday } = req.body;
    const users = getUsers();
    if (users[email]) return res.status(400).json({ error: "البريد الإلكتروني مسجل مسبقاً!" });
    
    users[email] = { name, email, password, avatar: avatar || "", birthday: birthday || "" };
    saveUsers(users);
    res.json({ success: true });
});

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();
    if (users[email] && users[email].password === password) {
        return res.json({ success: true, user: users[email] });
    }
    res.status(400).json({ error: "بيانات الدخول غير صحيحة" });
});

// مسار تحديث الحساب الشخصي
app.post('/api/update-profile', (req, res) => {
    const { email, name, avatar, birthday } = req.body;
    const users = getUsers();
    if (users[email]) {
        users[email].name = name;
        if (avatar) users[email].avatar = avatar;
        users[email].birthday = birthday;
        saveUsers(users);
        io.emit('user-updated', users[email]);
        return res.json({ success: true, user: users[email] });
    }
    res.status(400).json({ error: "المستخدم غير موجود" });
});

// إدارة أحداث الـ Socket والاتصال المباشر
io.on('connection', (socket) => {
    
    socket.on('go-online', (email) => {
        onlineUsers[socket.id] = email;
        const users = getUsers();
        io.emit('update-users-list', { users, onlineEmails: Object.values(onlineUsers) });

        // عند دخول المستخدم، نرسل له أرشيف الرسائل القديمة المخزنة فوراً
        const allPastMessages = getMessages();
        socket.emit('load-past-messages', { allPastMessages, myEmail: email });
    });

    // إرسال رسالة في الشات الجماعي للكل وحفظها
    socket.on('group-message', (data) => {
        saveMessage(data);
        io.emit('group-message', data);
    });

    // إرسال رسالة خاصة لميستقبل معين وحفظها
    socket.on('private-message', (data) => {
        const msgWithSender = { ...data, fromEmail: onlineUsers[socket.id] };
        saveMessage(msgWithSender);
        
        const targetSocketId = Object.keys(onlineUsers).find(key => onlineUsers[key] === data.to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('private-message', msgWithSender);
        }
        socket.emit('private-message', msgWithSender);
    });

    // بروتوكولات إشارات الاتصال الصوتي والمرئي (WebRTC)
    socket.on('call-user', (data) => {
        const targetSocketId = Object.keys(onlineUsers).find(key => onlineUsers[key] === data.to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', { from: onlineUsers[socket.id], offer: data.offer, type: data.type });
        }
    });

    socket.on('answer-call', (data) => {
        const targetSocketId = Object.keys(onlineUsers).find(key => onlineUsers[key] === data.to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-answered', { answer: data.answer });
        }
    });

    socket.on('ice-candidate', (data) => {
        const targetSocketId = Object.keys(onlineUsers).find(key => onlineUsers[key] === data.to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { candidate: data.candidate });
        }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        const users = getUsers();
        io.emit('update-users-list', { users, onlineEmails: Object.values(onlineUsers) });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`السيرفر يعمل بنجاح على المنفذ ${PORT}`));
