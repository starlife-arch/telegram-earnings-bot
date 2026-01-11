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

// Calculate referral bonus (10% of referred user's FIRST investment)
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

// Get user by email
async function getUserByEmail(email) {
  const users = await loadData(USERS_FILE);
  return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
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
        
        investment.totalProfit = (parseFloat(investment.totalProfit) || 0) + dailyProfit;
        
        // Removed 30-day completion check - investments now continue indefinitely
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
  
  // Handle investment proof photos
  if (session && session.step === 'awaiting_investment_proof') {
    try {
      // Get the best quality photo (last in array is highest quality)
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || '';
      
      // Store investment with pending status
      const investments = await loadData(INVESTMENTS_FILE);
      const investmentId = `INV-${Date.now()}`;
      
      const investment = {
        id: investmentId,
        memberId: session.data.memberId,
        amount: session.data.amount,
        paymentMethod: session.data.paymentMethod,
        transactionHash: session.data.transactionHash || '',
        status: 'pending', // Changed from 'active' to 'pending'
        date: new Date().toISOString(),
        daysActive: 0,
        totalProfit: 0,
        proofMediaId: `MEDIA-${Date.now()}`,
        proofCaption: caption || `Payment proof for $${session.data.amount}`
      };
      
      investments.push(investment);
      await saveData(INVESTMENTS_FILE, investments);
      
      // Store media file
      await storeMediaFile({
        id: `MEDIA-${Date.now()}`,
        fileId: fileId,
        fileType: 'photo',
        caption: `Payment proof for ${formatCurrency(session.data.amount)} (Method: ${session.data.paymentMethod})`,
        investmentId: investmentId,
        sender: session.data.memberId,
        timestamp: new Date().toISOString()
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
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const users = await loadData(USERS_FILE);
        const user = users.find(u => u.memberId === session.data.memberId);
        
        const adminMessage = `📈 **New Investment Request**\n\n` +
                            `Investment ID: ${investmentId}\n` +
                            `User: ${user.name} (${session.data.memberId})\n` +
                            `Amount: ${formatCurrency(session.data.amount)}\n` +
                            `Payment Method: ${session.data.paymentMethod}\n` +
                            `Transaction Hash: ${session.data.transactionHash || 'N/A'}\n` +
                            `Date: ${new Date().toLocaleString()}\n\n` +
                            `**Approve:** /approveinvestment ${investmentId}\n` +
                            `**Reject:** /rejectinvestment ${investmentId}\n\n` +
                            `**View Proof:** /viewproof ${investmentId}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
      
      return;
    } catch (error) {
      console.log('Error handling investment photo:', error.message);
      await bot.sendMessage(chatId, '❌ Error sending payment proof. Please try again.');
    }
  }
  
  // Only handle photos in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
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
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
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
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
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
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
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
      
      user.lastLogin = new Date().toISOString();
      await saveData(USERS_FILE, users);
      
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
                            `/logout - Logout\n\n` +
                            `💳 **Payment Methods:**\n` +
                            `• M-Pesa Till: 6034186\n` +
                            `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                            `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                            `• PayPal: dave@starlifeadvert.com\n` +
                            `Name: Starlife Advert US Agency`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
  }
  
  // User is not logged in - show public welcome
  const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
  const recentSuccess = fakeMembers.slice(0, 3);
  
  let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
  recentSuccess.forEach(member => {
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
  fakeMessage += '/support - Get help\n\n';
  fakeMessage += '💳 **Payment Methods:**\n';
  fakeMessage += '• M-Pesa Till: 6034186\n';
  fakeMessage += '• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n';
  fakeMessage += '• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n';
  fakeMessage += '• PayPal: dave@starlifeadvert.com\n';
  fakeMessage += 'Name: Starlife Advert US Agency';
  
  await bot.sendMessage(chatId, fakeMessage);
});

// Forgot Password command - NEW
bot.onText(/\/forgotpassword/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /profile to see your account details.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'forgot_password_method',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Password Recovery**\n\n` +
    `Select how you want to recover your password:\n\n` +
    `1️⃣ **By Member ID**\n` +
    `   - Enter your Member ID\n` +
    `   - We'll send new password to your registered chat\n\n` +
    `2️⃣ **By Email**\n` +
    `   - Enter your registered email\n` +
    `   - We'll send new password to your registered chat\n\n` +
    `3️⃣ **Contact Support**\n` +
    `   - If you don't remember either\n\n` +
    `Reply with number (1-3):`
  );
});

// Help command - NEW
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  const user = isLoggedIn ? await getLoggedInUser(chatId) : null;
  
  let helpMessage = `🆘 **Starlife Advert Help Center**\n\n`;
  
  if (isLoggedIn && user) {
    helpMessage += `👋 Welcome ${user.name}!\n\n`;
    helpMessage += `**📊 Account Commands:**\n`;
    helpMessage += `/profile - View your account details\n`;
    helpMessage += `/earnings - View your earnings\n`;
    helpMessage += `/transactions - View transaction history\n`;
    helpMessage += `/referral - View referral program (FIRST investment only)\n`;
    helpMessage += `/logout - Logout from account\n\n`;
    
    helpMessage += `**💰 Financial Commands:**\n`;
    helpMessage += `/invest - Make new investment\n`;
    helpMessage += `/withdraw - Withdraw funds\n`;
    helpMessage += `/viewearnings USER-ID - View others earnings ($1 fee)\n\n`;
    
    helpMessage += `**🆘 Support Commands:**\n`;
    helpMessage += `/support - Contact support team\n`;
    helpMessage += `/appeal - Submit appeal (if suspended)\n`;
    helpMessage += `/inbox - View offline messages\n\n`;
    
    helpMessage += `**🔐 Account Security:**\n`;
    helpMessage += `/forgotpassword - Reset your password\n\n`;
    
    helpMessage += `**💡 Quick Start:**\n`;
    helpMessage += `/investnow - Quick investment guide\n`;
  } else {
    helpMessage += `**Welcome! Here are available commands:**\n\n`;
    helpMessage += `**👤 Account Commands:**\n`;
    helpMessage += `/register - Create new account\n`;
    helpMessage += `/login - Login to existing account\n`;
    helpMessage += `/forgotpassword - Reset your password\n\n`;
    
    helpMessage += `**💡 Information Commands:**\n`;
    helpMessage += `/investnow - Quick start guide\n`;
    helpMessage += `/support - Contact support\n\n`;
    
    helpMessage += `**📊 After Registration:**\n`;
    helpMessage += `• Use /invest to start earning\n`;
    helpMessage += `• Earn 2% daily profit (LIFETIME)\n`;
    helpMessage += `• Get 10% from referrals (FIRST investment only)\n`;
    helpMessage += `• Fast withdrawals (10-15 min)\n\n`;
  }
  
  helpMessage += `**💳 Payment Methods:**\n`;
  helpMessage += `• M-Pesa Till: 6034186\n`;
  helpMessage += `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n`;
  helpMessage += `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n`;
  helpMessage += `• PayPal: dave@starlifeadvert.com\n`;
  helpMessage += `Name: Starlife Advert US Agency\n\n`;
  helpMessage += `**❓ Need Help?**\n`;
  helpMessage += `Use /support for immediate assistance`;
  
  await bot.sendMessage(chatId, helpMessage);
});

