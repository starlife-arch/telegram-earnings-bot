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
                      `   • Processing: 10-15 minutes\n\n` +
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

// Handle support for logged out users
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // Handle logged out user support
    if (session.step === 'support_loggedout_topic') {
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
      // Add message to existing logged out chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
      
      if (chatIndex === -1) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
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
    
    // ... [Keep all other message handling code from previous version] ...
    // All the existing message handling code for registration, login, investment, etc.
    // Should remain exactly the same as in the previous version
    
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

// ==================== PROTECTED COMMANDS ====================

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
  
  // Check if it's a protected command
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
  
  const profileMessage = `👤 **Your Profile**\n\n` +
                        `**Account Details:**\n` +
                        `Name: ${user.name}\n` +
                        `Member ID: ${user.memberId}\n` +
                        `Email: ${user.email}\n` +
                        `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n` +
                        `Last Login: ${new Date(user.lastLogin).toLocaleDateString()}\n\n` +
                        `**Financial Summary:**\n` +
                        `Current Balance: ${formatCurrency(user.balance)}\n` +
                        `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                        `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                        `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                        `**Investment Stats:**\n` +
                        `Active Investments: ${user.activeInvestments || 0}\n` +
                        `Total Referrals: ${user.referrals || 0}\n` +
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
  
  let earningsMessage = `💰 **Your Earnings Dashboard**\n\n`;
  
  earningsMessage += `👤 **Account Summary**\n`;
  earningsMessage += `Name: ${user.name}\n`;
  earningsMessage += `Member ID: ${user.memberId}\n`;
  earningsMessage += `Balance: ${formatCurrency(user.balance)}\n`;
  earningsMessage += `Total Earned: ${formatCurrency(user.totalEarned)}\n`;
  earningsMessage += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n`;
  earningsMessage += `Total Referrals: ${user.referrals || 0}\n\n`;
  
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
    `Processing Time: 10-15 minutes\n\n` +
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
                         `3. When they invest ANY amount\n` +
                         `4. You earn 10% of their investment!\n\n` +
                         `**Example:**\n` +
                         `• Friend invests $100 → You earn $10\n` +
                         `• Friend invests $500 → You earn $50\n` +
                         `• Friend invests $1000 → You earn $100\n\n` +
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

// Register command - Available to everyone (logged out users)
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  
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
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `📝 **Account Registration**\n\n` +
    `Step 1/4: Enter your full name\n\n` +
    `Example: John Doe\n` +
    `Enter your name:`
  );
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

// ==================== ADMIN COMMANDS ====================

// Admin commands are always available to admins, regardless of login status
// ... [Keep all admin commands exactly as they were in previous version] ...
// All admin commands should remain exactly the same

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
      '/deductbalance', '/supportchats', '/replychat', '/closechat',
      '/investments', '/withdrawals', '/approve', '/reject', '/stats',
      '/broadcast'
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

console.log('✅ Starlife Advert Bot is running! Logout system implemented!');

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
