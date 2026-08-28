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
    plan: { type: String, default: 'free' }
}, { timestamps: true });

const depositSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, required: true },
    senderNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    trxId: { type: String, required: true },
    status: { type: String, default: 'pending' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Deposit = mongoose.model('Deposit', depositSchema);

const PLANS = {
    free: { name: "Free", price: 0, adReward: 0.30 },
    silver: { name: "Silver", price: 100, adReward: 0.70 },
    gold: { name: "Gold", price: 500, adReward: 1.50 }
};

// ==================== ৩. AUTH ROUTES ====================
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: "ইমেইলটি ইতিমধ্যেই রেজিস্টার করা রয়েছে।" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, phone });
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

        res.json({
            id: user._id,
            name: user.name,
            balance: user.balance,
            plan: user.plan,
            planDetails: PLANS[user.plan] || PLANS.free
        });
    } catch (err) {
        res.status(500).json({ error: "ত্রুটি হয়েছে" });
    }
});

// ==================== ৪. DEPOSIT & MEMBERSHIP ====================
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