// Transactions command - NEW
bot.onText(/\/transactions/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  try {
    const transactions = await loadData(TRANSACTIONS_FILE);
    const userTransactions = transactions.filter(t => t.memberId === user.memberId);
    
    if (userTransactions.length === 0) {
      await bot.sendMessage(chatId, '📭 No transactions found.');
      return;
    }
    
    // Sort by date (newest first)
    userTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let message = `📊 **Transaction History**\n\n`;
    message += `Total Transactions: ${userTransactions.length}\n\n`;
    
    // Show last 10 transactions
    const recentTransactions = userTransactions.slice(0, 10);
    
    recentTransactions.forEach((tx, index) => {
      const date = new Date(tx.date).toLocaleDateString();
      const time = new Date(tx.date).toLocaleTimeString();
      const amount = parseFloat(tx.amount);
      const sign = amount >= 0 ? '+' : '';
      const type = tx.type === 'daily_profit' ? '💰 Daily Profit' :
                   tx.type === 'withdrawal' ? '💳 Withdrawal' :
                   tx.type === 'referral_bonus' ? '👥 Referral Bonus' :
                   tx.type === 'view_earnings_fee' ? '👀 Earnings View' :
                   tx.type === 'registration' ? '📝 Registration' :
                   tx.type === 'admin_add_balance' ? '👑 Admin Add' :
                   tx.type === 'admin_deduct_balance' ? '👑 Admin Deduct' :
                   tx.type === 'manual_investment' ? '📈 Manual Investment' :
                   tx.type;
      
      message += `${index + 1}. **${type}**\n`;
      message += `   Amount: ${sign}${formatCurrency(amount)}\n`;
      message += `   Date: ${date} ${time}\n`;
      if (tx.description) {
        message += `   Note: ${tx.description}\n`;
      }
      message += `\n`;
    });
    
    if (userTransactions.length > 10) {
      message += `... and ${userTransactions.length - 10} more transactions\n`;
      message += `Use /support to request full transaction history\n`;
    }
    
    // Calculate totals
    const totalDeposits = userTransactions
      .filter(t => t.amount > 0 && t.type !== 'daily_profit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalWithdrawals = userTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const totalProfits = userTransactions
      .filter(t => t.type === 'daily_profit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    message += `\n**📈 Summary:**\n`;
    message += `Total Deposits: ${formatCurrency(totalDeposits)}\n`;
    message += `Total Withdrawals: ${formatCurrency(totalWithdrawals)}\n`;
    message += `Total Profits: ${formatCurrency(totalProfits)}\n`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /transactions:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading transactions.');
  }
});

// Investnow command - NEW
bot.onText(/\/investnow/, async (msg) => {
  const chatId = msg.chat.id;
  
  const guideMessage = `🚀 **Quick Start Investment Guide**\n\n` +
                      `**Step 1: Create Account**\n` +
                      `Use /register to create your account\n` +
                      `Save your Member ID and Password!\n\n` +
                      `**Step 2: Make Payment**\n` +
                      `Choose your preferred payment method:\n\n` +
                      `💳 **M-Pesa:**\n` +
                      `Till: 6034186\n` +
                      `Name: Starlife Advert US Agency\n\n` +
                      `💳 **USDT Tether (BEP20) - RECOMMENDED:**\n` +
                      `Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                      `📌 Send only USDT (BEP20)\n\n` +
                      `💳 **USDT TRON (TRC20):**\n` +
                      `Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                      `📌 Send only USDT (TRC20)\n\n` +
                      `💳 **PayPal:**\n` +
                      `Email: dave@starlifeadvert.com\n\n` +
                      `**Step 3: Invest**\n` +
                      `Use /invest to start investment\n` +
                      `Minimum: $10 | Maximum: $800,000\n` +
                      `Send payment proof screenshot\n\n` +
                      `**Step 4: Earn Daily (LIFETIME)**\n` +
                      `✅ 2% daily profit FOREVER\n` +
                      `✅ No time limit\n` +
                      `✅ Automatic daily earnings\n\n` +
                      `**Step 5: Refer & Earn**\n` +
                      `Share your referral code\n` +
                      `Earn 10% of referrals' FIRST investment only\n\n` +
                      `**Step 6: Withdraw**\n` +
                      `Minimum withdrawal: $2\n` +
                      `Processing time: 10-15 minutes\n` +
                      `Fee: 5% (industry standard)\n\n` +
                      `**Ready to Start?**\n` +
                      `▶️ /register - Create account\n` +
                      `▶️ /login - If you have account\n` +
                      `▶️ /invest - Start investing\n\n` +
                      `**Need Help?**\n` +
                      `/support - 24/7 support available`;
  
  await bot.sendMessage(chatId, guideMessage);
});

// Change Password command - NEW
bot.onText(/\/changepassword/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  userSessions[chatId] = {
    step: 'change_password_current',
    data: {
      memberId: user.memberId
    }
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Change Password**\n\n` +
    `For security, please enter your current password:`
  );
});

// Invest command - UPDATED WITH PAYMENT METHODS
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
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

// Earnings command - View YOUR OWN earnings
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const investments = await loadData(INVESTMENTS_FILE);
  const userInvestments = investments.filter(inv => inv.memberId === user.memberId);
  
  let message = `📈 **Your Earnings**\n\n`;
  message += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `📊 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
  message += `💵 Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  message += `👥 Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  
  if (userInvestments.length > 0) {
    message += `**Active Investments:**\n`;
    userInvestments.filter(inv => inv.status === 'active').forEach(inv => {
      const dailyProfit = calculateDailyProfit(inv.amount);
      message += `• ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
    });
  } else {
    message += `No active investments.\n`;
    message += `Use /invest to start earning!\n`;
  }
  
  await bot.sendMessage(chatId, message);
});

// View earnings of another user (paid feature - $1)
bot.onText(/\/viewearnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetMemberId = match[1].toUpperCase();
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  // Check if user is trying to view their own earnings (should use /earnings instead)
  if (targetMemberId === user.memberId) {
    await bot.sendMessage(chatId, 
      `ℹ️ To view your own earnings, use /earnings command instead.\n` +
      `/viewearnings is for viewing other users' earnings (with $1 fee).`
    );
    return;
  }
  
  // Check if user has enough balance ($1 fee)
  const fee = 1.00;
  if ((user.balance || 0) < fee) {
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Fee to view earnings: ${formatCurrency(fee)}\n` +
      `Your balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Please add funds to use this feature.`
    );
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const targetUser = users.find(u => u.memberId === targetMemberId);
    
    if (!targetUser) {
      await bot.sendMessage(chatId, `❌ User ${targetMemberId} not found.`);
      return;
    }
    
    // Deduct fee from user
    const userIndex = users.findIndex(u => u.memberId === user.memberId);
    users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) - fee;
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `VIEW-EARN-${Date.now()}`,
      memberId: user.memberId,
      type: 'view_earnings_fee',
      amount: -fee,
      description: `Fee to view ${targetMemberId}'s earnings`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    // Record earnings view
    const earningsViews = await loadData(EARNINGS_VIEWS_FILE);
    earningsViews.push({
      id: `VIEW-${Date.now()}`,
      viewerId: user.memberId,
      viewedId: targetMemberId,
      fee: fee,
      date: new Date().toISOString()
    });
    await saveData(EARNINGS_VIEWS_FILE, earningsViews);
    
    // Get target user's investments
    const investments = await loadData(INVESTMENTS_FILE);
    const targetInvestments = investments.filter(inv => inv.memberId === targetMemberId);
    const activeInvestments = targetInvestments.filter(inv => inv.status === 'active');
    
    let message = `👤 **Earnings Report for ${targetUser.name} (${targetMemberId})**\n\n`;
    message += `💰 Balance: ${formatCurrency(targetUser.balance || 0)}\n`;
    message += `📊 Total Earned: ${formatCurrency(targetUser.totalEarned || 0)}\n`;
    message += `💵 Total Invested: ${formatCurrency(targetUser.totalInvested || 0)}\n`;
    message += `👥 Referral Earnings: ${formatCurrency(targetUser.referralEarnings || 0)}\n`;
    message += `📈 Active Investments: ${activeInvestments.length}\n`;
    message += `👥 Total Referrals: ${targetUser.referrals || 0}\n\n`;
    
    if (activeInvestments.length > 0) {
      message += `**Active Investments:**\n`;
      activeInvestments.forEach((inv, index) => {
        const dailyProfit = calculateDailyProfit(inv.amount);
        message += `${index + 1}. ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
      });
    }
    
    message += `\n---\n`;
    message += `Fee paid: ${formatCurrency(fee)}\n`;
    message += `Your new balance: ${formatCurrency(users[userIndex].balance)}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /viewearnings:', error.message);
    await bot.sendMessage(chatId, '❌ Error viewing earnings.');
  }
});

// Profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(r => r.referrerId === user.memberId);
  const successfulReferrals = userReferrals.filter(r => r.status === 'paid');
  
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
  message += `**Account Security**\n`;
  message += `/changepassword - Change password\n`;
  message += `/forgotpassword - Reset password\n\n`;
  message += `**Share your code:** ${user.referralCode}\n`;
  message += `Tell friends to use: /register ${user.referralCode}`;
  
  await bot.sendMessage(chatId, message);
});

// Referral command
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(r => r.referrerId === user.memberId);
  
  let message = `👥 **Referral Program**\n\n`;
  message += `**Earn 10% commission on your referrals' FIRST investment only!**\n\n`;
  message += `Your Referral Code: **${user.referralCode}**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Total Earned from Referrals: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  message += `**How it works:**\n`;
  message += `1. Share your referral code with friends\n`;
  message += `2. When they register using your code, they become your referral\n`;
  message += `3. When they make their FIRST investment, you get 10%\n`;
  message += `4. Their subsequent investments don't earn you bonuses\n\n`;
  message += `**How to share:**\n`;
  message += `Tell your friends to use the command:\n`;
  message += `/register ${user.referralCode}\n\n`;
  message += `**Your Referrals:**\n`;
  
  if (userReferrals.length > 0) {
    userReferrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅ Bonus Paid' : 
                    ref.status === 'pending' ? '⏳ Pending First Investment' : '❌ Failed';
      const bonus = ref.bonusAmount ? `- Bonus: ${formatCurrency(ref.bonusAmount)}` : '';
      message += `${index + 1}. ${ref.referredName} - ${status} ${bonus}\n`;
    });
  } else {
    message += `No referrals yet. Start sharing your code!`;
  }
  
  await bot.sendMessage(chatId, message);
});

