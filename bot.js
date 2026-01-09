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
const MEDIA_FILES_FILE = 'media_files.json';

// Initialize storage
async function initStorage() {
  const files = [USERS_FILE, INVESTMENTS_FILE, WITHDRAWALS_FILE, REFERRALS_FILE, 
                FAKE_MEMBERS_FILE, TRANSACTIONS_FILE, SUPPORT_CHATS_FILE, 
                EARNINGS_VIEWS_FILE, MEDIA_FILES_FILE];
  
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

// Store media file reference
async function storeMediaFile(mediaData) {
  try {
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    mediaFiles.push(mediaData);
    await saveData(MEDIA_FILES_FILE, mediaFiles);
    return true;
  } catch (error) {
    console.log('❌ Error storing media:', error.message);
    return false;
  }
}

// Get media file by ID
async function getMediaFile(mediaId) {
  try {
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    return mediaFiles.find(media => media.id === mediaId);
  } catch (error) {
    console.log('❌ Error getting media:', error.message);
    return null;
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

// Send notification to user (works even if logged out - FIXED)
async function sendUserNotification(memberId, message) {
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId);
    
    if (!user) {
      console.log(`User ${memberId} not found`);
      return false;
    }
    
    // Check if user has chatId
    if (!user.chatId) {
      console.log(`User ${memberId} has no chatId`);
      return false;
    }
    
    // Check if user is logged out
    const isLoggedOut = loggedOutUsers.has(user.chatId);
    
    // Send message anyway - even if logged out
    try {
      await bot.sendMessage(user.chatId, message);
      
      // If user was logged out, update last notification time
      if (isLoggedOut) {
        const userIndex = users.findIndex(u => u.memberId === memberId);
        if (userIndex !== -1) {
          users[userIndex].lastNotification = new Date().toISOString();
          await saveData(USERS_FILE, users);
          
          console.log(`Message sent to logged out user ${memberId}`);
        }
      }
      
      return true;
    } catch (error) {
      console.log(`Could not send message to ${memberId}:`, error.message);
      
      // If it's a block/unavailable error, don't keep trying
      if (error.response && error.response.statusCode === 403) {
        console.log(`User ${memberId} has blocked the bot`);
        
        // Mark user as unavailable
        const userIndex = users.findIndex(u => u.memberId === memberId);
        if (userIndex !== -1) {
          users[userIndex].botBlocked = true;
          await saveData(USERS_FILE, users);
        }
      }
      
      return false;
    }
  } catch (error) {
    console.log('Error in sendUserNotification:', error.message);
    return false;
  }
}

// Store message for user who can't receive it now
async function storeOfflineMessage(memberId, message, type = 'admin_message') {
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) return false;
    
    // Initialize offlineMessages if not exists
    if (!users[userIndex].offlineMessages) {
      users[userIndex].offlineMessages = [];
    }
    
    // Store the message
    users[userIndex].offlineMessages.push({
      id: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    });
    
    // Keep only last 50 messages
    if (users[userIndex].offlineMessages.length > 50) {
      users[userIndex].offlineMessages = users[userIndex].offlineMessages.slice(-50);
    }
    
    await saveData(USERS_FILE, users);
    return true;
  } catch (error) {
    console.log('Error storing offline message:', error.message);
    return false;
  }
}

