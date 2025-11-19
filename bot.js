const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = '8497221404:AAEiVLukFHvufV7wzBSCIGzfAGWK3YHP9f4';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxbXA_bg45apY8niBfuqcpCkVa9JN14TtFBCrMdrGF8-RdnFTqDtT1jyQtyTGmLgJsoUg/exec';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('🤖 Earnings Bot is running on Railway...');

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 Welcome to Earnings Bot!\n\nUse /earnings YOUR_MEMBER_ID to check your earnings\nExample: /earnings 123\n\n📊 You'll receive:\n• Investment Amount • Daily Earnings\n• Total Profit Earned • Days Active`;
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/earnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].trim();
  
  if (!memberId) {
    return bot.sendMessage(chatId, '❌ Please provide a valid Member ID');
  }
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await axios.get(`${WEB_APP_URL}?memberId=${encodeURIComponent(memberId)}`);
    const data = response.data;
    
    if (data.success) {
      await bot.sendMessage(chatId, data.message);
    } else {
      await bot.sendMessage(chatId, data.message);
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error fetching earnings. Please try again.');
  }
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text && !text.startsWith('/')) {
    bot.sendMessage(chatId, 'Use /start for help or /earnings YOUR_MEMBER_ID to check earnings.');
  }

});