// Withdraw command - UPDATED MINIMUM TO $2
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if ((user.balance || 0) < 2) { // Changed from 10 to 2
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Minimum withdrawal: $2\n` + // Updated message
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
    `Minimum Withdrawal: $2\n` + // Updated message
    `Withdrawal Fee: 5%\n\n` +
    `Enter amount to withdraw:`
  );
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
    `/forgotpassword - If you forgot password\n` +
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
        `Last message from support: "${activeChat.messages.slice(-1)[0]?.message || 'No messages yet'}"\n\n` +
        `Type /endsupport to end this chat`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
    
    // Start new support chat
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
  if (session && (session.step === 'support_chat' || session.step === 'support_loggedout_chat' || session.step === 'universal_support_chat' || session.step === 'appeal_chat')) {
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

// Appeal command for suspended users
bot.onText(/\/appeal/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const users = await loadData(USERS_FILE);
  const currentUser = users.find(u => u.memberId === user.memberId);
  
  if (!currentUser.banned) {
    await bot.sendMessage(chatId, '✅ Your account is not suspended. Use /support for other issues.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'appeal_message',
    data: {
      memberId: user.memberId,
      userName: user.name
    }
  };
  
  await bot.sendMessage(chatId,
    `📝 **Submit Appeal**\n\n` +
    `Your account has been suspended. You can submit an appeal here.\n\n` +
    `**Please include:**\n` +
    `1. Why you believe your account was wrongly suspended\n` +
    `2. Any evidence or screenshots\n` +
    `3. Your contact information\n\n` +
    `Type your appeal message below:\n` +
    `(You can also send photos/documents)`
  );
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
      registrationMessage += `Referrer earns 10% bonus on your FIRST investment only!\n\n`;
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
    // Handle forgot password method selection
    if (session.step === 'forgot_password_method') {
      const choice = parseInt(text);
      
      if (isNaN(choice) || choice < 1 || choice > 3) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-3:');
        return;
      }
      
      if (choice === 3) {
        // Contact support
        delete userSessions[chatId];
        await bot.sendMessage(chatId,
          `🆘 **Contact Support for Password Recovery**\n\n` +
          `Please use /support to contact our support team.\n` +
          `They will help you recover your account.\n\n` +
          `Make sure to provide:\n` +
          `• Your name\n` +
          `• Email address (if registered)\n` +
          `• Any other account details you remember`
        );
        return;
      }
      
      session.data.method = choice === 1 ? 'memberId' : 'email';
      session.step = choice === 1 ? 'forgot_password_memberid' : 'forgot_password_email';
      
      if (choice === 1) {
        await bot.sendMessage(chatId,
          `🔐 **Password Recovery by Member ID**\n\n` +
          `Enter your Member ID:\n` +
          `(Format: USER-123456)\n\n` +
          `A new password will be sent to your registered chat.`
        );
      } else {
        await bot.sendMessage(chatId,
          `📧 **Password Recovery by Email**\n\n` +
          `Enter your registered email address:\n\n` +
          `A new password will be sent to your registered chat.`
        );
      }
    }
    else if (session.step === 'forgot_password_memberid') {
      const memberId = text.trim().toUpperCase();
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === memberId);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Member ID not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 This account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // Generate new password
      const newPassword = generateRandomPassword(8);
      const userIndex = users.findIndex(u => u.memberId === memberId);
      users[userIndex].passwordHash = hashPassword(newPassword);
      
      await saveData(USERS_FILE, users);
      
      delete userSessions[chatId];
      
      // Send password to user's registered chat
      await sendUserNotification(memberId,
        `🔐 **Password Reset Successfully**\n\n` +
        `Your password has been reset via password recovery.\n\n` +
        `New Password: **${newPassword}**\n\n` +
        `**Login Details:**\n` +
        `Member ID: ${memberId}\n` +
        `Password: ${newPassword}\n\n` +
        `For security, change your password after logging in.\n` +
        `Use /changepassword to set a new password.`
      );
      
      await bot.sendMessage(chatId,
        `✅ **Password Reset Initiated**\n\n` +
        `A new password has been sent to the registered chat for ${memberId}.\n\n` +
        `If you don't receive it within 2 minutes:\n` +
        `1. Make sure you're using the correct Telegram account\n` +
        `2. Contact support with /support\n\n` +
        `**Security Note:**\n` +
        `Always use /changepassword after logging in to set your own password.`
      );
    }
    else if (session.step === 'forgot_password_email') {
      const email = text.trim().toLowerCase();
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.email && u.email.toLowerCase() === email);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Email not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 This account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // Generate new password
      const newPassword = generateRandomPassword(8);
      const userIndex = users.findIndex(u => u.email && u.email.toLowerCase() === email);
      users[userIndex].passwordHash = hashPassword(newPassword);
      
      await saveData(USERS_FILE, users);
      
      delete userSessions[chatId];
      
      // Send password to user's registered chat
      await sendUserNotification(user.memberId,
        `🔐 **Password Reset Successfully**\n\n` +
        `Your password has been reset via password recovery.\n\n` +
        `New Password: **${newPassword}**\n\n` +
        `**Login Details:**\n` +
        `Member ID: ${user.memberId}\n` +
        `Password: ${newPassword}\n\n` +
        `For security, change your password after logging in.\n` +
        `Use /changepassword to set a new password.`
      );
      
      await bot.sendMessage(chatId,
        `✅ **Password Reset Initiated**\n\n` +
        `A new password has been sent to the registered chat for ${user.memberId}.\n\n` +
        `If you don't receive it within 2 minutes:\n` +
        `1. Make sure you're using the correct Telegram account\n` +
        `2. Contact support with /support\n\n` +
        `**Security Note:**\n` +
        `Always use /changepassword after logging in to set your own password.`
      );
    }
    
    // Handle change password steps
    else if (session.step === 'change_password_current') {
      const currentPassword = text.trim();
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      
      if (userIndex === -1 || users[userIndex].passwordHash !== hashPassword(currentPassword)) {
        await bot.sendMessage(chatId, '❌ Current password is incorrect. Please try again:');
        return;
      }
      
      session.step = 'change_password_new';
      
      await bot.sendMessage(chatId,
        `✅ Current password verified.\n\n` +
        `Enter your new password:\n` +
        `• At least 6 characters\n` +
        `• Must include letters and numbers\n\n` +
        `Enter new password:`
      );
    }
    else if (session.step === 'change_password_new') {
      const newPassword = text.trim();
      
      if (newPassword.length < 6) {
        await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Please enter new password:');
        return;
      }
      
      if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        await bot.sendMessage(chatId, '❌ Password must include both letters and numbers. Please enter new password:');
        return;
      }
      
      session.data.newPassword = newPassword;
      session.step = 'change_password_confirm';
      
      await bot.sendMessage(chatId,
        `Confirm your new password:\n\n` +
        `Re-enter your new password:`
      );
    }
    else if (session.step === 'change_password_confirm') {
      const confirmPassword = text.trim();
      
      if (confirmPassword !== session.data.newPassword) {
        await bot.sendMessage(chatId, '❌ Passwords do not match. Please start again with /changepassword');
        delete userSessions[chatId];
        return;
      }
      
      // Update password in database
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      
      if (userIndex === -1) {
        await bot.sendMessage(chatId, '❌ User not found.');
        delete userSessions[chatId];
        return;
      }
      
      users[userIndex].passwordHash = hashPassword(session.data.newPassword);
      users[userIndex].lastPasswordChange = new Date().toISOString();
      
      await saveData(USERS_FILE, users);
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Password Changed Successfully!**\n\n` +
        `Your password has been updated.\n\n` +
        `**Security Tips:**\n` +
        `• Never share your password\n` +
        `• Use a strong, unique password\n` +
        `• Change password regularly\n\n` +
        `If you suspect any unauthorized access, contact support immediately.`
      );
    }
    
    // Handle registration steps
    else if (session.step === 'awaiting_name') {
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
                       `3. Earn 2% daily profit (LIFETIME)\n` +
                       `4. Share your referral code to earn 10% on FIRST investments!\n\n` +
                       `**Account Security:**\n` +
                       `/changepassword - Change password anytime\n` +
                       `/forgotpassword - Reset if forgotten\n\n` +
                       `**Payment Methods:**\n` +
                       `• M-Pesa Till: 6034186\n` +
                       `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                       `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                       `• PayPal: dave@starlifeadvert.com\n` +
                       `Name: Starlife Advert US Agency\n\n` +
                       `**Quick Commands:**\n` +
                       `/invest - Make investment\n` +
                       `/earnings - View YOUR earnings\n` +
                       `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                       `/transactions - View transaction history\n` +
                       `/referral - Share & earn 10% (FIRST investment only)\n` +
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
      
      let welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
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
                        `/earnings - View YOUR earnings\n` +
                        `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                        `/withdraw - Withdraw funds\n` +
                        `/transactions - View transaction history\n` +
                        `/referral - Share & earn 10% (FIRST investment only)\n` +
                        `/profile - Account details\n` +
                        `/changepassword - Change password\n` +
                        `/support - Contact support\n` +
                        `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
    }
    
    // Handle investment amount - UPDATED WITH PAYMENT METHODS
    else if (session.step === 'awaiting_investment_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10 || amount > 800000) { // Changed from 10000 to 800000
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $10\n` +
          `Maximum: $800,000\n\n` + // Updated message
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
      
      // Ask for transaction hash if crypto method
      if (method.includes('USDT')) {
        session.step = 'awaiting_transaction_hash';
        
        let network = method.includes('BEP20') ? 'BEP20' : 'TRC20';
        let wallet = method.includes('BEP20') ? 
          '0xa95bd74fae59521e8405e14b54b0d07795643812' : 
          'TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: ${method}\n\n` +
          `**Wallet Address (${network}):**\n` +
          `${wallet}\n\n` +
          `**Important:**\n` +
          `• Send only USDT (${network}) to this address\n` +
          `• Using a different network may result in permanent loss\n` +
          `• Keep your transaction hash (TXID) for verification\n\n` +
          `**After sending, please enter your transaction hash (TXID):**\n` +
          `Example: 0x1234abcd...`
        );
      } else if (method === 'PayPal') {
        session.step = 'awaiting_paypal_email';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: PayPal\n\n` +
          `**PayPal Email:**\n` +
          `dave@starlifeadvert.com\n\n` +
          `**Important:**\n` +
          `• Send payment to the email above\n` +
          `• Include your Member ID in the payment note\n\n` +
          `**Enter the email you used to send PayPal payment:**`
        );
      } else {
        // M-Pesa - no additional info needed
        session.step = 'awaiting_investment_proof';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: M-Pesa\n\n` +
          `**M-Pesa Details:**\n` +
          `Till: 6034186\n` +
          `Name: Starlife Advert US Agency\n\n` +
          `Now, please send a screenshot or photo of your payment proof (M-Pesa receipt).\n\n` +
          `You can send a photo or document.`
        );
      }
    }
    else if (session.step === 'awaiting_transaction_hash') {
      const transactionHash = text.trim();
      
      if (transactionHash.length < 10) {
        await bot.sendMessage(chatId, '❌ Invalid transaction hash. Please enter a valid TXID:');
        return;
      }
      
      session.data.transactionHash = transactionHash;
      session.step = 'awaiting_investment_proof';
      
      await bot.sendMessage(chatId,
        `✅ Transaction Hash: ${transactionHash.substring(0, 20)}...\n\n` +
        `Now, please send a screenshot or photo of your payment proof (transaction details).\n\n` +
        `You can send a photo or document.`
      );
    }
    else if (session.step === 'awaiting_paypal_email') {
      const paypalEmail = text.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(paypalEmail)) {
        await bot.sendMessage(chatId, '❌ Invalid email format. Please enter the email you used for PayPal payment:');
        return;
      }
      
      session.data.paypalEmail = paypalEmail;
      session.step = 'awaiting_investment_proof';
      
      await bot.sendMessage(chatId,
        `✅ PayPal Email: ${paypalEmail}\n\n` +
        `Now, please send a screenshot or photo of your payment proof (PayPal receipt).\n\n` +
        `You can send a photo or document.`
      );
    }
    
    // Handle withdrawal amount - UPDATED MINIMUM TO $2
    else if (session.step === 'awaiting_withdrawal_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 2 || amount > session.data.balance) { // Changed from 10 to 2
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $2\n` + // Updated message
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
                       `• Bank Name\n` +
                       `• SWIFT/BIC Code (if international)`;
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
      const users = await loadData(USERS_FILE);
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      
      if (userIndex === -1) {
        await bot.sendMessage(chatId, '❌ User not found.');
        delete userSessions[chatId];
        return;
      }
      
      // Deduct from balance
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) - session.data.withdrawalAmount;
      await saveData(USERS_FILE, users);
      
      // Create withdrawal request
      const withdrawals = await loadData(WITHDRAWALS_FILE);
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
        date: new Date().toISOString()
      };
      
      withdrawals.push(withdrawal);
      await saveData(WITHDRAWALS_FILE, withdrawals);
      
      // Record transaction
      const transactions = await loadData(TRANSACTIONS_FILE);
      transactions.push({
        id: `TRX-WDL-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'withdrawal',
        amount: -session.data.withdrawalAmount,
        description: `Withdrawal #${withdrawalId} (${session.data.method})`,
        date: new Date().toISOString()
      });
      await saveData(TRANSACTIONS_FILE, transactions);
      
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
        const users = await loadData(USERS_FILE);
        const user = users.find(u => u.memberId === session.data.memberId);
        
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
    
    // Handle appeal message
    else if (session.step === 'appeal_message') {
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      
      const chatIdStr = `APPEAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newChat = {
        id: chatIdStr,
        userId: session.data.memberId,
        userName: session.data.userName,
        topic: 'Account Suspension Appeal',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          sender: 'user',
          message: `[APPEAL] ${text}`,
          timestamp: new Date().toISOString()
        }],
        adminReplied: false,
        isAppeal: true
      };
      
      supportChats.push(newChat);
      await saveData(SUPPORT_CHATS_FILE, supportChats);
      
      session.step = 'appeal_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Appeal Submitted!**\n\n` +
        `Appeal ID: ${chatIdStr}\n\n` +
        `Our team will review your appeal within 24 hours.\n` +
        `You can continue sending additional information.\n\n` +
        `Type /endsupport to end appeal chat`
      );
      
      // Notify admins with URGENT priority
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🚨 **URGENT: New Appeal**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${session.data.userName} (${session.data.memberId})\n` +
                            `Type: Account Suspension Appeal\n` +
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
    else if (session.step === 'appeal_chat') {
      // Handle appeal chat messages
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const chatIndex = supportChats.findIndex(chat => chat.id === session.data.chatId);
      
      if (chatIndex === -1) {
        await bot.sendMessage(chatId, '❌ Appeal chat not found. Please start new appeal with /appeal');
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
        `✅ **Appeal message sent**\n\n` +
        `Our team will respond to your appeal shortly.\n\n` +
        `Type /endsupport to end appeal chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const chat = supportChats[chatIndex];
        const adminMessage = `💬 **New Appeal Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.userName} (${chat.userId})\n` +
                            `Type: Account Suspension Appeal\n` +
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
      
      // Check if user is banned to show different topics
      const users = await loadData(USERS_FILE);
      const user = users.find(u => u.memberId === session.data.memberId);
      const isBanned = user ? user.banned : false;
      
      if (isBanned) {
        // Banned user topics
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
        // Regular user topics
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
        
        const extraInstructions = topicNumber === 5 ? 
          '\n**You can send payment proof as:**\n• Photo (M-Pesa screenshot)\n• Document (bank statement)\n• Video (screen recording)\n\n' : '';
        
        await bot.sendMessage(chatId,
          `✅ Topic: ${topic}\n\n` +
          `Please describe your issue in detail:${extraInstructions}\n` +
          `Type your message below:\n` +
          `(You can also send photos/documents directly)`
        );
      }
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
                      `/approveinvestment INV_ID - Approve investment\n` +
                      `/rejectinvestment INV_ID - Reject investment\n` +
                      `/manualinv USER_ID AMOUNT - Add manual investment\n` +
                      `/deductinv USER_ID AMOUNT - Deduct investment amount\n` +
                      `/viewproof INV_ID - View payment proof\n\n` +
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