// Helper function to send direct message to user (UPDATED)
async function sendDirectMessageToUser(adminChatId, memberId, messageText) {
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId);
    
    if (!user) {
      await bot.sendMessage(adminChatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Check if user has blocked the bot
    if (user.botBlocked) {
      await bot.sendMessage(adminChatId,
        `❌ **User has blocked the bot**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `Cannot send message. User needs to unblock the bot first.`
      );
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
      // Store message for when user comes back online
      await storeOfflineMessage(memberId, 
        `📨 **Admin Message (Offline)**\n\n${messageText}\n\n💼 Management Team`,
        'admin_message'
      );
      
      await bot.sendMessage(adminChatId,
        `📨 **Message stored for offline user**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `User will see this message when they:\n` +
        `1. Login with /login\n` +
        `2. Or use /support\n\n` +
        `Message has been saved in their inbox.`
      );
    }
    
    // Record this message in support chats
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const adminMessageChat = {
      id: `ADMIN-MSG-${Date.now()}`,
      userId: memberId,
      userName: user.name,
      topic: 'Direct Admin Message',
      status: sent ? 'delivered' : 'stored_offline',
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

// Handle media files in support chats
async function handleSupportMedia(chatId, fileId, fileType, caption = '', session) {
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
      delete userSessions[chatId];
      return;
    }
    
    // Generate unique media ID
    const mediaId = `MEDIA-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Store media reference
    await storeMediaFile({
      id: mediaId,
      fileId: fileId,
      fileType: fileType,
      caption: caption,
      chatId: session.data.chatId,
      sender: session.data.memberId ? 'user' : 'anonymous',
      senderId: session.data.memberId || `chat_${chatId}`,
      timestamp: new Date().toISOString()
    });
    
    // Add media message to chat
    supportChats[chatIndex].messages.push({
      sender: session.data.memberId ? 'user' : 'anonymous',
      message: caption || `[${fileType.toUpperCase()} sent]`,
      mediaId: mediaId,
      fileType: fileType,
      timestamp: new Date().toISOString()
    });
    
    supportChats[chatIndex].updatedAt = new Date().toISOString();
    supportChats[chatIndex].adminReplied = false;
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    // Confirm to user
    await bot.sendMessage(chatId,
      `✅ **${fileType.charAt(0).toUpperCase() + fileType.slice(1)} sent to support!**\n\n` +
      `Your file has been received.\n` +
      `Support team will review it shortly.\n\n` +
      `Continue typing or send more files.`
    );
    
    // Notify admins about media
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      const chat = supportChats[chatIndex];
      const userName = chat.userName || 'Unknown User';
      const userId = chat.userId || 'Anonymous';
      
      const adminMessage = `📎 **New Media in Support Chat**\n\n` +
                          `Chat ID: ${session.data.chatId}\n` +
                          `User: ${userName} (${userId})\n` +
                          `File Type: ${fileType.toUpperCase()}\n` +
                          `Caption: ${caption || 'No caption'}\n\n` +
                          `**Reply:** /replychat ${session.data.chatId} your_message\n` +
                          `**View Chat:** /viewchat ${session.data.chatId}`;
      
      for (const adminId of adminIds) {
        try {
          await bot.sendMessage(adminId, adminMessage);
        } catch (error) {
          console.log('Could not notify admin:', adminId);
        }
      }
    }
  } catch (error) {
    console.log('Error handling media:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending file. Please try again.');
  }
}

// Forward media to admin
async function forwardMediaToAdmin(adminChatId, mediaId) {
  try {
    const mediaFile = await getMediaFile(mediaId);
    if (!mediaFile) {
      await bot.sendMessage(adminChatId, '❌ Media file not found.');
      return false;
    }
    
    const fileId = mediaFile.fileId;
    const fileType = mediaFile.fileType;
    const caption = mediaFile.caption || '';
    
    // Forward based on file type
    switch(fileType) {
      case 'photo':
        await bot.sendPhoto(adminChatId, fileId, { caption: caption });
        break;
      case 'document':
        await bot.sendDocument(adminChatId, fileId, { caption: caption });
        break;
      case 'video':
        await bot.sendVideo(adminChatId, fileId, { caption: caption });
        break;
      default:
        await bot.sendMessage(adminChatId, `📎 Media file (${fileType}): ${caption || 'No caption'}`);
        break;
    }
    
    return true;
  } catch (error) {
    console.log('Error forwarding media:', error.message);
    await bot.sendMessage(adminChatId, `❌ Could not load media file: ${error.message}`);
    return false;
  }
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

// ==================== MEDIA HANDLERS ====================

// Handle photos in support chats
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle photos in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat')) {
    return;
  }
  
  try {
    // Get the best quality photo (last in array is highest quality)
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const caption = msg.caption || '';
    
    await handleSupportMedia(chatId, fileId, 'photo', caption, session);
  } catch (error) {
    console.log('Error handling photo:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending photo. Please try again.');
  }
});

// Handle documents in support chats
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle documents in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat')) {
    return;
  }
  
  try {
    const fileId = msg.document.file_id;
    const caption = msg.caption || '';
    const fileName = msg.document.file_name || 'document';
    
    await handleSupportMedia(chatId, fileId, 'document', `${fileName}\n${caption}`, session);
  } catch (error) {
    console.log('Error handling document:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending document. Please try again.');
  }
});

// Handle videos in support chats
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle videos in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat')) {
    return;
  }
  
  try {
    const fileId = msg.video.file_id;
    const caption = msg.caption || '';
    
    await handleSupportMedia(chatId, fileId, 'video', caption, session);
  } catch (error) {
    console.log('Error handling video:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending video. Please try again.');
  }
});

// Handle voice messages in support chats
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle voice in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat')) {
    return;
  }
  
  try {
    const fileId = msg.voice.file_id;
    
    await handleSupportMedia(chatId, fileId, 'voice', 'Voice message', session);
  } catch (error) {
    console.log('Error handling voice:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending voice message. Please try again.');
  }
});

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

// Logout command
bot.onText(/\/logout/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ You are not logged in.');
    return;
  }
  
  // Mark user as logged out
  loggedOutUsers.add(chatId.toString());
  
  // Clear any active session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged Out Successfully**\n\n` +
    `You have been logged out from ${user.name} (${user.memberId}).\n\n` +
    `To login again, use:\n` +
    `/login - If you remember your credentials\n` +
    `/support - If you need help logging in\n\n` +
    `Note: You can still use /support while logged out.`
  );
});

