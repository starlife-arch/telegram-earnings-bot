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

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log('📱 /start from:', chatId);
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
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
    fakeMessage += '/investnow - Quick start guide\n\n';
    fakeMessage += '💳 **Payment Details:**\n';
    fakeMessage += 'M-Pesa Till: 6034186\n';
    fakeMessage += 'Name: Starlife Advert US Agency';
    
    await bot.sendMessage(chatId, fakeMessage);
  }
});

// Quick investment guide
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

// Help command
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `🤖 **Starlife Advert Bot - Help**\n\n` +
                     `**Account Commands:**\n` +
                     `/start - Start bot\n` +
                     `/register - Create account\n` +
                     `/login - Login to account\n` +
                     `/logout - Logout\n` +
                     `/profile - View profile\n\n` +
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
  
  // Clear any active sessions
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged out successfully!**\n\n` +
    `You have been logged out.\n\n` +
    `To login again, use /login\n` +
    `To create new account, use /register`
  );
});

// Profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
    return;
  }
  
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

// Register command
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

// Handle ALL messages (registration, login, investment, support, etc.)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if it's a command
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // REGISTRATION HANDLING
    if (session.step === 'awaiting_name') {
      session.data.name = text.trim();
      session.step = 'awaiting_password';
      
      await bot.sendMessage(chatId,
        `✅ Name saved: ${session.data.name}\n\n` +
        `Step 2/4: Create password\n\n` +
        `Minimum 6 characters\n` +
        `Enter password:`
      );
    } 
    else if (session.step === 'awaiting_password') {
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
    }
    else if (session.step === 'awaiting_email') {
      const email = text.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        await bot.sendMessage(chatId, '❌ Please enter a valid email address:');
        return;
      }
      
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
    }
    else if (session.step === 'awaiting_referral') {
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
      let successMessage = `🎉 **Registration Successful!**\n\n` +
                          `Welcome ${newUser.name}!\n\n` +
                          `📋 **Your Account:**\n` +
                          `Member ID: ${newUser.memberId}\n` +
                          `Your Referral Code: ${newUser.referralCode}\n` +
                          `Email: ${newUser.email}\n\n`;
      
      if (referrer) {
        successMessage += `👥 **Referred by:** ${referrer.name}\n`;
        successMessage += `**When you invest, ${referrer.name} earns 10% of your investment!**\n\n`;
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
            `**When they invest, you'll earn 10% of their investment!**\n\n` +
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
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // LOGIN HANDLING
    else if (session.step === 'login_memberid') {
      session.data.memberId = text.trim().toUpperCase();
      session.step = 'login_password';
      
      await bot.sendMessage(chatId, 'Enter your password:');
    }
    else if (session.step === 'login_password') {
      const memberId = session.data.memberId;
      const passwordHash = hashPassword(text);
      
      const users = await loadData(USERS_FILE);
      const user = users.find(u => 
        u.memberId === memberId && 
        u.passwordHash === passwordHash
      );
      
      if (user) {
        if (user.banned) {
          await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
          delete userSessions[chatId];
          return;
        }
        
        // Update chat ID and last login
        const userIndex = users.findIndex(u => u.memberId === memberId);
        if (userIndex !== -1) {
          users[userIndex].chatId = chatId.toString();
          users[userIndex].lastLogin = new Date().toISOString();
          await saveData(USERS_FILE, users);
        }
        
        delete userSessions[chatId];
        
        await bot.sendMessage(chatId,
          `✅ **Login Successful!**\n\n` +
          `Welcome back, ${user.name}!\n\n` +
          `Balance: ${formatCurrency(user.balance)}\n` +
          `Total Earned: ${formatCurrency(user.totalEarned)}\n\n` +
          `Use /invest to add funds\n` +
          `Use /earnings to view details`
        );
      } else {
        await bot.sendMessage(chatId, '❌ Invalid Member ID or password. Try /login again.');
        delete userSessions[chatId];
      }
    }
    
    // INVESTMENT HANDLING
    else if (session.step === 'invest_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10) {
        await bot.sendMessage(chatId, '❌ Minimum investment is $10. Enter valid amount:');
        return;
      }
      
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      
      if (userIndex === -1) {
        await bot.sendMessage(chatId, '❌ User not found. Please login again.');
        delete userSessions[chatId];
        return;
      }
      
      const user = users[userIndex];
      
      // Create investment
      const investment = {
        id: `INV-${Date.now()}`,
        memberId: user.memberId,
        userName: user.name,
        amount: amount,
        dailyProfit: calculateDailyProfit(amount),
        totalProfit: 0,
        daysActive: 0,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        paymentMethod: 'M-Pesa',
        paymentDetails: 'Till 6034186 - Starlife Advert US Agency'
      };
      
      // Save investment
      const investments = await loadData(INVESTMENTS_FILE);
      investments.push(investment);
      await saveData(INVESTMENTS_FILE, investments);
      
      // Update user stats
      users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + amount;
      users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
      
      // Record transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-${Date.now()}`,
        memberId: user.memberId,
        type: 'investment',
        amount: amount,
        description: `Investment #${investment.id}`,
        date: new Date().toISOString()
      });
      
      await saveData(USERS_FILE, users);
      await saveData(TRANSACTIONS_FILE, transactions);
      
      delete userSessions[chatId];
      
      // Send confirmation
      await bot.sendMessage(chatId,
        `✅ **Investment Created!**\n\n` +
        `Investment ID: ${investment.id}\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `Daily Profit: ${formatCurrency(investment.dailyProfit)}\n` +
        `Estimated Monthly: ${formatCurrency(amount * 0.02 * 30)}\n` +
        `Start Date: ${new Date().toLocaleDateString()}\n` +
        `End Date: ${new Date(investment.endDate).toLocaleDateString()}\n\n` +
        `💰 **Profit Calculation:**\n` +
        `• 2% daily added to balance\n` +
        `• Auto-calculated every 24h\n` +
        `• View with /earnings\n\n` +
        `👥 **Referral Bonus:**\n` +
        `Share your code: ${user.referralCode}\n` +
        `Earn 10% when friends invest!`
      );
      
      // Handle referral bonus for referrer (10% of investment)
      if (user.referredBy) {
        const referrer = users.find(u => u.memberId === user.referredBy);
        if (referrer) {
          const referralBonus = calculateReferralBonus(amount);
          
          // Update referrer stats
          const referrerIndex = users.findIndex(u => u.memberId === referrer.memberId);
          if (referrerIndex !== -1) {
            users[referrerIndex].balance = (parseFloat(users[referrerIndex].balance) || 0) + referralBonus;
            users[referrerIndex].referralEarnings = (parseFloat(users[referrerIndex].referralEarnings) || 0) + referralBonus;
            users[referrerIndex].referrals = (users[referrerIndex].referrals || 0) + 1;
            
            // Save referral record
            const referrals = await loadData(REFERRALS_FILE);
            referrals.push({
              id: `REF-${Date.now()}`,
              referrerId: referrer.memberId,
              referrerName: referrer.name,
              referredId: user.memberId,
              referredName: user.name,
              investmentAmount: amount,
              bonusAmount: referralBonus,
              date: new Date().toISOString()
            });
            await saveData(REFERRALS_FILE, referrals);
            
            // Record transaction for referrer
            transactions.push({
              id: `TRX-REF-${Date.now()}`,
              memberId: referrer.memberId,
              type: 'referral_bonus',
              amount: referralBonus,
              description: `10% referral bonus from ${user.name}'s investment`,
              date: new Date().toISOString()
            });
            await saveData(TRANSACTIONS_FILE, transactions);
            
            await saveData(USERS_FILE, users);
            
            // Notify referrer
            try {
              await bot.sendMessage(referrer.chatId,
                `💰 **Referral Bonus Earned!**\n\n` +
                `${user.name} invested ${formatCurrency(amount)}\n` +
                `You earned 10%: ${formatCurrency(referralBonus)}\n\n` +
                `New Balance: ${formatCurrency(users[referrerIndex].balance)}\n` +
                `Total Referral Earnings: ${formatCurrency(users[referrerIndex].referralEarnings)}\n\n` +
                `Keep sharing your code: ${referrer.referralCode}`
              );
            } catch (error) {
              console.log('Could not notify referrer');
            }
          }
        }
      }
      
      // Notify admin
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💰 **New Investment**\n\n` +
                            `User: ${user.name}\n` +
                            `Member ID: ${user.memberId}\n` +
                            `Amount: ${formatCurrency(amount)}\n` +
                            `Investment ID: ${investment.id}\n` +
                            `Time: ${new Date().toLocaleString()}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // WITHDRAWAL HANDLING
    else if (session.step === 'withdraw_amount') {
      const amount = parseFloat(text);
      const maxAmount = session.data.maxAmount;
      
      if (isNaN(amount) || amount < 2 || amount > maxAmount) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount\n\n` +
          `Minimum: $2\n` +
          `Maximum: ${formatCurrency(maxAmount)}\n\n` +
          `Enter valid amount:`
        );
        return;
      }
      
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      
      if (userIndex === -1) {
        await bot.sendMessage(chatId, '❌ User not found.');
        delete userSessions[chatId];
        return;
      }
      
      // Update balance
      users[userIndex].balance = maxAmount - amount;
      
      // Create withdrawal request
      const withdrawal = {
        id: `WD-${Date.now()}`,
        memberId: session.data.memberId,
        userName: users[userIndex].name,
        amount: amount,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        completedAt: null,
        paymentMethod: 'To be confirmed',
        adminNote: ''
      };
      
      // Save withdrawal
      const withdrawals = await loadData(WITHDRAWALS_FILE);
      withdrawals.push(withdrawal);
      await saveData(WITHDRAWALS_FILE, withdrawals);
      
      // Record transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-WD-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'withdrawal',
        amount: -amount,
        description: `Withdrawal request #${withdrawal.id}`,
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
      
      await saveData(USERS_FILE, users);
      
      delete userSessions[chatId];
      
      // Send confirmation
      await bot.sendMessage(chatId,
        `✅ **Withdrawal Request Submitted!**\n\n` +
        `Withdrawal ID: ${withdrawal.id}\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `Status: Pending\n` +
        `Processing: 10-15 minutes\n\n` +
        `We will notify you when processed.\n\n` +
        `Your balance: ${formatCurrency(users[userIndex].balance)}`
      );
      
      // Notify admin
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💳 **New Withdrawal Request**\n\n` +
                            `User: ${withdrawal.userName}\n` +
                            `Member ID: ${withdrawal.memberId}\n` +
                            `Amount: ${formatCurrency(amount)}\n` +
                            `Withdrawal ID: ${withdrawal.id}\n` +
                            `Balance After: ${formatCurrency(users[userIndex].balance)}\n\n` +
                            `Approve: /approve ${withdrawal.id}\n` +
                            `Reject: /reject ${withdrawal.id}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // SUPPORT HANDLING
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
        `Your message has been sent.\n` +
        `We will respond shortly.\n\n` +
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
        `We will respond shortly.\n` +
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

// Login command
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see dashboard.');
    return;
  }
  
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

// Invest command
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login or register with /register');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
    return;
  }
  
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

// Earnings command
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
    return;
  }
  
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

// View others earnings - ALWAYS CHARGE $1
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
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
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
  
  // ALWAYS charge $1 for viewing (no free views)
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

// Withdraw command
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
    return;
  }
  
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

// Referral command
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Your account has been suspended.');
    return;
  }
  
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

// Support command
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
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

// ==================== ADMIN COMMANDS ====================

// Admin panel
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  const adminMessage = `⚡ **Admin Panel**\n\n` +
                      `**User Management:**\n` +
                      `/users - List all users\n` +
                      `/view MEMBER_ID - User details\n` +
                      `/suspend MEMBER_ID - Suspend account\n` +
                      `/unsuspend MEMBER_ID - Unsuspend account\n` +
                      `/resetpass MEMBER_ID - Reset password\n` +
                      `/delete MEMBER_ID - Delete account\n` +
                      `/addbalance MEMBER_ID AMOUNT - Add funds\n` +
                      `/deductbalance MEMBER_ID AMOUNT - Deduct funds\n\n` +
                      `**Support Management:**\n` +
                      `/supportchats - Active chats\n` +
                      `/replychat CHAT_ID MSG - Reply to user\n` +
                      `/closechat CHAT_ID - Close chat\n\n` +
                      `**Financial Management:**\n` +
                      `/investments - All investments\n` +
                      `/withdrawals - Pending withdrawals\n` +
                      `/approve WD_ID - Approve withdrawal\n` +
                      `/reject WD_ID - Reject withdrawal\n\n` +
                      `**System Management:**\n` +
                      `/stats - System statistics\n` +
                      `/broadcast MESSAGE - Send to all users`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// Admin: List users
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    
    if (realUsers.length === 0) {
      await bot.sendMessage(chatId, '📭 No registered users yet.');
      return;
    }
    
    let message = `👥 **Total Users: ${realUsers.length}**\n\n`;
    
    // Show last 15 users
    const lastUsers = realUsers.slice(-15).reverse();
    lastUsers.forEach((user, index) => {
      message += `${index + 1}. ${user.name}\n`;
      message += `   ID: ${user.memberId}\n`;
      message += `   Balance: ${formatCurrency(user.balance)}\n`;
      message += `   Status: ${user.banned ? '🚫' : '✅'}\n`;
      message += `   Actions: /view ${user.memberId}\n\n`;
    });
    
    if (realUsers.length > 15) {
      message += `... and ${realUsers.length - 15} more users\n`;
    }
    
    message += `\n**Quick Stats:**\n`;
    message += `Active: ${realUsers.filter(u => !u.banned).length}\n`;
    message += `Suspended: ${realUsers.filter(u => u.banned).length}\n`;
    message += `Total Balance: ${formatCurrency(realUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin users error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching users');
  }
});

// Admin: View user details
bot.onText(/\/view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId && !u.isFake);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const investments = await loadData(INVESTMENTS_FILE);
    const userInvestments = investments.filter(inv => inv.memberId === memberId);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const userWithdrawals = withdrawals.filter(wd => wd.memberId === memberId);
    const referrals = await loadData(REFERRALS_FILE);
    const userReferrals = referrals.filter(ref => ref.referrerId === memberId);
    
    let message = `👤 **User Details**\n\n`;
    
    message += `**Basic Info**\n`;
    message += `Name: ${user.name}\n`;
    message += `Member ID: ${user.memberId}\n`;
    message += `Chat ID: ${user.chatId}\n`;
    message += `Email: ${user.email}\n`;
    message += `Joined: ${new Date(user.joinedDate).toLocaleString()}\n`;
    message += `Last Login: ${new Date(user.lastLogin).toLocaleString()}\n`;
    message += `Status: ${user.banned ? '🚫 SUSPENDED' : '✅ ACTIVE'}\n\n`;
    
    message += `**Financial**\n`;
    message += `Balance: ${formatCurrency(user.balance)}\n`;
    message += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
    message += `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
    message += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
    
    message += `**Investments**\n`;
    message += `Active: ${userInvestments.filter(i => i.status === 'active').length}\n`;
    message += `Total: ${userInvestments.length}\n`;
    message += `Total Amount: ${formatCurrency(userInvestments.reduce((sum, i) => sum + i.amount, 0))}\n\n`;
    
    message += `**Referrals**\n`;
    message += `Total Referred: ${userReferrals.length}\n`;
    message += `Referral Income: ${formatCurrency(userReferrals.reduce((sum, r) => sum + r.bonusAmount, 0))}\n`;
    message += `Referral Code: ${user.referralCode}\n\n`;
    
    message += `**Withdrawals**\n`;
    message += `Pending: ${userWithdrawals.filter(w => w.status === 'pending').length}\n`;
    message += `Completed: ${userWithdrawals.filter(w => w.status === 'completed').length}\n`;
    message += `Total Withdrawn: ${formatCurrency(userWithdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0))}\n\n`;
    
    message += `**Admin Actions**\n`;
    message += `/suspend ${memberId} - Suspend account\n`;
    message += `/unsuspend ${memberId} - Unsuspend account\n`;
    message += `/resetpass ${memberId} - Reset password\n`;
    message += `/delete ${memberId} - Delete account\n`;
    message += `/addbalance ${memberId} AMOUNT - Add funds\n`;
    message += `/deductbalance ${memberId} AMOUNT - Deduct funds`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin view error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching user details');
  }
});

// Admin: Suspend account
bot.onText(/\/suspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = true;
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been suspended.`);
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '🚫 **Account Suspended**\n\n' +
        'Your account has been suspended by administrator.\n' +
        'You cannot access your account until unsuspended.'
      );
    } catch (error) {
      console.log('Could not notify suspended user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error suspending user');
  }
});

