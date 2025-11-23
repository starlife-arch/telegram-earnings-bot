const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Root endpoint - Heroku requires this to stay alive
app.get('/', (req, res) => {
  res.send('🤖 Earnings Bot is running on Heroku...');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server first
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Bot initialization with error handling
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  process.exit(1);
}

if (!WEB_APP_URL) {
  console.log('❌ ERROR: WEB_APP_URL is missing');
  process.exit(1);
}

console.log('✅ Environment variables loaded');

// Initialize bot with better error handling
let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
      interval: 300,
      timeout: 10,
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

// Error handlers
bot.on('polling_error', (error) => {
  console.log('🔧 Polling error (normal):', error.code);
});

bot.on('webhook_error', (error) => {
  console.log('🔧 Webhook error:', error);
});

bot.on('error', (error) => {
  console.log('🔧 General bot error:', error.message);
});

// Test bot connection
bot.getMe()
  .then(botInfo => {
    console.log('✅ Bot connected to Telegram:', botInfo.username);
    console.log('✅ Bot is ready and listening...');
  })
  .catch(error => {
    console.log('❌ Bot failed to connect:', error.message);
  });

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log('📱 Received /start from:', chatId);
  
  const welcomeMessage = `👋 Welcome to Earnings Bot!\n\n` +
                        `Use /earnings YOUR_MEMBER_ID to check your earnings\n` +
                        `Example: /earnings SLA-123\n` +
                        `Use /register to sign up\n` +
                        `Use /help for assistance`;
  
  bot.sendMessage(chatId, welcomeMessage)
    .then(() => console.log('✅ Sent welcome message to:', chatId))
    .catch(error => console.log('❌ Error sending welcome:', error.message));
});

// Register command
bot.onText(/\/register/, (msg) => {
  const chatId = msg.chat.id;
  console.log('✅ Received /register from:', chatId);
  bot.sendMessage(chatId, 'Please use the web interface for registration.')
    .then(() => console.log('✅ Sent register message to:', chatId))
    .catch(error => console.log('❌ Error sending register message:', error.message));
});

// Earnings command
bot.onText(/\/earnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].trim().toUpperCase();
  console.log('📱 Received /earnings for:', memberId);
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(memberId)}`, {
      timeout: 10000
    });
    
    const data = response.data;
    console.log('✅ Earnings response:', data.success);
    
    if (data.success) {
      await bot.sendMessage(chatId, data.message, { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, data.message);
    }
    
    console.log('✅ Sent earnings data to:', chatId);
  } catch (error) {
    console.log('❌ Error fetching earnings:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching earnings. Please try again in a moment.');
  }
});

// Help command - FIXED with better error handling
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  console.log('✅ Received /help from:', chatId);
  
  const helpMessage = `🤖 **Earnings Bot Help**\n\n` +
                     `/start - Start the bot\n` +
                     `/earnings MEMBER_ID - Check your earnings\n` +
                     `/register - Registration information\n` +
                     `/help - Show this help message\n\n` +
                     `Contact support: @starlifeadvert`;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
    .then(() => console.log('✅ Sent help message to:', chatId))
    .catch(error => {
      console.log('❌ Error sending help message:', error.message);
      // Try sending without markdown if markdown fails
      const plainHelpMessage = `🤖 Earnings Bot Help\n\n` +
                             `/start - Start the bot\n` +
                             `/earnings MEMBER_ID - Check your earnings\n` +
                             `/register - Registration information\n` +
                             `/help - Show this help message\n\n` +
                             `Contact support: @starlifeadvert`;
      
      bot.sendMessage(chatId, plainHelpMessage)
        .then(() => console.log('✅ Sent plain help message to:', chatId))
        .catch(error2 => console.log('❌ Error sending plain help message:', error2.message));
    });
});

// Handle unknown commands
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Only respond to command-like messages that start with /
  if (text && text.startsWith('/') && 
      !text.startsWith('/start') && 
      !text.startsWith('/earnings') && 
      !text.startsWith('/register') && 
      !text.startsWith('/help')) {
    
    console.log('❓ Received unknown command:', text);
    bot.sendMessage(chatId, '❓ Unknown command. Use /help to see available commands.')
      .then(() => console.log('✅ Sent unknown command message to:', chatId))
      .catch(error => console.log('❌ Error sending unknown command message:', error.message));
  }
});

// Handle process cleanup
process.on('SIGTERM', () =>
