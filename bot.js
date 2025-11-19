const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = '8497221404:AAEiVLukFHvufV7wzBSCIGzfAGWK3YHP9f4';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyQZ2RgUqnziCzd_5UC684qIz1ZxALHMUSL4bBexKp25P222h81LG5Px5zriPhZkyamGA/exec';

console.log('🚀 Starting Telegram Auto-Registration Bot...');

const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: true,
  request: {
    timeout: 10000
  }
});

// Store temporary user data for registration
const userStates = new Map();

// Test bot connection
bot.getMe().then(botInfo => {
  console.log('✅ Bot connected successfully:', botInfo.username);
}).catch(error => {
  console.log('❌ Bot connection failed:', error.message);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 Welcome to Earnings Bot!\n\n` +
                        `💰 **Auto-Registration System**\n\n` +
                        `Available Commands:\n` +
                        `/register - Get your Member ID\n` +
                        `/myid - Find your Member ID\n` +
                        `/earnings <ID> - Check earnings\n` +
                        `/help - Show help`;
  
  bot.sendMessage(chatId, welcomeMessage);
});

// Registration command
bot.onText(/\/register/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
  
  userStates.set(chatId, { userId, userName, step: 'awaiting_investment' });
  
  bot.sendMessage(chatId, 
    "💰 **Registration Process**\n\n" +
    "Please enter your investment amount (USD):\n" +
    "Example: 1000\n\n" +
    "Or type '0' if no investment yet."
  );
});

// Handle investment amount input
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text.startsWith('/') && userStates.has(chatId)) {
    const userData = userStates.get(chatId);
    
    if (userData.step === 'awaiting_investment') {
      const investment = parseFloat(text);
      
      if (isNaN(investment)) {
        return bot.sendMessage(chatId, "❌ Please enter a valid number for investment amount.");
      }
      
      try {
        await bot.sendChatAction(chatId, 'typing');
        
        const response = await axios.get(
          `${WEB_APP_URL}?action=register&telegramId=${userData.userId}&userName=${encodeURIComponent(userData.userName)}&investment=${investment}`
        );
        
        const data = response.data;
        userStates.delete(chatId);
        
        if (data.success) {
          bot.sendMessage(chatId, data.message);
        } else {
          bot.sendMessage(chatId, data.message);
        }
      } catch (error) {
        userStates.delete(chatId);
        bot.sendMessage(chatId, "❌ Registration failed. Please try again.");
      }
    }
  }
});

// Find my ID command
bot.onText(/\/myid/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    const response = await axios.get(`${WEB_APP_URL}?action=findMyId&telegramId=${userId}`);
    const data = response.data;
    
    bot.sendMessage(chatId, data.message);
  } catch (error) {
    bot.sendMessage(chatId, "❌ Error finding your ID. Please try again.");
  }
});

// Earnings lookup command
bot.onText(/\/earnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].trim();
  
  if (!memberId) {
    return bot.sendMessage(chatId, '❌ Please provide a Member ID\nExample: /earnings 1001');
  }
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(memberId)}`);
    const data = response.data;
    
    if (data.success) {
      await bot.sendMessage(chatId, data.message);
    } else {
      await bot.send