// View chat command
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
    const isAppeal = chat.isAppeal || false;
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
    message += `⚖️ Appeal: ${isAppeal ? 'Yes ⚠️ URGENT' : 'No'}\n`;
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
    const earningsViews = await loadData(EARNINGS_VIEWS_FILE);
    const transactions = await loadData(TRANSACTIONS_FILE);
    
    const totalBalance = users.reduce((sum, user) => sum + parseFloat(user.balance || 0), 0);
    const totalInvested = users.reduce((sum, user) => sum + parseFloat(user.totalInvested || 0), 0);
    const totalEarned = users.reduce((sum, user) => sum + parseFloat(user.totalEarned || 0), 0);
    const totalReferralEarnings = referrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
    const activeUsers = users.filter(u => !u.banned).length;
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingInvestments = investments.filter(i => i.status === 'pending').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const activeSupportChats = supportChats.filter(c => c.status === 'active').length;
    const paidReferrals = referrals.filter(ref => ref.status === 'paid').length;
    const totalWithdrawalFees = withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + (w.fee || 0), 0);
    const offlineUsers = users.filter(u => u.chatId && loggedOutUsers.has(u.chatId)).length;
    const blockedUsers = users.filter(u => u.botBlocked).length;
    const suspendedUsers = users.filter(u => u.banned).length;
    const totalEarningsViewFees = earningsViews.reduce((sum, view) => sum + (view.fee || 0), 0);
    
    // Media stats
    const photoCount = mediaFiles.filter(m => m.fileType === 'photo').length;
    const documentCount = mediaFiles.filter(m => m.fileType === 'document').length;
    const videoCount = mediaFiles.filter(m => m.fileType === 'video').length;
    const voiceCount = mediaFiles.filter(m => m.fileType === 'voice').length;
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${users.length}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Suspended Users: ${suspendedUsers}\n` +
                        `• Logged Out: ${offlineUsers}\n` +
                        `• Blocked Bot: ${blockedUsers}\n` +
                        `• Total Balance: ${formatCurrency(totalBalance)}\n\n` +
                        `**Investments:**\n` +
                        `• Total Investments: ${investments.length}\n` +
                        `• Active Investments: ${activeInvestments}\n` +
                        `• Pending Investments: ${pendingInvestments}\n` +
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
                        `**Earnings Views:**\n` +
                        `• Total Views: ${earningsViews.length}\n` +
                        `• Total Fees: ${formatCurrency(totalEarningsViewFees)}\n\n` +
                        `**Transactions:**\n` +
                        `• Total Transactions: ${transactions.length}\n\n` +
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

// ==================== FIXED MISSING COMMANDS ====================

// Users list
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    
    if (users.length === 0) {
      await bot.sendMessage(chatId, '📭 No users found.');
      return;
    }
    
    let message = `👥 **Total Users: ${users.length}**\n\n`;
    
    // Show last 10 users
    const recentUsers = users.slice(-10).reverse();
    
    recentUsers.forEach((user, index) => {
      const status = user.banned ? '🚫' : user.botBlocked ? '❌' : '✅';
      const balance = formatCurrency(user.balance || 0);
      message += `${index + 1}. ${status} ${user.name} (${user.memberId})\n`;
      message += `   Balance: ${balance} | Ref: ${user.referrals || 0}\n\n`;
    });
    
    message += `**View user:** /view USER_ID\n`;
    message += `**Example:** /view USER-1000`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /users:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading users.');
  }
});

// View user details
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
    
    const investments = await loadData(INVESTMENTS_FILE);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const referrals = await loadData(REFERRALS_FILE);
    const earningsViews = await loadData(EARNINGS_VIEWS_FILE);
    const transactions = await loadData(TRANSACTIONS_FILE);
    
    const userInvestments = investments.filter(i => i.memberId === memberId);
    const userWithdrawals = withdrawals.filter(w => w.memberId === memberId);
    const userReferrals = referrals.filter(r => r.referrerId === memberId);
    const userEarningsViews = earningsViews.filter(v => v.viewerId === memberId);
    const viewedUserEarnings = earningsViews.filter(v => v.viewedId === memberId);
    const userTransactions = transactions.filter(t => t.memberId === memberId);
    const referredBy = user.referredBy ? `Referred by: ${user.referredBy}\n` : '';
    
    const message = `👤 **User Details**\n\n` +
                   `Name: ${user.name}\n` +
                   `Member ID: ${user.memberId}\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Chat ID: ${user.chatId || 'N/A'}\n` +
                   `Status: ${user.banned ? '🚫 Banned' : user.botBlocked ? '❌ Blocked Bot' : '✅ Active'}\n` +
                   `${referredBy}` +
                   `Joined: ${new Date(user.joinedDate).toLocaleString()}\n` +
                   `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}\n` +
                   `Last Password Change: ${user.lastPasswordChange ? new Date(user.lastPasswordChange).toLocaleString() : 'Never'}\n\n` +
                   `💰 **Financials**\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                   `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                   `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                   `📊 **Stats**\n` +
                   `Referrals: ${user.referrals || 0}\n` +
                   `Referral Code: ${user.referralCode || 'N/A'}\n` +
                   `Investments: ${userInvestments.length}\n` +
                   `Withdrawals: ${userWithdrawals.length}\n` +
                   `Referral Network: ${userReferrals.length}\n` +
                   `Earnings Views Made: ${userEarningsViews.length}\n` +
                   `Earnings Views Received: ${viewedUserEarnings.length}\n` +
                   `Transactions: ${userTransactions.length}\n\n` +
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

