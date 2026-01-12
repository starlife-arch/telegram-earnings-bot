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

// ==================== SECURITY ENHANCEMENTS ====================

// Check if user is logged in (ONE account per Telegram ID)
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

// Get user data if logged in (ONE account per Telegram ID)
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

// NEW: Check if Telegram account is already registered (ONE account per Telegram ID)
async function isTelegramAccountRegistered(chatId) {
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  return !!user;
}

// NEW: Get user by Telegram ID (ONE account per Telegram ID)
async function getUserByTelegramId(chatId) {
  const users = await loadData(USERS_FILE);
  return users.find(u => u.chatId === chatId.toString());
}

// NEW: Check if trying to login to wrong account (Security Fix)
async function canLoginToAccount(chatId, memberId) {
  const users = await loadData(USERS_FILE);
  
  // Find the account the user is trying to login to
  const targetUser = users.find(u => u.memberId === memberId);
  
  if (!targetUser) {
    return { canLogin: false, reason: 'Account not found' };
  }
  
  // Check if this Telegram account is already registered to ANOTHER account
  const existingUserForTelegram = users.find(u => u.chatId === chatId.toString());
  
  if (existingUserForTelegram) {
    // If this Telegram account is already linked to a DIFFERENT account
    if (existingUserForTelegram.memberId !== memberId) {
      return { 
        canLogin: false, 
        reason: `This Telegram account is already linked to ${existingUserForTelegram.name} (${existingUserForTelegram.memberId}). You cannot login to other accounts.` 
      };
    }
    // Same account - allowed
    return { canLogin: true, reason: '' };
  }
  
  // Check if the target account is already linked to another Telegram account
  if (targetUser.chatId && targetUser.chatId !== chatId.toString()) {
    return { 
      canLogin: false, 
      reason: `This account is already linked to another Telegram account. Please use your original Telegram account.` 
    };
  }
  
  return { canLogin: true, reason: '' };
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

// Helper function to send direct message to user
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
        status: 'pending',
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
  
  // Check if user is already registered to an account
  const isRegistered = await isTelegramAccountRegistered(chatId);
  
  if (isRegistered) {
    const user = await getUserByTelegramId(chatId);
    
    if (!user) {
      await bot.sendMessage(chatId, '❌ Account not found. Please register with /register');
      return;
    }
    
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
    
    // Update last login
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === user.memberId);
    if (userIndex !== -1) {
      users[userIndex].lastLogin = new Date().toISOString();
      await saveData(USERS_FILE, users);
    }
    
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
  
  // User is not registered - show public welcome
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
  fakeMessage += '/login - Login to your account\n';
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

// Forgot Password command
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

// Login command - UPDATED WITH SECURITY
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is already registered to an account
  const isRegistered = await isTelegramAccountRegistered(chatId);
  
  if (isRegistered) {
    const user = await getUserByTelegramId(chatId);
    
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
      
      // User is already registered - they should use /start or just be logged in automatically
      await bot.sendMessage(chatId,
        `✅ You are already registered to ${user.name} (${user.memberId}).\n\n` +
        `Use /start to access your dashboard.\n\n` +
        `If you need to login with a different account:\n` +
        `1. Logout first with /logout\n` +
        `2. Contact support to unlink your Telegram account\n` +
        `3. You can only have ONE account per Telegram account`
      );
      return;
    }
  }
  
  // User is not registered - start login process
  userSessions[chatId] = {
    step: 'login_memberid',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Login**\n\n` +
    `Enter your Member ID:\n` +
    `(Format: USER-123456)\n\n` +
    `**Important Security:**\n` +
    `• Each Telegram account can only be linked to ONE Starlife Advert account\n` +
    `• Once linked, you cannot login to other accounts\n` +
    `• If you need to change accounts, contact support\n\n` +
    `Forgot your Member ID? Use /support for help.`
  );
});

// Handle login steps - SECURITY FIXED
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if no text or if it's a command
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // Handle login steps with SECURITY FIX
    if (session.step === 'login_memberid') {
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
      
      // SECURITY CHECK: Can this Telegram account login to this account?
      const canLogin = await canLoginToAccount(chatId, memberId);
      
      if (!canLogin.canLogin) {
        await bot.sendMessage(chatId,
          `❌ **Access Denied**\n\n` +
          `${canLogin.reason}\n\n` +
          `**Security Policy:**\n` +
          `• Each Telegram account can only be linked to ONE Starlife Advert account\n` +
          `• If you need to access a different account, contact support\n` +
          `• To logout: /logout`
        );
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
      
      // Final security check
      const canLogin = await canLoginToAccount(chatId, session.data.memberId);
      
      if (!canLogin.canLogin) {
        await bot.sendMessage(chatId,
          `❌ **Access Denied**\n\n` +
          `${canLogin.reason}\n\n` +
          `**Security Policy:**\n` +
          `• Each Telegram account can only be linked to ONE Starlife Advert account\n` +
          `• If you need to access a different account, contact support\n` +
          `• To logout: /logout`
        );
        delete userSessions[chatId];
        return;
      }
      
      // Link this Telegram account to the user account (ONE-TO-ONE binding)
      const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
      users[userIndex].chatId = chatId.toString(); // Bind Telegram account
      users[userIndex].lastLogin = new Date().toISOString();
      
      await saveData(USERS_FILE, users);
      
      // Clear from logged out users
      loggedOutUsers.delete(chatId.toString());
      
      // Clear session
      delete userSessions[chatId];
      
      let welcomeMessage = `✅ **Login Successful!**\n\n`;
      welcomeMessage += `Welcome back, ${user.name}!\n\n`;
      welcomeMessage += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
      welcomeMessage += `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
      welcomeMessage += `👥 Referrals: ${user.referrals || 0}\n`;
      welcomeMessage += `🔗 Your Code: ${user.referralCode}\n\n`;
      
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
    
    // Handle other steps...
    // [Rest of the message handler code remains the same]
    
  } catch (error) {
    console.log('Message handling error:', error.message);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    delete userSessions[chatId];
  }
});

