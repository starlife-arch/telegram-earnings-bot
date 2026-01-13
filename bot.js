// ==================== IMPORTS AND CONFIGURATION ====================
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ==================== ENVIRONMENT VARIABLES ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// Validate required environment variables
if (!TELEGRAM_TOKEN) {
  console.error('❌ ERROR: TELEGRAM_TOKEN environment variable is missing');
  console.error('Please set TELEGRAM_TOKEN in your Heroku Config Vars');
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI environment variable is missing');
  console.error('Please set MONGODB_URI in your Heroku Config Vars');
  process.exit(1);
}

// ==================== BOT INITIALIZATION ====================
let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
  console.log('✅ Bot instance created');
} catch (error) {
  console.error('❌ Bot creation failed:', error.message);
  process.exit(1);
}

// ==================== DATABASE CONFIGURATION ====================
const DB_NAME = 'starlife';
let db;
let client;

const COLLECTIONS = {
  USERS: 'users',
  INVESTMENTS: 'investments',
  WITHDRAWALS: 'withdrawals',
  REFERRALS: 'referrals',
  FAKE_MEMBERS: 'fake_members',
  TRANSACTIONS: 'transactions',
  SUPPORT_CHATS: 'support_chats',
  EARNINGS_VIEWS: 'earnings_views',
  MEDIA_FILES: 'media_files'
};

// ==================== DATABASE FUNCTIONS ====================
async function initMongoDB() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');
    
    await createIndexes();
    console.log('✅ Indexes created');
    
    await initializeFakeMembers();
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return false;
  }
}

async function createIndexes() {
  try {
    await db.collection(COLLECTIONS.USERS).createIndex({ memberId: 1 }, { unique: true });
    await db.collection(COLLECTIONS.USERS).createIndex({ chatId: 1 }, { unique: true, sparse: true });
    await db.collection(COLLECTIONS.USERS).createIndex({ email: 1 }, { unique: true, sparse: true });
    await db.collection(COLLECTIONS.USERS).createIndex({ referralCode: 1 }, { unique: true });
  } catch (error) {
    console.error('Error creating indexes:', error.message);
  }
}

async function initializeFakeMembers() {
  try {
    const count = await db.collection(COLLECTIONS.FAKE_MEMBERS).countDocuments();
    
    if (count === 0) {
      const fakeMembers = [];
      const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
      
      for (let i = 1; i <= 50; i++) {
        const name = names[Math.floor(Math.random() * names.length)];
        const investment = Math.floor(Math.random() * 500) + 50;
        const profit = investment * 0.02 * 7;
        const referrals = Math.floor(Math.random() * 5);
        
        fakeMembers.push({
          id: `FAKE-${1000 + i}`,
          name: `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`,
          investment: investment,
          profit: profit.toFixed(2),
          referrals: referrals,
          joinDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(),
          isFake: true,
          createdAt: new Date().toISOString()
        });
      }
      
      await db.collection(COLLECTIONS.FAKE_MEMBERS).insertMany(fakeMembers);
      console.log('✅ Fake members initialized');
    }
  } catch (error) {
    console.error('Error initializing fake members:', error.message);
  }
}

async function loadData(collectionName, query = {}, sort = {}, limit = 0) {
  try {
    const collection = db.collection(collectionName);
    let cursor = collection.find(query);
    
    if (sort && Object.keys(sort).length > 0) {
      cursor = cursor.sort(sort);
    }
    
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }
    
    return await cursor.toArray();
  } catch (error) {
    console.error(`Error loading data from ${collectionName}:`, error.message);
    return [];
  }
}

async function saveData(collectionName, filter, update, options = { upsert: true }) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.updateOne(filter, update, options);
    return result;
  } catch (error) {
    console.error(`Error saving data to ${collectionName}:`, error.message);
    return null;
  }
}

async function insertData(collectionName, document) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.insertOne(document);
    return result;
  } catch (error) {
    console.error(`Error inserting data to ${collectionName}:`, error.message);
    return null;
  }
}

async function findOne(collectionName, query) {
  try {
    const collection = db.collection(collectionName);
    return await collection.findOne(query);
  } catch (error) {
    console.error(`Error finding one in ${collectionName}:`, error.message);
    return null;
  }
}

async function deleteData(collectionName, filter) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.deleteMany(filter);
    return result;
  } catch (error) {
    console.error(`Error deleting data from ${collectionName}:`, error.message);
    return null;
  }
}

// ==================== UTILITY FUNCTIONS ====================
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateRandomPassword(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function isAdmin(chatId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  return adminIds.includes(chatId.toString());
}

function calculateDailyProfit(investmentAmount) {
  return investmentAmount * 0.02;
}

function calculateReferralBonus(investmentAmount) {
  return investmentAmount * 0.10;
}

function calculateWithdrawalFee(amount) {
  return amount * 0.05;
}

function calculateNetWithdrawal(amount) {
  const fee = calculateWithdrawalFee(amount);
  return amount - fee;
}

function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// ==================== USER SESSIONS ====================
const userSessions = {};
const loggedOutUsers = new Set();
const adminSessions = {};

// ==================== USER MANAGEMENT FUNCTIONS ====================
async function isUserLoggedIn(chatId) {
  if (loggedOutUsers.has(chatId.toString())) {
    return false;
  }
  
  const user = await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
  return !!user;
}

async function getLoggedInUser(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return null;
  }
  
  const user = await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
  
  if (!user || user.banned) {
    return null;
  }
  
  return user;
}

async function getUserByMemberId(memberId) {
  return await findOne(COLLECTIONS.USERS, { memberId: memberId });
}

async function getUserByChatId(chatId) {
  return await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
}

async function getUserByEmail(email) {
  return await findOne(COLLECTIONS.USERS, { email: email.toLowerCase() });
}

async function getActiveSupportChat(userId) {
  return await findOne(COLLECTIONS.SUPPORT_CHATS, { 
    userId: userId,
    status: 'active'
  });
}

async function sendUserNotification(memberId, message) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user || !user.chatId) {
      return false;
    }
    
    try {
      await bot.sendMessage(user.chatId, message);
      return true;
    } catch (error) {
      console.log(`Could not send message to ${memberId}:`, error.message);
      return false;
    }
  } catch (error) {
    console.log('Error in sendUserNotification:', error.message);
    return false;
  }
}

