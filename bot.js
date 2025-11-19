const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Earnings Bot is running on Heroku...');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Your bot code - uses environment variables from Heroku
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

console.log('🚀 Starting Telegram Bot on Heroku...');

// Check if environment variables are set
if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  process.exit(1);
}

if (!WEB_APP_URL) {
  console.log('❌ ERROR: WEB_APP_URL is missing');
  process.exit(1);
}

console.log('✅ Environment variables loaded');

const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: true,
  request: {
    timeout: 10000
  }
});

// Test connection to Telegram
bot.getMe().then(botInfo => {
  console.log('✅ Bot connected to Telegram:', botInfo.username);
}).catch(error => {
  console.log('❌ Bot failed to connect:', error.message);
});

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log('Received /start from:', chatId);
  const welcomeMessage = `👋 Welcome to Earnings Bot!\n\n` +
                        `Use /earnings YOUR_MEMBER_ID to check your earnings\n` +
                        `Example: /earnings 123`;
  bot.sendMessage(chatId, welcomeMessage);
});

// Earnings command
bot.onText(/\/earnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].trim();
  console.log('Received /earnings for:', memberId);
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(memberId)}`);
    const data = response.data;
    bot.sendMessage(chatId, data.message);
  } catch (error) {
    console.log('Error fetching earnings:', error.message);
    bot.sendMessage(chatId, '❌ Error fetching earnings. Please try again.');
  }
});

// Register command
bot.onText(/\/register/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Please use the web interface for registration.');
});

console.log('✅ Bot is ready and listening for commands...');