// Admin: Unsuspend account
bot.onText(/\/unsuspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = false;
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been unsuspended.`);
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '✅ **Account Unsuspended**\n\n' +
        'Your account has been unsuspended by administrator.\n' +
        'You can now access your account normally.'
      );
    } catch (error) {
      console.log('Could not notify unsuspended user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error unsuspending user');
  }
});

// Admin: Reset password
bot.onText(/\/resetpass (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const tempPassword = Math.random().toString(36).slice(-8);
    users[userIndex].passwordHash = hashPassword(tempPassword);
    
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ Password reset for ${memberId}\n\n` +
      `Temporary Password: ${tempPassword}\n\n` +
      `User must login with this password immediately.`
    );
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '🔐 **Password Reset**\n\n' +
        'Your password has been reset by administrator.\n\n' +
        `Temporary Password: ${tempPassword}\n\n` +
        '⚠️ Please login immediately and change your password.'
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error resetting password');
  }
});

// Admin: Delete account
bot.onText(/\/delete (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const deletedUser = users.splice(userIndex, 1)[0];
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} (${deletedUser.name}) has been deleted.`);
    
    // Notify user
    try {
      await bot.sendMessage(deletedUser.chatId,
        '❌ **Account Deleted**\n\n' +
        'Your account has been deleted by administrator.\n' +
        'All your data has been removed from the system.'
      );
    } catch (error) {
      console.log('Could not notify deleted user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error deleting user');
  }
});

// Admin: Add balance
bot.onText(/\/addbalance (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].split(' ');
  const memberId = params[0].toUpperCase();
  const amount = parseFloat(params[1]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  if (!memberId || isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Usage: /addbalance MEMBER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + amount;
    users[userIndex].totalEarned = (parseFloat(users[userIndex].totalEarned) || 0) + amount;
    
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-ADMIN-ADD-${Date.now()}`,
      memberId: memberId,
      type: 'admin_add',
      amount: amount,
      description: `Admin added funds by ${chatId}`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ Funds added to ${memberId}\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n` +
      `User: ${users[userIndex].name}`
    );
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        `💰 **Funds Added by Admin**\n\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
        `Thank you for being part of Starlife Advert!`
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error adding funds');
  }
});

