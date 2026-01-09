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
  await initStorage();
  scheduleDailyProfits();
});

// Bot initialization
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  process.exit(1);
}

let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: true
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

// Help command - Available to everyone
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    // Logged in user help
    const helpMessage = `🤖 **Starlife Advert Bot - Help**\n\n` +
                       `**Account Commands:**\n` +
                       `/start - Start bot\n` +
                       `/profile - View profile\n` +
                       `/logout - Logout\n\n` +
                       `**Investment Commands:**\n` +
                       `/invest - Make investment\n` +
                       `/investnow - Quick guide\n` +
                       `/earnings - View earnings\n` +
                       `/viewearnings MEMBER_ID - View others ($1)\n\n` +
                       `**Referral Commands:**\n` +
                       `/referral - Share & earn 10%\n\n` +
                       `**Withdrawal Commands:**\n` +
                       `/withdraw - Withdraw funds\n\n` +
                       `**Support Commands:**\n` +
                       `/support - Contact support\n\n` +
                       `💳 **Payment Details:**\n` +
                       `M-Pesa Till: 6034186\n` +
                       `Name: Starlife Advert US Agency`;
    
    await bot.sendMessage(chatId, helpMessage);
  } else {
    // Logged out user help (limited)
    const helpMessage = `🤖 **Starlife Advert Bot - Help**\n\n` +
                       `You are currently logged out.\n\n` +
                       `**Available Commands:**\n` +
                       `/login - Login to your account\n` +
                       `/register - Create new account\n` +
                       `/support - Get help with login/password\n` +
                       `/investnow - View investment guide\n\n` +
                       `**Need Help Logging In?**\n` +
                       `Use /support for assistance with:\n` +
                       `• Forgotten password\n` +
                       `• Account recovery\n` +
                       `• Login issues\n\n` +
                       `💳 **Payment Details:**\n` +
                       `M-Pesa Till: 6034186\n` +
                       `Name: Starlife Advert US Agency`;
    
    await bot.sendMessage(chatId, helpMessage);
  }
});

// Quick investment guide - Available to everyone
bot.onText(/\/investnow/, async (msg) => {
  const chatId = msg.chat.id;
  
  const guideMessage = `🚀 **Quick Start Guide**\n\n` +
                      `1. **Register Account**\n` +
                      `   Use /register to create account\n\n` +
                      `2. **Make Investment**\n` +
                      `   Use /invest to start\n` +
                      `   Minimum: $10\n\n` +
                      `3. **Earn Daily**\n` +
                      `   • 2% daily profit\n` +
                      `   • Auto-added to balance\n\n` +
                      `4. **Earn from Referrals**\n` +
                      `   • Share your referral code\n` +
                      `   • Earn 10% of their investment\n\n` +
                      `5. **Withdraw Anytime**\n` +
                      `   • Minimum: $2\n` +
                      `   • Processing: 10-15 minutes\n` +
                      `   • Fee: 5% transaction fee\n\n` +
                      `💳 **Payment Details:**\n` +
                      `M-Pesa Till: 6034186\n` +
                      `Name: Starlife Advert US Agency`;
  
  await bot.sendMessage(chatId, guideMessage);
});

// Logout command - Only for logged in users
bot.onText(/\/logout/, async (msg) => {
  const chatId = msg.chat.id;
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (!isLoggedIn) {
    await bot.sendMessage(chatId, '❌ You are already logged out. Use /login to access your account.');
    return;
  }
  
  // Mark user as logged out
  loggedOutUsers.add(chatId.toString());
  
  // Clear any active sessions
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged out successfully!**\n\n` +
    `You have been logged out from your account.\n\n` +
    `**What you can do now:**\n` +
    `/login - Login to your account\n` +
    `/register - Create new account\n` +
    `/support - Get help with login/password\n` +
    `/investnow - View investment guide\n\n` +
    `**Need help?** Use /support for assistance.`
  );
});

// Support command - Available to everyone (for password help, etc.)
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
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const activeChat = supportChats.find(chat => 
      chat.userId === user.memberId && 
      chat.status === 'active'
    );
    
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
    // Logged out user - special support for login/password help
    userSessions[chatId] = {
      step: 'support_loggedout_topic',
      data: {}
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

// Register command - Available to everyone (logged out users)
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

// Login command - Available to everyone (logged out users)
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
    `(Format: USER-123456)`
  );
});

// ==================== PROTECTED COMMANDS MIDDLEWARE ====================

// These commands require login
const protectedCommands = [
  '/profile', '/invest', '/earnings', '/viewearnings', 
  '/withdraw', '/referral'
];

// Middleware to check if user is logged in
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || !text.startsWith('/')) return;
  
  // Extract command
  const command = text.split(' ')[0];
  
  // Check if it's a protected command (skip for admins)
  if (protectedCommands.some(cmd => command.startsWith(cmd))) {
    const canAccess = await canUserAccessAccount(chatId);
    
    if (!canAccess) {
      await bot.sendMessage(chatId,
        `🔒 **Access Denied**\n\n` +
        `You need to login to use this command.\n\n` +
        `Use /login to access your account\n` +
        `Use /register to create new account\n` +
        `Use /support for login/password help`
      );
      return;
    }
  }
});

// ==================== COMMAND HANDLERS ====================

// Profile command - PROTECTED
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerId === user.memberId);
  const totalReferralEarnings = userReferrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
  
  const profileMessage = `👤 **Your Profile**\n\n` +
                        `**Account Details:**\n` +
                        `Name: ${user.name}\n` +
                        `Member ID: ${user.memberId}\n` +
                        `Email: ${user.email}\n` +
                        `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n` +
                        `Last Login: ${new Date(user.lastLogin).toLocaleDateString()}\n` +
                        `Referred By: ${user.referredBy || 'None'}\n\n` +
                        `**Financial Summary:**\n` +
                        `Current Balance: ${formatCurrency(user.balance)}\n` +
                        `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                        `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                        `Referral Earnings: ${formatCurrency(totalReferralEarnings)}\n\n` +
                        `**Investment Stats:**\n` +
                        `Active Investments: ${user.activeInvestments || 0}\n` +
                        `Total Referrals: ${userReferrals.length}\n` +
                        `Referral Code: ${user.referralCode}\n\n` +
                        `**Account Status:** ${user.banned ? '🚫 SUSPENDED' : '✅ ACTIVE'}\n\n` +
                        `Use /support for profile changes`;
  
  await bot.sendMessage(chatId, profileMessage);
});

// Invest command - PROTECTED
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  userSessions[chatId] = {
    step: 'invest_amount',
    data: { memberId: user.memberId }
  };
  
  await bot.sendMessage(chatId,
    `💰 **Make Investment**\n\n` +
    `Minimum Investment: $10\n` +
    `Daily Profit: 2%\n` +
    `Investment Period: 30 days\n\n` +
    `**Payment Details:**\n` +
    `💳 M-Pesa Till: 6034186\n` +
    `🏢 Name: Starlife Advert US Agency\n\n` +
    `After payment, enter amount invested:`
  );
});

// Earnings command - PROTECTED
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  const investments = await loadData(INVESTMENTS_FILE);
  const userInvestments = investments.filter(inv => inv.memberId === user.memberId);
  const activeInvestments = userInvestments.filter(inv => inv.status === 'active');
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerId === user.memberId);
  const totalReferralEarnings = userReferrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
  
  let earningsMessage = `💰 **Your Earnings Dashboard**\n\n`;
  
  earningsMessage += `👤 **Account Summary**\n`;
  earningsMessage += `Name: ${user.name}\n`;
  earningsMessage += `Member ID: ${user.memberId}\n`;
  earningsMessage += `Balance: ${formatCurrency(user.balance)}\n`;
  earningsMessage += `Total Earned: ${formatCurrency(user.totalEarned)}\n`;
  earningsMessage += `Referral Earnings: ${formatCurrency(totalReferralEarnings)}\n`;
  earningsMessage += `Total Referrals: ${userReferrals.length}\n\n`;
  
  earningsMessage += `📈 **Investment Summary**\n`;
  earningsMessage += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  earningsMessage += `Active Investments: ${activeInvestments.length}\n\n`;
  
  if (activeInvestments.length > 0) {
    earningsMessage += `🏦 **Active Investments**\n`;
    activeInvestments.forEach((inv, index) => {
      const remainingDays = Math.max(0, 30 - (inv.daysActive || 0));
      earningsMessage += `${index + 1}. ${formatCurrency(inv.amount)} - ${remainingDays}d left\n`;
    });
    earningsMessage += `\n`;
  }
  
  earningsMessage += `💵 **Withdrawal Info**\n`;
  earningsMessage += `Minimum: $2\n`;
  earningsMessage += `Processing: 10-15 minutes\n`;
  earningsMessage += `Fee: 5% transaction fee\n`;
  earningsMessage += `Available: ${formatCurrency(user.balance)}\n\n`;
  
  earningsMessage += `👥 **Referral Program**\n`;
  earningsMessage += `Your Code: ${user.referralCode}\n`;
  earningsMessage += `Earn 10% of friends' investments!\n\n`;
  
  earningsMessage += `📱 **Quick Actions**\n`;
  earningsMessage += `/withdraw - Withdraw funds\n`;
  earningsMessage += `/invest - Add more funds\n`;
  earningsMessage += `/referral - Share & earn\n`;
  earningsMessage += `/support - Contact help`;
  
  await bot.sendMessage(chatId, earningsMessage);
});