// Add balance
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
      id: `ADMIN-ADD-${Date.now()}`,
      memberId: memberId,
      type: 'admin_add_balance',
      amount: amount,
      description: `Admin added balance`,
      date: new Date().toISOString(),
      adminId: chatId.toString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ **Balance Added Successfully**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Amount Added: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `💰 **Admin Added Balance**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
      `This was added by an administrator.`
    );
  } catch (error) {
    console.log('Error in /addbalance:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding balance.');
  }
});

// Reset password
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
    
    const newPassword = generateRandomPassword(8);
    users[userIndex].passwordHash = hashPassword(newPassword);
    users[userIndex].lastPasswordChange = new Date().toISOString();
    
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ **Password Reset Successful**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `New Password: ${newPassword}\n\n` +
      `User has been notified of the new password.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🔐 **Password Reset by Admin**\n\n` +
      `Your password has been reset by an administrator.\n\n` +
      `New Password: ${newPassword}\n\n` +
      `Please login with:\n` +
      `Member ID: ${memberId}\n` +
      `Password: ${newPassword}\n\n` +
      `For security, change your password after logging in.`
    );
  } catch (error) {
    console.log('Error in /resetpass:', error.message);
    await bot.sendMessage(chatId, '❌ Error resetting password.');
  }
});

// Suspend user
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
    
    await bot.sendMessage(chatId,
      `🚫 **User Suspended**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Status: Suspended\n\n` +
      `User can no longer access their account.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🚫 **Account Suspended**\n\n` +
      `Your account has been suspended by an administrator.\n` +
      `You can no longer access your account.\n\n` +
      `If you believe this is an error, contact support immediately.`
    );
  } catch (error) {
    console.log('Error in /suspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error suspending user.');
  }
});

// Unsuspend user
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
    
    await bot.sendMessage(chatId,
      `✅ **User Unsuspended**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Status: Active\n\n` +
      `User can now access their account again.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `✅ **Account Reactivated**\n\n` +
      `Your account has been reactivated by an administrator.\n` +
      `You can now login and access your account.\n\n` +
      `Welcome back!`
    );
  } catch (error) {
    console.log('Error in /unsuspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error unsuspending user.');
  }
});

// Delete user
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
    
    const userName = users[userIndex].name;
    
    // Remove user
    users.splice(userIndex, 1);
    await saveData(USERS_FILE, users);
    
    // Clean up related data
    const investments = await loadData(INVESTMENTS_FILE);
    const updatedInvestments = investments.filter(i => i.memberId !== memberId);
    await saveData(INVESTMENTS_FILE, updatedInvestments);
    
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const updatedWithdrawals = withdrawals.filter(w => w.memberId !== memberId);
    await saveData(WITHDRAWALS_FILE, updatedWithdrawals);
    
    const referrals = await loadData(REFERRALS_FILE);
    const updatedReferrals = referrals.filter(r => r.referrerId !== memberId && r.referredId !== memberId);
    await saveData(REFERRALS_FILE, updatedReferrals);
    
    await bot.sendMessage(chatId,
      `🗑️ **User Deleted**\n\n` +
      `User: ${userName} (${memberId})\n` +
      `All user data has been removed from the system.`
    );
  } catch (error) {
    console.log('Error in /delete:', error.message);
    await bot.sendMessage(chatId, '❌ Error deleting user.');
  }
});