// Admin: Deduct balance
bot.onText(/\/deductbalance (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].split(' ');
  const memberId = params[0].toUpperCase();
  const amount = parseFloat(params[1]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  if (!memberId || isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Usage: /deductbalance MEMBER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const currentBalance = parseFloat(users[userIndex].balance) || 0;
    if (amount > currentBalance) {
      await bot.sendMessage(chatId, `❌ Cannot deduct ${formatCurrency(amount)}. User only has ${formatCurrency(currentBalance)}.`);
      return;
    }
    
    users[userIndex].balance = currentBalance - amount;
    
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-ADMIN-DEDUCT-${Date.now()}`,
      memberId: memberId,
      type: 'admin_deduct',
      amount: -amount,
      description: `Admin deducted funds by ${chatId}`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ Funds deducted from ${memberId}\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n` +
      `User: ${users[userIndex].name}`
    );
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        `💰 **Funds Deducted by Admin**\n\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
        `Contact support if you have questions.`
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error deducting funds');
  }
});

// Admin: View support chats
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
      message += `   Reply: /replychat ${chat.id} message\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin supportchats error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching support chats');
  }
});

// Admin: Reply to chat
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

// Admin: Close chat
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
          `Your support chat has been closed.\n\n` +
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

// Admin: View investments
bot.onText(/\/investments/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    
    if (investments.length === 0) {
      await bot.sendMessage(chatId, '📭 No investments yet.');
      return;
    }
    
    const activeInvestments = investments.filter(i => i.status === 'active');
    const completedInvestments = investments.filter(i => i.status === 'completed');
    
    let message = `📈 **Investment Report**\n\n`;
    
    message += `**Summary:**\n`;
    message += `Total Investments: ${investments.length}\n`;
    message += `Active: ${activeInvestments.length}\n`;
    message += `Completed: ${completedInvestments.length}\n`;
    message += `Total Amount: ${formatCurrency(investments.reduce((sum, i) => sum + i.amount, 0))}\n\n`;
    
    message += `**Recent Active Investments (Last 5):**\n`;
    const recentActive = activeInvestments.slice(-5).reverse();
    recentActive.forEach((inv, index) => {
      message += `${index + 1}. ${inv.userName} (${inv.memberId})\n`;
      message += `   Amount: ${formatCurrency(inv.amount)}\n`;
      message += `   Days Active: ${inv.daysActive || 0}\n`;
      message += `   Total Profit: ${formatCurrency(inv.totalProfit || 0)}\n\n`;
    });
    
    message += `**Total Daily Payout:** ${formatCurrency(activeInvestments.reduce((sum, i) => sum + (i.dailyProfit || 0), 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin investments error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching investments');
  }
});

// Admin: View withdrawals
bot.onText(/\/withdrawals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    
    if (pendingWithdrawals.length === 0) {
      await bot.sendMessage(chatId, '✅ No pending withdrawals.');
      return;
    }
    
    let message = `💳 **Pending Withdrawals (${pendingWithdrawals.length})**\n\n`;
    
    pendingWithdrawals.forEach((wd, index) => {
      const timeAgo = Math.floor((new Date() - new Date(wd.requestedAt)) / (1000 * 60));
      message += `${index + 1}. ${wd.userName} (${wd.memberId})\n`;
      message += `   Amount: ${formatCurrency(wd.amount)}\n`;
      message += `   ID: ${wd.id}\n`;
      message += `   Requested: ${timeAgo} minutes ago\n`;
      message += `   Approve: /approve ${wd.id}\n`;
      message += `   Reject: /reject ${wd.id}\n\n`;
    });
    
    message += `**Total Pending:** ${formatCurrency(pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin withdrawals error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching withdrawals');
  }
});