// Inbox command to view offline messages
bot.onText(/\/inbox/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === user.memberId);
  
  if (userIndex === -1) {
    await bot.sendMessage(chatId, '❌ User not found.');
    return;
  }
  
  if (!users[userIndex].offlineMessages || users[userIndex].offlineMessages.length === 0) {
    await bot.sendMessage(chatId, '📭 Your inbox is empty.');
    return;
  }
  
  const offlineMessages = users[userIndex].offlineMessages;
  const unreadMessages = offlineMessages.filter(msg => !msg.read);
  
  let message = `📬 **Your Inbox**\n\n`;
  message += `Total Messages: ${offlineMessages.length}\n`;
  message += `Unread Messages: ${unreadMessages.length}\n\n`;
  
  // Show last 5 messages
  const recentMessages = offlineMessages.slice(-5).reverse();
  
  recentMessages.forEach((msg, index) => {
    const date = new Date(msg.timestamp).toLocaleDateString();
    const readStatus = msg.read ? '✅ Read' : '🆕 Unread';
    const messagePreview = msg.message.length > 50 ? 
      msg.message.substring(0, 50) + '...' : msg.message;
    
    message += `${index + 1}. ${readStatus} (${date})\n`;
    message += `   ${messagePreview}\n\n`;
  });
  
  if (offlineMessages.length > 5) {
    message += `... and ${offlineMessages.length - 5} more messages\n\n`;
  }
  
  message += `**Commands:**\n`;
  message += `/readmsgs - Mark all as read\n`;
  message += `/clearmsgs - Clear all messages\n`;
  
  await bot.sendMessage(chatId, message);
  
  // Mark messages as read when user views inbox
  if (unreadMessages.length > 0) {
    users[userIndex].offlineMessages.forEach(msg => {
      msg.read = true;
    });
    await saveData(USERS_FILE, users);
  }
});

// Mark all messages as read
bot.onText(/\/readmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === user.memberId);
  
  if (userIndex !== -1 && users[userIndex].offlineMessages) {
    users[userIndex].offlineMessages.forEach(msg => {
      msg.read = true;
    });
    await saveData(USERS_FILE, users);
    await bot.sendMessage(chatId, '✅ All messages marked as read.');
  }
});