// View others earnings - PROTECTED
bot.onText(/\/viewearnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetMemberId = match[1].toUpperCase();
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  // Check if user is trying to view their own earnings
  if (targetMemberId === user.memberId) {
    await bot.sendMessage(chatId, '❌ Use /earnings to view your own earnings.');
    return;
  }
  
  // Find target user
  const users = await loadData(USERS_FILE);
  const targetUser = users.find(u => u.memberId === targetMemberId && !u.isFake);
  
  if (!targetUser) {
    await bot.sendMessage(chatId, `❌ User ${targetMemberId} not found.`);
    return;
  }
  
  // ALWAYS charge $1 for viewing
  if (user.balance < 1) {
    await bot.sendMessage(chatId,
      `❌ **Payment Required**\n\n` +
      `Viewing others' earnings costs $1.\n` +
      `Your balance: ${formatCurrency(user.balance)}\n` +
      `Need ${formatCurrency(1 - user.balance)} more.\n\n` +
      `Invest or refer friends to earn more!`
    );
    return;
  }
  
  // Charge $1 for viewing
  const userIndex = users.findIndex(u => u.memberId === user.memberId);
  users[userIndex].balance = parseFloat(user.balance) - 1;
  
  // Record the payment
  const earningsViews = await loadData(EARNINGS_VIEWS_FILE);
  const today = new Date().toISOString().split('T')[0];
  
  earningsViews.push({
    id: `VIEW-${Date.now()}`,
    viewerId: user.memberId,
    viewerName: user.name,
    targetId: targetMemberId,
    targetName: targetUser.name,
    amount: 1,
    date: today,
    timestamp: new Date().toISOString()
  });
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-VIEW-${Date.now()}`,
    memberId: user.memberId,
    type: 'earnings_view',
    amount: -1,
    description: `Paid to view ${targetUser.name}'s earnings`,
    date: new Date().toISOString()
  });
  
  await saveData(USERS_FILE, users);
  await saveData(EARNINGS_VIEWS_FILE, earningsViews);
  await saveData(TRANSACTIONS_FILE, transactions);
  
  // Show earnings
  const earningsMessage = `💰 **Earnings of ${targetUser.name} (${targetMemberId})**\n\n` +
                         `Balance: ${formatCurrency(targetUser.balance || 0)}\n` +
                         `Total Invested: ${formatCurrency(targetUser.totalInvested || 0)}\n` +
                         `Total Earned: ${formatCurrency(targetUser.totalEarned || 0)}\n` +
                         `Referrals: ${targetUser.referrals || 0}\n` +
                         `Joined: ${new Date(targetUser.joinedDate).toLocaleDateString()}\n\n` +
                         `💸 **Paid $1 for this view**\n` +
                         `Your new balance: ${formatCurrency(users[userIndex].balance)}`;
  
  await bot.sendMessage(chatId, earningsMessage);
});

// Withdraw command - PROTECTED
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  const balance = parseFloat(user.balance) || 0;
  
  if (balance < 2) {
    await bot.sendMessage(chatId,
      `❌ Minimum withdrawal is $2\n\n` +
      `Your Balance: ${formatCurrency(balance)}\n` +
      `Need ${formatCurrency(2 - balance)} more\n\n` +
      `Invest or refer friends to earn more!`
    );
    return;
  }
  
  userSessions[chatId] = {
    step: 'withdraw_amount',
    data: { memberId: user.memberId, maxAmount: balance }
  };
  
  await bot.sendMessage(chatId,
    `💳 **Withdrawal Request**\n\n` +
    `Available Balance: ${formatCurrency(balance)}\n` +
    `Minimum Withdrawal: $2\n` +
    `Processing Time: 10-15 minutes\n` +
    `⚠️ **Transaction Fee: 5%**\n\n` +
    `**Payment Methods:**\n` +
    `• M-Pesa (Kenya)\n` +
    `• Bank Transfer\n` +
    `• PayPal (if available)\n\n` +
    `Enter amount to withdraw:`
  );
});

// Referral command - PROTECTED
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) return; // Middleware already blocked
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerId === user.memberId);
  const totalReferralEarnings = userReferrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
  
  const referralMessage = `👥 **Earn 10% Referral Commission**\n\n` +
                         `**Your Referral Stats:**\n` +
                         `Total Referrals: ${userReferrals.length}\n` +
                         `Total Earned: ${formatCurrency(totalReferralEarnings)}\n` +
                         `Pending Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                         `**Your Referral Code:**\n` +
                         `\`${user.referralCode}\`\n\n` +
                         `**How It Works:**\n` +
                         `1. Share your code with friends\n` +
                         `2. They register using your code\n` +
                         `3. When they make their FIRST investment\n` +
                         `4. You earn 10% of their first investment!\n` +
                         `(Only first investment earns referral bonus)\n\n` +
                         `**Example:**\n` +
                         `• Friend invests $100 (first time) → You earn $10\n` +
                         `• Friend invests $500 (second time) → You earn $0\n` +
                         `• Friend invests $1000 (third time) → You earn $0\n\n` +
                         `**Payment Methods to Share:**\n` +
                         `💳 M-Pesa Till: 6034186\n` +
                         `🏢 Name: Starlife Advert US Agency\n\n` +
                         `**Copy & Share Message:**\n` +
                         `\`\`\`\n` +
                         `🎯 Join Starlife Advert & Earn 2% Daily!\n\n` +
                         `💰 Invest from $10\n` +
                         `📈 Earn 2% daily profit\n` +
                         `👥 Get 10% from referrals\n` +
                         `⚡ Fast withdrawals (10-15 min)\n\n` +
                         `Use my referral code: ${user.referralCode}\n\n` +
                         `Payment: M-Pesa Till 6034186\n` +
                         `Name: Starlife Advert US Agency\n` +
                         `\`\`\``;
  
  await bot.sendMessage(chatId, referralMessage, { parse_mode: 'Markdown' });
});

// ==================== MESSAGE HANDLERS ====================

