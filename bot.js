const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Data storage files
const USERS_FILE = 'users.json';
const INVESTMENTS_FILE = 'investments.json';
const WITHDRAWALS_FILE = 'withdrawals.json';
const REFERRALS_FILE = 'referrals.json';
const FAKE_MEMBERS_FILE = 'fake_members.json';
const TRANSACTIONS_FILE = 'transactions.json';
const SUPPORT_CHATS_FILE = 'support_chats.json';
const EARNINGS_VIEWS_FILE = 'earnings_views.json';

// Initialize storage
async function initStorage() {
  const files = [USERS_FILE, INVESTMENTS_FILE, WITHDRAWALS_FILE, REFERRALS_FILE, 
                FAKE_MEMBERS_FILE, TRANSACTIONS_FILE, SUPPORT_CHATS_FILE, EARNINGS_VIEWS_FILE];
  
  for (const file of files) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, JSON.stringify([]));
    }
  }
  
  const fakeMembers = JSON.parse(await fs.readFile(FAKE_MEMBERS_FILE, 'utf8') || '[]');
  if (fakeMembers.length === 0) {
    const initialFakeMembers = generateFakeMembers(50);
    await fs.writeFile(FAKE_MEMBERS_FILE, JSON.stringify(initialFakeMembers, null, 2));
  }
  
  console.log('✅ Storage initialized');
}

// Load data
async function loadData(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save data
async function saveData(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.log('❌ Error saving data:', error.message);
    return false;
  }
}

// Generate fake members
function generateFakeMembers(count) {
  const fakeMembers = [];
  const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
  
  for (let i = 1; i <= count; i++) {
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
      isFake: true
    });
  }
  
  return fakeMembers;
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate random password
function generateRandomPassword(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Check if admin
function isAdmin(chatId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  return adminIds.includes(chatId.toString());
}

// Calculate daily profit (2% daily)
function calculateDailyProfit(investmentAmount) {
  return investmentAmount * 0.02;
}

// Calculate referral bonus (10% of referred user's investment)
function calculateReferralBonus(investmentAmount) {
  return investmentAmount * 0.10;
}

// Calculate withdrawal fee (5%)
function calculateWithdrawalFee(amount) {
  return amount * 0.05;
}

// Calculate net withdrawal amount after 5% fee
function calculateNetWithdrawal(amount) {
  const fee = calculateWithdrawalFee(amount);
  return amount - fee;
}

// Format currency
function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    await initStorage();
    scheduleDailyProfits();
    console.log('✅ Bot system initialized successfully');
  } catch (error) {
    console.log('❌ Initialization error:', error.message);
  }
});

// Bot initialization
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  console.log('Please set TELEGRAM_TOKEN environment variable');
  process.exit(1);
}

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
  console.log('❌ Bot creation failed:', error.message);
  process.exit(1);
}

// User sessions
const userSessions = {};

// Logged out users (track who has logged out)
const loggedOutUsers = new Set();

// Admin sessions for messaging users
const adminSessions = {};

// Daily profit scheduler
function scheduleDailyProfits() {
  setInterval(async () => {
    try {
      const investments = await loadData(INVESTMENTS_FILE);
      const users = await loadData(USERS_FILE);
      
      const activeInvestments = investments.filter(inv => inv.status === 'active');
      
      for (const investment of activeInvestments) {
        const dailyProfit = calculateDailyProfit(investment.amount);
        
        const userIndex = users.findIndex(u => u.memberId === investment.memberId);
        if (userIndex !== -1) {
          users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + dailyProfit;
          users[userIndex].totalEarned = (parseFloat(users[userIndex].totalEarned) || 0) + dailyProfit;
          
          const transactions = await loadData(TRANSACTIONS_FILE);
          transactions.push({
            id: `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            memberId: investment.memberId,
            type: 'daily_profit',
            amount: dailyProfit,
            description: `Daily profit from investment #${investment.id}`,
            date: new Date().toISOString()
          });
          await saveData(TRANSACTIONS_FILE, transactions);
        }
        
        investment.daysActive = (investment.daysActive || 0) + 1;
        investment.totalProfit = (parseFloat(investment.totalProfit) || 0) + dailyProfit;
        
        if (investment.daysActive >= 30) {
          investment.status = 'completed';
          
          const user = users.find(u => u.memberId === investment.memberId);
          if (user) {
            try {
              // Check if user is logged in (has chatId)
              if (user.chatId && !loggedOutUsers.has(user.chatId)) {
                await bot.sendMessage(user.chatId,
                  `🎉 **Investment Completed!**\n\n` +
                  `Investment #${investment.id} has completed its 30-day period.\n` +
                  `Total Profit Earned: ${formatCurrency(investment.totalProfit)}\n\n` +
                  `You can now withdraw your profits!`
                );
              }
            } catch (error) {
              console.log('Could not notify user');
            }
          }
        }
      }
      
      await saveData(USERS_FILE, users);
      await saveData(INVESTMENTS_FILE, investments);
      
      console.log('✅ Daily profits calculated for', activeInvestments.length, 'investments');
    } catch (error) {
      console.log('❌ Error calculating daily profits:', error.message);
    }
  }, 24 * 60 * 60 * 1000);
}

// ==================== HELPER FUNCTIONS ====================

// Check if user is logged in
async function isUserLoggedIn(chatId) {
  // Check if user has explicitly logged out
  if (loggedOutUsers.has(chatId.toString())) {
    return false;
  }
  
  // Check if user exists and has chatId
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  return !!user;
}

// Check if user is logged in AND not banned
async function canUserAccessAccount(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return false;
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) return false;
  if (user.banned) return false;
  
  return true;
}

// Get user data if logged in
async function getLoggedInUser(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return null;
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user || user.banned) {
    return null;
  }
  
  return user;
}

// Get user by member ID
async function getUserByMemberId(memberId) {
  const users = await loadData(USERS_FILE);
  return users.find(u => u.memberId === memberId);
}

// Get active support chat for user
async function getActiveSupportChat(userId) {
  const supportChats = await loadData(SUPPORT_CHATS_FILE);
  return supportChats.find(chat => 
    (chat.userId === userId || chat.userId === `LOGGED_OUT_${userId}`) && 
    chat.status === 'active'
  );
}