async function storeOfflineMessage(memberId, message, type = 'admin_message') {
  try {
    const messageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const offlineMessage = {
      id: messageId,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $push: { 
          offlineMessages: {
            $each: [offlineMessage],
            $slice: -50
          }
        }
      }
    );
    
    return true;
  } catch (error) {
    console.log('Error storing offline message:', error.message);
    return false;
  }
}

// ==================== DAILY PROFIT SCHEDULER ====================
function scheduleDailyProfits() {
  setInterval(async () => {
    try {
      const investments = await loadData(COLLECTIONS.INVESTMENTS, { status: 'active' });
      
      for (const investment of investments) {
        const dailyProfit = calculateDailyProfit(investment.amount);
        
        await saveData(COLLECTIONS.USERS,
          { memberId: investment.memberId },
          { 
            $inc: { 
              balance: dailyProfit,
              totalEarned: dailyProfit
            }
          }
        );
        
        await insertData(COLLECTIONS.TRANSACTIONS, {
          id: `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: investment.memberId,
          type: 'daily_profit',
          amount: dailyProfit,
          description: `Daily profit from investment #${investment.id}`,
          date: new Date().toISOString()
        });
        
        await saveData(COLLECTIONS.INVESTMENTS,
          { id: investment.id },
          { 
            $inc: { 
              totalProfit: dailyProfit,
              daysActive: 1
            }
          }
        );
      }
      
      console.log('✅ Daily profits calculated for', investments.length, 'investments');
    } catch (error) {
      console.log('❌ Error calculating daily profits:', error.message);
    }
  }, 24 * 60 * 60 * 1000);
}

// ==================== BOT COMMAND HANDLERS ====================

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log('📱 /start from:', chatId);
  
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    const user = await getUserByChatId(chatId);
    
    if (user) {
      if (user.banned) {
        await bot.sendMessage(chatId,
          `🚫 **Account Suspended**\n\n` +
          `Your account has been suspended by admin.\n\n` +
          `**You can still:**\n` +
          `/appeal - Submit appeal\n` +
          `/support - Contact support\n\n` +
          `If you believe this is an error, please submit an appeal.`
        );
        return;
      }
      
      await saveData(COLLECTIONS.USERS,
        { chatId: chatId.toString() },
        { $set: { lastLogin: new Date().toISOString() } }
      );
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referralCode}\n\n` +
                            `📋 **Quick Commands:**\n` +
                            `/invest - Make investment\n` +
                            `/earnings - View YOUR earnings\n` +
                            `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                            `/withdraw - Withdraw funds\n` +
                            `/referral - Share & earn 10% (FIRST investment only)\n` +
                            `/profile - Account details\n` +
                            `/transactions - View transaction history\n` +
                            `/support - Contact support\n` +
                            `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
  }
  
  // Not logged in - show public welcome
  const fakeMembers = await loadData(COLLECTIONS.FAKE_MEMBERS, {}, {}, 3);
  
  let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
  fakeMembers.forEach(member => {
    fakeMessage += `✅ ${member.name} invested ${formatCurrency(member.investment)} & earned ${formatCurrency(member.profit)}\n`;
  });
  
  fakeMessage += '\n🚀 **Ready to Start Earning?**\n\n';
  fakeMessage += '💵 **Earn 2% Daily Profit**\n';
  fakeMessage += '👥 **Earn 10% from referrals (FIRST investment only)**\n';
  fakeMessage += '⚡ **Fast Withdrawals (10-15 min)**\n\n';
  fakeMessage += 'Choose an option:\n';
  fakeMessage += '/register - Create account\n';
  fakeMessage += '/login - Existing account\n';
  fakeMessage += '/investnow - Quick start guide\n';
  fakeMessage += '/support - Get help';
  
  await bot.sendMessage(chatId, fakeMessage);
});

// /register command
bot.onText(/\/register(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1] ? match[1].trim().toUpperCase() : null;
  
  const existingUser = await getUserByChatId(chatId);
  
  if (existingUser) {
    await bot.sendMessage(chatId,
      `🚫 **Account Already Linked**\n\n` +
      `This Telegram account is already linked to:\n` +
      `Member ID: ${existingUser.memberId}\n` +
      `Name: ${existingUser.name}\n\n` +
      `Use /login to access your existing account.`
    );
    return;
  }
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You already have an account. Use /login to access.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_name',
    data: {
      referralCode: referralCode
    }
  };
  
  let registrationMessage = `📝 **Account Registration**\n\n`;
  
  if (referralCode) {
    const referrer = await findOne(COLLECTIONS.USERS, { referralCode: referralCode });
    if (referrer) {
      registrationMessage += `✅ **Referral Code Applied!**\n`;
      registrationMessage += `Referred by: ${referrer.name}\n`;
      registrationMessage += `Referrer earns 10% bonus on your FIRST investment only!\n\n`;
    } else {
      registrationMessage += `⚠️ **Invalid Referral Code:** ${referralCode}\n`;
      registrationMessage += `Starting registration without referral...\n\n`;
      userSessions[chatId].data.referralCode = null;
    }
  }
  
  registrationMessage += `Step 1/4: Enter your full name\n\n` +
                       `Example: John Doe\n` +
                       `Enter your name:`;
  
  await bot.sendMessage(chatId, registrationMessage);
});

// /login command
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see dashboard.');
    return;
  }
  
  loggedOutUsers.delete(chatId.toString());
  
  userSessions[chatId] = {
    step: 'login_memberid',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Login**\n\n` +
    `Enter your Member ID:\n` +
    `(Format: USER-123456)\n\n` +
    `Forgot your Member ID? Use /support for help.`
  );
});