// Handle all messages (registration, login, support, etc.)
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
        banned: false,
        hasEarnedReferralBonus: false // Track if referrer has earned bonus from this user
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
            bonusAmount: 0, // Will be added when referred user makes FIRST investment
            status: 'pending',
            date: new Date().toISOString(),
            investmentAmount: 0,
            isFirstInvestment: true, // Track if this is for first investment
            bonusPaid: false // Track if bonus has been paid
          });
          
          await saveData(REFERRALS_FILE, referrals);
          await saveData(USERS_FILE, users);
          
          // Notify referrer
          if (referrer.chatId && !loggedOutUsers.has(referrer.chatId)) {
            try {
              await bot.sendMessage(referrer.chatId,
                `🎉 **New Referral!**\n\n` +
                `${session.data.name} registered using your referral code!\n` +
                `You will earn 10% when they make their FIRST investment.\n\n` +
                `Total Referrals: ${referrer.referrals}`
              );
            } catch (error) {
              console.log('Could not notify referrer');
            }
          }
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
                          `Referral Code: ${referralCode}\n`;
      
      if (referredBy) {
        welcomeMessage += `Referred By: ${referredBy}\n`;
      }
      
      welcomeMessage += `\n**To Start Earning:**\n` +
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
    
    // Handle investment amount
    else if (session.step === 'invest_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10) {
        await bot.sendMessage(chatId, '❌ Minimum investment is $10. Please enter amount:');
        return;
      }
      
      session.data.amount = amount;
      session.step = 'invest_proof';
      
      await bot.sendMessage(chatId,
        `✅ Amount: ${formatCurrency(amount)}\n\n` +
        `**Payment Confirmation Required**\n\n` +
        `Please send your payment proof:\n` +
        `• M-Pesa screenshot\n` +
        `• Transaction ID\n` +
        `• Or any payment confirmation\n\n` +
        `Send your proof now:`
      );
    }
    else if (session.step === 'invest_proof') {
      const proof = text.trim();
      
      // Create investment record
      const investments = await loadData(INVESTMENTS_FILE);
      const investmentId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newInvestment = {
        id: investmentId,
        memberId: session.data.memberId,
        amount: session.data.amount,
        date: new Date().toISOString(),
        status: 'pending',
        daysActive: 0,
        totalProfit: 0,
        paymentProof: proof,
        isFirstInvestment: false // Will be updated during approval
      };
      
      investments.push(newInvestment);
      await saveData(INVESTMENTS_FILE, investments);
      
      // Update user's total invested
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      if (userIndex !== -1) {
        users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + session.data.amount;
        // Don't increment activeInvestments until approved
        await saveData(USERS_FILE, users);
      }
      
      // Record transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-INV-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'investment',
        amount: -session.data.amount,
        description: `Investment #${investmentId}`,
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
      
      // Clear session
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Investment Submitted!**\n\n` +
        `Investment ID: ${investmentId}\n` +
        `Amount: ${formatCurrency(session.data.amount)}\n` +
        `Status: Pending Approval\n\n` +
        `Our team will verify your payment within 15 minutes.\n` +
        `Once approved, you'll start earning 2% daily!\n\n` +
        `Check /earnings for updates.`
      );
      
      // Notify admins with FULL DETAILS including payment proof
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const user = users.find(u => u.memberId === session.data.memberId);
        const adminMessage = `💰 **NEW INVESTMENT REQUEST**\n\n` +
                            `🆔 **Investment ID:** ${investmentId}\n` +
                            `👤 **User:** ${user ? user.name : 'Unknown'} (${session.data.memberId})\n` +
                            `💰 **Amount:** ${formatCurrency(session.data.amount)}\n` +
                            `📅 **Date:** ${new Date().toLocaleString()}\n\n` +
                            `📋 **PAYMENT PROOF:**\n` +
                            `${proof}\n\n` +
                            `✅ **Approve:** /approve ${investmentId}\n` +
                            `❌ **Reject:** /reject ${investmentId}\n` +
                            `💵 **Add Manually:** /manualinv ${session.data.memberId} ${session.data.amount}\n\n` +
                            `📊 **Quick Actions:**\n` +
                            `/investments - View all investments\n` +
                            `/view ${session.data.memberId} - View user details`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Handle withdrawal amount
    else if (session.step === 'withdraw_amount') {
      const amount = parseFloat(text);
      const maxAmount = session.data.maxAmount;
      
      if (isNaN(amount) || amount < 2 || amount > maxAmount) {
        await bot.sendMessage(chatId, `❌ Amount must be between $2 and ${formatCurrency(maxAmount)}. Please enter amount:`);
        return;
      }
      
      const fee = calculateWithdrawalFee(amount);
      const netAmount = calculateNetWithdrawal(amount);
      
      session.data.amount = amount;
      session.data.fee = fee;
      session.data.netAmount = netAmount;
      session.step = 'withdraw_method';
      
      await bot.sendMessage(chatId,
        `✅ Amount: ${formatCurrency(amount)}\n` +
        `📊 **Fee (5%):** ${formatCurrency(fee)}\n` +
        `💰 **You Receive:** ${formatCurrency(netAmount)}\n\n` +
        `Select withdrawal method:\n\n` +
        `1️⃣ M-Pesa (Kenya)\n` +
        `2️⃣ Bank Transfer\n` +
        `3️⃣ PayPal\n\n` +
        `Reply with number (1-3):`
      );
    }
    else if (session.step === 'withdraw_method') {
      const methodNum = parseInt(text);
      const methods = ['M-Pesa', 'Bank Transfer', 'PayPal'];
      
      if (isNaN(methodNum) || methodNum < 1 || methodNum > 3) {
        await bot.sendMessage(chatId, '❌ Please enter 1, 2, or 3:');
        return;
      }
      
      const method = methods[methodNum - 1];
      session.data.method = method;
      
      if (method === 'M-Pesa') {
        session.step = 'withdraw_mpesa';
        await bot.sendMessage(chatId, 'Enter your M-Pesa phone number (format: 07XXXXXXXX):');
      } else if (method === 'Bank Transfer') {
        session.step = 'withdraw_bank';
        await bot.sendMessage(chatId, 'Enter your bank account details (Account Name, Number, Bank Name):');
      } else {
        session.step = 'withdraw_paypal';
        await bot.sendMessage(chatId, 'Enter your PayPal email address:');
      }
    }
    else if (session.step === 'withdraw_mpesa') {
      const phone = text.trim();
      if (!/^0[17]\d{8}$/.test(phone)) {
        await bot.sendMessage(chatId, '❌ Invalid M-Pesa number. Format: 07XXXXXXXX or 01XXXXXXXX. Try again:');
        return;
      }
      
      session.data.details = `M-Pesa: ${phone}`;
      await processWithdrawal(chatId, session);
    }
    else if (session.step === 'withdraw_bank') {
      const bankDetails = text.trim();
      if (bankDetails.length < 10) {
        await bot.sendMessage(chatId, '❌ Please provide complete bank details. Try again:');
        return;
      }
      
      session.data.details = `Bank: ${bankDetails}`;
      await processWithdrawal(chatId, session);
    }
    else if (session.step === 'withdraw_paypal') {
      const paypalEmail = text.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(paypalEmail)) {
        await bot.sendMessage(chatId, '❌ Invalid email. Please enter valid PayPal email:');
        return;
      }
      
      session.data.details = `PayPal: ${paypalEmail}`;
      await processWithdrawal(chatId, session);
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
      session.step = 'support_loggedout_message';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${topic}\n\n` +
        `Please describe your issue in detail:\n` +
        `Include your Member ID if you remember it.\n\n` +
        `Type your message below:`
      );
    }
    else if (session.step === 'support_loggedout_message') {
      // Create support chat for logged out user
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIdStr = `CHAT-LOGOUT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newChat = {
        id: chatIdStr,
        userId: 'LOGGED_OUT',
        userName: `Logged Out User (${chatId})`,
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
      
      session.step = 'support_loggedout_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will help you with your login/account issue.\n` +
        `We will respond shortly.\n\n` +
        `Type /endsupport to cancel`
      );
      
      // Notify all admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **Logged Out User Support**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: Logged Out (Chat ID: ${chatId})\n` +
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
        const adminMessage = `💬 **Logged Out User Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: Logged Out (Chat ID: ${chatId})\n` +
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
      // Create support chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIdStr = `CHAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
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
        const adminMessage = `💬 **New Support Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${session.data.userName} (${session.data.memberId})\n` +
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