// Register command - UPDATED WITH SECURITY
bot.onText(/\/register(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1] ? match[1].trim().toUpperCase() : null;
  
  // Check if Telegram account is already registered
  const isRegistered = await isTelegramAccountRegistered(chatId);
  if (isRegistered) {
    const user = await getUserByTelegramId(chatId);
    if (user) {
      await bot.sendMessage(chatId,
        `❌ **You already have an account!**\n\n` +
        `This Telegram account is already registered to:\n` +
        `Name: ${user.name}\n` +
        `Member ID: ${user.memberId}\n\n` +
        `**Security Policy:**\n` +
        `• Each Telegram account can only have ONE Starlife Advert account\n` +
        `• To logout: /logout\n` +
        `• To access your account: /start\n\n` +
        `If you need to create a new account:\n` +
        `1. Use a different Telegram account\n` +
        `2. Or contact support to unlink this account`
      );
      return;
    }
  }
  
  userSessions[chatId] = {
    step: 'awaiting_name',
    data: {
      referralCode: referralCode
    }
  };
  
  let registrationMessage = `📝 **Account Registration**\n\n`;
  registrationMessage += `**Important Security:**\n`;
  registrationMessage += `• This Telegram account will be permanently linked to your Starlife Advert account\n`;
  registrationMessage += `• You cannot login to other accounts with this Telegram account\n`;
  registrationMessage += `• One Telegram account = One Starlife Advert account\n\n`;
  
  if (referralCode) {
    // Check if referral code is valid
    const users = await loadData(USERS_FILE);
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

// Handle registration steps - UPDATED WITH SECURITY
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
      
      // Check if Telegram account is still not registered (double-check)
      const isRegistered = await isTelegramAccountRegistered(chatId);
      if (isRegistered) {
        await bot.sendMessage(chatId, '❌ This Telegram account is already registered. Use /login to access your account.');
        delete userSessions[chatId];
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
      
      // Create new user with Telegram account binding
      const newUser = {
        memberId: memberId,
        chatId: chatId.toString(), // BIND Telegram account permanently
        telegramId: chatId.toString(), // Store Telegram ID separately for reference
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
        offlineMessages: [],
        accountLinked: true, // Mark account as linked to Telegram
        linkedDate: new Date().toISOString()
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
      
      welcomeMessage += `\n**⚠️ IMPORTANT SECURITY:**\n` +
                       `• This Telegram account is now PERMANENTLY linked to your account\n` +
                       `• You cannot login to other accounts with this Telegram account\n` +
                       `• One Telegram account = One Starlife Advert account\n\n` +
                       `**Save your Member ID and Password!**\n` +
                       `You'll need them for password recovery.\n\n` +
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
    
    // [Rest of the message handler code remains the same]
    
  } catch (error) {
    console.log('Message handling error:', error.message);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    delete userSessions[chatId];
  }
});

// ==================== FIX FOR ACCOUNT DISAPPEARANCE ====================

// Add a data integrity check function
async function checkDataIntegrity() {
  try {
    console.log('🔍 Checking data integrity...');
    
    const users = await loadData(USERS_FILE);
    const investments = await loadData(INVESTMENTS_FILE);
    const transactions = await loadData(TRANSACTIONS_FILE);
    
    // Check for users without chatId (orphaned accounts)
    const usersWithoutChatId = users.filter(u => !u.chatId || u.chatId === '');
    console.log(`Users without chatId: ${usersWithoutChatId.length}`);
    
    // Check for investments without matching users
    const orphanedInvestments = [];
    for (const investment of investments) {
      const user = users.find(u => u.memberId === investment.memberId);
      if (!user) {
        orphanedInvestments.push(investment);
      }
    }
    console.log(`Orphaned investments: ${orphanedInvestments.length}`);
    
    // Check for transactions without matching users
    const orphanedTransactions = [];
    for (const transaction of transactions) {
      const user = users.find(u => u.memberId === transaction.memberId);
      if (!user) {
        orphanedTransactions.push(transaction);
      }
    }
    console.log(`Orphaned transactions: ${orphanedTransactions.length}`);
    
    // Fix: Remove orphaned data
    if (orphanedInvestments.length > 0) {
      const validInvestments = investments.filter(inv => {
        const user = users.find(u => u.memberId === inv.memberId);
        return !!user;
      });
      await saveData(INVESTMENTS_FILE, validInvestments);
      console.log(`✅ Removed ${orphanedInvestments.length} orphaned investments`);
    }
    
    if (orphanedTransactions.length > 0) {
      const validTransactions = transactions.filter(tx => {
        const user = users.find(u => u.memberId === tx.memberId);
        return !!user;
      });
      await saveData(TRANSACTIONS_FILE, validTransactions);
      console.log(`✅ Removed ${orphanedTransactions.length} orphaned transactions`);
    }
    
    console.log('✅ Data integrity check completed');
  } catch (error) {
    console.log('❌ Error in data integrity check:', error.message);
  }
}

// Run data integrity check periodically
setInterval(checkDataIntegrity, 6 * 60 * 60 * 1000); // Every 6 hours

// ==================== ADMIN COMMANDS FOR ACCOUNT RECOVERY ====================

// NEW: Admin command to fix account linking
bot.onText(/\/fixaccount (.+)/, async (msg, match) => {
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
    
    // Check if user has chatId
    if (user.chatId) {
      // Check if this chatId is used by another account
      const duplicateUser = users.find(u => 
        u.chatId === user.chatId && 
        u.memberId !== memberId
      );
      
      if (duplicateUser) {
        await bot.sendMessage(chatId,
          `⚠️ **Chat ID Conflict**\n\n` +
          `Chat ID ${user.chatId} is used by:\n` +
          `1. ${user.name} (${user.memberId})\n` +
          `2. ${duplicateUser.name} (${duplicateUser.memberId})\n\n` +
          `**Use:** /unlink ${memberId} to unlink this account`
        );
        return;
      }
    }
    
    await bot.sendMessage(chatId,
      `🔧 **Account Information**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Chat ID: ${user.chatId || 'Not set'}\n` +
      `Email: ${user.email || 'Not set'}\n` +
      `Balance: ${formatCurrency(user.balance || 0)}\n` +
      `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}\n\n` +
      `**Commands:**\n` +
      `/linkaccount ${memberId} TELEGRAM_ID - Link to Telegram account\n` +
      `/unlink ${memberId} - Unlink from Telegram account\n` +
      `/resetpass ${memberId} - Reset password\n` +
      `/view ${memberId} - View full details`
    );
  } catch (error) {
    console.log('Error in /fixaccount:', error.message);
    await bot.sendMessage(chatId, '❌ Error checking account.');
  }
});