// Support chats list
bot.onText(/\/supportchats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const activeChats = supportChats.filter(c => c.status === 'active');
    
    if (activeChats.length === 0) {
      await bot.sendMessage(chatId, '📭 No active support chats.');
      return;
    }
    
    let message = `💬 **Active Support Chats: ${activeChats.length}**\n\n`;
    
    activeChats.forEach((chat, index) => {
      const isLoggedOut = chat.isLoggedOut ? '🚪' : '';
      const noAccount = chat.noAccount ? '🚫' : '';
      const isAppeal = chat.isAppeal ? '⚖️' : '';
      const timeAgo = Math.floor((new Date() - new Date(chat.updatedAt)) / 60000);
      const messages = chat.messages ? chat.messages.length : 0;
      const lastMessage = chat.messages && chat.messages.length > 0 ? 
        chat.messages[chat.messages.length - 1].message.substring(0, 30) + '...' : 'No messages';
      
      message += `${index + 1}. ${isLoggedOut}${noAccount}${isAppeal} **${chat.userName}**\n`;
      message += `   🆔 ${chat.id}\n`;
      message += `   📝 ${chat.topic}\n`;
      message += `   💬 ${messages} messages\n`;
      message += `   🕒 ${timeAgo} min ago\n`;
      message += `   📨 "${lastMessage}"\n`;
      message += `   **View:** /viewchat ${chat.id}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /supportchats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading support chats.');
  }
});

// Reply to chat
bot.onText(/\/replychat (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  const replyMessage = match[2];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(c => c.id === supportChatId);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const chat = supportChats[chatIndex];
    const userId = chat.userId;
    const userName = chat.userName;
    
    // Add admin reply to chat
    supportChats[chatIndex].messages.push({
      sender: 'admin',
      message: replyMessage,
      timestamp: new Date().toISOString(),
      adminId: chatId.toString()
    });
    supportChats[chatIndex].updatedAt = new Date().toISOString();
    supportChats[chatIndex].adminReplied = true;
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    // Send notification to user based on chat type
    if (chat.noAccount) {
      // User without account - send to their chat ID
      const userChatId = chat.userChatId || userId.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `💬 **Support Response**\n\n` +
          `${replyMessage}\n\n` +
          `Use /support to reply back.`
        );
      } catch (error) {
        console.log('Could not send to no-account user:', error.message);
      }
    } else if (chat.isLoggedOut) {
      // Logged out user - store offline message
      const memberId = userId.replace('LOGGED_OUT_', '');
      await storeOfflineMessage(memberId,
        `💬 **Support Response (You were logged out)**\n\n` +
        `${replyMessage}\n\n` +
        `Login with /login to continue chatting.`,
        'support_response'
      );
    } else {
      // Regular user - send direct message
      await sendUserNotification(userId,
        `💬 **Support Response**\n\n` +
        `${replyMessage}\n\n` +
        `Use /support to reply back.`
      );
    }
    
    await bot.sendMessage(chatId,
      `✅ **Reply Sent**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `User: ${userName}\n` +
      `Message: "${replyMessage}"\n\n` +
      `View chat: /viewchat ${supportChatId}`
    );
  } catch (error) {
    console.log('Error in /replychat:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending reply.');
  }
});

// Close chat
bot.onText(/\/closechat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(c => c.id === supportChatId);
    
    if (chatIndex === -1) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    if (supportChats[chatIndex].status === 'closed') {
      await bot.sendMessage(chatId, `⚠️ Chat ${supportChatId} is already closed.`);
      return;
    }
    
    supportChats[chatIndex].status = 'closed';
    supportChats[chatIndex].updatedAt = new Date().toISOString();
    supportChats[chatIndex].closedBy = 'admin';
    
    await saveData(SUPPORT_CHATS_FILE, supportChats);
    
    await bot.sendMessage(chatId,
      `✅ **Chat Closed**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `User: ${supportChats[chatIndex].userName}\n` +
      `Closed by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    const chat = supportChats[chatIndex];
    if (chat.noAccount) {
      const userChatId = chat.userChatId || chat.userId.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `✅ **Support Chat Closed**\n\n` +
          `Your support chat has been closed by our team.\n\n` +
          `If you need further assistance, use /support to start a new chat.`
        );
      } catch (error) {
        console.log('Could not notify no-account user');
      }
    } else if (!chat.isLoggedOut) {
      await sendUserNotification(chat.userId,
        `✅ **Support Chat Closed**\n\n` +
        `Your support chat has been closed by our team.\n\n` +
        `If you need further assistance, use /support to start a new chat.`
      );
    }
  } catch (error) {
    console.log('Error in /closechat:', error.message);
    await bot.sendMessage(chatId, '❌ Error closing chat.');
  }
});

// Message user directly
bot.onText(/\/message (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const messageText = match[2];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  await sendDirectMessageToUser(chatId, memberId, messageText);
});

// Initialize admin sessions for messaging
bot.onText(/\/message (.+)/, async (msg, match) => {
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
    
    adminSessions[chatId] = {
      step: 'admin_message_user',
      targetUserId: memberId,
      targetUserName: user.name
    };
    
    await bot.sendMessage(chatId,
      `💬 **Message User**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Type your message below:\n` +
      `(Max 4096 characters)\n\n` +
      `Type /cancel to cancel`
    );
  } catch (error) {
    console.log('Error in /message:', error.message);
    await bot.sendMessage(chatId, '❌ Error starting message.');
  }
});

// Handle admin message composition
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const adminSession = adminSessions[chatId];
  
  if (adminSession && adminSession.step === 'admin_message_user') {
    await sendDirectMessageToUser(chatId, adminSession.targetUserId, text);
    delete adminSessions[chatId];
  }
});

// Cancel admin action
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (adminSessions[chatId]) {
    delete adminSessions[chatId];
    await bot.sendMessage(chatId, '❌ Action cancelled.');
  }
});

// ==================== INVESTMENT ADMIN COMMANDS ====================

// List all investments
bot.onText(/\/investments/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    
    if (investments.length === 0) {
      await bot.sendMessage(chatId, '📭 No investments found.');
      return;
    }
    
    const activeInvestments = investments.filter(i => i.status === 'active');
    const pendingInvestments = investments.filter(i => i.status === 'pending');
    const completedInvestments = investments.filter(i => i.status === 'completed');
    
    let message = `📈 **Investments Summary**\n\n`;
    message += `Total: ${investments.length}\n`;
    message += `Active: ${activeInvestments.length}\n`;
    message += `Pending: ${pendingInvestments.length}\n`;
    message += `Completed: ${completedInvestments.length}\n\n`;
    
    // Show recent investments
    const recentInvestments = investments.slice(-5).reverse();
    
    message += `**Recent Investments:**\n`;
    recentInvestments.forEach((inv, index) => {
      const status = inv.status === 'active' ? '🟢' : inv.status === 'pending' ? '🟡' : '🔵';
      message += `${index + 1}. ${status} ${inv.memberId}\n`;
      message += `   Amount: ${formatCurrency(inv.amount)}\n`;
      message += `   Method: ${inv.paymentMethod || 'M-Pesa'}\n`;
      message += `   Status: ${inv.status}\n`;
      message += `   Date: ${new Date(inv.date).toLocaleDateString()}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /investments:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading investments.');
  }
});

// Approve investment - FIXED REFERRAL SYSTEM - BONUS ON FIRST INVESTMENT ONLY
bot.onText(/\/approveinvestment (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    const investmentIndex = investments.findIndex(i => i.id === investmentId);
    
    if (investmentIndex === -1) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    const investment = investments[investmentIndex];
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Check if this is the user's FIRST investment (BEFORE we update to active)
    const userActiveInvestments = investments.filter(inv => 
      inv.memberId === investment.memberId && 
      inv.status === 'active'
    );
    
    // If user has NO active investments, this is their FIRST investment
    const isFirstInvestment = userActiveInvestments.length === 0;
    
    // Update investment status
    investments[investmentIndex].status = 'active';
    investments[investmentIndex].approvedAt = new Date().toISOString();
    investments[investmentIndex].approvedBy = chatId.toString();
    
    // Update user's total invested and active investments count
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === investment.memberId);
    
    if (userIndex !== -1) {
      users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + investment.amount;
      users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
      
      // Handle referral bonus if this is the user's FIRST investment and they were referred
      if (users[userIndex].referredBy && isFirstInvestment) {
        const referrer = users.find(u => u.referralCode === users[userIndex].referredBy);
        if (referrer) {
          const referralBonus = calculateReferralBonus(investment.amount);
          
          // Update referrer's balance and referral earnings
          const referrerIndex = users.findIndex(u => u.memberId === referrer.memberId);
          users[referrerIndex].balance = (parseFloat(users[referrerIndex].balance) || 0) + referralBonus;
          users[referrerIndex].referralEarnings = (parseFloat(users[referrerIndex].referralEarnings) || 0) + referralBonus;
          
          // Update referral record
          const referrals = await loadData(REFERRALS_FILE);
          const referralIndex = referrals.findIndex(r => 
            r.referrerId === referrer.memberId && 
            r.referredId === investment.memberId
          );
          
          if (referralIndex !== -1) {
            referrals[referralIndex].status = 'paid';
            referrals[referralIndex].bonusAmount = referralBonus;
            referrals[referralIndex].bonusPaid = true;
            referrals[referralIndex].investmentAmount = investment.amount;
            referrals[referralIndex].paidAt = new Date().toISOString();
            referrals[referralIndex].isFirstInvestment = false; // Mark as not first anymore
            
            await saveData(REFERRALS_FILE, referrals);
          }
          
          // Notify referrer about FIRST investment bonus
          await sendUserNotification(referrer.memberId,
            `🎉 **Referral Bonus Earned!**\n\n` +
            `Your referral made their FIRST investment!\n\n` +
            `Referral: ${users[userIndex].name}\n` +
            `Investment Amount: ${formatCurrency(investment.amount)}\n` +
            `Your Bonus (10%): ${formatCurrency(referralBonus)}\n\n` +
            `Bonus has been added to your balance!\n` +
            `New Balance: ${formatCurrency(users[referrerIndex].balance)}\n\n` +
            `Note: You only earn 10% on their FIRST investment.\n` +
            `Subsequent investments will not earn bonuses.`
          );
          
          // Record transaction for referrer
          const transactions = await loadData(TRANSACTIONS_FILE);
          transactions.push({
            id: `REF-BONUS-${Date.now()}`,
            memberId: referrer.memberId,
            type: 'referral_bonus',
            amount: referralBonus,
            description: `Bonus from ${users[userIndex].name}'s FIRST investment`,
            date: new Date().toISOString()
          });
          await saveData(TRANSACTIONS_FILE, transactions);
        }
      } else if (users[userIndex].referredBy && !isFirstInvestment) {
        // This is a SUBSEQUENT investment - no bonus
        const referrer = users.find(u => u.referralCode === users[userIndex].referredBy);
        if (referrer) {
          // Update referral record to mark as subsequent
          const referrals = await loadData(REFERRALS_FILE);
          const referralIndex = referrals.findIndex(r => 
            r.referrerId === referrer.memberId && 
            r.referredId === investment.memberId
          );
          
          if (referralIndex !== -1 && referrals[referralIndex].isFirstInvestment) {
            // Mark as not first investment anymore
            referrals[referralIndex].isFirstInvestment = false;
            referrals[referralIndex].status = 'completed';
            referrals[referralIndex].note = 'No bonus - subsequent investment';
            await saveData(REFERRALS_FILE, referrals);
            
            // Notify referrer about SUBSEQUENT investment (no bonus)
            await sendUserNotification(referrer.memberId,
              `ℹ️ **Referral Update**\n\n` +
              `${users[userIndex].name} made another investment.\n\n` +
              `Investment Amount: ${formatCurrency(investment.amount)}\n` +
              `No bonus earned - you only get 10% on FIRST investment.\n\n` +
              `Thanks for referring them!`
            );
          }
        }
      }
    }
    
    await saveData(INVESTMENTS_FILE, investments);
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ **Investment Approved**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.memberId}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
      `Transaction Hash: ${investment.transactionHash || 'N/A'}\n` +
      `Approved by: Admin\n` +
      `First Investment: ${isFirstInvestment ? '✅ Yes' : '❌ No'}\n\n` +
      `The investment is now active and earning 2% daily.`
    );
    
    // Notify user
    await sendUserNotification(investment.memberId,
      `✅ **Investment Approved!**\n\n` +
      `Your investment has been approved and is now active!\n\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Investment ID: ${investmentId}\n` +
      `Daily Profit: ${formatCurrency(calculateDailyProfit(investment.amount))}\n` +
      `Duration: LIFETIME (no expiration)\n` +
      `${isFirstInvestment ? '\n🎉 **This is your FIRST investment!** If you were referred, your referrer earned 10% bonus.' : ''}\n\n` +
      `Your investment is now earning 2% daily profit!\n` +
      `Check your earnings with /earnings`
    );
  } catch (error) {
    console.log('Error in /approveinvestment:', error.message);
    await bot.sendMessage(chatId, '❌ Error approving investment.');
  }
});