// Process withdrawal
async function processWithdrawal(chatId, session) {
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, '❌ User not found.');
    delete userSessions[chatId];
    return;
  }
  
  // Deduct balance
  users[userIndex].balance = parseFloat(users[userIndex].balance) - session.data.amount;
  await saveData(USERS_FILE, users);
  
  // Create withdrawal record
  const withdrawals = await loadData(WITHDRAWALS_FILE);
  const withdrawalId = `WDL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  
  const newWithdrawal = {
    id: withdrawalId,
    memberId: session.data.memberId,
    amount: session.data.amount,
    fee: session.data.fee,
    netAmount: session.data.netAmount,
    method: session.data.method,
    details: session.data.details,
    date: new Date().toISOString(),
    status: 'pending'
  };
  
  withdrawals.push(newWithdrawal);
  await saveData(WITHDRAWALS_FILE, withdrawals);
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-WDL-${Date.now()}`,
    memberId: session.data.memberId,
    type: 'withdrawal',
    amount: -session.data.amount,
    description: `Withdrawal #${withdrawalId} via ${session.data.method} (Fee: ${formatCurrency(session.data.fee)})`,
    date: new Date().toISOString()
  });
  await saveData(TRANSACTIONS_FILE, transactions);
  
  // Clear session
  delete userSessions[chatId];
  
  await bot.sendMessage(chatId,
    `✅ **Withdrawal Request Submitted!**\n\n` +
    `Withdrawal ID: ${withdrawalId}\n` +
    `Amount: ${formatCurrency(session.data.amount)}\n` +
    `Fee (5%): ${formatCurrency(session.data.fee)}\n` +
    `You Receive: ${formatCurrency(session.data.netAmount)}\n` +
    `Method: ${session.data.method}\n` +
    `Details: ${session.data.details}\n` +
    `Status: Pending\n\n` +
    `Processing time: 10-15 minutes\n` +
    `You will be notified once processed.\n\n` +
    `Check /earnings for updates.`
  );
  
  // Notify admins
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  if (adminIds.length > 0) {
    const user = users[userIndex];
    const adminMessage = `💳 **NEW WITHDRAWAL REQUEST**\n\n` +
                        `🆔 **Withdrawal ID:** ${withdrawalId}\n` +
                        `👤 **User:** ${user.name} (${session.data.memberId})\n` +
                        `💰 **Amount:** ${formatCurrency(session.data.amount)}\n` +
                        `📊 **Fee (5%):** ${formatCurrency(session.data.fee)}\n` +
                        `💵 **Net Amount:** ${formatCurrency(session.data.netAmount)}\n` +
                        `📱 **Method:** ${session.data.method}\n` +
                        `📋 **Details:** ${session.data.details}\n` +
                        `📅 **Date:** ${new Date().toLocaleString()}\n\n` +
                        `✅ **Approve:** /approve ${withdrawalId}\n` +
                        `❌ **Reject:** /reject ${withdrawalId}\n\n` +
                        `📊 **Quick Actions:**\n` +
                        `/withdrawals - View all withdrawals\n` +
                        `/view ${session.data.memberId} - View user details`;
    
    for (const adminId of adminIds) {
      try {
        await bot.sendMessage(adminId, adminMessage);
      } catch (error) {
        console.log('Could not notify admin:', adminId);
      }
    }
  }
}

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

// ADMIN COMMANDS - Available without login for admins only
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
                      `/findref REF_CODE - Find user by referral code\n\n` +
                      `💰 **Financial Management:**\n` +
                      `/addbalance USER_ID AMOUNT - Add balance\n` +
                      `/deductbalance USER_ID AMOUNT - Deduct balance\n\n` +
                      `📈 **Investment Management:**\n` +
                      `/investments - List all investments\n` +
                      `/approve INV_ID - Approve investment\n` +
                      `/reject INV_ID - Reject investment\n` +
                      `/manualinv USER_ID AMOUNT - Add manual investment\n\n` +
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
                      `/broadcast MESSAGE - Send to all users\n\n` +
                      `🔧 **Examples:**\n` +
                      `/approve INV-123456\n` +
                      `/reject WDL-123456\n` +
                      `/view USER-1001\n` +
                      `/addbalance USER-1001 100\n` +
                      `/suspend USER-1001\n` +
                      `/manualinv USER-1001 500\n` +
                      `/findref REF-ABC123\n` +
                      `/addrefbonus USER-1001 50`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// Admin command handlers with proper authorization
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  let message = `👥 **Users: ${users.length}**\n\n`;
  
  users.slice(0, 10).forEach(user => {
    message += `👤 ${user.name} (${user.memberId})\n`;
    message += `💰 ${formatCurrency(user.balance)} | 📈 ${formatCurrency(user.totalEarned)}\n`;
    message += `👥 ${user.referrals || 0} refs | ${user.banned ? '🚫' : '✅'}\n\n`;
  });
  
  if (users.length > 10) {
    message += `... and ${users.length - 10} more users\n\n`;
    message += `Use /view USER_ID to see details`;
  }
  
  await bot.sendMessage(chatId, message);
});

bot.onText(/\/view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.memberId === memberId);
  
  if (!user) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  const investments = await loadData(INVESTMENTS_FILE);
  const userInvestments = investments.filter(inv => inv.memberId === memberId);
  const withdrawals = await loadData(WITHDRAWALS_FILE);
  const userWithdrawals = withdrawals.filter(wdl => wdl.memberId === memberId);
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerId === memberId);
  const userReferredBy = referrals.filter(ref => ref.referredId === memberId);
  
  const userMessage = `👤 **User Details**\n\n` +
                     `**Account Info:**\n` +
                     `Name: ${user.name}\n` +
                     `Member ID: ${memberId}\n` +
                     `Email: ${user.email}\n` +
                     `Chat ID: ${user.chatId}\n` +
                     `Joined: ${new Date(user.joinedDate).toLocaleString()}\n` +
                     `Last Login: ${new Date(user.lastLogin).toLocaleString()}\n` +
                     `Referral Code: ${user.referralCode}\n` +
                     `Referred By: ${user.referredBy || 'None'}\n` +
                     `Status: ${user.banned ? '🚫 SUSPENDED' : '✅ ACTIVE'}\n\n` +
                     `**Financial Info:**\n` +
                     `Balance: ${formatCurrency(user.balance)}\n` +
                     `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                     `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                     `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                     `**Stats:**\n` +
                     `Referrals: ${user.referrals || 0}\n` +
                     `Active Investments: ${user.activeInvestments || 0}\n` +
                     `Total Referred Users: ${userReferrals.length}\n` +
                     `Referred By: ${userReferredBy.length > 0 ? userReferredBy[0].referrerName : 'None'}\n\n` +
                     `**Investment History:** ${userInvestments.length}\n` +
                     `**Withdrawal History:** ${userWithdrawals.length}\n\n` +
                     `**Admin Actions:**\n` +
                     `${user.banned ? `/unsuspend ${memberId}` : `/suspend ${memberId}`}\n` +
                     `/addbalance ${memberId} AMOUNT\n` +
                     `/deductbalance ${memberId} AMOUNT\n` +
                     `/manualinv ${memberId} AMOUNT\n` +
                     `/resetpass ${memberId}\n` +
                     `/delete ${memberId}\n` +
                     `/findref ${user.referralCode}`;
  
  await bot.sendMessage(chatId, userMessage);
});

bot.onText(/\/suspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  users[userIndex].banned = true;
  await saveData(USERS_FILE, users);
  
  await bot.sendMessage(chatId, `✅ User ${memberId} has been suspended.`);
  
  // Notify user if they're logged in
  const user = users[userIndex];
  if (user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId, '🚫 Your account has been suspended by admin.');
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

bot.onText(/\/unsuspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  users[userIndex].banned = false;
  await saveData(USERS_FILE, users);
  
  await bot.sendMessage(chatId, `✅ User ${memberId} has been unsuspended.`);
  
  // Notify user if they're logged in
  const user = users[userIndex];
  if (user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId, '✅ Your account has been unsuspended by admin.');
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

bot.onText(/\/addbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + amount;
  await saveData(USERS_FILE, users);
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-ADMIN-${Date.now()}`,
    memberId: memberId,
    type: 'admin_add',
    amount: amount,
    description: `Admin added balance`,
    date: new Date().toISOString()
  });
  await saveData(TRANSACTIONS_FILE, transactions);
  
  await bot.sendMessage(chatId, `✅ Added ${formatCurrency(amount)} to ${memberId}. New balance: ${formatCurrency(users[userIndex].balance)}`);
  
  // Notify user if they're logged in
  const user = users[userIndex];
  if (user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId, `💰 Admin added ${formatCurrency(amount)} to your account. New balance: ${formatCurrency(user.balance)}`);
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