// Clear all messages
bot.onText(/\/clearmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const userIndex = users.findIndex(u => u.memberId === user.memberId);
  
  if (userIndex !== -1) {
    users[userIndex].offlineMessages = [];
    await saveData(USERS_FILE, users);
    await bot.sendMessage(chatId, '✅ All messages cleared.');
  }
});

// Enhanced support system that works for everyone
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
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
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
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
        `5️⃣ Payment Proof/Upload\n` +
        `6️⃣ Other\n\n` +
        `Reply with the number (1-6):`
      );
    }
  } else {
    // Universal support for everyone (logged out or no account)
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
      `**Reply with number (1-5):**\n\n` +
      `**Note:** You can send photos, documents, videos, or voice messages!`
    );
  }
});

// End support chat
bot.onText(/\/endsupport/, async (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions[chatId];
  if (session && (session.step === 'support_chat' || session.step === 'support_loggedout_chat' || session.step === 'universal_support_chat')) {
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

// Handle all text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if no text or if it's a command
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
        botBlocked: false,
        offlineMessages: []
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
                            `🔗 Your Code: ${user.referralCode}\n\n`;
      
      // Check for offline messages
      if (user.offlineMessages && user.offlineMessages.length > 0) {
        const unreadMessages = user.offlineMessages.filter(msg => !msg.read);
        
        if (unreadMessages.length > 0) {
          welcomeMessage += `📬 **You have ${unreadMessages.length} unread message(s)**\n`;
          welcomeMessage += `Use /inbox to view your messages\n\n`;
        }
      }
      
      welcomeMessage += `📋 **Quick Commands:**\n` +
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
    
    // Handle universal support
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
      
      const extraInstructions = choice === 5 ? 
        '\n**You can send payment proof as:**\n• Photo (screenshot)\n• Document (PDF receipt)\n• Video (screen recording)\n\n' : '';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${session.data.topic}\n\n` +
        `Please describe your issue in detail:${extraInstructions}\n\n` +
        `**Include these if relevant:**\n` +
        `• Member ID (if you have one)\n` +
        `• Your name\n` +
        `• Email address\n` +
        `• Screenshot details\n\n` +
        `Type your message below:\n` +
        `(You can also send photos/documents directly)`
      );
    }
    else if (session.step === 'universal_support_message') {
      // Create support chat for user without account
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      
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
      
      supportChats.push(newChat);
      await saveData(SUPPORT_CHATS_FILE, supportChats);
      
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
      
      // Notify admins
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
      // Handle text messages from users without accounts
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
        const chat = supportChats[chatIndex];
        const adminMessage = `💬 **No Account User Message**\n\n` +
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
    
    // Handle regular support topics
    else if (session.step === 'support_topic') {
      const topicNumber = parseInt(text);
      const topics = [
        'Account Issues',
        'Investment Problems',
        'Withdrawal Help',
        'Referral Issues',
        'Payment Proof/Upload',
        'Other'
      ];
      
      if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 6) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-6:');
        return;
      }
      
      const topic = topics[topicNumber - 1];
      session.data.topic = topic;
      session.step = 'support_message';
      
      const extraInstructions = topicNumber === 5 ? 
        '\n**You can send payment proof as:**\n• Photo (M-Pesa screenshot)\n• Document (bank statement)\n• Video (screen recording)\n\n' : '';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${topic}\n\n` +
        `Please describe your issue in detail:${extraInstructions}\n` +
        `Type your message below:\n` +
        `(You can also send photos/documents directly)`
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
      // Handle text messages in active support chats
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

// ==================== ADMIN COMMANDS WITH MEDIA SUPPORT ====================

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
                      `/viewmedia CHAT_ID - View media in chat\n` +
                      `/replychat CHAT_ID MESSAGE - Reply to chat\n` +
                      `/closechat CHAT_ID - Close chat\n\n` +
                      `📢 **Broadcast:**\n` +
                      `/broadcast MESSAGE - Send to all users`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// View media in support chat
bot.onText(/\/viewmedia (.+)/, async (msg, match) => {
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
    
    // Find media files in this chat
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    const chatMedia = mediaFiles.filter(media => media.chatId === supportChatId);
    
    if (chatMedia.length === 0) {
      await bot.sendMessage(chatId, `📭 No media files in chat ${supportChatId}.`);
      return;
    }
    
    let message = `📎 **Media Files in Chat: ${supportChatId}**\n\n`;
    message += `Total Media Files: ${chatMedia.length}\n\n`;
    
    // Group by type
    const photos = chatMedia.filter(m => m.fileType === 'photo');
    const documents = chatMedia.filter(m => m.fileType === 'document');
    const videos = chatMedia.filter(m => m.fileType === 'video');
    const voices = chatMedia.filter(m => m.fileType === 'voice');
    
    if (photos.length > 0) {
      message += `📸 **Photos:** ${photos.length}\n`;
      photos.slice(0, 3).forEach((photo, index) => {
        const time = new Date(photo.timestamp).toLocaleString();
        message += `${index + 1}. ${photo.caption || 'No caption'} (${time})\n`;
      });
      if (photos.length > 3) message += `... and ${photos.length - 3} more photos\n`;
      message += `\n`;
    }
    
    if (documents.length > 0) {
      message += `📄 **Documents:** ${documents.length}\n`;
      documents.slice(0, 3).forEach((doc, index) => {
        const time = new Date(doc.timestamp).toLocaleString();
        message += `${index + 1}. ${doc.caption || 'No caption'} (${time})\n`;
      });
      if (documents.length > 3) message += `... and ${documents.length - 3} more documents\n`;
      message += `\n`;
    }
    
    if (videos.length > 0) {
      message += `🎥 **Videos:** ${videos.length}\n`;
      videos.slice(0, 3).forEach((video, index) => {
        const time = new Date(video.timestamp).toLocaleString();
        message += `${index + 1}. ${video.caption || 'No caption'} (${time})\n`;
      });
      if (videos.length > 3) message += `... and ${videos.length - 3} more videos\n`;
      message += `\n`;
    }
    
    if (voices.length > 0) {
      message += `🎤 **Voice Messages:** ${voices.length}\n`;
      voices.slice(0, 3).forEach((voice, index) => {
        const time = new Date(voice.timestamp).toLocaleString();
        message += `${index + 1}. Voice message (${time})\n`;
      });
      if (voices.length > 3) message += `... and ${voices.length - 3} more voice messages\n`;
      message += `\n`;
    }
    
    message += `**To view a specific media file, forward it to users or check the chat history.**\n`;
    message += `**View Chat:** /viewchat ${supportChatId}`;
    
    await bot.sendMessage(chatId, message);
    
    // Send first photo if exists (as preview)
    if (photos.length > 0) {
      try {
        const firstPhoto = photos[0];
        await bot.sendPhoto(chatId, firstPhoto.fileId, {
          caption: `Preview: ${firstPhoto.caption || 'Photo from support chat'}`
        });
      } catch (error) {
        console.log('Could not send photo preview:', error.message);
      }
    }
    
  } catch (error) {
    console.log('Error in /viewmedia:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading media files.');
  }
});

// Updated viewchat command to include media info
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
    const noAccount = chat.noAccount || false;
    const userName = chat.userName || 'Unknown User';
    const userId = chat.userId || 'Unknown ID';
    
    // Count media in chat
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    const chatMedia = mediaFiles.filter(media => media.chatId === supportChatId);
    const mediaCount = chatMedia.length;
    
    let message = `💬 **Support Chat Details**\n\n`;
    message += `🆔 Chat ID: ${chat.id}\n`;
    message += `👤 User: ${userName}\n`;
    message += `🔑 User ID: ${userId}\n`;
    message += `📝 Topic: ${chat.topic}\n`;
    message += `📊 Status: ${chat.status === 'active' ? '🟢 Active' : '🔴 Closed'}\n`;
    message += `🚪 Logged Out: ${isLoggedOut ? 'Yes' : 'No'}\n`;
    message += `🚫 No Account: ${noAccount ? 'Yes' : 'No'}\n`;
    message += `📎 Media Files: ${mediaCount}\n`;
    message += `📅 Created: ${new Date(chat.createdAt).toLocaleString()}\n`;
    message += `🕒 Updated: ${new Date(chat.updatedAt).toLocaleString()}\n`;
    message += `💬 Messages: ${chat.messages ? chat.messages.length : 0}\n\n`;
    
    if (chat.messages && chat.messages.length > 0) {
      message += `**Recent Chat History:**\n\n`;
      
      // Show last 10 messages
      const recentMessages = chat.messages.slice(-10);
      
      recentMessages.forEach((msg, index) => {
        const sender = msg.sender === 'admin' ? '👨‍💼 Admin' : '👤 User';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const hasMedia = msg.mediaId ? ' 📎' : '';
        
        message += `${recentMessages.length - 9 + index}. ${sender}${hasMedia} (${time}):\n`;
        
        if (msg.mediaId) {
          const mediaType = msg.fileType || 'file';
          message += `   [${mediaType.toUpperCase()}] ${msg.message}\n\n`;
        } else {
          message += `   "${msg.message}"\n\n`;
        }
      });
    } else {
      message += `No messages in this chat.\n\n`;
    }
    
    message += `**Actions:**\n`;
    if (chat.status === 'active') {
      message += `💭 Reply: /replychat ${chat.id} message\n`;
      message += `📎 View Media: /viewmedia ${chat.id}\n`;
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
    
    // Show media files if any
    if (mediaCount > 0) {
      const recentMedia = chatMedia.slice(-3).reverse(); // Show 3 most recent
      
      for (const media of recentMedia) {
        try {
          const mediaInfo = `Media from ${new Date(media.timestamp).toLocaleString()}\nCaption: ${media.caption || 'No caption'}`;
          
          switch(media.fileType) {
            case 'photo':
              await bot.sendPhoto(chatId, media.fileId, { caption: mediaInfo });
              break;
            case 'document':
              await bot.sendDocument(chatId, media.fileId, { caption: mediaInfo });
              break;
            case 'video':
              await bot.sendVideo(chatId, media.fileId, { caption: mediaInfo });
              break;
            case 'voice':
              await bot.sendVoice(chatId, media.fileId, { caption: mediaInfo });
              break;
          }
        } catch (error) {
          console.log(`Could not forward media ${media.id}:`, error.message);
          await bot.sendMessage(chatId, `❌ Could not load ${media.fileType}: ${media.caption || 'No caption'}`);
        }
      }
      
      if (mediaCount > 3) {
        await bot.sendMessage(chatId, `📎 ... and ${mediaCount - 3} more media files in this chat.`);
      }
    }
  } catch (error) {
    console.log('Error in /viewchat:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading chat details.');
  }
});