// Reject investment
bot.onText(/\/rejectinvestment (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    const investmentIndex = investments.findIndex(i => i.id === investmentId);
    
    if (investmentIndex === -1) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    const investment = investments[investmentIndex];
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Update investment status
    investments[investmentIndex].status = 'rejected';
    investments[investmentIndex].rejectedAt = new Date().toISOString();
    investments[investmentIndex].rejectedBy = chatId.toString();
    
    await saveData(INVESTMENTS_FILE, investments);
    
    await bot.sendMessage(chatId,
      `❌ **Investment Rejected**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.memberId}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
      `Rejected by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    await sendUserNotification(investment.memberId,
      `❌ **Investment Rejected**\n\n` +
      `Your investment request has been rejected.\n\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Investment ID: ${investmentId}\n\n` +
      `Please contact support for more information.`
    );
  } catch (error) {
    console.log('Error in /rejectinvestment:', error.message);
    await bot.sendMessage(chatId, '❌ Error rejecting investment.');
  }
});

// View payment proof
bot.onText(/\/viewproof (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    const investment = investments.find(i => i.id === investmentId);
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    const mediaFiles = await loadData(MEDIA_FILES_FILE);
    const proof = mediaFiles.find(m => m.investmentId === investmentId);
    
    if (!proof) {
      await bot.sendMessage(chatId, `❌ No proof found for investment ${investmentId}.`);
      return;
    }
    
    // Send the proof photo to admin
    await bot.sendPhoto(chatId, proof.fileId, {
      caption: `📎 Proof for Investment ${investmentId}\n` +
              `User: ${investment.memberId}\n` +
              `Amount: ${formatCurrency(investment.amount)}\n` +
              `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
              `Transaction Hash: ${investment.transactionHash || 'N/A'}\n` +
              `Date: ${new Date(investment.date).toLocaleString()}\n` +
              `Status: ${investment.status}`
    });
  } catch (error) {
    console.log('Error in /viewproof:', error.message);
    await bot.sendMessage(chatId, '❌ Error viewing proof.');
  }
});

// Manual investment
bot.onText(/\/manualinv (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /manualinv USER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const investments = await loadData(INVESTMENTS_FILE);
    const investmentId = `INV-MANUAL-${Date.now()}`;
    
    // Create manual investment
    const manualInvestment = {
      id: investmentId,
      memberId: memberId,
      amount: amount,
      paymentMethod: 'Admin Manual',
      status: 'active',
      date: new Date().toISOString(),
      daysActive: 0,
      totalProfit: 0,
      isManual: true,
      adminId: chatId.toString()
    };
    
    investments.push(manualInvestment);
    
    // Update user stats
    users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + amount;
    users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
    
    await saveData(INVESTMENTS_FILE, investments);
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-MANUAL-INV-${Date.now()}`,
      memberId: memberId,
      type: 'manual_investment',
      amount: amount,
      description: `Manual investment added by admin`,
      date: new Date().toISOString(),
      adminId: chatId.toString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ **Manual Investment Added**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Investment ID: ${investmentId}\n` +
      `Status: Active\n\n` +
      `User will earn daily 2% profit on this amount.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `📈 **Manual Investment Added**\n\n` +
      `An administrator has added a manual investment to your account.\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Investment ID: ${investmentId}\n\n` +
      `You will now earn 2% daily profit on this amount!`
    );
  } catch (error) {
    console.log('Error in /manualinv:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding manual investment.');
  }
});

// ==================== NEW MISSING ADMIN COMMANDS ====================

// Deduct balance from user
bot.onText(/\/deductbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /deductbalance USER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if ((users[userIndex].balance || 0) < amount) {
      await bot.sendMessage(chatId,
        `❌ Insufficient balance.\n` +
        `User has: ${formatCurrency(users[userIndex].balance || 0)}\n` +
        `Trying to deduct: ${formatCurrency(amount)}`
      );
      return;
    }
    
    users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) - amount;
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `ADMIN-DEDUCT-${Date.now()}`,
      memberId: memberId,
      type: 'admin_deduct_balance',
      amount: -amount,
      description: `Admin deducted balance`,
      date: new Date().toISOString(),
      adminId: chatId.toString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ **Balance Deducted Successfully**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Balance Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
      `This was deducted by an administrator.`
    );
  } catch (error) {
    console.log('Error in /deductbalance:', error.message);
    await bot.sendMessage(chatId, '❌ Error deducting balance.');
  }
});

// Deduct investment amount
bot.onText(/\/deductinv (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /deductinv USER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Check if user has enough invested
    const investments = await loadData(INVESTMENTS_FILE);
    const userInvestments = investments.filter(inv => inv.memberId === memberId && inv.status === 'active');
    const totalInvested = userInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    
    if (totalInvested < amount) {
      await bot.sendMessage(chatId,
        `❌ User doesn't have enough active investments.\n` +
        `Total Active Investments: ${formatCurrency(totalInvested)}\n` +
        `Trying to deduct: ${formatCurrency(amount)}`
      );
      return;
    }
    
    // Find and reduce investments (start with most recent)
    let remaining = amount;
    for (let investment of userInvestments.reverse()) {
      if (remaining <= 0) break;
      
      const investmentIndex = investments.findIndex(inv => inv.id === investment.id);
      if (investmentIndex !== -1) {
        const deductAmount = Math.min(investments[investmentIndex].amount, remaining);
        investments[investmentIndex].amount -= deductAmount;
        remaining -= deductAmount;
        
        // If investment becomes 0 or negative, mark as completed
        if (investments[investmentIndex].amount <= 0) {
          investments[investmentIndex].status = 'completed';
          investments[investmentIndex].completedAt = new Date().toISOString();
        }
      }
    }
    
    // Update user's total invested
    users[userIndex].totalInvested = Math.max(0, (users[userIndex].totalInvested || 0) - amount);
    await saveData(USERS_FILE, users);
    await saveData(INVESTMENTS_FILE, investments);
    
    await bot.sendMessage(chatId,
      `✅ **Investment Deducted Successfully**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(users[userIndex].totalInvested)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Investment Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(users[userIndex].totalInvested)}\n\n` +
      `This was deducted by an administrator.`
    );
  } catch (error) {
    console.log('Error in /deductinv:', error.message);
    await bot.sendMessage(chatId, '❌ Error deducting investment.');
  }
});