bot.onText(/\/deductbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  const currentBalance = parseFloat(users[userIndex].balance) || 0;
  if (amount > currentBalance) {
    await bot.sendMessage(chatId, `❌ User only has ${formatCurrency(currentBalance)}.`);
    return;
  }
  
  users[userIndex].balance = currentBalance - amount;
  await saveData(USERS_FILE, users);
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-ADMIN-${Date.now()}`,
    memberId: memberId,
    type: 'admin_deduct',
    amount: -amount,
    description: `Admin deducted balance`,
    date: new Date().toISOString()
  });
  await saveData(TRANSACTIONS_FILE, transactions);
  
  await bot.sendMessage(chatId, `✅ Deducted ${formatCurrency(amount)} from ${memberId}. New balance: ${formatCurrency(users[userIndex].balance)}`);
  
  // Notify user if they're logged in
  const user = users[userIndex];
  if (user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId, `💰 Admin deducted ${formatCurrency(amount)} from your account. New balance: ${formatCurrency(user.balance)}`);
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

bot.onText(/\/investments/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const investments = await loadData(INVESTMENTS_FILE);
  const pendingInvestments = investments.filter(inv => inv.status === 'pending');
  const activeInvestments = investments.filter(inv => inv.status === 'active');
  const completedInvestments = investments.filter(inv => inv.status === 'completed');
  
  const message = `📈 **Investment Summary**\n\n` +
                 `**Pending:** ${pendingInvestments.length}\n` +
                 `**Active:** ${activeInvestments.length}\n` +
                 `**Completed:** ${completedInvestments.length}\n` +
                 `**Total:** ${investments.length}\n\n` +
                 `**Recent Pending Investments:**\n`;
  
  let detailedMessage = message;
  pendingInvestments.slice(0, 5).forEach(inv => {
    detailedMessage += `\n🆔 ${inv.id}\n`;
    detailedMessage += `👤 ${inv.memberId}\n`;
    detailedMessage += `💰 ${formatCurrency(inv.amount)}\n`;
    detailedMessage += `📅 ${new Date(inv.date).toLocaleDateString()}\n`;
    detailedMessage += `✅ /approve ${inv.id}\n`;
    detailedMessage += `❌ /reject ${inv.id}\n`;
    detailedMessage += `💵 /manualinv ${inv.memberId} ${inv.amount}\n`;
  });
  
  if (pendingInvestments.length > 5) {
    detailedMessage += `\n... and ${pendingInvestments.length - 5} more pending`;
  }
  
  await bot.sendMessage(chatId, detailedMessage);
});

bot.onText(/\/withdrawals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const withdrawals = await loadData(WITHDRAWALS_FILE);
  const pendingWithdrawals = withdrawals.filter(wdl => wdl.status === 'pending');
  const approvedWithdrawals = withdrawals.filter(wdl => wdl.status === 'approved');
  const rejectedWithdrawals = withdrawals.filter(wdl => wdl.status === 'rejected');
  
  const message = `💳 **Withdrawal Summary**\n\n` +
                 `**Pending:** ${pendingWithdrawals.length}\n` +
                 `**Approved:** ${approvedWithdrawals.length}\n` +
                 `**Rejected:** ${rejectedWithdrawals.length}\n` +
                 `**Total:** ${withdrawals.length}\n\n` +
                 `**Recent Pending Withdrawals:**\n`;
  
  let detailedMessage = message;
  pendingWithdrawals.slice(0, 5).forEach(wdl => {
    detailedMessage += `\n🆔 ${wdl.id}\n`;
    detailedMessage += `👤 ${wdl.memberId}\n`;
    detailedMessage += `💰 ${formatCurrency(wdl.amount)}\n`;
    detailedMessage += `📊 Fee: ${formatCurrency(wdl.fee || 0)}\n`;
    detailedMessage += `💵 Net: ${formatCurrency(wdl.netAmount || wdl.amount)}\n`;
    detailedMessage += `📱 ${wdl.method}\n`;
    detailedMessage += `📅 ${new Date(wdl.date).toLocaleDateString()}\n`;
    detailedMessage += `✅ /approve ${wdl.id}\n`;
    detailedMessage += `❌ /reject ${wdl.id}\n`;
  });
  
  if (pendingWithdrawals.length > 5) {
    detailedMessage += `\n... and ${pendingWithdrawals.length - 5} more pending`;
  }
  
  await bot.sendMessage(chatId, detailedMessage);
});

// APPROVE investment or withdrawal
bot.onText(/\/approve (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Check if it's an investment or withdrawal
  if (id.startsWith('INV-')) {
    // Approve investment
    const investments = await loadData(INVESTMENTS_FILE);
    const investmentIndex = investments.findIndex(inv => inv.id === id);
    
    if (investmentIndex === -1) {
      await bot.sendMessage(chatId, `❌ Investment ${id} not found.`);
      return;
    }
    
    if (investments[investmentIndex].status !== 'pending') {
      await bot.sendMessage(chatId, `❌ Investment ${id} is already ${investments[investmentIndex].status}.`);
      return;
    }
    
    investments[investmentIndex].status = 'active';
    investments[investmentIndex].approvedDate = new Date().toISOString();
    investments[investmentIndex].approvedBy = chatId.toString();
    
    // Check if this is the user's first investment
    const userInvestments = investments.filter(inv => 
      inv.memberId === investments[investmentIndex].memberId && 
      inv.status === 'active'
    );
    
    const isFirstInvestment = userInvestments.length === 0;
    investments[investmentIndex].isFirstInvestment = isFirstInvestment;
    
    await saveData(INVESTMENTS_FILE, investments);
    
    // Update user's active investments count
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === investments[investmentIndex].memberId);
    if (userIndex !== -1) {
      users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
      await saveData(USERS_FILE, users);
    }
    
    // Add referral bonus if applicable AND it's the first investment
    if (isFirstInvestment) {
      await addReferralBonusForFirstInvestment(investments[investmentIndex].memberId, investments[investmentIndex].amount, chatId);
    }
    
    await bot.sendMessage(chatId, `✅ Investment ${id} approved! ${isFirstInvestment ? '(First investment - referral bonus processed)' : ''}`);
    
    // Notify user
    const investor = users[userIndex];
    if (investor && investor.chatId && !loggedOutUsers.has(investor.chatId)) {
      try {
        await bot.sendMessage(investor.chatId,
          `🎉 **Investment Approved!**\n\n` +
          `Your investment of ${formatCurrency(investments[investmentIndex].amount)} has been approved.\n` +
          `You will start earning 2% daily profit starting tomorrow!\n\n` +
          `Check /earnings for updates.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
  } else if (id.startsWith('WDL-')) {
    // Approve withdrawal
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(wdl => wdl.id === id);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${id} not found.`);
      return;
    }
    
    if (withdrawals[withdrawalIndex].status !== 'pending') {
      await bot.sendMessage(chatId, `❌ Withdrawal ${id} is already ${withdrawals[withdrawalIndex].status}.`);
      return;
    }
    
    withdrawals[withdrawalIndex].status = 'approved';
    withdrawals[withdrawalIndex].approvedDate = new Date().toISOString();
    withdrawals[withdrawalIndex].processedBy = chatId.toString();
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    await bot.sendMessage(chatId, `✅ Withdrawal ${id} approved!`);
    
    // Notify user
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
      try {
        const withdrawal = withdrawals[withdrawalIndex];
        await bot.sendMessage(user.chatId,
          `🎉 **Withdrawal Approved!**\n\n` +
          `Your withdrawal of ${formatCurrency(withdrawal.amount)} has been approved.\n` +
          `Fee (5%): ${formatCurrency(withdrawal.fee || 0)}\n` +
          `Net Amount: ${formatCurrency(withdrawal.netAmount || withdrawal.amount)}\n` +
          `Payment will be sent to: ${withdrawal.details}\n\n` +
          `Processing time: 10-15 minutes\n` +
          `Thank you for using Starlife Advert!`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
  } else {
    await bot.sendMessage(chatId, `❌ Invalid ID format. Use INV-XXX for investments or WDL-XXX for withdrawals.`);
  }
});

// REJECT investment or withdrawal
bot.onText(/\/reject (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const id = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Check if it's an investment or withdrawal
  if (id.startsWith('INV-')) {
    // Reject investment
    const investments = await loadData(INVESTMENTS_FILE);
    const investmentIndex = investments.findIndex(inv => inv.id === id);
    
    if (investmentIndex === -1) {
      await bot.sendMessage(chatId, `❌ Investment ${id} not found.`);
      return;
    }
    
    if (investments[investmentIndex].status !== 'pending') {
      await bot.sendMessage(chatId, `❌ Investment ${id} is already ${investments[investmentIndex].status}.`);
      return;
    }
    
    investments[investmentIndex].status = 'rejected';
    investments[investmentIndex].rejectedDate = new Date().toISOString();
    investments[investmentIndex].rejectedBy = chatId.toString();
    await saveData(INVESTMENTS_FILE, investments);
    
    // Refund balance to user
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === investments[investmentIndex].memberId);
    if (userIndex !== -1) {
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + investments[investmentIndex].amount;
      users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) - investments[investmentIndex].amount;
      await saveData(USERS_FILE, users);
      
      // Record refund transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-REFUND-${Date.now()}`,
        memberId: investments[investmentIndex].memberId,
        type: 'investment_refund',
        amount: investments[investmentIndex].amount,
        description: `Refund for rejected investment #${id}`,
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
    }
    
    await bot.sendMessage(chatId, `❌ Investment ${id} rejected and user refunded.`);
    
    // Notify user
    const user = users[userIndex];
    if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
      try {
        await bot.sendMessage(user.chatId,
          `❌ **Investment Rejected**\n\n` +
          `Your investment of ${formatCurrency(investments[investmentIndex].amount)} has been rejected.\n` +
          `The amount has been refunded to your balance.\n\n` +
          `New balance: ${formatCurrency(user.balance)}\n` +
          `Contact /support for more information.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
  } else if (id.startsWith('WDL-')) {
    // Reject withdrawal
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(wdl => wdl.id === id);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${id} not found.`);
      return;
    }
    
    if (withdrawals[withdrawalIndex].status !== 'pending') {
      await bot.sendMessage(chatId, `❌ Withdrawal ${id} is already ${withdrawals[withdrawalIndex].status}.`);
      return;
    }
    
    withdrawals[withdrawalIndex].status = 'rejected';
    withdrawals[withdrawalIndex].rejectedDate = new Date().toISOString();
    withdrawals[withdrawalIndex].processedBy = chatId.toString();
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Refund balance to user
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    if (userIndex !== -1) {
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + withdrawals[withdrawalIndex].amount;
      await saveData(USERS_FILE, users);
      
      // Record refund transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-REFUND-${Date.now()}`,
        memberId: withdrawals[withdrawalIndex].memberId,
        type: 'withdrawal_refund',
        amount: withdrawals[withdrawalIndex].amount,
        description: `Refund for rejected withdrawal #${id}`,
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
    }
    
    await bot.sendMessage(chatId, `❌ Withdrawal ${id} rejected and user refunded.`);
    
    // Notify user
    const user = users[userIndex];
    if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
      try {
        await bot.sendMessage(user.chatId,
          `❌ **Withdrawal Rejected**\n\n` +
          `Your withdrawal of ${formatCurrency(withdrawals[withdrawalIndex].amount)} has been rejected.\n` +
          `The amount has been refunded to your balance.\n\n` +
          `New balance: ${formatCurrency(user.balance)}\n` +
          `Contact /support for more information.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
  } else {
    await bot.sendMessage(chatId, `❌ Invalid ID format. Use INV-XXX for investments or WDL-XXX for withdrawals.`);
  }
});

// View referrals
bot.onText(/\/referrals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const referrals = await loadData(REFERRALS_FILE);
  const paidReferrals = referrals.filter(ref => ref.status === 'paid');
  const pendingReferrals = referrals.filter(ref => ref.status === 'pending');
  
  const message = `👥 **Referral Summary**\n\n` +
                 `**Total Referrals:** ${referrals.length}\n` +
                 `**Paid Referrals:** ${paidReferrals.length}\n` +
                 `**Pending Referrals:** ${pendingReferrals.length}\n\n` +
                 `**Total Bonus Paid:** ${formatCurrency(paidReferrals.reduce((sum, ref) => sum + ref.bonusAmount, 0))}\n\n` +
                 `**Recent Referrals:**\n`;
  
  let detailedMessage = message;
  referrals.slice(-10).reverse().forEach((ref, index) => {
    detailedMessage += `\n${index + 1}. ${ref.referrerName} → ${ref.referredName}\n`;
    detailedMessage += `💰 ${formatCurrency(ref.bonusAmount)} | ${ref.status === 'paid' ? '✅' : '⏳'}\n`;
    if (ref.investmentAmount > 0) {
      detailedMessage += `Investment: ${formatCurrency(ref.investmentAmount)}\n`;
    }
    detailedMessage += `First Investment: ${ref.isFirstInvestment ? '✅' : '❌'}\n`;
    detailedMessage += `Bonus Paid: ${ref.bonusPaid ? '✅' : '❌'}\n`;
    detailedMessage += `Date: ${new Date(ref.date).toLocaleDateString()}\n`;
  });
  
  await bot.sendMessage(chatId, detailedMessage);
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
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
                      `• Total Chats: ${supportChats.length}\n\n` +
                      `**System:**\n` +
                      `• Logged Out Users: ${loggedOutUsers.size}`;
  
  await bot.sendMessage(chatId, statsMessage);
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const activeUsers = users.filter(u => !u.banned);
  
  let sent = 0;
  let failed = 0;
  
  await bot.sendMessage(chatId, `📢 Broadcasting to ${activeUsers.length} users...`);
  
  for (const user of activeUsers) {
    if (user.chatId && !loggedOutUsers.has(user.chatId)) {
      try {
        await bot.sendMessage(user.chatId,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `💼 Management Team`
        );
        sent++;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failed++;
      }
    }
  }
  
  await bot.sendMessage(chatId,
    `✅ **Broadcast Complete**\n\n` +
    `📤 Sent: ${sent}\n` +
    `❌ Failed: ${failed}\n` +
    `👥 Total: ${activeUsers.length}`
  );
});

// ==================== NEW ADMIN COMMANDS ====================

// Support chats list - ADMIN
bot.onText(/\/supportchats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
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
      const isLoggedOut = chat.isLoggedOut || false;
      const userName = isLoggedOut ? 
        `Logged Out (${chat.userId})` : 
        `${chat.userName || 'Unknown'} (${chat.userId})`;
      
      const lastMessage = chat.messages && chat.messages.length > 0 ? 
        chat.messages[chat.messages.length - 1] : 
        null;
      
      const lastMessageText = lastMessage ? 
        (lastMessage.message.length > 30 ? 
          lastMessage.message.substring(0, 30) + '...' : 
          lastMessage.message) : 
        'No messages';
      
      const lastSender = lastMessage ? 
        (lastMessage.sender === 'admin' ? '👨‍💼 Admin' : '👤 User') : 
        '';
      
      const messageCount = chat.messages ? chat.messages.length : 0;
      
      message += `${index + 1}. **${userName}**\n`;
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
});

// View specific support chat - ADMIN
bot.onText(/\/viewchat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const supportChats = await loadData(SUPPORT_CHATS_FILE);
  const chat = supportChats.find(c => c.id === supportChatId);
  
  if (!chat) {
    await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
    return;
  }
  
  const isLoggedOut = chat.isLoggedOut || false;
  const userName = isLoggedOut ? 
    `Logged Out User (${chat.userId})` : 
    `${chat.userName || 'Unknown'} (${chat.userId})`;
  
  let message = `💬 **Support Chat Details**\n\n`;
  message += `🆔 Chat ID: ${chat.id}\n`;
  message += `👤 User: ${userName}\n`;
  message += `📝 Topic: ${chat.topic}\n`;
  message += `📊 Status: ${chat.status === 'active' ? '🟢 Active' : '🔴 Closed'}\n`;
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
});

// Reply to support chat - ADMIN
bot.onText(/\/replychat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fullText = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Parse the input - support multiple formats
  let supportChatId, replyMessage;
  
  // Try to split by space (for chat IDs without spaces)
  const firstSpaceIndex = fullText.indexOf(' ');
  
  if (firstSpaceIndex === -1) {
    // No message provided
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
  
  const supportChats = await loadData(SUPPORT_CHATS_FILE);
  let chatIndex = supportChats.findIndex(chat => chat.id === supportChatId);
  
  if (chatIndex === -1) {
    // Also try to find by user ID (for logged out users using phone numbers)
    const phoneChat = supportChats.find(chat => 
      chat.userId === supportChatId && chat.status === 'active'
    );
    
    if (phoneChat) {
      supportChatId = phoneChat.id;
      chatIndex = supportChats.findIndex(chat => chat.id === supportChatId);
    } else {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
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
  const isLoggedOut = chat.isLoggedOut || false;
  const userName = isLoggedOut ? 
    `Logged Out User (${chat.userId})` : 
    `${chat.userName || 'Unknown'} (${chat.userId})`;
  
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
    // For logged out users, check if userId is a phone number
    if (!isLoggedOut) {
      // Find user by memberId
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === chat.userId);
      
      if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
        await bot.sendMessage(user.chatId,
          `👨‍💼 **Support Response**\n\n` +
          `Topic: ${chat.topic}\n` +
          `Support: "${replyMessage}"\n\n` +
          `Continue the conversation by typing your response.\n` +
          `Use /endsupport to close chat.`
        );
      }
    }
  } catch (error) {
    console.log('Could not notify user:', error.message);
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
  
  const isLoggedOut = chat.isLoggedOut || false;
  const userName = isLoggedOut ? 
    `Logged Out User` : 
    `${chat.userName || 'Unknown'} (${chat.userId})`;
  
  await bot.sendMessage(chatId,
    `✅ **Chat Closed**\n\n` +
    `Chat ID: ${supportChatId}\n` +
    `With: ${userName}\n` +
    `Topic: ${chat.topic}\n` +
    `Messages: ${chat.messages ? chat.messages.length : 0}\n` +
    `Closed at: ${new Date().toLocaleString()}`
  );
  
  // Notify user if possible
  if (!isLoggedOut) {
    try {
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === chat.userId);
      
      if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
        await bot.sendMessage(user.chatId,
          `💬 **Support Chat Closed**\n\n` +
          `Your support chat has been closed by our team.\n` +
          `Thank you for contacting us!\n\n` +
          `If you need further assistance, use /support again.`
        );
      }
    } catch (error) {
      console.log('Could not notify user about chat closure');
    }
  }
});

// Find user by referral code - ADMIN
bot.onText(/\/findref (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.referralCode === referralCode);
  
  if (!user) {
    await bot.sendMessage(chatId, `❌ No user found with referral code: ${referralCode}`);
    return;
  }
  
  // Find users referred by this user
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerCode === referralCode);
  const userReferredBy = referrals.filter(ref => ref.referredId === user.memberId);
  
  const userMessage = `🔍 **User Found by Referral Code**\n\n` +
                     `**Account Holder:**\n` +
                     `Name: ${user.name}\n` +
                     `Member ID: ${user.memberId}\n` +
                     `Referral Code: ${user.referralCode}\n` +
                     `Balance: ${formatCurrency(user.balance)}\n` +
                     `Referrals: ${user.referrals || 0}\n` +
                     `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  
  if (userReferredBy.length > 0) {
    userMessage += `**Referred By:**\n`;
    userReferredBy.forEach(ref => {
      userMessage += `• ${ref.referrerName} (${ref.referrerId})\n`;
    });
    userMessage += `\n`;
  }
  
  if (userReferrals.length > 0) {
    userMessage += `**Users Referred (${userReferrals.length}):**\n`;
    userReferrals.forEach((ref, index) => {
      userMessage += `${index + 1}. ${ref.referredName} (${ref.referredId})\n`;
      userMessage += `   Investment: ${ref.investmentAmount > 0 ? formatCurrency(ref.investmentAmount) : 'No investment yet'}\n`;
      userMessage += `   Bonus: ${formatCurrency(ref.bonusAmount)} | Status: ${ref.status}\n`;
      userMessage += `   First Investment: ${ref.isFirstInvestment ? '✅' : '❌'}\n`;
      userMessage += `   Bonus Paid: ${ref.bonusPaid ? '✅' : '❌'}\n\n`;
    });
  } else {
    userMessage += `**No users referred yet.**\n\n`;
  }
  
  userMessage += `**Quick Actions:**\n`;
  userMessage += `/view ${user.memberId} - View full details\n`;
  userMessage += `/addrefbonus ${user.memberId} AMOUNT - Add referral bonus\n`;
  userMessage += `/addbalance ${user.memberId} AMOUNT - Add balance\n`;
  
  await bot.sendMessage(chatId, userMessage);
});