// ==================== OTHER ADMIN COMMANDS ====================

// Stats command with media stats
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
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    
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
    const offlineUsers = users.filter(u => u.chatId && loggedOutUsers.has(u.chatId)).length;
    const blockedUsers = users.filter(u => u.botBlocked).length;
    
    // Media stats
    const photoCount = mediaFiles.filter(m => m.fileType === 'photo').length;
    const documentCount = mediaFiles.filter(m => m.fileType === 'document').length;
    const videoCount = mediaFiles.filter(m => m.fileType === 'video').length;
    const voiceCount = mediaFiles.filter(m => m.fileType === 'voice').length;
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${users.length}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Banned Users: ${users.length - activeUsers}\n` +
                        `• Logged Out: ${offlineUsers}\n` +
                        `• Blocked Bot: ${blockedUsers}\n` +
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
                        `• Total Chats: ${supportChats.length}\n` +
                        `• Media Files: ${mediaFiles.length}\n` +
                        `  📸 Photos: ${photoCount}\n` +
                        `  📄 Documents: ${documentCount}\n` +
                        `  🎥 Videos: ${videoCount}\n` +
                        `  🎤 Voice: ${voiceCount}`;
    
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

console.log('✅ Starlife Advert Bot is running! All features enabled with MEDIA SUPPORT!');