// Send notification to user (works even if logged out)
async function sendUserNotification(memberId, message) {
  try {
    const user = await getUserByMemberId(memberId);
    if (user && user.chatId) {
      await bot.sendMessage(user.chatId, message);
      return true;
    }
  } catch (error) {
    console.log('Could not send notification to user:', error.message);
  }
  return false;
}

// ==================== BOT COMMANDS ====================

// Start command - Available to everyone
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log('📱 /start from:', chatId);
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.chatId === chatId.toString());
    
    if (user) {
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
        return;
      }
      
      user.lastLogin = new Date().toISOString();
      await saveData(USERS_FILE, users);
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referralCode}\n\n` +
                            `📋 **Quick Commands:**\n` +
                            `/invest - Make investment\n` +
                            `/earnings - View earnings\n` +
                            `/viewearnings MEMBER_ID - View others ($1)\n` +
                            `/withdraw - Withdraw funds\n` +
                            `/referral - Share & earn 10%\n` +
                            `/profile - Account details\n` +
                            `/support - Contact support\n` +
                            `/logout - Logout\n\n` +
                            `💳 **Payment:**\n` +
                            `M-Pesa Till: 6034186\n` +
                            `Name: Starlife Advert US Agency`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
  }
  
  // User is not logged in - show public welcome
  // Show fake members success stories
  const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
  const recentSuccess = fakeMembers.slice(0, 3);
  
  let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
  recentSuccess.forEach(member => {
    fakeMessage += `✅ ${member.name} invested ${formatCurrency(member.investment)} & earned ${formatCurrency(member.profit)}\n`;
  });
  
  fakeMessage += '\n🚀 **Ready to Start Earning?**\n\n';
  fakeMessage += '💵 **Earn 2% Daily Profit**\n';
  fakeMessage += '👥 **Earn 10% from referrals**\n';
  fakeMessage += '⚡ **Fast Withdrawals (10-15 min)**\n\n';
  fakeMessage += 'Choose an option:\n';
  fakeMessage += '/register - Create account\n';
  fakeMessage += '/login - Existing account\n';
  fakeMessage += '/investnow - Quick start guide\n';
  fakeMessage += '/support - Get help\n\n';
  fakeMessage += '💳 **Payment Details:**\n';
  fakeMessage += 'M-Pesa Till: 6034186\n';
  fakeMessage += 'Name: Starlife Advert US Agency';
  
  await bot.sendMessage(chatId, fakeMessage);
});

// Support command - Available to everyone (ENHANCED)
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    // Logged in user - regular support
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.chatId === chatId.toString());
    
    if (user && user.banned) {
      await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
      return;
    }
    
    // Check for active support chat
    const activeChat = await getActiveSupportChat(user.memberId);
    
    if (activeChat) {
      // Continue existing chat
      userSessions[chatId] = {
        step: 'support_chat',
        data: {
          memberId: user.memberId,
          userName: user.name,
          chatId: activeChat.id
        }
      };
      
      await bot.sendMessage(chatId,
        `💬 **Support Chat (Active)**\n\n` +
        `You have an active support conversation.\n` +
        `Type your message below:\n\n` +
        `Last message from support: "${activeChat.messages.slice(-1)[0]?.message || 'No messages yet'}"\n\n` +
        `Type /endsupport to end this chat`
      );
    } else {
      // Start new support chat
      userSessions[chatId] = {
        step: 'support_topic',
        data: {
          memberId: user.memberId,
          userName: user.name
        }
      };
      
      await bot.sendMessage(chatId,
        `🆘 **Support Center**\n\n` +
        `Please select your issue:\n\n` +
        `1️⃣ Account Issues\n` +
        `2️⃣ Investment Problems\n` +
        `3️⃣ Withdrawal Help\n` +
        `4️⃣ Referral Issues\n` +
        `5️⃣ Other\n\n` +
        `Reply with the number (1-5):`
      );
    }
  } else {
    // Logged out user - check if they have an active chat
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.chatId === chatId.toString());
    
    if (user) {
      // User exists but is logged out - check for active chat
      const activeChat = await getActiveSupportChat(user.memberId);
      
      if (activeChat) {
        // Continue existing chat
        userSessions[chatId] = {
          step: 'support_chat',
          data: {
            memberId: user.memberId,
            userName: user.name,
            chatId: activeChat.id,
            isLoggedOut: true
          }
        };
        
        await bot.sendMessage(chatId,
          `💬 **Support Chat (Active)**\n\n` +
          `You have an active support conversation.\n` +
          `Type your message below:\n\n` +
          `Last message from support: "${activeChat.messages.slice(-1)[0]?.message || 'No messages yet'}"\n\n` +
          `Type /endsupport to end this chat\n` +
          `Note: You are logged out. You can still chat with support.`
        );
        return;
      }
    }
    
    // Start new support chat for logged out user
    userSessions[chatId] = {
      step: 'support_loggedout_topic',
      data: {
        chatId: chatId
      }
    };
    
    await bot.sendMessage(chatId,
      `🆘 **Login/Account Support**\n\n` +
      `You are currently logged out.\n\n` +
      `Please select your issue:\n\n` +
      `1️⃣ Forgot Password\n` +
      `2️⃣ Can't Login\n` +
      `3️⃣ Account Recovery\n` +
      `4️⃣ Other Login Issue\n\n` +
      `Reply with the number (1-4):`
    );
  }
});

// Register command
bot.onText(/\/register(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1] ? match[1].trim().toUpperCase() : null;
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You already have an account. Use /login to access.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const existingUser = users.find(u => u.chatId === chatId.toString());
  
  if (existingUser) {
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
    // Check if referral code is valid
    const referrer = users.find(u => u.referralCode === referralCode);
    if (referrer) {
      registrationMessage += `✅ **Referral Code Applied!**\n`;
      registrationMessage += `Referred by: ${referrer.name}\n`;
      registrationMessage += `You'll earn 10% bonus when you invest!\n\n`;
    } else {
      registrationMessage += `⚠️ **Invalid Referral Code:** ${referralCode}\n`;
      registrationMessage += `Starting registration without referral...\n\n`;
      userSessions[chatId].data.referralCode = null;
    }
  } else {
    registrationMessage += `💡 **No Referral Code?**\n`;
    registrationMessage += `If you have a referral code, type /register CODE\n`;
    registrationMessage += `Example: /register REF-ABC123\n\n`;
  }
  
  registrationMessage += `Step 1/4: Enter your full name\n\n` +
                       `Example: John Doe\n` +
                       `Enter your name:`;
  
  await bot.sendMessage(chatId, registrationMessage);
});