// /invest command
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_investment_amount',
    data: {
      memberId: user.memberId
    }
  };
  
  await bot.sendMessage(chatId,
    `💰 **Make Investment**\n\n` +
    `**Available Payment Methods:**\n\n` +
    `1️⃣ **M-Pesa**\n` +
    `   Till: 6034186\n` +
    `   Name: Starlife Advert US Agency\n\n` +
    `2️⃣ **USDT Tether (BEP20) - RECOMMENDED**\n` +
    `   Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
    `   📌 Send only USDT (BEP20)\n\n` +
    `3️⃣ **USDT TRON (TRC20)**\n` +
    `   Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
    `   📌 Send only USDT (TRC20)\n\n` +
    `4️⃣ **PayPal**\n` +
    `   Email: dave@starlifeadvert.com\n\n` +
    `**Investment Details:**\n` +
    `Minimum Investment: $10\n` +
    `Maximum Investment: $800,000\n` +
    `Daily Profit: 2% (LIFETIME)\n\n` +
    `Enter amount to invest:`
  );
});

// /withdraw command
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if ((user.balance || 0) < 2) {
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Minimum withdrawal: $2\n` +
      `Your balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Please earn more through investments first.`
    );
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_withdrawal_amount',
    data: {
      memberId: user.memberId,
      balance: user.balance
    }
  };
  
  await bot.sendMessage(chatId,
    `💳 **Withdraw Funds**\n\n` +
    `Your Balance: ${formatCurrency(user.balance || 0)}\n` +
    `Minimum Withdrawal: $2\n` +
    `Withdrawal Fee: 5%\n\n` +
    `Enter amount to withdraw:`
  );
});

// /profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: user.memberId });
  const successfulReferrals = referrals.filter(r => r.status === 'paid');
  
  let message = `👤 **Your Profile**\n\n`;
  message += `Name: ${user.name}\n`;
  message += `Member ID: ${user.memberId}\n`;
  message += `Email: ${user.email || 'Not set'}\n`;
  message += `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n`;
  message += `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}\n\n`;
  message += `💰 **Financial Summary**\n`;
  message += `Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
  message += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  message += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  message += `👥 **Referral Stats**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Successful Referrals: ${successfulReferrals.length}\n`;
  message += `Your Code: ${user.referralCode}\n\n`;
  message += `**Share your code:** ${user.referralCode}\n`;
  message += `Tell friends to use: /register ${user.referralCode}`;
  
  await bot.sendMessage(chatId, message);
});

// /earnings command
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const investments = await loadData(COLLECTIONS.INVESTMENTS, { 
    memberId: user.memberId,
    status: 'active'
  });
  
  let message = `📈 **Your Earnings**\n\n`;
  message += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `📊 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
  message += `💵 Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  message += `👥 Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  
  if (investments.length > 0) {
    message += `**Active Investments:**\n`;
    investments.forEach(inv => {
      const dailyProfit = calculateDailyProfit(inv.amount);
      message += `• ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
    });
  } else {
    message += `No active investments.\n`;
    message += `Use /invest to start earning!\n`;
  }
  
  await bot.sendMessage(chatId, message);
});

// /logout command
bot.onText(/\/logout/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ You are not logged in.');
    return;
  }
  
  loggedOutUsers.add(chatId.toString());
  
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged Out Successfully**\n\n` +
    `You have been logged out from ${user.name} (${user.memberId}).\n\n` +
    `To login again, use:\n` +
    `/login - If you remember your credentials\n` +
    `/forgotpassword - If you forgot password\n` +
    `/support - If you need help logging in`
  );
});

// /support command
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    const user = await getUserByChatId(chatId);
    const activeChat = await getActiveSupportChat(user.memberId);
    
    if (activeChat) {
      userSessions[chatId] = {
        step: 'support_chat',
        data: {
          memberId: user.memberId,
          userName: user.name,
          chatId: activeChat.id
        }
      };
      
      const welcomeMessage = user.banned ? 
        `🚫 **Account Suspended - Support Chat**\n\n` +
        `Your account has been suspended, but you can still contact support.\n\n` +
        `Type your message below to appeal or ask for help:\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n\n` +
        `Type /endsupport to end this chat` :
        
        `💬 **Support Chat (Active)**\n\n` +
        `You have an active support conversation.\n` +
        `Type your message below:\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Type /endsupport to end this chat`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
    
    userSessions[chatId] = {
      step: 'support_topic',
      data: {
        memberId: user.memberId,
        userName: user.name
      }
    };
    
    const supportMessage = user.banned ? 
      `🚫 **Account Suspended - Appeal Center**\n\n` +
      `Your account has been suspended. Please select your issue:\n\n` +
      `1️⃣ Appeal Suspension\n` +
      `2️⃣ Account Recovery\n` +
      `3️⃣ Payment Issues\n` +
      `4️⃣ Other Issues\n\n` +
      `Reply with the number (1-4):` :
      
      `🆘 **Support Center**\n\n` +
      `Please select your issue:\n\n` +
      `1️⃣ Account Issues\n` +
      `2️⃣ Investment Problems\n` +
      `3️⃣ Withdrawal Help\n` +
      `4️⃣ Referral Issues\n` +
      `5️⃣ Payment Proof/Upload\n` +
      `6️⃣ Other\n\n` +
      `Reply with the number (1-6):`;
    
    await bot.sendMessage(chatId, supportMessage);
  } else {
    userSessions[chatId] = {
      step: 'universal_support_choice',
      data: {
        chatId: chatId
      }
    };
    
    await bot.sendMessage(chatId,
      `🆘 **Universal Support Center**\n\n` +
      `Welcome! We're here to help you with:\n\n` +
      `1️⃣ **Account Issues**\n` +
      `   - Can't login\n` +
      `   - Forgot password\n` +
      `   - Account recovery\n\n` +
      `2️⃣ **General Questions**\n` +
      `   - How to invest\n` +
      `   - How withdrawals work\n` +
      `   - Referral program\n\n` +
      `3️⃣ **Technical Problems**\n` +
      `   - Bot not responding\n` +
      `   - Payment issues\n` +
      `   - Other problems\n\n` +
      `4️⃣ **Create New Account**\n` +
      `   - Registration help\n` +
      `   - Investment guidance\n\n` +
      `5️⃣ **Send Payment Proof**\n` +
      `   - Upload M-Pesa screenshot\n` +
      `   - Payment confirmation\n\n` +
      `**Reply with number (1-5):**`
    );
  }
});