// Add manual investment - ADMIN
bot.onText(/\/manualinv (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount < 10) {
    await bot.sendMessage(chatId, '❌ Minimum investment is $10.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  // Create investment record
  const investments = await loadData(INVESTMENTS_FILE);
  const investmentId = `MANUAL-INV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  
  // Check if this is the user's first investment
  const userInvestments = investments.filter(inv => 
    inv.memberId === memberId && 
    inv.status === 'active'
  );
  
  const isFirstInvestment = userInvestments.length === 0;
  
  const newInvestment = {
    id: investmentId,
    memberId: memberId,
    amount: amount,
    date: new Date().toISOString(),
    status: 'active',
    daysActive: 0,
    totalProfit: 0,
    paymentProof: 'MANUAL BY ADMIN',
    approvedDate: new Date().toISOString(),
    approvedBy: chatId.toString(),
    isManual: true,
    isFirstInvestment: isFirstInvestment
  };
  
  investments.push(newInvestment);
  await saveData(INVESTMENTS_FILE, investments);
  
  // Update user
  users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + amount;
  users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
  await saveData(USERS_FILE, users);
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-MANUAL-INV-${Date.now()}`,
    memberId: memberId,
    type: 'manual_investment',
    amount: -amount,
    description: `Manual investment #${investmentId} by admin`,
    date: new Date().toISOString()
  });
  await saveData(TRANSACTIONS_FILE, transactions);
  
  await bot.sendMessage(chatId, `✅ Manual investment of ${formatCurrency(amount)} added for ${memberId}. Investment ID: ${investmentId}`);
  
  // Add referral bonus if this is first investment
  if (isFirstInvestment) {
    await addReferralBonusForFirstInvestment(memberId, amount, chatId);
  }
  
  // Notify user
  const user = users[userIndex];
  if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId,
        `🎉 **Manual Investment Added!**\n\n` +
        `Admin has added a manual investment of ${formatCurrency(amount)} to your account.\n` +
        `Investment ID: ${investmentId}\n` +
        `You will start earning 2% daily profit starting tomorrow!\n\n` +
        `Check /earnings for updates.`
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

// Add referral bonus manually - ADMIN
bot.onText(/\/addrefbonus (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount.');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
    return;
  }
  
  // Add bonus to user
  users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + amount;
  users[userIndex].referralEarnings = (parseFloat(users[userIndex].referralEarnings) || 0) + amount;
  
  await saveData(USERS_FILE, users);
  
  // Record transaction
  const transactions = await loadData(TRANSACTIONS_FILE);
  transactions.push({
    id: `TRX-MANUAL-REF-${Date.now()}`,
    memberId: memberId,
    type: 'manual_referral_bonus',
    amount: amount,
    description: `Manual referral bonus added by admin`,
    date: new Date().toISOString()
  });
  await saveData(TRANSACTIONS_FILE, transactions);
  
  await bot.sendMessage(chatId, `✅ Added ${formatCurrency(amount)} referral bonus to ${memberId}. New balance: ${formatCurrency(users[userIndex].balance)}`);
  
  // Notify user
  const user = users[userIndex];
  if (user && user.chatId && !loggedOutUsers.has(user.chatId)) {
    try {
      await bot.sendMessage(user.chatId,
        `🎉 **Referral Bonus Added!**\n\n` +
        `Admin has added a referral bonus of ${formatCurrency(amount)} to your account.\n` +
        `New balance: ${formatCurrency(user.balance)}\n\n` +
        `Thank you for referring users!`
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  }
});

// Helper function to add referral bonus for first investment
async function addReferralBonusForFirstInvestment(memberId, investmentAmount, adminChatId) {
  const users = await loadData(USERS_FILE);
  const referrals = await loadData(REFERRALS_FILE);
  
  const investor = users.find(u => u.memberId === memberId);
  if (!investor || !investor.referredBy) {
    return; // No referrer
  }
  
  const referrer = users.find(u => u.referralCode === investor.referredBy);
  if (!referrer) {
    return; // Referrer not found
  }
  
  // Check if referrer has already earned bonus from this user
  const existingReferral = referrals.find(ref => 
    ref.referredId === memberId && 
    ref.referrerId === referrer.memberId
  );
  
  if (existingReferral && existingReferral.bonusPaid) {
    // Bonus already paid for this user
    return;
  }
  
  const bonusAmount = calculateReferralBonus(investmentAmount);
  const referrerIndex = users.findIndex(u => u.memberId === referrer.memberId);
  
  if (referrerIndex !== -1) {
    users[referrerIndex].balance = (parseFloat(users[referrerIndex].balance) || 0) + bonusAmount;
    users[referrerIndex].referralEarnings = (parseFloat(users[referrerIndex].referralEarnings) || 0) + bonusAmount;
    
    // Update or create referral record
    let referralIndex = referrals.findIndex(ref => 
      ref.referredId === memberId && 
      ref.referrerId === referrer.memberId
    );
    
    if (referralIndex === -1) {
      // Create new referral record
      referrals.push({
        id: `REF-${Date.now()}`,
        referrerId: referrer.memberId,
        referrerName: referrer.name,
        referrerCode: referrer.referralCode,
        referredId: memberId,
        referredName: investor.name,
        bonusAmount: bonusAmount,
        status: 'paid',
        date: new Date().toISOString(),
        investmentAmount: investmentAmount,
        isFirstInvestment: true,
        bonusPaid: true,
        paidDate: new Date().toISOString()
      });
    } else {
      // Update existing referral record
      referrals[referralIndex].bonusAmount = bonusAmount;
      referrals[referralIndex].status = 'paid';
      referrals[referralIndex].investmentAmount = investmentAmount;
      referrals[referralIndex].isFirstInvestment = true;
      referrals[referralIndex].bonusPaid = true;
      referrals[referralIndex].paidDate = new Date().toISOString();
    }
    
    await saveData(REFERRALS_FILE, referrals);
    await saveData(USERS_FILE, users);
    
    // Record transaction for referrer
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-REF-${Date.now()}`,
      memberId: referrer.memberId,
      type: 'referral_bonus',
      amount: bonusAmount,
      description: `Referral bonus from ${investor.name}'s first investment (${formatCurrency(investmentAmount)})`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    // Notify referrer
    if (referrer.chatId && !loggedOutUsers.has(referrer.chatId)) {
      try {
        await bot.sendMessage(referrer.chatId,
          `🎉 **Referral Bonus Earned!**\n\n` +
          `${investor.name} made their FIRST investment of ${formatCurrency(investmentAmount)}\n` +
          `You earned 10% bonus: ${formatCurrency(bonusAmount)}\n\n` +
          `New balance: ${formatCurrency(users[referrerIndex].balance)}\n\n` +
          `Note: You only earn bonus on their first investment.`
        );
      } catch (error) {
        console.log('Could not notify referrer');
      }
    }
    
    // Notify admin
    await bot.sendMessage(adminChatId,
      `💰 **Referral Bonus Added**\n\n` +
      `Referrer: ${referrer.name} (${referrer.memberId})\n` +
      `Referred: ${investor.name} (${investor.memberId})\n` +
      `Investment: ${formatCurrency(investmentAmount)}\n` +
      `Bonus (10%): ${formatCurrency(bonusAmount)}\n\n` +
      `Bonus has been credited to referrer's account.`
    );
  }
}

// ==================== HANDLE UNKNOWN COMMANDS ====================

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text && text.startsWith('/')) {
    // Check if command exists
    const validCommands = [
      '/start', '/help', '/register', '/login', '/logout', '/profile',
      '/invest', '/investnow', '/earnings', '/viewearnings', '/withdraw',
      '/referral', '/support', '/endsupport', '/admin', '/users', '/view',
      '/suspend', '/unsuspend', '/resetpass', '/delete', '/addbalance',
      '/deductbalance', '/supportchats', '/viewchat', '/replychat', '/closechat',
      '/investments', '/withdrawals', '/approve', '/reject', '/stats',
      '/broadcast', '/referrals', '/findref', '/manualinv', '/addrefbonus'
    ];
    
    const command = text.split(' ')[0];
    if (!validCommands.some(cmd => text.startsWith(cmd))) {
      bot.sendMessage(chatId,
        `❓ Unknown command: ${command}\n\n` +
        `Use /help to see available commands.`
      );
    }
  }
});

console.log('✅ Starlife Advert Bot is running! All features enabled!');

// Clean shutdown
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