// Login command
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see dashboard.');
    return;
  }
  
  // Remove from logged out users if they're trying to login
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

// ==================== MESSAGE HANDLERS ====================

// Handle all messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // Handle registration steps
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
      const users = await loadData(USERS_FILE);
      const memberId = `USER-${String(users.length + 1000)}`;
      
      // Generate referral code
      const referralCode = `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Check if referral code is valid
      let referredBy = null;
      if (session.data.referralCode) {
        const referrer = users.find(u => u.referralCode === session.data.referralCode);
        if (referrer) {
          referredBy = session.data.referralCode;
        }
      }
      
      // Create new user
      const newUser = {
        memberId: memberId,
        chatId: chatId.toString(),
        name: session.data.name,
        email: session.data.email,
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
        banned: false
      };
      
      users.push(newUser);
      await saveData(USERS_FILE, users);
      
      // Handle referral tracking if user was referred
      if (referredBy) {
        const referrer = users.find(u => u.referralCode === referredBy);
        if (referrer) {
          // Update referrer's referral count
          referrer.referrals = (referrer.referrals || 0) + 1;
          
          // Create referral record
          const referrals = await loadData(REFERRALS_FILE);
          referrals.push({
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
            bonusPaid: false
          });
          
          await saveData(REFERRALS_FILE, referrals);
          await saveData(USERS_FILE, users);
          
          // Notify referrer
          await sendUserNotification(referrer.memberId,
            `🎉 **New Referral!**\n\n` +
            `${session.data.name} registered using your referral code!\n` +
            `You will earn 10% when they make their FIRST investment.\n\n` +
            `Total Referrals: ${referrer.referrals}`
          );
        }
      }
      
      // Clear session
      delete userSessions[chatId];
      
      // Clear from logged out users if they were there
      loggedOutUsers.delete(chatId.toString());
      
      // Welcome message
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
      
      welcomeMessage += `\n**Save your Member ID and Password!**\n` +
                       `You'll need them to login.\n\n` +
                       `**To Start Earning:**\n` +
                       `1. Use /invest to make your first investment\n` +
                       `2. Minimum investment: $10\n` +
                       `3. Earn 2% daily profit\n` +
                       `4. Share your referral code to earn 10%!\n\n` +
                       `**Payment Details:**\n` +
                       `💳 M-Pesa Till: 6034186\n` +
                       `🏢 Name: Starlife Advert US Agency\n\n` +
                       `**Quick Commands:**\n` +
                       `/invest - Make investment\n` +
                       `/earnings - View earnings\n` +
                       `/referral - Share & earn 10%\n` +
                       `/profile - Account details\n` +
                       `/support - Contact support\n\n` +
                       `✅ You are now logged in!`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      
      // Record transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-REG-${Date.now()}`,
        memberId: memberId,
        type: 'registration',
        amount: 0,
        description: 'Account registration',
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
    }
    
    // Handle login steps
    else if (session.step === 'login_memberid') {
      const memberId = text.trim().toUpperCase();
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === memberId);
      
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
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === session.data.memberId);
      
      if (!user || user.passwordHash !== hashPassword(password)) {
        await bot.sendMessage(chatId, '❌ Invalid password. Try again:');
        session.step = 'login_password';
        return;
      }
      
      // Update chatId if different
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      users[userIndex].chatId = chatId.toString();
      users[userIndex].lastLogin = new Date().toISOString();
      
      await saveData(USERS_FILE, users);
      
      // Clear from logged out users
      loggedOutUsers.delete(chatId.toString());
      
      // Clear session
      delete userSessions[chatId];
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referralCode}\n\n` +
                            `📋 **Quick Commands:**\n` +
                            `/invest - Make investment\n` +
                            `/earnings - View earnings\n` +
                            `/viewearnings MEMBER_ID - View others ($1)\n` +
                            `/withdraw - Withdraw funds\n` +
                            `/referral - Share & earn 10%\n` +
                            `/profile - Account details\n` +
                            `/support - Contact support\n` +
                            `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
    }
    
    // Handle support for logged out users
    else if (session.step === 'support_loggedout_topic') {
      const topicNumber = parseInt(text);
      const topics = [
        'Forgot Password',
        'Can\'t Login',
        'Account Recovery',
        'Other Login Issue'
      ];
      
      if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 4) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-4:');
        return;
      }
      
      const topic = topics[topicNumber - 1];
      session.data.topic = topic;
      session.step = 'support_loggedout_memberid';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${topic}\n\n` +
        `Do you remember your Member ID?\n\n` +
        `1️⃣ Yes, I remember my Member ID\n` +
        `2️⃣ No, I need help finding it\n\n` +
        `Reply with number (1-2):`
      );
    }
    else if (session.step === 'support_loggedout_memberid') {
      const choice = parseInt(text);
      
      if (choice === 1) {
        session.step = 'support_loggedout_enter_memberid';
        await bot.sendMessage(chatId,
          `Please enter your Member ID:\n` +
          `(Format: USER-123456)\n\n` +
          `If you don't remember, type "forgot"`
        );
      } else if (choice === 2) {
        // Try to find user by chat ID
        const users = await loadData(USERS_FILE);
        const user = users.find(u => u.chatId === chatId.toString());
        
        if (user) {
          session.data.memberId = user.memberId;
          session.data.userName = user.name;
          session.step = 'support_loggedout_message';
          
          await bot.sendMessage(chatId,
            `✅ Found your account!\n` +
            `Name: ${user.name}\n` +
            `Member ID: ${user.memberId}\n\n` +
            `Please describe your issue in detail:\n` +
            `Type your message below:`
          );
        } else {
          session.step = 'support_loggedout_message_noaccount';
          await bot.sendMessage(chatId,
            `We couldn't find an account linked to this chat.\n\n` +
            `Please describe your issue in detail:\n` +
            `Include your name and email if possible.\n\n` +
            `Type your message below:`
          );
        }
      } else {
        await bot.sendMessage(chatId, '❌ Please enter 1 or 2:');
      }
    }
    else if (session.step === 'support_loggedout_enter_memberid') {
      if (text.toLowerCase() === 'forgot') {
        // Try to find user by chat ID
        const users = await loadData(USERS_FILE);
        const user = users.find(u => u.chatId === chatId.toString());
        
        if (user) {
          session.data.memberId = user.memberId;
          session.data.userName = user.name;
          session.step = 'support_loggedout_message';
          
          await bot.sendMessage(chatId,
            `✅ Found your account!\n` +
            `Name: ${user.name}\n` +
            `Member ID: ${user.memberId}\n\n` +
            `Please describe your issue in detail:\n` +
            `Type your message below:`
          );
        } else {
          session.step = 'support_loggedout_message_noaccount';
          await bot.sendMessage(chatId,
            `We couldn't find an account linked to this chat.\n\n` +
            `Please describe your issue in detail:\n` +
            `Include your name and email if possible.\n\n` +
            `Type your message below:`
          );
        }
      } else {
        const memberId = text.trim().toUpperCase();
        const users = await loadData(USERS_FILE);
        const user = users.find(u => u.memberId === memberId);
        
        if (user) {
          session.data.memberId = memberId;
          session.data.userName = user.name;
          session.step = 'support_loggedout_message';
          
          await bot.sendMessage(chatId,
            `✅ Found your account!\n` +
            `Name: ${user.name}\n` +
            `Member ID: ${memberId}\n\n` +
            `Please describe your issue in detail:\n` +
            `Type your message below:`
          );
        } else {
          await bot.sendMessage(chatId,
            `❌ Member ID not found: ${memberId}\n\n` +
            `Please check and try again, or type "forgot" if you don't remember:`
          );
        }
      }
    }
    else if (session.step === 'support_loggedout_message' || session.step === 'support_loggedout_message_noaccount') {
      // Create or find support chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      
      let chatIdStr;
      let chatIndex = -1;
      
      if (session.data.memberId) {
        // Find existing active chat for this user
        chatIndex = supportChats.findIndex(chat => 
          chat.userId === `LOGGED_OUT_${session.data.memberId}` && 
          chat.status === 'active'
        );
      } else {
        // Find existing active chat for this chat ID
        chatIndex = supportChats.findIndex(chat => 
          chat.userId === `LOGGED_OUT_CHAT_${chatId}` && 
          chat.status === 'active'
        );
      }
      
      if (chatIndex !== -1) {
        // Continue existing chat
        chatIdStr = supportChats[chatIndex].id;
      } else {
        // Create new support chat
        chatIdStr = `CHAT-LOGOUT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        const newChat = {
          id: chatIdStr,
          userId: session.data.memberId ? `LOGGED_OUT_${session.data.memberId}` : `LOGGED_OUT_CHAT_${chatId}`,
          userName: session.data.userName || `Logged Out User (Chat ID: ${chatId})`,
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
          isLoggedOut: true
        };
        
        supportChats.push(newChat);
        await saveData(SUPPORT_CHATS_FILE, supportChats);
      }
      
      if (chatIndex !== -1) {
        // Add message to existing chat
        supportChats[chatIndex].messages.push({
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        });
        supportChats[chatIndex].updatedAt = new Date().toISOString();
        supportChats[chatIndex].adminReplied = false;
        
        await saveData(SUPPORT_CHATS_FILE, supportChats);
      }
      
      session.step = 'support_loggedout_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify all admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const userName = session.data.userName || `Logged Out User (Chat ID: ${chatId})`;
        const userId = session.data.memberId || `Chat ID: ${chatId}`;
        
        const adminMessage = `🆘 **Logged Out User Support**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${userName}\n` +
                            `User ID: ${userId}\n` +
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
    else if (session.step === 'support_loggedout_chat') {
      // Check if chat is closed
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
      
      if (chatIndex === -1) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      if (supportChats[chatIndex].status === 'closed') {
        await bot.sendMessage(chatId, '❌ This support chat has been closed by admin.');
        delete userSessions[chatId];
        return;
      }
      
      supportChats[chatIndex].messages.push({
        sender: 'user',
        message: text,
        timestamp: new Date().toISOString()
      });
      supportChats[chatIndex].updatedAt = new Date().toISOString();
      supportChats[chatIndex].adminReplied = false;
      
      await saveData(SUPPORT_CHATS_FILE, supportChats);
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const chat = supportChats[chatIndex];
        const adminMessage = `💬 **Logged Out User Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.userName}\n` +
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
    
    // Handle regular support
    else if (session.step === 'support_topic') {
      const topicNumber = parseInt(text);
      const topics = [
        'Account Issues',
        'Investment Problems',
        'Withdrawal Help',
        'Referral Issues',
        'Other'
      ];
      
      if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 5) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-5:');
        return;
      }
      
      const topic = topics[topicNumber - 1];
      session.data.topic = topic;
      session.step = 'support_message';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${topic}\n\n` +
        `Please describe your issue in detail:\n` +
        `Type your message below:`
      );
    }
    else if (session.step === 'support_message') {
      // Create or find support chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      
      // Find existing active chat for this user
      const chatIndex = supportChats.findIndex(chat => 
        chat.userId === session.data.memberId && 
        chat.status === 'active'
      );
      
      let chatIdStr;
      
      if (chatIndex !== -1) {
        // Continue existing chat
        chatIdStr = supportChats[chatIndex].id;
        supportChats[chatIndex].messages.push({
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        });
        supportChats[chatIndex].updatedAt = new Date().toISOString();
        supportChats[chatIndex].adminReplied = false;
      } else {
        // Create new support chat
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
        
        supportChats.push(newChat);
      }
      
      await saveData(SUPPORT_CHATS_FILE, supportChats);
      
      session.step = 'support_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond within 15 minutes.\n\n` +
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
      // Check if chat is closed
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
      
      if (chatIndex === -1) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      if (supportChats[chatIndex].status === 'closed') {
        await bot.sendMessage(chatId, '❌ This support chat has been closed by admin.');
        delete userSessions[chatId];
        return;
      }
      
      supportChats[chatIndex].messages.push({
        sender: 'user',
        message: text,
        timestamp: new Date().toISOString()
      });
      supportChats[chatIndex].updatedAt = new Date().toISOString();
      supportChats[chatIndex].adminReplied = false;
      
      await saveData(SUPPORT_CHATS_FILE, supportChats);
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const chat = supportChats[chatIndex];
        const adminMessage = `💬 **New Support Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.userName} (${chat.userId})\n` +
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

// End support chat
bot.onText(/\/endsupport/, async (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions[chatId];
  if (session && (session.step === 'support_chat' || session.step === 'support_loggedout_chat')) {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
    
    if (chatIndex !== -1) {
      supportChats[chatIndex].status = 'closed';
      supportChats[chatIndex].updatedAt = new Date().toISOString();
      supportChats[chatIndex].closedBy = 'user';
      await saveData(SUPPORT_CHATS_FILE, supportChats);
    }
    
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

// ==================== ADMIN COMMANDS ====================

// ADMIN COMMANDS
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
                      `/delete USER_ID - Delete user\n` +
                      `/findref REF_CODE - Find user by referral code\n` +
                      `/message USER_ID - Message user directly\n\n` +
                      `💰 **Financial Management:**\n` +
                      `/addbalance USER_ID AMOUNT - Add balance\n` +
                      `/deductbalance USER_ID AMOUNT - Deduct balance\n\n` +
                      `📈 **Investment Management:**\n` +
                      `/investments - List all investments\n` +
                      `/approve INV_ID - Approve investment\n` +
                      `/reject INV_ID - Reject investment\n` +
                      `/manualinv USER_ID AMOUNT - Add manual investment\n` +
                      `/deductinv USER_ID AMOUNT - Deduct investment amount\n\n` +
                      `💳 **Withdrawal Management:**\n` +
                      `/withdrawals - List withdrawals\n` +
                      `/approve WDL_ID - Approve withdrawal\n` +
                      `/reject WDL_ID - Reject withdrawal\n\n` +
                      `👥 **Referral Management:**\n` +
                      `/referrals - List all referrals\n` +
                      `/addrefbonus USER_ID AMOUNT - Add referral bonus\n\n` +
                      `🆘 **Support Management:**\n` +
                      `/supportchats - View active chats\n` +
                      `/viewchat CHAT_ID - View specific chat\n` +
                      `/replychat CHAT_ID MESSAGE - Reply to chat\n` +
                      `/closechat CHAT_ID - Close chat\n\n` +
                      `📢 **Broadcast:**\n` +
                      `/broadcast MESSAGE - Send to all users`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// Reset password - ADMIN (FIXED)
bot.onText(/\/resetpass (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const user = users[userIndex];
    
    // Generate new random password
    const newPassword = generateRandomPassword(8);
    users[userIndex].passwordHash = hashPassword(newPassword);
    
    await saveData(USERS_FILE, users);
    
    // Send notification to user
    const notificationSent = await sendUserNotification(memberId,
      `🔐 **Password Reset**\n\n` +
      `Your password has been reset by admin.\n\n` +
      `**New Login Details:**\n` +
      `Member ID: ${memberId}\n` +
      `New Password: ${newPassword}\n\n` +
      `Please login with these details and change your password immediately.\n` +
      `Use /login to access your account.\n\n` +
      `💡 **Security Tip:** Change your password after logging in.`
    );
    
    if (notificationSent) {
      await bot.sendMessage(chatId,
        `✅ **Password Reset Successful**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `New Password: ${newPassword}\n\n` +
        `User has been notified of the new password.`
      );
    } else {
      await bot.sendMessage(chatId,
        `⚠️ **Password Reset (User Not Notified)**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `New Password: ${newPassword}\n\n` +
        `User could not be notified (may be logged out).\n` +
        `Please contact them through support chat.`
      );
    }
    
    // Record in support chats for tracking
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const resetChat = {
      id: `PASS-RESET-${Date.now()}`,
      userId: memberId,
      userName: user.name,
      topic: 'Password Reset',
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{
        sender: 'admin',
        message: `Password reset by admin. New password: ${newPassword}`,
        timestamp: new Date().toISOString(),
        adminId: chatId.toString()
      }],
      adminReplied: true,
      isSystemMessage: true
    };
    
    supportChats.push(resetChat);
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
  } catch (error) {
    console.log('Error in /resetpass:', error.message);
    await bot.sendMessage(chatId, '❌ Error resetting password.');
  }
});

// Delete user - ADMIN (FIXED)
bot.onText(/\/delete (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const user = users[userIndex];
    
    // Ask for confirmation
    adminSessions[chatId] = {
      step: 'confirm_delete',
      data: {
        memberId: memberId,
        userName: user.name
      }
    };
    
    await bot.sendMessage(chatId,
      `⚠️ **Confirm User Deletion**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Balance: ${formatCurrency(user.balance)}\n` +
      `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n\n` +
      `This action cannot be undone!\n\n` +
      `Type "CONFIRM DELETE ${memberId}" to proceed,\n` +
      `or type "CANCEL" to cancel.`
    );
    
  } catch (error) {
    console.log('Error in /delete:', error.message);
    await bot.sendMessage(chatId, '❌ Error deleting user.');
  }
});

// Suspend user - ADMIN (FIXED)
bot.onText(/\/suspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (users[userIndex].banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is already suspended.`);
      return;
    }
    
    users[userIndex].banned = true;
    await saveData(USERS_FILE, users);
    
    // Send notification to user
    await sendUserNotification(memberId,
      `🚫 **Account Suspended**\n\n` +
      `Your account has been suspended by admin.\n\n` +
      `You cannot access your account or make any transactions.\n` +
      `Please contact support if you believe this is an error.\n\n` +
      `Use /support to contact our team.`
    );
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been suspended.`);
    
    // Record in support chats
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const suspendChat = {
      id: `SUSPEND-${Date.now()}`,
      userId: memberId,
      userName: users[userIndex].name,
      topic: 'Account Suspension',
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{
        sender: 'admin',
        message: `Account suspended by admin`,
        timestamp: new Date().toISOString(),
        adminId: chatId.toString()
      }],
      adminReplied: true,
      isSystemMessage: true
    };
    
    supportChats.push(suspendChat);
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
  } catch (error) {
    console.log('Error in /suspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error suspending user.');
  }
});