// /endsupport command
bot.onText(/\/endsupport/, async (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions[chatId];
  if (session && (session.step === 'support_chat' || session.step === 'support_loggedout_chat' || session.step === 'universal_support_chat' || session.step === 'appeal_chat')) {
    await saveData(COLLECTIONS.SUPPORT_CHATS,
      { id: session.data.chatId },
      { 
        $set: { 
          status: 'closed',
          updatedAt: new Date().toISOString(),
          closedBy: 'user'
        }
      }
    );
    
    delete userSessions[chatId];
    
    await bot.sendMessage(chatId,
      `✅ **Support Chat Ended**\n\n` +
      `Thank you for contacting support.\n` +
      `Use /support if you need help again.`
    );
  } else {
    await bot.sendMessage(chatId, '❌ No active support chat to end.');
  }
});

// /admin command
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const adminMessage = `⚡ **ADMIN PANEL**\n\n` +
                      `📊 **Dashboard:**\n` +
                      `/stats - System statistics\n` +
                      `/admin - Show this menu\n\n` +
                      `👥 **User Management:**\n` +
                      `/users - List all users\n` +
                      `/view USER_ID - View user details\n` +
                      `/suspend USER_ID - Suspend user\n` +
                      `/unsuspend USER_ID - Unsuspend user\n` +
                      `/resetpass USER_ID - Reset password\n` +
                      `/delete USER_ID - Delete user\n\n` +
                      `💰 **Financial Management:**\n` +
                      `/addbalance USER_ID AMOUNT - Add balance\n` +
                      `/deductbalance USER_ID AMOUNT - Deduct balance\n\n` +
                      `📈 **Investment Management:**\n` +
                      `/investments - List all investments\n` +
                      `/approveinvestment INV_ID - Approve investment\n` +
                      `/rejectinvestment INV_ID - Reject investment\n\n` +
                      `💳 **Withdrawal Management:**\n` +
                      `/withdrawals - List withdrawals\n` +
                      `/approve WDL_ID - Approve withdrawal\n` +
                      `/reject WDL_ID - Reject withdrawal\n\n` +
                      `🆘 **Support Management:**\n` +
                      `/supportchats - View active chats\n` +
                      `/viewchat CHAT_ID - View specific chat\n` +
                      `/replychat CHAT_ID MESSAGE - Reply to chat\n` +
                      `/closechat CHAT_ID - Close chat\n\n` +
                      `📢 **Broadcast:**\n` +
                      `/broadcast MESSAGE - Send to all users`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// /stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(COLLECTIONS.USERS);
    const investments = await loadData(COLLECTIONS.INVESTMENTS);
    const withdrawals = await loadData(COLLECTIONS.WITHDRAWALS);
    const supportChats = await loadData(COLLECTIONS.SUPPORT_CHATS);
    
    const totalBalance = users.reduce((sum, user) => sum + parseFloat(user.balance || 0), 0);
    const totalInvested = users.reduce((sum, user) => sum + parseFloat(user.totalInvested || 0), 0);
    const totalEarned = users.reduce((sum, user) => sum + parseFloat(user.totalEarned || 0), 0);
    const activeUsers = users.filter(u => !u.banned).length;
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingInvestments = investments.filter(i => i.status === 'pending').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const activeSupportChats = supportChats.filter(c => c.status === 'active').length;
    const suspendedUsers = users.filter(u => u.banned).length;
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${users.length}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Suspended Users: ${suspendedUsers}\n` +
                        `• Total Balance: ${formatCurrency(totalBalance)}\n\n` +
                        `**Investments:**\n` +
                        `• Total Investments: ${investments.length}\n` +
                        `• Active Investments: ${activeInvestments}\n` +
                        `• Pending Investments: ${pendingInvestments}\n` +
                        `• Total Invested: ${formatCurrency(totalInvested)}\n` +
                        `• Total Earned: ${formatCurrency(totalEarned)}\n\n` +
                        `**Withdrawals:**\n` +
                        `• Total Withdrawals: ${withdrawals.length}\n` +
                        `• Pending Withdrawals: ${pendingWithdrawals}\n\n` +
                        `**Support:**\n` +
                        `• Active Chats: ${activeSupportChats}\n` +
                        `• Total Chats: ${supportChats.length}`;
    
    await bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.log('Error in /stats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading statistics.');
  }
});

// ==================== MESSAGE HANDLER ====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // Registration flow
    if (session.step === 'awaiting_name') {
      const name = text.trim();
      if (name.length < 2) {
        await bot.sendMessage(chatId, '❌ Name must be at least 2 characters. Please enter your name:');
        return;
      }
      
      session.data.name = name;
      session.step = 'awaiting_email';
      
      await bot.sendMessage(chatId,
        `✅ Name: ${name}\n\n` +
        `Step 2/4: Enter your email\n\n` +
        `Example: johndoe@example.com\n` +
        `Enter your email:`
      );
    }
    else if (session.step === 'awaiting_email') {
      const email = text.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(email)) {
        await bot.sendMessage(chatId, '❌ Invalid email format. Please enter a valid email:');
        return;
      }
      
      session.data.email = email;
      session.step = 'awaiting_password';
      
      await bot.sendMessage(chatId,
        `✅ Email: ${email}\n\n` +
        `Step 3/4: Create a password\n\n` +
        `• At least 6 characters\n` +
        `• Must include letters and numbers\n` +
        `Enter your password:`
      );
    }
    else if (session.step === 'awaiting_password') {
      const password = text.trim();
      
      if (password.length < 6) {
        await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Please enter password:');
        return;
      }
      
      if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        await bot.sendMessage(chatId, '❌ Password must include both letters and numbers. Please enter password:');
        return;
      }
      
      session.data.password = password;
      session.step = 'awaiting_confirm_password';
      
      await bot.sendMessage(chatId,
        `Step 4/4: Confirm your password\n\n` +
        `Re-enter your password:`
      );
    }
    else if (session.step === 'awaiting_confirm_password') {
      const confirmPassword = text.trim();
      
      if (confirmPassword !== session.data.password) {
        await bot.sendMessage(chatId, '❌ Passwords do not match. Please enter your password again:');
        session.step = 'awaiting_password';
        return;
      }
      
      // Generate member ID
      const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
      const memberId = `USER-${String(usersCount + 1000)}`;
      
      // Generate referral code
      const referralCode = `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Check if referral code is valid
      let referredBy = null;
      if (session.data.referralCode) {
        const referrer = await findOne(COLLECTIONS.USERS, { referralCode: session.data.referralCode });
        if (referrer) {
          referredBy = session.data.referralCode;
        }
      }
      
      // Create new user
      const newUser = {
        memberId: memberId,
        chatId: chatId.toString(),
        name: session.data.name,
        email: session.data.email.toLowerCase(),
        passwordHash: hashPassword(session.data.password),
        balance: 0,
        totalInvested: 0,
        totalEarned: 0,
        referralEarnings: 0,
        referrals: 0,
        referralCode: referralCode,
        referredBy: referredBy,
        activeInvestments: 0,
        joinedDate: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        banned: false,
        botBlocked: false,
        accountBound: true,
        telegramAccountId: chatId.toString(),
        offlineMessages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await insertData(COLLECTIONS.USERS, newUser);
      
      // Handle referral tracking
      if (referredBy) {
        const referrer = await findOne(COLLECTIONS.USERS, { referralCode: referredBy });
        if (referrer) {
          await saveData(COLLECTIONS.USERS,
            { memberId: referrer.memberId },
            { $inc: { referrals: 1 } }
          );
          
          await insertData(COLLECTIONS.REFERRALS, {
            id: `REF-${Date.now()}`,
            referrerId: referrer.memberId,
            referrerName: referrer.name,
            referrerCode: referrer.referralCode,
            referredId: memberId,
            referredName: session.data.name,
            bonusAmount: 0,
            status: 'pending',
            date: new Date().toISOString(),
            investmentAmount: 0,
            isFirstInvestment: true,
            bonusPaid: false,
            createdAt: new Date().toISOString()
          });
        }
      }
      
      delete userSessions[chatId];
      loggedOutUsers.delete(chatId.toString());
      
      let welcomeMessage = `🎉 **Registration Successful!**\n\n` +
                          `Welcome to Starlife Advert, ${session.data.name}!\n\n` +
                          `**Account Details:**\n` +
                          `Member ID: ${memberId}\n` +
                          `Email: ${session.data.email}\n` +
                          `Password: ${session.data.password}\n` +
                          `Referral Code: ${referralCode}\n`;
      
      if (referredBy) {
        welcomeMessage += `Referred By: ${referredBy}\n`;
      }
      
      welcomeMessage += `\n**IMPORTANT SECURITY:**\n` +
                       `This Telegram account is now linked to Member ID: ${memberId}\n\n` +
                       `**Save your Member ID and Password!**\n` +
                       `You'll need them if you ever switch Telegram accounts.\n\n` +
                       `**To Start Earning:**\n` +
                       `1. Use /invest to make your first investment\n` +
                       `2. Minimum investment: $10\n` +
                       `3. Earn 2% daily profit (LIFETIME)\n` +
                       `4. Share your referral code to earn 10% on FIRST investments!\n\n` +
                       `✅ You are now logged in!`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      
      await insertData(COLLECTIONS.TRANSACTIONS, {
        id: `TRX-REG-${Date.now()}`,
        memberId: memberId,
        type: 'registration',
        amount: 0,
        description: 'Account registration',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }
    
    // Login flow
    else if (session.step === 'login_memberid') {
      const memberId = text.trim().toUpperCase();
      const user = await getUserByMemberId(memberId);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Member ID not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 Your account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      session.data.memberId = memberId;
      session.step = 'login_password';
      
      await bot.sendMessage(chatId, `Enter password for ${memberId}:`);
    }
    else if (session.step === 'login_password') {
      const password = text.trim();
      const user = await getUserByMemberId(session.data.memberId);
      
      if (!user || user.passwordHash !== hashPassword(password)) {
        await bot.sendMessage(chatId, '❌ Invalid password. Try again:');
        session.step = 'login_password';
        return;
      }
      
      if (user.chatId !== chatId.toString()) {
        await saveData(COLLECTIONS.USERS,
          { memberId: session.data.memberId },
          { 
            $set: { 
              chatId: chatId.toString(),
              accountBound: true,
              telegramAccountId: chatId.toString(),
              lastLogin: new Date().toISOString()
            }
          }
        );
      } else {
        await saveData(COLLECTIONS.USERS,
          { memberId: session.data.memberId },
          { $set: { lastLogin: new Date().toISOString() } }
        );
      }
      
      loggedOutUsers.delete(chatId.toString());
      delete userSessions[chatId];
      
      let welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                          `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                          `👥 Referrals: ${user.referrals || 0}\n` +
                          `🔗 Your Code: ${user.referralCode}\n\n`;
      
      if (user.offlineMessages && user.offlineMessages.length > 0) {
        const unreadMessages = user.offlineMessages.filter(msg => !msg.read);
        
        if (unreadMessages.length > 0) {
          welcomeMessage += `📬 **You have ${unreadMessages.length} unread message(s)**\n`;
          welcomeMessage += `Use /inbox to view your messages\n\n`;
        }
      }
      
      welcomeMessage += `📋 **Quick Commands:**\n` +
                        `/invest - Make investment\n` +
                        `/earnings - View YOUR earnings\n` +
                        `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                        `/withdraw - Withdraw funds\n` +
                        `/profile - Account details\n` +
                        `/support - Contact support\n` +
                        `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
    }
    
    // Investment flow
    else if (session.step === 'awaiting_investment_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10 || amount > 800000) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $10\n` +
          `Maximum: $800,000\n\n` +
          `Please enter a valid amount:`
        );
        return;
      }
      
      session.data.amount = amount;
      session.step = 'awaiting_investment_payment_method';
      
      await bot.sendMessage(chatId,
        `✅ Amount: ${formatCurrency(amount)}\n\n` +
        `**Select Payment Method:**\n\n` +
        `1️⃣ **M-Pesa**\n` +
        `   Till: 6034186\n` +
        `   Name: Starlife Advert US Agency\n\n` +
        `2️⃣ **USDT Tether (BEP20) - RECOMMENDED**\n` +
        `   Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
        `   📌 Send only USDT (BEP20)\n\n` +
        `3️⃣ **USDT TRON (TRC20)**\n` +
        `   Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
        `   📌 Send only USDT (TRC20)\n\n` +
        `4️⃣ **PayPal**\n` +
        `   Email: dave@starlifeadvert.com\n\n` +
        `Reply with number (1-4):`
      );
    }
    else if (session.step === 'awaiting_investment_payment_method') {
      const methodNumber = parseInt(text);
      const methods = ['M-Pesa', 'USDT Tether (BEP20)', 'USDT TRON (TRC20)', 'PayPal'];
      
      if (isNaN(methodNumber) || methodNumber < 1 || methodNumber > 4) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-4:');
        return;
      }
      
      const method = methods[methodNumber - 1];
      session.data.paymentMethod = method;
      session.step = 'awaiting_investment_proof';
      
      let paymentDetails = '';
      
      if (method === 'M-Pesa') {
        paymentDetails = `**M-Pesa Details:**\n` +
                        `Till: 6034186\n` +
                        `Name: Starlife Advert US Agency\n\n` +
                        `Please send payment and then send a screenshot of your payment proof.`;
      } else if (method === 'USDT Tether (BEP20)') {
        paymentDetails = `**USDT Tether (BEP20) Details:**\n` +
                        `Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n\n` +
                        `📌 **IMPORTANT:** Send only USDT (BEP20)\n` +
                        `After sending, please send a screenshot of your transaction.`;
      } else if (method === 'USDT TRON (TRC20)') {
        paymentDetails = `**USDT TRON (TRC20) Details:**\n` +
                        `Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n\n` +
                        `📌 **IMPORTANT:** Send only USDT (TRC20)\n` +
                        `After sending, please send a screenshot of your transaction.`;
      } else {
        paymentDetails = `**PayPal Details:**\n` +
                        `Email: dave@starlifeadvert.com\n\n` +
                        `After sending, please send a screenshot of your payment.`;
      }
      
      await bot.sendMessage(chatId,
        `✅ Payment Method: ${method}\n\n` +
        `${paymentDetails}\n\n` +
        `**Now, please send a photo/screenshot of your payment proof:**`
      );
    }
    
    // Withdrawal flow
    else if (session.step === 'awaiting_withdrawal_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 2 || amount > session.data.balance) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $2\n` +
          `Maximum: ${formatCurrency(session.data.balance)}\n\n` +
          `Please enter a valid amount:`
        );
        return;
      }
      
      const fee = calculateWithdrawalFee(amount);
      const netAmount = calculateNetWithdrawal(amount);
      
      session.data.withdrawalAmount = amount;
      session.data.fee = fee;
      session.data.netAmount = netAmount;
      session.step = 'awaiting_withdrawal_method';
      
      await bot.sendMessage(chatId,
        `💰 **Withdrawal Details**\n\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `Fee (5%): ${formatCurrency(fee)}\n` +
        `Net Amount: ${formatCurrency(netAmount)}\n\n` +
        `Select withdrawal method:\n\n` +
        `1️⃣ M-Pesa\n` +
        `2️⃣ Bank Transfer\n` +
        `3️⃣ PayPal\n\n` +
        `Reply with number (1-3):`
      );
    }
    else if (session.step === 'awaiting_withdrawal_method') {
      const methodNumber = parseInt(text);
      const methods = ['M-Pesa', 'Bank Transfer', 'PayPal'];
      
      if (isNaN(methodNumber) || methodNumber < 1 || methodNumber > 3) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-3:');
        return;
      }
      
      const method = methods[methodNumber - 1];
      session.data.method = method;
      session.step = 'awaiting_withdrawal_details';
      
      let detailsPrompt = '';
      
      if (method === 'M-Pesa') {
        detailsPrompt = `Enter your M-Pesa phone number:\n` +
                       `Example: 254712345678`;
      } else if (method === 'Bank Transfer') {
        detailsPrompt = `Enter your bank details:\n` +
                       `• Account Name\n` +
                       `• Account Number\n` +
                       `• Bank Name`;
      } else {
        detailsPrompt = `Enter your PayPal email address:`;
      }
      
      await bot.sendMessage(chatId,
        `✅ Method: ${method}\n\n` +
        `${detailsPrompt}\n\n` +
        `Enter the required information:`
      );
    }
    else if (session.step === 'awaiting_withdrawal_details') {
      const details = text.trim();
      
      if (details.length < 3) {
        await bot.sendMessage(chatId, '❌ Details too short. Please provide valid information:');
        return;
      }
      
      // Update user balance
      await saveData(COLLECTIONS.USERS,
        { memberId: session.data.memberId },
        { $inc: { balance: -session.data.withdrawalAmount } }
      );
      
      // Create withdrawal request
      const withdrawalId = `WDL-${Date.now()}`;
      
      const withdrawal = {
        id: withdrawalId,
        memberId: session.data.memberId,
        amount: session.data.withdrawalAmount,
        fee: session.data.fee,
        netAmount: session.data.netAmount,
        method: session.data.method,
        details: details,
        status: 'pending',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      await insertData(COLLECTIONS.WITHDRAWALS, withdrawal);
      
      // Record transaction
      await insertData(COLLECTIONS.TRANSACTIONS, {
        id: `TRX-WDL-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'withdrawal',
        amount: -session.data.withdrawalAmount,
        description: `Withdrawal #${withdrawalId} (${session.data.method})`,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Withdrawal Request Submitted!**\n\n` +
        `Amount: ${formatCurrency(session.data.withdrawalAmount)}\n` +
        `Fee: ${formatCurrency(session.data.fee)}\n` +
        `Net Amount: ${formatCurrency(session.data.netAmount)}\n` +
        `Method: ${session.data.method}\n` +
        `Withdrawal ID: ${withdrawalId}\n\n` +
        `Your request has been sent for processing.\n` +
        `Processing time: 10-15 minutes\n\n` +
        `You will be notified when it's approved.`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const user = await getUserByMemberId(session.data.memberId);
        
        const adminMessage = `💳 **New Withdrawal Request**\n\n` +
                            `ID: ${withdrawalId}\n` +
                            `User: ${user.name} (${session.data.memberId})\n` +
                            `Amount: ${formatCurrency(session.data.withdrawalAmount)}\n` +
                            `Net Amount: ${formatCurrency(session.data.netAmount)}\n` +
                            `Method: ${session.data.method}\n` +
                            `Details: ${details}\n\n` +
                            `**Approve:** /approve ${withdrawalId}\n` +
                            `**Reject:** /reject ${withdrawalId}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Support flow
    else if (session.step === 'support_topic') {
      const topicNumber = parseInt(text);
      
      const user = await getUserByMemberId(session.data.memberId);
      const isBanned = user ? user.banned : false;
      
      if (isBanned) {
        if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 4) {
          await bot.sendMessage(chatId, '❌ Please enter a number between 1-4:');
          return;
        }
        
        const bannedTopics = [
          'Appeal Suspension',
          'Account Recovery',
          'Payment Issues',
          'Other Issues'
        ];
        
        const topic = bannedTopics[topicNumber - 1];
        session.data.topic = `SUSPENDED - ${topic}`;
        session.step = 'support_message';
        
        await bot.sendMessage(chatId,
          `✅ Topic: ${topic}\n\n` +
          `Please explain your situation in detail:\n` +
          `• Why you believe your account was wrongly suspended\n` +
          `• Any evidence to support your appeal\n` +
          `• Your contact information\n\n` +
          `Type your appeal message below:`
        );
      } else {
        if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 6) {
          await bot.sendMessage(chatId, '❌ Please enter a number between 1-6:');
          return;
        }
        
        const topics = [
          'Account Issues',
          'Investment Problems',
          'Withdrawal Help',
          'Referral Issues',
          'Payment Proof/Upload',
          'Other'
        ];
        
        const topic = topics[topicNumber - 1];
        session.data.topic = topic;
        session.step = 'support_message';
        
        await bot.sendMessage(chatId,
          `✅ Topic: ${topic}\n\n` +
          `Please describe your issue in detail:\n` +
          `Type your message below:`
        );
      }
    }
    else if (session.step === 'support_message') {
      // Create or find support chat
      const activeChat = await getActiveSupportChat(session.data.memberId);
      
      let chatIdStr;
      
      if (activeChat) {
        chatIdStr = activeChat.id;
        await saveData(COLLECTIONS.SUPPORT_CHATS,
          { id: chatIdStr },
          { 
            $push: { 
              messages: {
                sender: 'user',
                message: text,
                timestamp: new Date().toISOString()
              }
            },
            $set: {
              updatedAt: new Date().toISOString(),
              adminReplied: false
            }
          }
        );
      } else {
        chatIdStr = `CHAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        const newChat = {
          id: chatIdStr,
          userId: session.data.memberId,
          userName: session.data.userName,
          topic: session.data.topic,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{
            sender: 'user',
            message: text,
            timestamp: new Date().toISOString()
          }],
          adminReplied: false
        };
        
        await insertData(COLLECTIONS.SUPPORT_CHATS, newChat);
      }
      
      session.step = 'support_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond within 15 minutes.\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **New Support Request**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${session.data.userName} (${session.data.memberId})\n` +
                            `Topic: ${session.data.topic}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    else if (session.step === 'support_chat') {
      const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
      
      if (!supportChat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      if (supportChat.status === 'closed') {
        await bot.sendMessage(chatId, '❌ This support chat has been closed by admin.');
        delete userSessions[chatId];
        return;
      }
      
      await saveData(COLLECTIONS.SUPPORT_CHATS,
        { id: session.data.chatId },
        { 
          $push: { 
            messages: {
              sender: 'user',
              message: text,
              timestamp: new Date().toISOString()
            }
          },
          $set: {
            updatedAt: new Date().toISOString(),
            adminReplied: false
          }
        }
      );
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Support Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${supportChat.userName} (${supportChat.userId})\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Universal support flow
    else if (session.step === 'universal_support_choice') {
      const choice = parseInt(text);
      
      if (isNaN(choice) || choice < 1 || choice > 5) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-5:');
        return;
      }
      
      const choices = [
        'Account Issues',
        'General Questions',
        'Technical Problems',
        'Create New Account',
        'Send Payment Proof'
      ];
      
      session.data.topic = choices[choice - 1];
      session.step = 'universal_support_message';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${session.data.topic}\n\n` +
        `Please describe your issue in detail:\n\n` +
        `**Include these if relevant:**\n` +
        `• Member ID (if you have one)\n` +
        `• Your name\n` +
        `• Email address\n` +
        `• Screenshot details\n\n` +
        `Type your message below:`
      );
    }
    else if (session.step === 'universal_support_message') {
      const chatIdStr = `CHAT-NOACC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newChat = {
        id: chatIdStr,
        userId: `NO_ACCOUNT_${chatId}`,
        userName: `User without account (Chat ID: ${chatId})`,
        userChatId: chatId.toString(),
        topic: session.data.topic,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        }],
        adminReplied: false,
        noAccount: true
      };
      
      await insertData(COLLECTIONS.SUPPORT_CHATS, newChat);
      
      session.step = 'universal_support_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond within 15 minutes.\n` +
        `You don't need an account to continue chatting.\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Type /endsupport to end chat`
      );
      
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **New Support (No Account)**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: No account (Chat ID: ${chatId})\n` +
                            `Topic: ${session.data.topic}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    else if (session.step === 'universal_support_chat') {
      const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
      
      if (!supportChat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      await saveData(COLLECTIONS.SUPPORT_CHATS,
        { id: session.data.chatId },
        { 
          $push: { 
            messages: {
              sender: 'user',
              message: text,
              timestamp: new Date().toISOString()
            }
          },
          $set: {
            updatedAt: new Date().toISOString(),
            adminReplied: false
          }
        }
      );
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **No Account User Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${supportChat.userName}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
  } catch (error) {
    console.log('Message handling error:', error.message);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    delete userSessions[chatId];
  }
});