// List all referrals
bot.onText(/\/referrals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const referrals = await loadData(REFERRALS_FILE);
    
    if (referrals.length === 0) {
      await bot.sendMessage(chatId, '📭 No referrals found.');
      return;
    }
    
    const paidReferrals = referrals.filter(r => r.status === 'paid');
    const pendingReferrals = referrals.filter(r => r.status === 'pending');
    const firstInvestmentReferrals = referrals.filter(r => r.isFirstInvestment === true);
    
    let message = `👥 **Referrals Summary**\n\n`;
    message += `Total Referrals: ${referrals.length}\n`;
    message += `Paid (First Investment Bonus): ${paidReferrals.length}\n`;
    message += `Pending First Investment: ${pendingReferrals.length}\n`;
    message += `Awaiting First Investment: ${firstInvestmentReferrals.length}\n`;
    message += `Total Bonus Paid: ${formatCurrency(paidReferrals.reduce((sum, r) => sum + (r.bonusAmount || 0), 0))}\n\n`;
    
    // Show recent referrals
    const recentReferrals = referrals.slice(-10).reverse();
    
    message += `**Recent Referrals:**\n`;
    recentReferrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅' : ref.status === 'pending' ? '⏳' : '❌';
      const firstInv = ref.isFirstInvestment ? 'FIRST' : 'SUBSEQUENT';
      message += `${index + 1}. ${status} ${ref.referrerName} → ${ref.referredName}\n`;
      message += `   Type: ${firstInv} | Bonus: ${formatCurrency(ref.bonusAmount || 0)} | ${new Date(ref.date).toLocaleDateString()}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /referrals:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading referrals.');
  }
});

// Find user by referral code
bot.onText(/\/findref (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.referralCode === referralCode);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ No user found with referral code: ${referralCode}`);
      return;
    }
    
    const referrals = await loadData(REFERRALS_FILE);
    const userReferrals = referrals.filter(r => r.referrerId === user.memberId);
    const successfulReferrals = userReferrals.filter(r => r.status === 'paid');
    const firstInvestmentReferrals = userReferrals.filter(r => r.isFirstInvestment === true);
    
    const message = `🔍 **User Found by Referral Code**\n\n` +
                   `Referral Code: ${referralCode}\n` +
                   `User: ${user.name} (${user.memberId})\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Referrals: ${user.referrals || 0}\n` +
                   `Successful Referrals (First Investment Bonus): ${successfulReferrals.length}\n` +
                   `Referrals Awaiting First Investment: ${firstInvestmentReferrals.length}\n` +
                   `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                   `**Note:** Referrers earn 10% only on FIRST investment of referred users.\n\n` +
                   `**View User:** /view ${user.memberId}\n` +
                   `**Message User:** /message ${user.memberId}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /findref:', error.message);
    await bot.sendMessage(chatId, '❌ Error finding user.');
  }
});

// Add referral bonus
bot.onText(/\/addrefbonus (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /addrefbonus USER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Add to balance and referral earnings
    users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + amount;
    users[userIndex].referralEarnings = (parseFloat(users[userIndex].referralEarnings) || 0) + amount;
    
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `REF-BONUS-${Date.now()}`,
      memberId: memberId,
      type: 'referral_bonus',
      amount: amount,
      description: `Admin added referral bonus`,
      date: new Date().toISOString(),
      adminId: chatId.toString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ **Referral Bonus Added**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Bonus Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n` +
      `Total Referral Earnings: ${formatCurrency(users[userIndex].referralEarnings)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🎉 **Referral Bonus Added!**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n` +
      `Total Referral Earnings: ${formatCurrency(users[userIndex].referralEarnings)}\n\n` +
      `This bonus was added by an administrator.`
    );
  } catch (error) {
    console.log('Error in /addrefbonus:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding referral bonus.');
  }
});

// ==================== WITHDRAWAL ADMIN COMMANDS ====================

// List withdrawals
bot.onText(/\/withdrawals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    
    if (withdrawals.length === 0) {
      await bot.sendMessage(chatId, '📭 No withdrawals found.');
      return;
    }
    
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    
    let message = `💳 **Withdrawals Summary**\n\n`;
    message += `Total: ${withdrawals.length}\n`;
    message += `Pending: ${pendingWithdrawals.length}\n`;
    message += `Approved: ${withdrawals.filter(w => w.status === 'approved').length}\n`;
    message += `Rejected: ${withdrawals.filter(w => w.status === 'rejected').length}\n\n`;
    
    if (pendingWithdrawals.length > 0) {
      message += `**Pending Withdrawals:**\n`;
      
      pendingWithdrawals.slice(0, 5).forEach((wd, index) => {
        message += `${index + 1}. ${wd.memberId}\n`;
        message += `   Amount: ${formatCurrency(wd.amount)} (Fee: ${formatCurrency(wd.fee || 0)})\n`;
        message += `   Net: ${formatCurrency(wd.netAmount || wd.amount)}\n`;
        message += `   Method: ${wd.method || 'M-Pesa'}\n`;
        message += `   Date: ${new Date(wd.date).toLocaleString()}\n`;
        message += `   **Approve:** /approve ${wd.id}\n`;
        message += `   **Reject:** /reject ${wd.id}\n\n`;
      });
    }
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /withdrawals:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading withdrawals.');
  }
});

// Approve withdrawal
bot.onText(/\/approve (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    const withdrawal = withdrawals[withdrawalIndex];
    
    if (withdrawal.status === 'approved') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already approved.`);
      return;
    }
    
    // Update withdrawal status
    withdrawals[withdrawalIndex].status = 'approved';
    withdrawals[withdrawalIndex].approvedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].approvedBy = chatId.toString();
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    await bot.sendMessage(chatId,
      `✅ **Withdrawal Approved**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.memberId}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Method: ${withdrawal.method || 'M-Pesa'}\n` +
      `Details: ${withdrawal.details || 'N/A'}\n\n` +
      `Please process the payment within 10-15 minutes.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.memberId,
      `✅ **Withdrawal Approved**\n\n` +
      `Your withdrawal request has been approved!\n\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Net Amount: ${formatCurrency(withdrawal.netAmount || withdrawal.amount)}\n` +
      `Withdrawal ID: ${withdrawalId}\n\n` +
      `Payment will be processed within 10-15 minutes.\n` +
      `Thank you for your patience!`
    );
  } catch (error) {
    console.log('Error in /approve:', error.message);
    await bot.sendMessage(chatId, '❌ Error approving withdrawal.');
  }
});

// Reject withdrawal
bot.onText(/\/reject (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    const withdrawal = withdrawals[withdrawalIndex];
    
    if (withdrawal.status === 'rejected') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already rejected.`);
      return;
    }
    
    // Update withdrawal status
    withdrawals[withdrawalIndex].status = 'rejected';
    withdrawals[withdrawalIndex].rejectedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].rejectedBy = chatId.toString();
    
    // Refund amount to user balance
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === withdrawal.memberId);
    
    if (userIndex !== -1) {
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + withdrawal.amount;
      await saveData(USERS_FILE, users);
    }
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    await bot.sendMessage(chatId,
      `❌ **Withdrawal Rejected**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.memberId}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)} REFUNDED\n` +
      `Reason: Please contact user with reason\n\n` +
      `Amount has been refunded to user's balance.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.memberId,
      `❌ **Withdrawal Rejected**\n\n` +
      `Your withdrawal request has been rejected.\n\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Withdrawal ID: ${withdrawalId}\n\n` +
      `Your funds have been refunded to your account balance.\n` +
      `Please contact support for more information.`
    );
  } catch (error) {
    console.log('Error in /reject:', error.message);
    await bot.sendMessage(chatId, '❌ Error rejecting withdrawal.');
  }
});

// ==================== BROADCAST COMMAND ====================

// Broadcast to all users
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const activeUsers = users.filter(u => !u.banned && u.chatId);
    
    await bot.sendMessage(chatId,
      `📢 **Broadcast Starting**\n\n` +
      `Message: "${message}"\n` +
      `Recipients: ${activeUsers.length} active users\n\n` +
      `Broadcast in progress...`
    );
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of activeUsers) {
      try {
        await bot.sendMessage(user.chatId,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `💼 Management Team`
        );
        successCount++;
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
        console.log(`Failed to send to ${user.memberId}:`, error.message);
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ **Broadcast Complete**\n\n` +
      `Success: ${successCount} users\n` +
      `Failed: ${failCount} users\n` +
      `Total: ${activeUsers.length} users\n\n` +
      `Message sent to all active users.`
    );
  } catch (error) {
    console.log('Error in /broadcast:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending broadcast.');
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

console.log('✅ Starlife Advert Bot is running! All features added successfully!');