// Unsuspend user - ADMIN (FIXED)
bot.onText(/\/unsuspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (!users[userIndex].banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is not suspended.`);
      return;
    }
    
    users[userIndex].banned = false;
    await saveData(USERS_FILE, users);
    
    // Send notification to user
    await sendUserNotification(memberId,
      `✅ **Account Unsuspended**\n\n` +
      `Your account has been unsuspended by admin.\n\n` +
      `You can now access your account and make transactions.\n` +
      `Use /login to access your account.\n\n` +
      `Welcome back!`
    );
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been unsuspended.`);
    
    // Record in support chats
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const unsuspendChat = {
      id: `UNSUSPEND-${Date.now()}`,
      userId: memberId,
      userName: users[userIndex].name,
      topic: 'Account Unsuspension',
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{
        sender: 'admin',
        message: `Account unsuspended by admin`,
        timestamp: new Date().toISOString(),
        adminId: chatId.toString()
      }],
      adminReplied: true,
      isSystemMessage: true
    };
    
    supportChats.push(unsuspendChat);
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
  } catch (error) {
    console.log('Error in /unsuspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error unsuspending user.');
  }
});

// Handle admin confirmation sessions
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text) return;
  
  const adminSession = adminSessions[chatId];
  if (!adminSession) return;
  
  try {
    if (adminSession.step === 'confirm_delete') {
      if (text === `CONFIRM DELETE ${adminSession.data.memberId}`) {
        const users = await loadData(USERS_FILE);
        const userIndex = users.findIndex(u => u.memberId === adminSession.data.memberId);
        
        if (userIndex !== -1) {
          const user = users[userIndex];
          
          // Remove user
          users.splice(userIndex, 1);
          await saveData(USERS_FILE, users);
          
          // Send notification to user
          await sendUserNotification(adminSession.data.memberId,
            `❌ **Account Deleted**\n\n` +
            `Your account has been deleted by admin.\n\n` +
            `All your data has been removed from our system.\n` +
            `If you believe this is an error, please contact support.\n\n` +
            `Thank you for using Starlife Advert.`
          );
          
          await bot.sendMessage(chatId,
            `✅ **User Deleted**\n\n` +
            `User: ${user.name} (${adminSession.data.memberId})\n` +
            `Account has been permanently deleted.`
          );
          
          // Record deletion
          const supportChats = await loadData(SUPPORT_CHATS_FILE);
          const deleteChat = {
            id: `DELETE-${Date.now()}`,
            userId: adminSession.data.memberId,
            userName: user.name,
            topic: 'Account Deletion',
            status: 'completed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [{
              sender: 'admin',
              message: `Account deleted by admin`,
              timestamp: new Date().toISOString(),
              adminId: chatId.toString()
            }],
            adminReplied: true,
            isSystemMessage: true
          };
          
          supportChats.push(deleteChat);
          await saveData(SUPPORT_CHATS_FILE, supportChats);
          
        } else {
          await bot.sendMessage(chatId, `❌ User ${adminSession.data.memberId} not found.`);
        }
        
        delete adminSessions[chatId];
        
      } else if (text === 'CANCEL') {
        await bot.sendMessage(chatId, '❌ User deletion cancelled.');
        delete adminSessions[chatId];
      } else {
        await bot.sendMessage(chatId,
          `⚠️ **Invalid Confirmation**\n\n` +
          `Type "CONFIRM DELETE ${adminSession.data.memberId}" to proceed,\n` +
          `or type "CANCEL" to cancel.`
        );
      }
    }
  } catch (error) {
    console.log('Admin session error:', error.message);
    await bot.sendMessage(chatId, '❌ Error processing request.');
    delete adminSessions[chatId];
  }
});