// ==================== MEDIA HANDLERS ====================
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (session && session.step === 'awaiting_investment_proof') {
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || '';
      
      const investmentId = `INV-${Date.now()}`;
      
      const investment = {
        id: investmentId,
        memberId: session.data.memberId,
        amount: session.data.amount,
        paymentMethod: session.data.paymentMethod,
        status: 'pending',
        date: new Date().toISOString(),
        daysActive: 0,
        totalProfit: 0,
        proofMediaId: `MEDIA-${Date.now()}`,
        proofCaption: caption || `Payment proof for $${session.data.amount}`
      };
      
      await insertData(COLLECTIONS.INVESTMENTS, investment);
      
      await insertData(COLLECTIONS.MEDIA_FILES, {
        id: `MEDIA-${Date.now()}`,
        fileId: fileId,
        fileType: 'photo',
        caption: `Payment proof for ${formatCurrency(session.data.amount)} (Method: ${session.data.paymentMethod})`,
        investmentId: investmentId,
        sender: session.data.memberId,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Payment Proof Received!**\n\n` +
        `Amount: ${formatCurrency(session.data.amount)}\n` +
        `Payment Method: ${session.data.paymentMethod}\n` +
        `Investment ID: ${investmentId}\n\n` +
        `Your investment is pending approval.\n` +
        `Our team will review your payment proof and activate your investment within 15 minutes.\n\n` +
        `You will be notified once it's approved.`
      );
      
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const user = await getUserByMemberId(session.data.memberId);
        
        const adminMessage = `📈 **New Investment Request**\n\n` +
                            `Investment ID: ${investmentId}\n` +
                            `User: ${user.name} (${session.data.memberId})\n` +
                            `Amount: ${formatCurrency(session.data.amount)}\n` +
                            `Payment Method: ${session.data.paymentMethod}\n` +
                            `Date: ${new Date().toLocaleString()}\n\n` +
                            `**Approve:** /approveinvestment ${investmentId}\n` +
                            `**Reject:** /rejectinvestment ${investmentId}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    } catch (error) {
      console.log('Error handling investment photo:', error.message);
      await bot.sendMessage(chatId, '❌ Error sending payment proof. Please try again.');
    }
  }
});

// ==================== ADMIN COMMANDS ====================

// /users command
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(COLLECTIONS.USERS, {}, { joinedDate: -1 }, 10);
    
    if (users.length === 0) {
      await bot.sendMessage(chatId, '📭 No users found.');
      return;
    }
    
    let message = `👥 **Recent Users (Last 10)**\n\n`;
    
    users.forEach((user, index) => {
      const status = user.banned ? '🚫' : '✅';
      const balance = formatCurrency(user.balance || 0);
      message += `${index + 1}. ${status} ${user.name} (${user.memberId})\n`;
      message += `   Balance: ${balance} | Ref: ${user.referrals || 0}\n\n`;
    });
    
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    message += `**Total Users:** ${totalUsers}\n\n`;
    message += `**View user:** /view USER_ID\n`;
    message += `**Example:** /view USER-1000`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /users:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading users.');
  }
});

// /view command
bot.onText(/\/view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const investments = await loadData(COLLECTIONS.INVESTMENTS, { memberId: memberId });
    const withdrawals = await loadData(COLLECTIONS.WITHDRAWALS, { memberId: memberId });
    const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: memberId });
    
    const message = `👤 **User Details**\n\n` +
                   `Name: ${user.name}\n` +
                   `Member ID: ${user.memberId}\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Chat ID: ${user.chatId || 'N/A'}\n` +
                   `Status: ${user.banned ? '🚫 Banned' : '✅ Active'}\n` +
                   `Joined: ${new Date(user.joinedDate).toLocaleString()}\n` +
                   `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}\n\n` +
                   `💰 **Financials**\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                   `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                   `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                   `📊 **Stats**\n` +
                   `Referrals: ${user.referrals || 0}\n` +
                   `Referral Code: ${user.referralCode || 'N/A'}\n` +
                   `Investments: ${investments.length}\n` +
                   `Withdrawals: ${withdrawals.length}\n` +
                   `Referral Network: ${referrals.length}\n\n` +
                   `**Actions:**\n` +
                   `💰 Add Balance: /addbalance ${memberId} AMOUNT\n` +
                   `🔐 Reset Pass: /resetpass ${memberId}\n` +
                   `📨 Message: /message ${memberId}\n` +
                   `${user.banned ? `✅ Unsuspend: /unsuspend ${memberId}` : `🚫 Suspend: /suspend ${memberId}`}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /view:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading user details.');
  }
});

// /addbalance command
bot.onText(/\/addbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /addbalance USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { $inc: { balance: amount } }
    );
    
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `ADMIN-ADD-${Date.now()}`,
      memberId: memberId,
      type: 'admin_add_balance',
      amount: amount,
      description: `Admin added balance`,
      date: new Date().toISOString(),
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Balance Added Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Added: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}`
    );
    
    await sendUserNotification(memberId,
      `💰 **Admin Added Balance**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}\n\n` +
      `This was added by an administrator.`
    );
  } catch (error) {
    console.log('Error in /addbalance:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding balance.');
  }
});

// ==================== SERVER STARTUP ====================
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🤖 Bot Token: ${TELEGRAM_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`🗄️  MongoDB URI: ${MONGODB_URI ? '✅ Set' : '❌ Missing'}`);
  
  try {
    const mongoConnected = await initMongoDB();
    if (mongoConnected) {
      scheduleDailyProfits();
      console.log('✅ Bot system initialized successfully');
      console.log('📊 MongoDB connected');
      console.log('💰 Daily profit scheduler started');
    } else {
      console.log('❌ Failed to connect to MongoDB');
    }
  } catch (error) {
    console.log('❌ Initialization error:', error.message);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: 'running',
    mongo: !!db
  });
});

app.get('/', (req, res) => {
  res.send('Starlife Advert Bot is running!');
});

// Error handlers
bot.on('polling_error', (error) => {
  console.log('Polling error:', error.message);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('✅ Starlife Advert Bot is ready!');
console.log('📱 Commands available: /start, /register, /login, /invest, /withdraw, /profile, /support, /admin');