// NEW: Admin command to link account to Telegram
bot.onText(/\/linkaccount (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const telegramId = match[2];
  
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
    
    // Check if Telegram ID is already used
    const existingUser = users.find(u => u.chatId === telegramId);
    if (existingUser && existingUser.memberId !== memberId) {
      await bot.sendMessage(chatId,
        `❌ **Telegram ID already in use**\n\n` +
        `Telegram ID ${telegramId} is already linked to:\n` +
        `User: ${existingUser.name} (${existingUser.memberId})\n\n` +
        `Use /unlink ${existingUser.memberId} first to unlink it.`
      );
      return;
    }
    
    // Link the account
    users[userIndex].chatId = telegramId;
    users[userIndex].accountLinked = true;
    users[userIndex].linkedDate = new Date().toISOString();
    
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ **Account Linked Successfully**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Linked to Telegram ID: ${telegramId}\n\n` +
      `User can now login with their Telegram account.`
    );
    
    // Try to notify user
    await sendUserNotification(memberId,
      `✅ **Account Linked**\n\n` +
      `Your account has been linked to a Telegram account by admin.\n\n` +
      `You can now login using your Telegram account.\n` +
      `Member ID: ${memberId}\n\n` +
      `Use /login to access your account.`
    );
  } catch (error) {
    console.log('Error in /linkaccount:', error.message);
    await bot.sendMessage(chatId, '❌ Error linking account.');
  }
});

// NEW: Admin command to unlink account from Telegram
bot.onText(/\/unlink (.+)/, async (msg, match) => {
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
    
    const oldChatId = users[userIndex].chatId;
    
    // Unlink the account
    users[userIndex].chatId = '';
    users[userIndex].accountLinked = false;
    users[userIndex].unlinkedDate = new Date().toISOString();
    users[userIndex].unlinkedBy = chatId.toString();
    
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ **Account Unlinked Successfully**\n\n` +
      `User: ${users[userIndex].name} (${memberId})\n` +
      `Unlinked from Telegram ID: ${oldChatId || 'N/A'}\n\n` +
      `User can now be linked to a different Telegram account.`
    );
  } catch (error) {
    console.log('Error in /unlink:', error.message);
    await bot.sendMessage(chatId, '❌ Error unlinking account.');
  }
});

// [Rest of the bot commands and handlers remain the same...]
// Only the login/registration security has been fixed

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
  res.send('Starlife Advert Bot is running! Security fixes applied.');
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

console.log('✅ Starlife Advert Bot is running! Security fixes applied!');
console.log('🔒 Security: ONE Telegram account = ONE Starlife Advert account');
