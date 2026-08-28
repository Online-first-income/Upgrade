const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// মিডলওয়্যার সেটআপ
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ১. public ফোল্ডার স্ট্যাটিক ফাইল হিসেবে যুক্ত করা
app.use(express.static(path.join(__dirname, 'public')));

// ২. হোমপেজ রাউট
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ৩. সাবস্ক্রিপশন প্ল্যান কনফিগারেশন
const PLANS = {
    free: { name: "Free", price: 0, adReward: 0.30 },
    silver: { name: "Silver", price: 100, adReward: 0.70 },
    gold: { name: "Gold", price: 500, adReward: 1.50 }
};

// ৪. ইউজার টেস্ট ডাটাবেজ
let users = [
    { id: 'usr_101', name: "Tanvir BD", balance: 150.00, plan: "free", country: "BD" }
];

// ৫. ডাইনামিক অ্যাড নেটওয়ার্ক কনফিগারেশন
const AD_NETWORKS = {
    cpalead: {
        enabled: true,
        secretKey: 'MY_SECRET_123',
        ourCommissionPercentage: 30
    }
};

// ৬. ইউজার তথ্য ও প্ল্যান দেখার এপিআই
app.get('/api/user/:userId', (req, res) => {
    const user = users.find(u => u.id === req.params.userId);
    if (user) {
        const userPlanDetails = PLANS[user.plan] || PLANS.free;
        res.json({
            ...user,
            planDetails: userPlanDetails
        });
    } else {
        res.status(404).json({ error: "ইউজার পাওয়া যায়নি" });
    }
});

// ৭. সাবস্ক্রিপশন আপগ্রেড করার এপিআই
app.post('/api/upgrade-plan', (req, res) => {
    const { userId, targetPlan } = req.body;
    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(400).json({ error: "ইউজার সঠিক নয়" });
    }

    const selectedPlan = PLANS[targetPlan];
    if (!selectedPlan) {
        return res.status(400).json({ error: "অকার্যকর প্ল্যান" });
    }

    if (user.plan === targetPlan) {
        return res.status(400).json({ error: "আপনি ইতিমধ্যে এই প্ল্যানে আছেন।" });
    }

    if (user.balance < selectedPlan.price) {
        return res.status(400).json({ error: `পর্যাপ্ত ব্যালেন্স নেই! ${selectedPlan.name} প্ল্যানের জন্য ৳${selectedPlan.price} প্রয়োজন।` });
    }

    // ব্যালেন্স কেটে প্ল্যান আপডেট করা
    user.balance -= selectedPlan.price;
    user.plan = targetPlan;

    res.json({
        success: true,
        message: `অভিনন্দন! আপনার অ্যাকাউন্ট সফলভাবে ${selectedPlan.name} প্ল্যানে আপগ্রেড হয়েছে।`,
        newBalance: user.balance,
        newPlan: user.plan
    });
});

// ৮. অ্যাড রিওয়ার্ড যোগ করার এপিআই (প্ল্যান অনুযায়ী)
app.post('/api/add-reward', (req, res) => {
    const { userId } = req.body;
    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(400).json({ error: "ইউজার সঠিক নয়" });
    }

    const userPlan = PLANS[user.plan] || PLANS.free;
    const reward = userPlan.adReward;

    user.balance += reward;

    res.json({
        success: true,
        rewardEarned: reward,
        newBalance: user.balance
    });
});

// ৯. পোস্টব্যাক এন্ডপয়েন্ট
app.get('/api/postback/:network', (req, res) => {
    const networkName = req.params.network;
    const networkConfig = AD_NETWORKS[networkName];

    if (!networkConfig || !networkConfig.enabled) {
        return res.status(400).send("Unauthorized Network");
    }

    const { subId, payout, secret } = req.query;

    if (secret !== networkConfig.secretKey) {
        return res.status(403).send("Invalid Secret Key");
    }

    const user = users.find(u => u.id === subId);
    if (!user) {
        return res.status(404).send("User Not Found");
    }

    const totalPayoutAmount = parseFloat(payout) || 0;
    const commission = (totalPayoutAmount * networkConfig.ourCommissionPercentage) / 100;
    const userEarnings = totalPayoutAmount - commission;

    user.balance += userEarnings;

    console.log(`[SUCCESS] User ${subId} earned ৳${userEarnings}`);
    res.send("1");
});

// ১০. বিকাশ ও নগদ উইথড্রয়াল এপিআই
app.post('/api/withdraw', (req, res) => {
    const { userId, amount, method, accountNumber } = req.body;
    const user = users.find(u => u.id === userId);

    if (!user) {
        return res.status(400).json({ error: "ইউজার সঠিক নয়" });
    }

    if (amount < 50) {
        return res.status(400).json({ error: "সর্বনিম্ন ৫০ টাকা উইথড্র করা যাবে।" });
    }

    if (user.balance < amount) {
        return res.status(400).json({ error: "পর্যাপ্ত ব্যালেন্স নেই।" });
    }

    user.balance -= amount;
    res.json({
        success: true,
        message: `${method} (${accountNumber})-এ ৳${amount} টাকা পেমেন্ট রিকোয়েস্ট সফল হয়েছে।`,
        remainingBalance: user.balance
    });
});

// সার্ভার পোর্ট সেটআপ
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));