// Message user directly - ADMIN
bot.onText(/\/message (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fullText = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Parse the input
  let memberId, messageText;
  const firstSpaceIndex = fullText.indexOf(' ');
  
  if (firstSpaceIndex === -1) {
    // No message provided, start message session
    memberId = fullText.toUpperCase();
    
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    adminSessions[chatId] = {
      step: 'admin_message_user',
      data: {
        memberId: memberId,
        userName: user.name
      }
    };
    
    await bot.sendMessage(chatId,
      `💬 **Direct Message to ${user.name} (${memberId})**\n\n` +
      `Type your message below:\n\n` +
      `The user will receive this as a direct message from admin.\n` +
      `Type /cancel to cancel.`
    );
    return;
  }
  
  memberId = fullText.substring(0, firstSpaceIndex).toUpperCase();
  messageText = fullText.substring(firstSpaceIndex + 1).trim();
  
  await sendDirectMessageToUser(chatId, memberId, messageText);
});

// Helper function to send direct message to user
async function sendDirectMessageToUser(adminChatId, memberId, messageText) {
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId);
    
    if (!user) {
      await bot.sendMessage(adminChatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Try to send message to user
    const sent = await sendUserNotification(memberId,
      `📨 **Message from Starlife Advert Admin**\n\n` +
      `${messageText}\n\n` +
      `💼 Management Team`
    );
    
    if (sent) {
      await bot.sendMessage(adminChatId,
        `✅ **Message sent to ${user.name} (${memberId})**\n\n` +
        `Message: "${messageText}"`
      );
    } else {
      await bot.sendMessage(adminChatId,
        `⚠️ **Message saved but user not notified**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `User is logged out. They will see this message when they login and use /support.`
      );
    }
    
    // Record this message in support chats
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const adminMessageChat = {
      id: `ADMIN-MSG-${Date.now()}`,
      userId: memberId,
      userName: user.name,
      topic: 'Direct Admin Message',
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{
        sender: 'admin',
        message: messageText,
        timestamp: new Date().toISOString(),
        adminId: adminChatId.toString()
      }],
      adminReplied: true,
      isDirectMessage: true
    };
    
    supportChats.push(adminMessageChat);
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
  } catch (error) {
    console.log('Error sending direct message:', error.message);
    await bot.sendMessage(adminChatId,
      `❌ **Failed to send message**\n\n` +
      `Error: ${error.message}`
    );
  }
}

// Support chats list - ADMIN
bot.onText(/\/supportchats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const activeChats = supportChats.filter(chat => chat.status === 'active');
    const closedChats = supportChats.filter(chat => chat.status === 'closed');
    
    let message = `💬 **Support Chats**\n\n`;
    message += `**Active Chats:** ${activeChats.length}\n`;
    message += `**Closed Chats:** ${closedChats.length}\n`;
    message += `**Total Chats:** ${supportChats.length}\n\n`;
    
    if (activeChats.length > 0) {
      message += `🟢 **Active Support Chats:**\n\n`;
      
      activeChats.slice(0, 10).forEach((chat, index) => {
        const userName = chat.userName || 'Unknown User';
        const lastMessage = chat.messages && chat.messages.length > 0 ? 
          chat.messages[chat.messages.length - 1] : null;
        
        const lastMessageText = lastMessage ? 
          (lastMessage.message.length > 30 ? 
            lastMessage.message.substring(0, 30) + '...' : 
            lastMessage.message) : 
          'No messages';
        
        const lastSender = lastMessage ? 
          (lastMessage.sender === 'admin' ? '👨‍💼 Admin' : '👤 User') : '';
        
        const messageCount = chat.messages ? chat.messages.length : 0;
        const isLoggedOut = chat.isLoggedOut || false;
        const statusIcon = isLoggedOut ? '🚪' : '👤';
        
        message += `${index + 1}. ${statusIcon} **${userName}**\n`;
        message += `   🆔: ${chat.id}\n`;
        message += `   📝 Topic: ${chat.topic}\n`;
        message += `   💬 Messages: ${messageCount}\n`;
        message += `   🕒 Last: ${lastSender} "${lastMessageText}"\n`;
        message += `   ⏰ Created: ${new Date(chat.createdAt).toLocaleDateString()}\n`;
        message += `   💭 Reply: /replychat ${chat.id} your_message\n`;
        message += `   👁️ View: /viewchat ${chat.id}\n`;
        message += `   ❌ Close: /closechat ${chat.id}\n\n`;
      });
      
      if (activeChats.length > 10) {
        message += `... and ${activeChats.length - 10} more active chats\n\n`;
      }
    } else {
      message += `✅ No active support chats at the moment.\n\n`;
    }
    
    message += `**Commands:**\n`;
    message += `/replychat CHAT_ID message - Reply to chat\n`;
    message += `/viewchat CHAT_ID - View chat details\n`;
    message += `/closechat CHAT_ID - Close chat\n`;
    message += `/supportchats - Refresh list`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.log('Error in /supportchats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading support chats.');
  }
});

// View specific support chat - ADMIN
bot.onText(/\/viewchat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chat = supportChats.find(c => c.id === supportChatId);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const isLoggedOut = chat.isLoggedOut || false;
    const userName = chat.userName || 'Unknown User';
    const userId = chat.userId || 'Unknown ID';
    
    let message = `💬 **Support Chat Details**\n\n`;
    message += `🆔 Chat ID: ${chat.id}\n`;
    message += `👤 User: ${userName}\n`;
    message += `🔑 User ID: ${userId}\n`;
    message += `📝 Topic: ${chat.topic}\n`;
    message += `📊 Status: ${chat.status === 'active' ? '🟢 Active' : '🔴 Closed'}\n`;
    message += `🚪 Logged Out: ${isLoggedOut ? 'Yes' : 'No'}\n`;
    message += `📅 Created: ${new Date(chat.createdAt).toLocaleString()}\n`;
    message += `🕒 Updated: ${new Date(chat.updatedAt).toLocaleString()}\n`;
    message += `💬 Messages: ${chat.messages ? chat.messages.length : 0}\n\n`;
    
    if (chat.messages && chat.messages.length > 0) {
      message += `**Chat History:**\n\n`;
      
      chat.messages.forEach((msg, index) => {
        const sender = msg.sender === 'admin' ? '👨‍💼 Admin' : '👤 User';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        message += `${index + 1}. ${sender} (${time}):\n`;
        message += `   "${msg.message}"\n\n`;
      });
    } else {
      message += `No messages in this chat.\n\n`;
    }
    
    message += `**Actions:**\n`;
    if (chat.status === 'active') {
      message += `💭 Reply: /replychat ${chat.id} message\n`;
      message += `❌ Close: /closechat ${chat.id}\n`;
    } else {
      message += `✅ Chat is already closed\n`;
    }
    
    // Split long messages
    if (message.length > 4000) {
      const part1 = message.substring(0, 4000);
      const part2 = message.substring(4000);
      
      await bot.sendMessage(chatId, part1);
      await bot.sendMessage(chatId, part2);
    } else {
      await bot.sendMessage(chatId, message);
    }
  } catch (error) {
    console.log('Error in /viewchat:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading chat details.');
  }
});

// Reply to support chat - ADMIN
bot.onText(/\/replychat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fullText = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Parse the input
  let supportChatId, replyMessage;
  const firstSpaceIndex = fullText.indexOf(' ');
  
  if (firstSpaceIndex === -1) {
    await bot.sendMessage(chatId, 
      `❌ Usage: /replychat CHAT_ID your message here\n\n` +
      `Example: /replychat CHAT-123456 Hello, how can I help you?`
    );
    return;
  }
  
  supportChatId = fullText.substring(0, firstSpaceIndex);
  replyMessage = fullText.substring(firstSpaceIndex + 1).trim();
  
  if (!replyMessage) {
    await bot.sendMessage(chatId, '❌ Please provide a message to send.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === supportChatId);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const chat = supportChats[chatIndex];
    
    if (chat.status !== 'active') {
      await bot.sendMessage(chatId, `❌ Chat ${supportChatId} is closed. Reopen it first.`);
      return;
    }
    
    // Add admin message to chat
    chat.messages.push({
      sender: 'admin',
      message: replyMessage,
      timestamp: new Date().toISOString(),
      adminId: chatId.toString()
    });
    
    chat.updatedAt = new Date().toISOString();
    chat.adminReplied = true;
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    // Send confirmation to admin
    const userName = chat.userName || 'Unknown User';
    
    await bot.sendMessage(chatId,
      `✅ **Reply Sent**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `To: ${userName}\n` +
      `Topic: ${chat.topic}\n` +
      `Your message: "${replyMessage}"\n\n` +
      `Message added to chat.`
    );
    
    // Try to send message to user
    try {
      // Extract member ID from chat user ID
      let memberId = chat.userId;
      if (memberId.startsWith('LOGGED_OUT_')) {
        memberId = memberId.replace('LOGGED_OUT_', '');
      } else if (memberId.startsWith('LOGGED_OUT_CHAT_')) {
        // This is a chat-based ID, not a member ID
        // User will see message when they use /support
        console.log('Cannot send to logged out chat-based user');
        return;
      }
      
      // Send notification to user
      await sendUserNotification(memberId,
        `👨‍💼 **Support Response**\n\n` +
        `Topic: ${chat.topic}\n` +
        `Support: "${replyMessage}"\n\n` +
        `Continue the conversation by typing your response.\n` +
        `Use /endsupport to close chat.`
      );
      
    } catch (error) {
      console.log('Could not notify user:', error.message);
    }
  } catch (error) {
    console.log('Error in /replychat:', error.message);
    await bot.sendMessage(chatId, '❌ Error replying to chat.');
  }
});

