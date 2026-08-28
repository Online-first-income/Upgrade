const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ১. MONGODB CONNECTIVITY ====================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://ronynetwork4_db_user:XrM1YaCfL05rLHs8@cluster0.38o182a.mongodb.net/JobDatabase?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// ==================== ২. SCHEMAS & MODELS ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    balance: { type: Number, default: 0.00 },
    plan: { type: String, default: 'free' },
    completedTasks: [{ type: String }], // কাজের আইডি জমা থাকবে (যেমন: cpalead1)
    lastTaskResetDate: { type: String, default: "" } // তারিখের হিসাব রাখার জন্য (YYYY-MM-DD)
}, { timestamps: true });

const depositSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true },
    senderNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    trxId: { type: String, required: true },
    status: { type: String, default: 'pending' }
}, { timestamps: true });

const withdrawSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true },
    accountNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, default: 'pending' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Deposit = mongoose.model('Deposit', depositSchema);
const Withdraw = mongoose.model('Withdraw', withdrawSchema);

const PLANS = {
    free: { name: "Free", price: 0, adReward: 0.30 },
    silver: { name: "Silver", price: 100, adReward: 0.70 },
    gold: { name: "Gold", price: 500, adReward: 1.50 }
};

// তারিখ বের করার হেলপার ফাংশন (YYYY-MM-DD)
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

// ==================== ৩. AUTH & USER ROUTES ====================
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "ইমেইলটি ইতিমধ্যেই রেজিস্টার করা রয়েছে।" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            name, 
            email, 
            password: hashedPassword, 
            phone,
            completedTasks: [],
            lastTaskResetDate: getTodayDateString()
        });
        await newUser.save();

        res.json({ success: true, message: "রেজিস্ট্রেশন সফল হয়েছে! এখন লগইন করুন।" });
    } catch (err) {
        res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ error: "ইমেইল বা পাসওয়ার্ড ভুল।" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "ইমেইল বা পাসওয়ার্ড ভুল।" });

        res.json({
            success: true,
            user: { id: user._id, name: user.name, email: user.email, balance: user.balance, plan: user.plan }
        });
    } catch (err) {
        res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
    }
});

app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });

        const today = getTodayDateString();
        // রাত ১২টার পর নতুন দিন শুরু হলে টাস্ক লিস্ট অটোমেটিক খালি হবে
        if (user.lastTaskResetDate !== today) {
            user.completedTasks = [];
            user.lastTaskResetDate = today;
            await user.save();
        }

        res.json({
            id: user._id,
            name: user.name,
            balance: user.balance,
            plan: user.plan,
            completedTasks: user.completedTasks || [],
            planDetails: PLANS[user.plan] || PLANS.free
        });
    } catch (err) {
        res.status(500).json({ error: "ত্রুটি হয়েছে" });
    }
});

// ==================== ৪. TASK REWARD & LIMIT ROUTE ====================
app.post('/api/complete-task', async (req, res) => {
    try {
        const { userId, taskId } = req.body;
        const user = await User.findById(userId);

        if (!user) return res.status(400).json({ error: "ইউজার পাওয়া যায়নি।" });

        const today = getTodayDateString();
        if (user.lastTaskResetDate !== today) {
            user.completedTasks = [];
            user.lastTaskResetDate = today;
        }

        // চেক করা ইউজার কাজটি আজ ইতিমধ্যেই করেছে কিনা
        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ error: "আপনি আজকের জন্য এই কাজটি ইতিমধ্যেই শেষ করেছেন! আগামীকাল রাত ১২টার পর আবার করতে পারবেন।" });
        }

        const currentPlan = PLANS[user.plan] || PLANS.free;
        const reward = currentPlan.adReward;

        user.balance += reward;
        user.completedTasks.push(taskId); // সম্পন্ন হওয়া টাস্ক সেভ করা
        await user.save();

        res.json({
            success: true,
            message: `অভিনন্দন! আপনার অ্যাকাউন্টে ৳${reward} যোগ করা হয়েছে।`
        });
    } catch (err) {
        res.status(500).json({ error: "রিওয়ার্ড যোগ করতে সমস্যা হয়েছে।" });
    }
});

// ==================== ৫. WITHDRAWAL, DEPOSIT & PLAN ====================
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, method, accountNumber, amount } = req.body;
        const numAmount = parseFloat(amount);

        if (!userId || !accountNumber || isNaN(numAmount)) {
            return res.status(400).json({ error: "সবগুলো ঘর সঠিকভাবে পূরণ করুন।" });
        }

        if (numAmount < 50) {
            return res.status(400).json({ error: "সর্বনিম্ন ৫০ টাকা উইথড্র করতে পারবেন।" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(400).json({ error: "ইউজার পাওয়া যায়নি।" });

        if (user.balance < numAmount) {
            return res.status(400).json({ error: "আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই।" });
        }

        user.balance -= numAmount;
        await user.save();

        const newWithdraw = new Withdraw({ userId, method, accountNumber, amount: numAmount });
        await newWithdraw.save();

        res.json({ success: true, message: `৳${numAmount} উইথড্র রিকোয়েস্ট সফল হয়েছে! ২৪-৭২ ঘণ্টার মধ্যে পেমেন্ট পাবেন।` });
    } catch (err) {
        res.status(500).json({ error: "উইথড্র রিকোয়েস্ট জমা দেওয়া সম্ভব হয়নি।" });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { userId, method, senderNumber, amount, trxId } = req.body;

        if (!userId || !senderNumber || !amount || !trxId) {
            return res.status(400).json({ error: "সবগুলো ঘর পূরণ করুন।" });
        }

        const newDeposit = new Deposit({ userId, method, senderNumber, amount, trxId });
        await newDeposit.save();

        res.json({ success: true, message: "ডিপোজিট রিকোয়েস্ট সফলভাবে জমা হয়েছে।" });
    } catch (err) {
        res.status(500).json({ error: "ডিপোজিট রিকোয়েস্ট জমা দেওয়া সম্ভব হয়নি।" });
    }
});

app.post('/api/upgrade-plan', async (req, res) => {
    try {
        const { userId, targetPlan } = req.body;
        const user = await User.findById(userId);

        if (!user) return res.status(400).json({ error: "ইউজার সঠিক নয়" });

        const selectedPlan = PLANS[targetPlan];
        if (!selectedPlan) return res.status(400).json({ error: "অকার্যকর প্ল্যান" });

        if (user.balance < selectedPlan.price) {
            return res.status(400).json({ error: `পর্যাপ্ত ব্যালেন্স নেই! ${selectedPlan.name} প্ল্যানের জন্য ৳${selectedPlan.price} প্রয়োজন।` });
        }

        user.balance -= selectedPlan.price;
        user.plan = targetPlan;
        await user.save();

        res.json({ success: true, message: `অভিনন্দন! আপনার অ্যাকাউন্ট সফলভাবে ${selectedPlan.name} প্ল্যানে আপগ্রেড হয়েছে।` });
    } catch (err) {
        res.status(500).json({ error: "আপগ্রেড ব্যর্থ হয়েছে।" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