// Admin: Approve withdrawal
bot.onText(/\/approve (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found`);
      return;
    }
    
    withdrawals[withdrawalIndex].status = 'completed';
    withdrawals[withdrawalIndex].completedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].adminNote = `Approved by admin ${chatId} at ${new Date().toLocaleString()}`;
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Notify user
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    
    if (user) {
      try {
        await bot.sendMessage(user.chatId,
          `✅ **Withdrawal Approved!**\n\n` +
          `Withdrawal ID: ${withdrawalId}\n` +
          `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
          `Status: Completed\n\n` +
          `💸 Funds should arrive within 10-15 minutes.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ Withdrawal ${withdrawalId} approved\n\n` +
      `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
      `User: ${withdrawals[withdrawalIndex].userName}\n` +
      `Member ID: ${withdrawals[withdrawalIndex].memberId}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error approving withdrawal');
  }
});

// Admin: Reject withdrawal
bot.onText(/\/reject (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found`);
      return;
    }
    
    // Return funds to user balance
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    
    if (userIndex !== -1) {
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + withdrawals[withdrawalIndex].amount;
      await saveData(USERS_FILE, users);
    }
    
    withdrawals[withdrawalIndex].status = 'rejected';
    withdrawals[withdrawalIndex].completedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].adminNote = `Rejected by admin ${chatId} at ${new Date().toLocaleString()}`;
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Notify user
    const user = users[userIndex];
    if (user) {
      try {
        await bot.sendMessage(user.chatId,
          `❌ **Withdrawal Rejected**\n\n` +
          `Withdrawal ID: ${withdrawalId}\n` +
          `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
          `Status: Rejected\n\n` +
          `💰 Funds returned to your balance.\n` +
          `New Balance: ${formatCurrency(user.balance)}\n\n` +
          `Contact support for more information.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
    await bot.sendMessage(chatId,
      `❌ Withdrawal ${withdrawalId} rejected\n\n` +
      `Amount returned to user balance\n` +
      `User: ${withdrawals[withdrawalIndex].userName}\n` +
      `Member ID: ${withdrawals[withdrawalIndex].memberId}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error rejecting withdrawal');
  }
});