// Close support chat - ADMIN
bot.onText(/\/closechat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === supportChatId);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const chat = supportChats[chatIndex];
    
    if (chat.status === 'closed') {
      await bot.sendMessage(chatId, `ℹ️ Chat ${supportChatId} is already closed.`);
      return;
    }
    
    chat.status = 'closed';
    chat.closedAt = new Date().toISOString();
    chat.closedBy = chatId.toString();
    chat.updatedAt = new Date().toISOString();
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    const userName = chat.userName || 'Unknown User';
    
    await bot.sendMessage(chatId,
      `✅ **Chat Closed**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `With: ${userName}\n` +
      `Topic: ${chat.topic}\n` +
      `Messages: ${chat.messages ? chat.messages.length : 0}\n` +
      `Closed at: ${new Date().toLocaleString()}`
    );
    
    // Try to notify user
    try {
      let memberId = chat.userId;
      if (memberId.startsWith('LOGGED_OUT_')) {
        memberId = memberId.replace('LOGGED_OUT_', '');
      }
      
      if (memberId && !memberId.startsWith('LOGGED_OUT_CHAT_')) {
        await sendUserNotification(memberId,
          `💬 **Support Chat Closed**\n\n` +
          `Your support chat has been closed by our team.\n` +
          `Thank you for contacting us!\n\n` +
          `If you need further assistance, use /support again.`
        );
      }
    } catch (error) {
      console.log('Could not notify user about chat closure');
    }
  } catch (error) {
    console.log('Error in /closechat:', error.message);
    await bot.sendMessage(chatId, '❌ Error closing chat.');
  }
});

// ==================== OTHER ADMIN COMMANDS ====================

// Stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const investments = await loadData(INVESTMENTS_FILE);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const referrals = await loadData(REFERRALS_FILE);
    
    const totalBalance = users.reduce((sum, user) => sum + parseFloat(user.balance || 0), 0);
    const totalInvested = users.reduce((sum, user) => sum + parseFloat(user.totalInvested || 0), 0);
    const totalEarned = users.reduce((sum, user) => sum + parseFloat(user.totalEarned || 0), 0);
    const totalReferralEarnings = referrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
    const activeUsers = users.filter(u => !u.banned).length;
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const activeSupportChats = supportChats.filter(c => c.status === 'active').length;
    const paidReferrals = referrals.filter(ref => ref.status === 'paid').length;
    const totalWithdrawalFees = withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + (w.fee || 0), 0);
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${users.length}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Banned Users: ${users.length - activeUsers}\n` +
                        `• Logged Out: ${loggedOutUsers.size}\n` +
                        `• Total Balance: ${formatCurrency(totalBalance)}\n\n` +
                        `**Investments:**\n` +
                        `• Total Investments: ${investments.length}\n` +
                        `• Active Investments: ${activeInvestments}\n` +
                        `• Pending Investments: ${investments.filter(i => i.status === 'pending').length}\n` +
                        `• Total Invested: ${formatCurrency(totalInvested)}\n` +
                        `• Total Earned: ${formatCurrency(totalEarned)}\n\n` +
                        `**Withdrawals:**\n` +
                        `• Total Withdrawals: ${withdrawals.length}\n` +
                        `• Pending Withdrawals: ${pendingWithdrawals}\n` +
                        `• Total Withdrawn: ${formatCurrency(withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + w.amount, 0))}\n` +
                        `• Total Fees Collected: ${formatCurrency(totalWithdrawalFees)}\n\n` +
                        `**Referrals:**\n` +
                        `• Total Referrals: ${referrals.length}\n` +
                        `• Paid Referrals: ${paidReferrals}\n` +
                        `• Total Bonus Paid: ${formatCurrency(totalReferralEarnings)}\n\n` +
                        `**Support:**\n` +
                        `• Active Chats: ${activeSupportChats}\n` +
                        `• Total Chats: ${supportChats.length}\n`;
    
    await bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.log('Error in /stats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading statistics.');
  }
});

// ==================== HEALTH CHECK ENDPOINT ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    users: Object.keys(userSessions).length,
    loggedOutUsers: loggedOutUsers.size,
    adminSessions: Object.keys(adminSessions).length
  });
});

app.get('/', (req, res) => {
  res.send('Starlife Advert Bot is running!');
});

// ==================== ERROR HANDLING ====================

bot.on('polling_error', (error) => {
  console.log('Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.log('Webhook error:', error.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('✅ Starlife Advert Bot is running! All features enabled!');