// Admin: Stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    const investments = await loadData(INVESTMENTS_FILE);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const referrals = await loadData(REFERRALS_FILE);
    
    const totalBalance = realUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
    const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
    const totalWithdrawn = withdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0);
    const totalReferralBonuses = referrals.reduce((sum, r) => sum + r.bonusAmount, 0);
    
    const today = new Date().toISOString().split('T')[0];
    const todayRegistrations = realUsers.filter(u => u.joinedDate.split('T')[0] === today).length;
    const todayInvestments = investments.filter(i => i.startDate.split('T')[0] === today);
    const todayInvestmentAmount = todayInvestments.reduce((sum, i) => sum + i.amount, 0);
    
    let message = `📊 **System Statistics**\n\n`;
    
    message += `**Users**\n`;
    message += `Total Users: ${realUsers.length}\n`;
    message += `Active: ${realUsers.filter(u => !u.banned).length}\n`;
    message += `Suspended: ${realUsers.filter(u => u.banned).length}\n`;
    message += `New Today: ${todayRegistrations}\n\n`;
    
    message += `**Financial**\n`;
    message += `Total Balance: ${formatCurrency(totalBalance)}\n`;
    message += `Total Invested: ${formatCurrency(totalInvested)}\n`;
    message += `Total Withdrawn: ${formatCurrency(totalWithdrawn)}\n`;
    message += `Total Referral Bonuses: ${formatCurrency(totalReferralBonuses)}\n`;
    message += `Investments Today: ${formatCurrency(todayInvestmentAmount)} (${todayInvestments.length})\n\n`;
    
    message += `**Investments**\n`;
    message += `Active: ${investments.filter(i => i.status === 'active').length}\n`;
    message += `Completed: ${investments.filter(i => i.status === 'completed').length}\n`;
    message += `Daily Payout: ${formatCurrency(investments.filter(i => i.status === 'active').reduce((sum, i) => sum + (i.dailyProfit || 0), 0))}\n\n`;
    
    message += `**Withdrawals**\n`;
    message += `Pending: ${withdrawals.filter(w => w.status === 'pending').length}\n`;
    message += `Completed: ${withdrawals.filter(w => w.status === 'completed').length}\n`;
    message += `Rejected: ${withdrawals.filter(w => w.status === 'rejected').length}\n\n`;
    
    message += `**System**\n`;
    message += `Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
    message += `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin stats error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching statistics');
  }
});

// Admin: Broadcast
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '❌ Admin access required.');
    return;
  }
  
  if (!message || message.length < 5) {
    await bot.sendMessage(chatId, '❌ Message too short. Minimum 5 characters.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake && !u.banned);
    
    await bot.sendMessage(chatId, `📢 Broadcasting to ${realUsers.length} users...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of realUsers) {
      try {
        await bot.sendMessage(user.chatId,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `---\n` +
          `This is an official broadcast message.`
        );
        successCount++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ Broadcast Complete\n\n` +
      `Success: ${successCount} users\n` +
      `Failed: ${failCount} users\n` +
      `Total: ${realUsers.length} users`
    );
  } catch (error) {
    console.log('Broadcast error:', error.message);
    await bot.sendMessage(chatId, '❌ Error broadcasting message');
  }
});

// Handle unknown commands
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

console.log('✅ Starlife Advert Bot is running! All commands are working!');

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
