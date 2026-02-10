const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

async function sendEmail(to, subject, text) {
  return transporter.sendMail({
    from: `Starlife Advert <${process.env.MAIL_FROM}>`,
    to,
    subject,
    text,
    replyTo: process.env.MAIL_REPLY_TO,
  });
}

function getPasswordStrengthError(password, label = 'password') {
  if (password.length < 8) {
    return `❌ Password must be at least 8 characters. Please enter ${label}:`;
  }
  if (!/[a-z]/.test(password)) {
    return `❌ Password must include at least one lowercase letter. Please enter ${label}:`;
  }
  if (!/[A-Z]/.test(password)) {
    return `❌ Password must include at least one uppercase letter. Please enter ${label}:`;
  }
  if (!/\d/.test(password)) {
    return `❌ Password must include at least one number. Please enter ${label}:`;
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return `❌ Password must include at least one symbol. Please enter ${label}:`;
  }
  return '';
}

// ==================== EMAIL NOTIFICATION HELPER ====================

// Helper function to send email notifications
async function sendEmailNotification(memberId, subject, templateName, data = {}) {
  try {
    const user = await getUserByMemberId(memberId);
    if (!user || !user.email) {
      console.log(`No email found for user ${memberId}`);
      return false;
    }

    // Email templates
    const templates = {
      'welcome': (data) => {
        return `Dear ${data.name},\n\n` +
               `Welcome to Starlife Advert! Your account has been successfully created.\n\n` +
               `📋 **Account Details:**\n` +
               `Member ID: ${data.memberId}\n` +
               `Name: ${data.name}\n` +
               `Email: ${data.email}\n` +
               `Password: ${data.password}\n` +
               `Referral Code: ${data.referralCode}\n` +
               `Join Date: ${new Date(data.joinDate).toLocaleDateString()}\n\n` +
               `💵 **Welcome Bonus:**\n` +
               `$1.00 has been added to your account balance.\n\n` +
               `💰 **Payment Methods:**\n` +
               `• M-Pesa Till: 6034186\n` +
               `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
               `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
               `• PayPal: starlife.payment@starlifeadvert.com\n` +
               `Name: Starlife Advert US Agency\n\n` +
               `📈 **Start Earning:**\n` +
               `1. Use /invest to make your first investment\n` +
               `2. Minimum investment: $10\n` +
               `3. Earn 2% daily profit (LIFETIME)\n` +
               `4. Share your referral code to earn 10% on FIRST investments!\n\n` +
               `🔒 **Account Security:**\n` +
               `This Telegram account is PERMANENTLY linked to your Member ID.\n` +
               `Save your Member ID and Password for future login.\n\n` +
               `Need help? Use /support in the bot.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'investment_pending': (data) => {
        return `Dear ${data.name},\n\n` +
               `Your investment request has been received and is pending approval.\n\n` +
               `📊 **Investment Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Payment Method: ${data.paymentMethod}\n` +
               `Investment ID: ${data.investmentId}\n` +
               `Transaction Hash: ${data.transactionHash || 'N/A'}\n` +
               `Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `⏳ **Status:** Pending Approval\n` +
               `Our team will review your payment proof and activate your investment within 15 minutes.\n\n` +
               `You will receive another email when your investment is approved.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'investment_approved': (data) => {
        return `Dear ${data.name},\n\n` +
               `🎉 **Your investment has been approved!**\n\n` +
               `📊 **Investment Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Investment ID: ${data.investmentId}\n` +
               `Daily Profit: $${(data.amount * 0.02).toFixed(2)}\n` +
               `Duration: LIFETIME (no expiration)\n` +
               `Approval Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `💰 **What happens next:**\n` +
               `• You will earn 2% daily profit starting today\n` +
               `• Profits are automatically added to your balance\n` +
               `• No action required from you\n` +
               `• Your investment will earn forever\n\n` +
               `${data.isFirstInvestment ? '🎉 **This is your FIRST investment!** If you were referred, your referrer earned 10% bonus.\n\n' : ''}` +
               `Check your earnings with /earnings command in the bot.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'investment_rejected': (data) => {
        return `Dear ${data.name},\n\n` +
               `❌ **Investment Rejected**\n\n` +
               `Your investment request has been rejected.\n\n` +
               `📊 **Investment Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Investment ID: ${data.investmentId}\n` +
               `Payment Method: ${data.paymentMethod}\n` +
               `Rejection Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `**Possible reasons:**\n` +
               `• Invalid payment proof\n` +
               `• Transaction not found\n` +
               `• Suspicious activity\n` +
               `• Incorrect payment details\n\n` +
               `Please contact support with /support in the bot for more information.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'withdrawal_request': (data) => {
        return `Dear ${data.name},\n\n` +
               `Your withdrawal request has been received.\n\n` +
               `💳 **Withdrawal Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Fee (5%): $${data.fee.toFixed(2)}\n` +
               `Net Amount: $${data.netAmount.toFixed(2)}\n` +
               `Method: ${data.method}\n` +
               `Withdrawal ID: ${data.withdrawalId}\n` +
               `Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `⏳ **Status:** Pending Approval\n` +
               `Our team will process your withdrawal within 10-15 minutes.\n\n` +
               `You will receive another email when your withdrawal is processed.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'withdrawal_approved': (data) => {
        return `Dear ${data.name},\n\n` +
               `✅ **Withdrawal Approved!**\n\n` +
               `Your withdrawal has been approved and will be processed shortly.\n\n` +
               `💳 **Withdrawal Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Fee (5%): $${data.fee.toFixed(2)}\n` +
               `Net Amount: $${data.netAmount.toFixed(2)}\n` +
               `Method: ${data.method}\n` +
               `Withdrawal ID: ${data.withdrawalId}\n` +
               `Details: ${data.details}\n` +
               `Approval Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `💰 **Processing Time:**\n` +
               `• M-Pesa: 10-15 minutes\n` +
               `• Bank Transfer: 1-2 business days\n` +
               `• PayPal: 10-15 minutes\n\n` +
               `If you don't receive your funds within the expected time, please contact support.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'withdrawal_rejected': (data) => {
        return `Dear ${data.name},\n\n` +
               `❌ **Withdrawal Rejected**\n\n` +
               `Your withdrawal request has been rejected.\n\n` +
               `💳 **Withdrawal Details:**\n` +
               `Amount: $${data.amount.toFixed(2)}\n` +
               `Fee (5%): $${data.fee.toFixed(2)}\n` +
               `Net Amount: $${data.netAmount.toFixed(2)}\n` +
               `Method: ${data.method}\n` +
               `Withdrawal ID: ${data.withdrawalId}\n` +
               `Rejection Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `💸 **Refund Status:**\n` +
               `Your funds ($${data.amount.toFixed(2)}) have been refunded to your account balance.\n\n` +
               `**Possible reasons:**\n` +
               `• Invalid payment details\n` +
               `• Suspicious activity\n` +
               `• Account verification required\n` +
               `• Technical issues\n\n` +
               `Please contact support with /support in the bot for more information.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'account_suspended': (data) => {
        return `Dear ${data.name},\n\n` +
               `🚫 **Account Suspended**\n\n` +
               `Your account has been suspended by an administrator.\n\n` +
               `📋 **Account Details:**\n` +
               `Member ID: ${data.memberId}\n` +
               `Name: ${data.name}\n` +
               `Suspension Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `❌ **What this means:**\n` +
               `• You cannot access your account\n` +
               `• You cannot make investments\n` +
               `• You cannot withdraw funds\n` +
               `• Your balance is frozen\n\n` +
               `✅ **What you can do:**\n` +
               `1. Submit an appeal with /appeal in the bot\n` +
               `2. Contact support with /support\n` +
               `3. Wait for admin review\n\n` +
               `If you believe this is an error, please submit an appeal immediately.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'account_unsuspended': (data) => {
        return `Dear ${data.name},\n\n` +
               `✅ **Account Reactivated!**\n\n` +
               `Your account has been reactivated by an administrator.\n\n` +
               `📋 **Account Details:**\n` +
               `Member ID: ${data.memberId}\n` +
               `Name: ${data.name}\n` +
               `Reactivation Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `🎉 **Welcome back!**\n\n` +
               `Your account is now fully accessible:\n` +
               `• You can login with /login\n` +
               `• You can make investments\n` +
               `• You can withdraw funds\n` +
               `• Your balance is available\n\n` +
               `Thank you for your patience.\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'password_reset': (data) => {
        return `Dear ${data.name},\n\n` +
               `🔐 **Password Reset**\n\n` +
               `Your password has been reset by an administrator.\n\n` +
               `📋 **Login Details:**\n` +
               `Member ID: ${data.memberId}\n` +
               `New Password: ${data.newPassword}\n` +
               `Reset Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `⚠️ **Security Notice:**\n` +
               `• Login immediately and change your password\n` +
               `• Use /changepassword after logging in\n` +
               `• Never share your password\n` +
               `• If you didn't request this, contact support immediately\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      },

      'password_changed': (data) => {
        return `Dear ${data.name},\n\n` +
               `✅ **Password Changed Successfully**\n\n` +
               `Your password has been changed.\n\n` +
               `📋 **Account Details:**\n` +
               `Member ID: ${data.memberId}\n` +
               `Change Date: ${new Date(data.date).toLocaleString()}\n\n` +
               `🔒 **Security Tips:**\n` +
               `• Never share your password\n` +
               `• Use a strong, unique password\n` +
               `• Change password regularly\n` +
               `• If you suspect unauthorized access, contact support immediately\n\n` +
               `Best regards,\n` +
               `Starlife Advert Team`;
      }
    };

    // Get the email template
    const template = templates[templateName];
    if (!template) {
      console.log(`Email template ${templateName} not found`);
      return false;
    }

    const emailBody = template(data);
    
    // Send the email
    await sendEmail(user.email, subject, emailBody);
    console.log(`📧 Email sent to ${user.email} for ${templateName}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email to ${memberId}:`, error.message);
    return false;
  }
}

// ==================== END OF EMAIL NOTIFICATION HELPER ====================

// ==================== BROADCAST EMAIL HELPER ====================

// Helper function to send broadcast emails to all users
async function sendBroadcastEmailToAll(subject, message, excludeAdmins = false) {
  try {
    console.log(`Starting email broadcast: ${subject}`);
    
    // Get all users with email
    const users = await getAllUsers();
    const usersWithEmail = users.filter(user => user.email && user.email.trim() !== '');
    
    if (excludeAdmins) {
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      usersWithEmail = usersWithEmail.filter(user => !adminIds.includes(user.chat_id));
    }
    
    console.log(`Found ${usersWithEmail.length} users with email addresses`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Send emails with rate limiting (3 per second to avoid overloading)
    for (const user of usersWithEmail) {
      try {
        await sendEmail(
          user.email,
          subject,
          `Dear ${user.name},\n\n${message}\n\nBest regards,\nStarlife Advert Team`
        );
        
        successCount++;
        console.log(`✅ Email sent to ${user.email} (${successCount}/${usersWithEmail.length})`);
        
        // Rate limiting: wait 300ms between emails to be gentle on Brevo
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        failCount++;
        console.error(`❌ Failed to send email to ${user.email}:`, error.message);
        
        // Wait a bit longer if there's an error
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`📧 Email broadcast completed! Success: ${successCount}, Failed: ${failCount}`);
    
    return {
      total: usersWithEmail.length,
      success: successCount,
      failed: failCount
    };
    
  } catch (error) {
    console.error('Error in sendBroadcastEmailToAll:', error.message);
    throw error;
  }
}

// Helper function to send batch emails (for large lists)
async function sendBatchBroadcastEmails(subject, message, batchSize = 50) {
  try {
    const users = await getAllUsers();
    const usersWithEmail = users.filter(user => user.email && user.email.trim() !== '');
    
    console.log(`Total users with email: ${usersWithEmail.length}`);
    console.log(`Sending in batches of ${batchSize} to respect 300/day limit`);
    
    let totalSent = 0;
    const results = [];
    
    for (let i = 0; i < usersWithEmail.length; i += batchSize) {
      const batch = usersWithEmail.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1} (${batch.length} users)`);
      
      let batchSuccess = 0;
      let batchFail = 0;
      
      for (const user of batch) {
        try {
          await sendEmail(
            user.email,
            subject,
            `Dear ${user.name},\n\n${message}\n\nBest regards,\nStarlife Advert Team`
          );
          
          batchSuccess++;
          totalSent++;
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          batchFail++;
          console.error(`Failed for ${user.email}:`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      results.push({
        batch: Math.floor(i/batchSize) + 1,
        success: batchSuccess,
        failed: batchFail
      });
      
      console.log(`Batch ${Math.floor(i/batchSize) + 1} complete: ${batchSuccess} sent, ${batchFail} failed`);
      
      // If we've sent 300 emails today, stop (respecting daily limit)
      if (totalSent >= 280) { // Stop at 280 to be safe
        console.log(`⚠️ Reached daily email limit (280/300). Stopping.`);
        break;
      }
      
      // Wait 10 seconds between batches
      if (i + batchSize < usersWithEmail.length) {
        console.log(`⏳ Waiting 10 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    return {
      totalUsers: usersWithEmail.length,
      totalSent: totalSent,
      batches: results
    };
    
  } catch (error) {
    console.error('Error in sendBatchBroadcastEmails:', error.message);
    throw error;
  }
}

// ==================== END OF BROADCAST EMAIL HELPER ====================

// ==================== SCHEDULED EMAIL BROADCAST SYSTEM ====================

// Store scheduled broadcasts
const scheduledBroadcasts = new Map();

// Schedule a broadcast email
function scheduleBroadcastEmail(name, subject, message, scheduleTime, recurring = false) {
  const now = new Date();
  const scheduledTime = new Date(scheduleTime);
  
  if (scheduledTime <= now) {
    console.log('Scheduled time must be in the future');
    return false;
  }
  
  const timeUntil = scheduledTime.getTime() - now.getTime();
  
  console.log(`⏰ Scheduling broadcast "${name}" for ${scheduledTime.toLocaleString()}`);
  
  const timeoutId = setTimeout(async () => {
    console.log(`⏰ Executing scheduled broadcast: ${name}`);
    
    try {
      const result = await sendBroadcastEmailToAll(subject, message);
      console.log(`✅ Scheduled broadcast "${name}" completed: ${result.success} emails sent`);
      
      // Store broadcast history
      await storeBroadcastHistory(name, subject, message, result);
      
      // If recurring, schedule again for next day
      if (recurring) {
        const nextDay = new Date(scheduledTime);
        nextDay.setDate(nextDay.getDate() + 1);
        scheduleBroadcastEmail(name, subject, message, nextDay, true);
      }
    } catch (error) {
      console.error(`❌ Scheduled broadcast "${name}" failed:`, error.message);
    }
  }, timeUntil);
  
  scheduledBroadcasts.set(name, {
    id: timeoutId,
    name: name,
    subject: subject,
    message: message,
    scheduledTime: scheduledTime,
    recurring: recurring
  });
  
  return true;
}

// Cancel scheduled broadcast
function cancelScheduledBroadcast(name) {
  const broadcast = scheduledBroadcasts.get(name);
  if (broadcast) {
    clearTimeout(broadcast.id);
    scheduledBroadcasts.delete(name);
    console.log(`❌ Cancelled scheduled broadcast: ${name}`);
    return true;
  }
  return false;
}

// List scheduled broadcasts
function listScheduledBroadcasts() {
  const broadcasts = [];
  for (const [name, broadcast] of scheduledBroadcasts) {
    broadcasts.push({
      name: broadcast.name,
      subject: broadcast.subject,
      scheduledTime: broadcast.scheduledTime,
      recurring: broadcast.recurring
    });
  }
  return broadcasts;
}

// Store broadcast history in database
async function storeBroadcastHistory(name, subject, message, result) {
  try {
    const broadcastId = `BRC-${Date.now()}`;
    await pool.query(
      `INSERT INTO broadcast_history (
        broadcast_id, name, subject, message, scheduled_time, 
        execution_time, total_users, emails_sent, emails_failed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        broadcastId,
        name,
        subject,
        message,
        new Date(),
        new Date(),
        result.totalUsers || result.total,
        result.totalSent || result.success,
        result.failed || 0
      ]
    );
    return true;
  } catch (error) {
    console.error('Error storing broadcast history:', error.message);
    return false;
  }
}

// Initialize broadcast history table
async function initBroadcastTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcast_history (
        id SERIAL PRIMARY KEY,
        broadcast_id VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        scheduled_time TIMESTAMP NOT NULL,
        execution_time TIMESTAMP NOT NULL,
        total_users INTEGER DEFAULT 0,
        emails_sent INTEGER DEFAULT 0,
        emails_failed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Broadcast history table ready');
  } catch (error) {
    console.error('Error creating broadcast table:', error.message);
  }
}

// ==================== END OF SCHEDULED EMAIL BROADCAST SYSTEM ====================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
});

// Initialize PostgreSQL tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Initializing database tables...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        member_id VARCHAR(50) UNIQUE NOT NULL,
        chat_id VARCHAR(100) UNIQUE,
        telegram_account_id VARCHAR(100),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(30),
        password_hash VARCHAR(255) NOT NULL,
        balance DECIMAL(15,2) DEFAULT 0.00,
        total_invested DECIMAL(15,2) DEFAULT 0.00,
        total_earned DECIMAL(15,2) DEFAULT 0.00,
        referral_earnings DECIMAL(15,2) DEFAULT 0.00,
        referrals INTEGER DEFAULT 0,
        referral_code VARCHAR(50) UNIQUE NOT NULL,
        referred_by VARCHAR(50),
        active_investments INTEGER DEFAULT 0,
        joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        last_password_change TIMESTAMP,
        banned BOOLEAN DEFAULT FALSE,
        bot_blocked BOOLEAN DEFAULT FALSE,
        account_bound BOOLEAN DEFAULT TRUE,
        offline_messages JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for users table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);
      CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id);
      CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    `);
    
    // Create investments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS investments (
        id SERIAL PRIMARY KEY,
        investment_id VARCHAR(50) UNIQUE NOT NULL,
        member_id VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        transaction_hash VARCHAR(255),
        paypal_email VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        days_active INTEGER DEFAULT 0,
        total_profit DECIMAL(15,2) DEFAULT 0.00,
        proof_media_id VARCHAR(100),
        proof_caption TEXT,
        approved_at TIMESTAMP,
        approved_by VARCHAR(100),
        rejected_at TIMESTAMP,
        rejected_by VARCHAR(100),
        completed_at TIMESTAMP,
        is_manual BOOLEAN DEFAULT FALSE,
        admin_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for investments table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_investments_member_id ON investments(member_id);
      CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
      CREATE INDEX IF NOT EXISTS idx_investments_investment_id ON investments(investment_id);
    `);
    
    // Create withdrawals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        withdrawal_id VARCHAR(50) UNIQUE NOT NULL,
        member_id VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        fee DECIMAL(15,2) NOT NULL,
        net_amount DECIMAL(15,2) NOT NULL,
        method VARCHAR(50) NOT NULL,
        details TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        approved_by VARCHAR(100),
        rejected_at TIMESTAMP,
        rejected_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for withdrawals table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_withdrawals_member_id ON withdrawals(member_id);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_withdrawal_id ON withdrawals(withdrawal_id);
    `);
    
    // Create referrals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referral_id VARCHAR(50) UNIQUE NOT NULL,
        referrer_id VARCHAR(50) NOT NULL,
        referrer_name VARCHAR(100) NOT NULL,
        referrer_code VARCHAR(50) NOT NULL,
        referred_id VARCHAR(50) NOT NULL,
        referred_name VARCHAR(100) NOT NULL,
        bonus_amount DECIMAL(15,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'pending',
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        investment_amount DECIMAL(15,2) DEFAULT 0.00,
        is_first_investment BOOLEAN DEFAULT TRUE,
        bonus_paid BOOLEAN DEFAULT FALSE,
        paid_at TIMESTAMP,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(member_id) ON DELETE CASCADE,
        FOREIGN KEY (referred_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for referrals table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
    `);
    
    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(50) UNIQUE NOT NULL,
        member_id VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        description TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        admin_id VARCHAR(100),
        investment_id VARCHAR(50),
        withdrawal_id VARCHAR(50),
        referral_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for transactions table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    `);
    
         // Create support_chats table (FIXED - removed duplicate created_at)
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_chats (
        id SERIAL PRIMARY KEY,
        chat_id VARCHAR(100) UNIQUE NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        user_chat_id VARCHAR(100),
        topic VARCHAR(200) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        messages JSONB DEFAULT '[]',
        admin_replied BOOLEAN DEFAULT FALSE,
        no_account BOOLEAN DEFAULT FALSE,
        is_logged_out BOOLEAN DEFAULT FALSE,
        is_appeal BOOLEAN DEFAULT FALSE,
        closed_by VARCHAR(50)
      )
    `);
    
    // Create indexes for support_chats table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_support_chats_user_id ON support_chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_support_chats_status ON support_chats(status);
      CREATE INDEX IF NOT EXISTS idx_support_chats_chat_id ON support_chats(chat_id);
    `);
    
    // Create earnings_views table
    await client.query(`
      CREATE TABLE IF NOT EXISTS earnings_views (
        id SERIAL PRIMARY KEY,
        view_id VARCHAR(50) UNIQUE NOT NULL,
        viewer_id VARCHAR(50) NOT NULL,
        viewed_id VARCHAR(50) NOT NULL,
        fee DECIMAL(15,2) NOT NULL,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (viewer_id) REFERENCES users(member_id) ON DELETE CASCADE,
        FOREIGN KEY (viewed_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);
    
    // Create media_files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_files (
        id SERIAL PRIMARY KEY,
        media_id VARCHAR(100) UNIQUE NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        caption TEXT,
        chat_id VARCHAR(100),
        sender VARCHAR(50),
        sender_id VARCHAR(100),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        investment_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    

    // Create shareholders table (isolated module)
    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholders (
        id SERIAL PRIMARY KEY,
        shareholder_id VARCHAR(50) UNIQUE NOT NULL,
        member_id VARCHAR(50) UNIQUE NOT NULL,
        activation_date TIMESTAMP,
        status VARCHAR(20) DEFAULT 'under_review',
        tier VARCHAR(100),
        total_stake_usd DECIMAL(15,2) DEFAULT 0.00,
        lock_from_last_activation BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (member_id) REFERENCES users(member_id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_shareholders_member_id ON shareholders(member_id);
      CREATE INDEX IF NOT EXISTS idx_shareholders_shareholder_id ON shareholders(shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_shareholders_status ON shareholders(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_stake_requests (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(50) UNIQUE NOT NULL,
        shareholder_id VARCHAR(50) NOT NULL,
        amount_usd DECIMAL(15,2) NOT NULL,
        method VARCHAR(50),
        proof_file_id VARCHAR(255),
        proof_file_type VARCHAR(50),
        proof_reference VARCHAR(255),
        status VARCHAR(30) DEFAULT 'pending_proof',
        admin_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP,
        decided_by VARCHAR(100)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_stake_requests_shareholder_id ON shareholder_stake_requests(shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_sh_stake_requests_status ON shareholder_stake_requests(status);
      CREATE INDEX IF NOT EXISTS idx_sh_stake_requests_request_id ON shareholder_stake_requests(request_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_stake_history (
        id SERIAL PRIMARY KEY,
        shareholder_id VARCHAR(50) NOT NULL,
        amount_usd DECIMAL(15,2) NOT NULL,
        type VARCHAR(30) NOT NULL,
        ref VARCHAR(100),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_stake_history_shareholder_id ON shareholder_stake_history(shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_sh_stake_history_created_at ON shareholder_stake_history(created_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_earnings (
        id SERIAL PRIMARY KEY,
        shareholder_id VARCHAR(50) UNIQUE NOT NULL,
        earnings_balance_usd DECIMAL(15,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'pending_review',
        next_payout_date TIMESTAMP,
        last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_earnings_shareholder_id ON shareholder_earnings(shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_sh_earnings_status ON shareholder_earnings(status);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_withdrawal_requests (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(50) UNIQUE NOT NULL,
        shareholder_id VARCHAR(50) NOT NULL,
        amount_usd DECIMAL(15,2) NOT NULL,
        payout_method VARCHAR(50) NOT NULL,
        payout_details TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'pending_admin_approval',
        admin_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMP,
        decided_by VARCHAR(100)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_withdrawal_requests_shareholder_id ON shareholder_withdrawal_requests(shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_sh_withdrawal_requests_status ON shareholder_withdrawal_requests(status);
      CREATE INDEX IF NOT EXISTS idx_sh_withdrawal_requests_request_id ON shareholder_withdrawal_requests(request_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_tiers (
        id SERIAL PRIMARY KEY,
        tier_name VARCHAR(100) UNIQUE NOT NULL,
        min_usd DECIMAL(15,2) NOT NULL,
        benefits_json JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_tiers_min_usd ON shareholder_tiers(min_usd);
    `);

    const tierCount = await client.query('SELECT COUNT(*) FROM shareholder_tiers');
    if (parseInt(tierCount.rows[0].count, 10) === 0) {
      await client.query(
        `INSERT INTO shareholder_tiers (tier_name, min_usd, benefits_json)
         VALUES
         ('Bronze', 100.00, '["Transport allowance"]'::jsonb),
         ('Silver', 500.00, '["Transport allowance", "Daily expenses allowance"]'::jsonb),
         ('Gold', 1000.00, '["Transport allowance", "Daily expenses allowance", "Travel & housing allowance"]'::jsonb)
        `
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS shareholder_audit_log (
        id SERIAL PRIMARY KEY,
        admin_id VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_id VARCHAR(100) NOT NULL,
        before_state JSONB,
        after_state JSONB,
        reason TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sh_audit_admin_id ON shareholder_audit_log(admin_id);
      CREATE INDEX IF NOT EXISTS idx_sh_audit_target_id ON shareholder_audit_log(target_id);
      CREATE INDEX IF NOT EXISTS idx_sh_audit_timestamp ON shareholder_audit_log(timestamp);
    `);

    // Create fake_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fake_members (
        id SERIAL PRIMARY KEY,
        fake_member_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        investment DECIMAL(15,2) NOT NULL,
        profit DECIMAL(15,2) NOT NULL,
        referrals INTEGER DEFAULT 0,
        join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_fake BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Populate fake_members table if empty
    const fakeCount = await client.query('SELECT COUNT(*) FROM fake_members');
    if (parseInt(fakeCount.rows[0].count) === 0) {
      console.log('🔄 Generating fake members...');
      const fakeMembers = generateFakeMembers(50);
      for (const member of fakeMembers) {
        await client.query(
          'INSERT INTO fake_members (fake_member_id, name, investment, profit, referrals, join_date, is_fake) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [member.id, member.name, member.investment, member.profit, member.referrals, member.joinDate, true]
        );
      }
    }
    
    console.log('✅ Database tables initialized successfully');
// Initialize broadcast table
await initBroadcastTable();
// Initialize daily profit table
await initDailyProfitTable();    
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== DATABASE HELPER FUNCTIONS ====================

// Get user by chat ID
async function getUserByChatId(chatId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE chat_id = $1',
      [chatId.toString()]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by chat ID:', error.message);
    return null;
  }
}

// Get user by member ID
async function getUserByMemberId(memberId) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE member_id = $1',
      [memberId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by member ID:', error.message);
    return null;
  }
}

// Get user by email
async function getUserByEmail(email) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by email:', error.message);
    return null;
  }
}

// Get user by referral code
async function getUserByReferralCode(referralCode) {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE referral_code = $1',
      [referralCode]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user by referral code:', error.message);
    return null;
  }
}

// Create new user
async function createUser(userData) {
  try {
    const result = await pool.query(
      `INSERT INTO users (
        member_id, chat_id, telegram_account_id, name, email, phone, password_hash,
        referral_code, referred_by, balance, total_invested, total_earned,
        referral_earnings, referrals, active_investments, joined_date,
        last_login, banned, bot_blocked, account_bound, offline_messages
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        userData.memberId,
        userData.chatId,
        userData.telegramAccountId,
        userData.name,
        userData.email,
        userData.phone,
        userData.passwordHash,
        userData.referralCode,
        userData.referredBy || null,
        userData.balance || 0,
        userData.totalInvested || 0,
        userData.totalEarned || 0,
        userData.referralEarnings || 0,
        userData.referrals || 0,
        userData.activeInvestments || 0,
        new Date(),
        new Date(),
        false,
        false,
        true,
        JSON.stringify([])
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error.message);
    throw error;
  }
}

// Update user
async function updateUser(memberId, updates) {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    fields.push('updated_at = $' + index);
    values.push(new Date());
    
    values.push(memberId);
    
    const query = `UPDATE users SET ${fields.join(', ')} WHERE member_id = $${index + 1} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating user:', error.message);
    throw error;
  }
}

// Get user's active investments
async function getUserActiveInvestments(memberId) {
  try {
    const result = await pool.query(
      'SELECT * FROM investments WHERE member_id = $1 AND status = $2',
      [memberId, 'active']
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user investments:', error.message);
    return [];
  }
}

// Get all active investments
async function getAllActiveInvestments() {
  try {
    const result = await pool.query(
      'SELECT * FROM investments WHERE status = $1',
      ['active']
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all active investments:', error.message);
    return [];
  }
}

// Create investment
async function createInvestment(investmentData) {
  try {
    const result = await pool.query(
      `INSERT INTO investments (
        investment_id, member_id, amount, payment_method, transaction_hash,
        paypal_email, status, date, proof_media_id, proof_caption
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        investmentData.id,
        investmentData.memberId,
        investmentData.amount,
        investmentData.paymentMethod,
        investmentData.transactionHash || null,
        investmentData.paypalEmail || null,
        investmentData.status || 'pending',
        new Date(),
        investmentData.proofMediaId || null,
        investmentData.proofCaption || ''
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating investment:', error.message);
    throw error;
  }
}

// Update investment
async function updateInvestment(investmentId, updates) {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    values.push(investmentId);
    
    const query = `UPDATE investments SET ${fields.join(', ')} WHERE investment_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating investment:', error.message);
    throw error;
  }
}

// Create withdrawal
async function createWithdrawal(withdrawalData) {
  try {
    const result = await pool.query(
      `INSERT INTO withdrawals (
        withdrawal_id, member_id, amount, fee, net_amount, method, details, status, date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        withdrawalData.id,
        withdrawalData.memberId,
        withdrawalData.amount,
        withdrawalData.fee,
        withdrawalData.netAmount,
        withdrawalData.method,
        withdrawalData.details,
        'pending',
        new Date()
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating withdrawal:', error.message);
    throw error;
  }
}

// Update withdrawal
async function updateWithdrawal(withdrawalId, updates) {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    values.push(withdrawalId);
    
    const query = `UPDATE withdrawals SET ${fields.join(', ')} WHERE withdrawal_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating withdrawal:', error.message);
    throw error;
  }
}

// Create referral
async function createReferral(referralData) {
  try {
    const result = await pool.query(
      `INSERT INTO referrals (
        referral_id, referrer_id, referrer_name, referrer_code,
        referred_id, referred_name, status, date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        referralData.id,
        referralData.referrerId,
        referralData.referrerName,
        referralData.referrerCode,
        referralData.referredId,
        referralData.referredName,
        'pending',
        new Date()
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating referral:', error.message);
    throw error;
  }
}

// Update referral
async function updateReferral(referralId, updates) {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    values.push(referralId);
    
    const query = `UPDATE referrals SET ${fields.join(', ')} WHERE referral_id = $${index} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating referral:', error.message);
    throw error;
  }
}

// Create transaction
async function createTransaction(transactionData) {
  try {
    const result = await pool.query(
      `INSERT INTO transactions (
        transaction_id, member_id, type, amount, description, date, admin_id,
        investment_id, withdrawal_id, referral_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        transactionData.id,
        transactionData.memberId,
        transactionData.type,
        transactionData.amount,
        transactionData.description || '',
        new Date(),
        transactionData.adminId || null,
        transactionData.investmentId || null,
        transactionData.withdrawalId || null,
        transactionData.referralId || null
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating transaction:', error.message);
    throw error;
  }
}

// Get user transactions
async function getUserTransactions(memberId, limit = 100) {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE member_id = $1 ORDER BY date DESC LIMIT $2',
      [memberId, limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting user transactions:', error.message);
    return [];
  }
}

// Create support chat
async function createSupportChat(chatData) {
  try {
    const result = await pool.query(
      `INSERT INTO support_chats (
        chat_id, user_id, user_name, user_chat_id, topic, status,
        messages, admin_replied, no_account, is_logged_out, is_appeal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        chatData.id,
        chatData.userId,
        chatData.userName,
        chatData.userChatId || null,
        chatData.topic,
        'active',
        JSON.stringify([{
          sender: 'user',
          message: chatData.firstMessage || 'Started chat',
          timestamp: new Date().toISOString()
        }]),
        false,
        chatData.noAccount || false,
        chatData.isLoggedOut || false,
        chatData.isAppeal || false
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating support chat:', error.message);
    throw error;
  }
}

// Get support chat by ID
async function getSupportChat(chatId) {
  try {
    const result = await pool.query(
      'SELECT * FROM support_chats WHERE chat_id = $1',
      [chatId]
    );
    if (result.rows[0]) {
      result.rows[0].messages = result.rows[0].messages || [];
    }
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting support chat:', error.message);
    return null;
  }
}

// Update support chat
async function updateSupportChat(chatId, updates) {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }
    
    fields.push('updated_at = $' + index);
    values.push(new Date());
    
    values.push(chatId);
    
    const query = `UPDATE support_chats SET ${fields.join(', ')} WHERE chat_id = $${index + 1} RETURNING *`;
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating support chat:', error.message);
    throw error;
  }
}

// Add message to support chat
async function addMessageToSupportChat(chatId, message) {
  try {
    const chat = await getSupportChat(chatId);
    if (!chat) return null;
    
    const messages = chat.messages || [];
    messages.push(message);
    
    const result = await pool.query(
      'UPDATE support_chats SET messages = $1, updated_at = $2 WHERE chat_id = $3 RETURNING *',
      [JSON.stringify(messages), new Date(), chatId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error adding message to support chat:', error.message);
    throw error;
  }
}

// Get active support chats
async function getActiveSupportChats() {
  try {
    const result = await pool.query(
      'SELECT * FROM support_chats WHERE status = $1 ORDER BY updated_at DESC',
      ['active']
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting active support chats:', error.message);
    return [];
  }
}

// Store media file
async function storeMediaFile(mediaData) {
  try {
    const result = await pool.query(
      `INSERT INTO media_files (
        media_id, file_id, file_type, caption, chat_id,
        sender, sender_id, timestamp, investment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        mediaData.id,
        mediaData.fileId,
        mediaData.fileType,
        mediaData.caption || '',
        mediaData.chatId || null,
        mediaData.sender || 'user',
        mediaData.senderId || null,
        new Date(),
        mediaData.investmentId || null
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error storing media file:', error.message);
    throw error;
  }
}

// Get media file by ID
async function getMediaFile(mediaId) {
  try {
    const result = await pool.query(
      'SELECT * FROM media_files WHERE media_id = $1',
      [mediaId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting media file:', error.message);
    return null;
  }
}

// Get media files by chat ID
async function getMediaFilesByChat(chatId) {
  try {
    const result = await pool.query(
      'SELECT * FROM media_files WHERE chat_id = $1 ORDER BY timestamp DESC',
      [chatId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting media files by chat:', error.message);
    return [];
  }
}

// Get media files by investment ID
async function getMediaFilesByInvestmentId(investmentId) {
  try {
    const result = await pool.query(
      'SELECT * FROM media_files WHERE investment_id = $1 ORDER BY timestamp DESC',
      [investmentId]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting media files by investment:', error.message);
    return [];
  }
}

// Create earnings view
async function createEarningsView(viewData) {
  try {
    const result = await pool.query(
      'INSERT INTO earnings_views (view_id, viewer_id, viewed_id, fee, date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [viewData.id, viewData.viewerId, viewData.viewedId, viewData.fee, new Date()]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating earnings view:', error.message);
    throw error;
  }
}

// Get fake members
async function getFakeMembers(limit = 50) {
  try {
    const result = await pool.query(
      'SELECT * FROM fake_members ORDER BY join_date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting fake members:', error.message);
    return [];
  }
}

// Get all users (for admin)
async function getAllUsers(limit = 100) {
  try {
    const result = await pool.query(
      'SELECT * FROM users ORDER BY joined_date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all users:', error.message);
    return [];
  }
}

// Get all investments (for admin)
async function getAllInvestments(limit = 100) {
  try {
    const result = await pool.query(
      'SELECT * FROM investments ORDER BY date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all investments:', error.message);
    return [];
  }
}

// Get all withdrawals (for admin)
async function getAllWithdrawals(limit = 100) {
  try {
    const result = await pool.query(
      'SELECT * FROM withdrawals ORDER BY date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all withdrawals:', error.message);
    return [];
  }
}

// Get all referrals (for admin)
async function getAllReferrals(limit = 100) {
  try {
    const result = await pool.query(
      'SELECT * FROM referrals ORDER BY date DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error getting all referrals:', error.message);
    return [];
  }
}

// Get system statistics
async function getSystemStats() {
  try {
    const stats = {};
    
    // Users count
    const usersResult = await pool.query('SELECT COUNT(*) as total, SUM(balance) as total_balance, SUM(total_invested) as total_invested, SUM(total_earned) as total_earned FROM users WHERE banned = false');
    stats.users = usersResult.rows[0];
    
    // Active investments
    const investmentsResult = await pool.query("SELECT COUNT(*) as total, SUM(amount) as total_amount FROM investments WHERE status = 'active'");
    stats.investments = investmentsResult.rows[0];
    
    // Pending investments
    const pendingInvestmentsResult = await pool.query("SELECT COUNT(*) as total FROM investments WHERE status = 'pending'");
    stats.pendingInvestments = pendingInvestmentsResult.rows[0];
    
    // Withdrawals
    const withdrawalsResult = await pool.query("SELECT COUNT(*) as total, SUM(amount) as total_amount, SUM(fee) as total_fees FROM withdrawals WHERE status = 'pending'");
    stats.withdrawals = withdrawalsResult.rows[0];
    
    // Active support chats
    const supportResult = await pool.query("SELECT COUNT(*) as total FROM support_chats WHERE status = 'active'");
    stats.supportChats = supportResult.rows[0];
    
    return stats;
  } catch (error) {
    console.error('Error getting system stats:', error.message);
    return {};
  }
}

async function createShareholderAuditLog({ adminId, action, targetId, beforeState = null, afterState = null, reason = null }) {
  try {
    await pool.query(
      `INSERT INTO shareholder_audit_log (admin_id, action, target_id, before_state, after_state, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, action, targetId, beforeState ? JSON.stringify(beforeState) : null, afterState ? JSON.stringify(afterState) : null, reason]
    );
  } catch (error) {
    console.error('Error creating shareholder audit log:', error.message);
  }
}

async function ensureShareholderTablesReady() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shareholders (
      id SERIAL PRIMARY KEY,
      shareholder_id VARCHAR(50) UNIQUE NOT NULL,
      member_id VARCHAR(50) UNIQUE NOT NULL,
      activation_date TIMESTAMP,
      status VARCHAR(20) DEFAULT 'under_review',
      tier VARCHAR(100),
      total_stake_usd DECIMAL(15,2) DEFAULT 0.00,
      lock_from_last_activation BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES users(member_id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_shareholders_member_id ON shareholders(member_id);
    CREATE INDEX IF NOT EXISTS idx_shareholders_shareholder_id ON shareholders(shareholder_id);
    CREATE INDEX IF NOT EXISTS idx_shareholders_status ON shareholders(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shareholder_earnings (
      id SERIAL PRIMARY KEY,
      shareholder_id VARCHAR(50) UNIQUE NOT NULL,
      earnings_balance_usd DECIMAL(15,2) DEFAULT 0.00,
      status VARCHAR(20) DEFAULT 'pending_review',
      next_payout_date TIMESTAMP,
      last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sh_earnings_shareholder_id ON shareholder_earnings(shareholder_id);
    CREATE INDEX IF NOT EXISTS idx_sh_earnings_status ON shareholder_earnings(status);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shareholder_tiers (
      id SERIAL PRIMARY KEY,
      tier_name VARCHAR(100) UNIQUE NOT NULL,
      min_usd DECIMAL(15,2) NOT NULL,
      benefits_json JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sh_tiers_min_usd ON shareholder_tiers(min_usd);
  `);

  const tierCount = await pool.query('SELECT COUNT(*) FROM shareholder_tiers');
  if (parseInt(tierCount.rows[0].count, 10) === 0) {
    await pool.query(
      `INSERT INTO shareholder_tiers (tier_name, min_usd, benefits_json)
       VALUES
       ('Bronze', 100.00, '["Transport allowance"]'::jsonb),
       ('Silver', 500.00, '["Transport allowance", "Daily expenses allowance"]'::jsonb),
       ('Gold', 1000.00, '["Transport allowance", "Daily expenses allowance", "Travel & housing allowance"]'::jsonb)
      `
    );
  }
}

async function getShareholderByMemberId(memberId) {
  try {
    await ensureShareholderTablesReady();
    const result = await pool.query('SELECT * FROM shareholders WHERE member_id = $1', [memberId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting shareholder by member ID:', error.message);
    return null;
  }
}

async function getShareholderByShareholderId(shareholderId) {
  try {
    await ensureShareholderTablesReady();
    const result = await pool.query('SELECT * FROM shareholders WHERE shareholder_id = $1', [shareholderId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting shareholder by shareholder ID:', error.message);
    return null;
  }
}

async function getShareholderTiers() {
  try {
    await ensureShareholderTablesReady();
    const result = await pool.query('SELECT * FROM shareholder_tiers ORDER BY min_usd ASC');
    return result.rows;
  } catch (error) {
    console.error('Error getting shareholder tiers:', error.message);
    return [];
  }
}

async function generateShareholderIdForUser(userName) {
  const year = new Date().getFullYear();
  const initials = getInitials(userName);
  const prefixPattern = `SHA-${year}-${initials}`;

  const result = await pool.query(
    `SELECT shareholder_id FROM shareholders
     WHERE shareholder_id LIKE $1
     ORDER BY shareholder_id DESC
     LIMIT 1`,
    [`${prefixPattern}-%-${SHAREHOLDER_ID_SUFFIX}`]
  );

  let seq = 1;
  if (result.rows[0]?.shareholder_id) {
    const matches = result.rows[0].shareholder_id.match(/-(\d{2,})-/);
    if (matches && matches[1]) {
      seq = parseInt(matches[1], 10) + 1;
    }
  }

  return `SHA-${year}-${initials}-${String(seq).padStart(2, '0')}-${SHAREHOLDER_ID_SUFFIX}`;
}

async function ensureShareholderEarningsRecord(shareholderId) {
  await pool.query(
    `INSERT INTO shareholder_earnings (shareholder_id, earnings_balance_usd, status, last_update)
     VALUES ($1, 0.00, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT (shareholder_id) DO NOTHING`,
    [shareholderId]
  );
}

async function getShareholderDashboard(memberId) {
  const user = await getUserByMemberId(memberId);
  if (!user) return null;

  const shareholder = await getShareholderByMemberId(memberId);
  if (!shareholder) {
    return { user, shareholder: null };
  }

  await ensureShareholderEarningsRecord(shareholder.shareholder_id);

  const [tiersResult, earningsResult, historyResult, topupResult] = await Promise.all([
    pool.query('SELECT * FROM shareholder_tiers ORDER BY min_usd ASC'),
    pool.query('SELECT * FROM shareholder_earnings WHERE shareholder_id = $1 LIMIT 1', [shareholder.shareholder_id]),
    pool.query('SELECT * FROM shareholder_stake_history WHERE shareholder_id = $1 ORDER BY created_at DESC LIMIT 10', [shareholder.shareholder_id]),
    pool.query('SELECT * FROM shareholder_stake_requests WHERE shareholder_id = $1 ORDER BY created_at DESC LIMIT 10', [shareholder.shareholder_id])
  ]);

  return {
    user,
    shareholder,
    tiers: tiersResult.rows,
    earnings: earningsResult.rows[0] || null,
    stakeHistory: historyResult.rows,
    topupRequests: topupResult.rows
  };
}

async function createShareholderProfile(memberId, adminId, reason = 'Admin created shareholder profile', preferredShareholderId = null) {
  await ensureShareholderTablesReady();
  const user = await getUserByMemberId(memberId);
  if (!user) throw new Error('User not found');

  const existing = await getShareholderByMemberId(memberId);
  if (existing) {
    throw new Error('Shareholder profile already exists');
  }

  const tiers = await getShareholderTiers();
  const baseTier = tiers[0] || { tier_name: 'Bronze' };
  let shareholderId = await generateShareholderIdForUser(user.name);
  if (preferredShareholderId) {
    const existingByShareholderId = await getShareholderByShareholderId(preferredShareholderId);
    if (existingByShareholderId) {
      throw new Error('Shareholder ID already exists');
    }
    shareholderId = preferredShareholderId;
  }

  const result = await pool.query(
    `INSERT INTO shareholders (shareholder_id, member_id, activation_date, status, tier, total_stake_usd)
     VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, 0.00)
     RETURNING *`,
    [shareholderId, memberId, SHAREHOLDER_STATUS.ACTIVE, baseTier.tier_name]
  );

  await ensureShareholderEarningsRecord(shareholderId);

  await createShareholderAuditLog({
    adminId,
    action: 'create_shareholder_profile',
    targetId: shareholderId,
    beforeState: null,
    afterState: result.rows[0],
    reason
  });

  return result.rows[0];
}

function getLockStatus(shareholder) {
  if (!shareholder || !shareholder.activation_date) {
    return { eligible: false, remainingMs: SHAREHOLDER_WITHDRAWAL_LOCK_MONTHS * 30 * 24 * 60 * 60 * 1000 };
  }

  const activationDate = new Date(shareholder.activation_date);
  const unlockDate = new Date(activationDate);
  unlockDate.setMonth(unlockDate.getMonth() + SHAREHOLDER_WITHDRAWAL_LOCK_MONTHS);
  const now = new Date();
  const remainingMs = unlockDate.getTime() - now.getTime();

  return {
    eligible: remainingMs <= 0,
    unlockDate,
    remainingMs: Math.max(remainingMs, 0)
  };
}

function formatRemainingLockTime(ms) {
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `${days} day(s)`;
}

async function recomputeShareholderTierAndStake(shareholderId) {
  const stakeSum = await pool.query(
    `SELECT COALESCE(SUM(amount_usd), 0) as total
     FROM shareholder_stake_history
     WHERE shareholder_id = $1`,
    [shareholderId]
  );

  const totalStake = parseFloat(stakeSum.rows[0].total || 0);
  const tiers = await getShareholderTiers();
  const tier = getShareholderTierByStake(tiers, totalStake);

  const result = await pool.query(
    `UPDATE shareholders
     SET total_stake_usd = $2,
         tier = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE shareholder_id = $1
     RETURNING *`,
    [shareholderId, totalStake, tier ? tier.tier_name : null]
  );

  return result.rows[0];
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

const SHAREHOLDER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  UNDER_REVIEW: 'under_review'
};

const SHAREHOLDER_REQUEST_STATUS = {
  PENDING_PROOF: 'pending_proof',
  PENDING_ADMIN_APPROVAL: 'pending_admin_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const SHAREHOLDER_WITHDRAWAL_LOCK_MONTHS = 6;
const SHAREHOLDER_ID_SUFFIX = process.env.SHAREHOLDER_ID_SUFFIX || 'UI';
const SHAREHOLDER_MIN_TOPUP_USD = parseFloat(process.env.SHAREHOLDER_MIN_TOPUP_USD || '10');

function getInitials(name = '') {
  const parts = name
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return 'NA';
  if (parts.length === 1) {
    const firstTwo = parts[0].substring(0, 2).toUpperCase();
    return firstTwo.length === 1 ? `${firstTwo}X` : firstTwo;
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getShareholderTierByStake(tiers, totalStakeUsd) {
  const stake = parseFloat(totalStakeUsd || 0);
  const sortedTiers = [...tiers].sort((a, b) => parseFloat(a.min_usd) - parseFloat(b.min_usd));
  let selectedTier = sortedTiers[0] || null;

  for (const tier of sortedTiers) {
    if (stake >= parseFloat(tier.min_usd || 0)) {
      selectedTier = tier;
    }
  }

  return selectedTier;
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

// ==================== HELPER FUNCTIONS ====================

// Check if user is logged in
async function isUserLoggedIn(chatId) {
  if (loggedOutUsers.has(chatId.toString())) {
    return false;
  }
  
  const user = await getUserByChatId(chatId);
  return !!user;
}

// Check if user is logged in AND not banned
async function canUserAccessAccount(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return false;
  }
  
  const user = await getUserByChatId(chatId);
  if (!user || user.banned) return false;
  
  return true;
}

// Get user data if logged in
async function getLoggedInUser(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return null;
  }
  
  const user = await getUserByChatId(chatId);
  if (!user || user.banned) {
    return null;
  }
  
  return user;
}

// Check if Telegram account is already bound to a different user
async function isChatIdBoundToDifferentUser(chatId, requestedMemberId) {
  const user = await getUserByChatId(chatId);
  if (!user) return false;
  return user.member_id !== requestedMemberId;
}

// Check if member ID is already bound to a different Telegram account
async function isMemberIdBoundToDifferentChat(memberId, chatId) {
  const user = await getUserByMemberId(memberId);
  if (!user || !user.chat_id) return false;
  return user.chat_id !== chatId.toString();
}

// Get active support chat for user
async function getActiveSupportChat(userId) {
  try {
    const result = await pool.query(
      "SELECT * FROM support_chats WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting active support chat:', error.message);
    return null;
  }
}

// Send notification to user
async function sendUserNotification(memberId, message) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      console.log(`User ${memberId} not found`);
      return false;
    }
    
    if (!user.chat_id) {
      console.log(`User ${memberId} has no chat_id`);
      return false;
    }
    
    const isLoggedOut = loggedOutUsers.has(user.chat_id);
    
    try {
      await bot.sendMessage(user.chat_id, message);
      
      if (isLoggedOut) {
        await updateUser(memberId, {
          last_login: new Date()
        });
        console.log(`Message sent to logged out user ${memberId}`);
      }
      
      return true;
    } catch (error) {
      console.log(`Could not send message to ${memberId}:`, error.message);
      
      if (error.response && error.response.statusCode === 403) {
        console.log(`User ${memberId} has blocked the bot`);
        await updateUser(memberId, { bot_blocked: true });
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
    const user = await getUserByMemberId(memberId);
    if (!user) return false;
    
    const offlineMessages = user.offline_messages || [];
    offlineMessages.push({
      id: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    });
    
    if (offlineMessages.length > 50) {
      offlineMessages = offlineMessages.slice(-50);
    }
    
    await updateUser(memberId, { offline_messages: JSON.stringify(offlineMessages) });
    return true;
  } catch (error) {
    console.log('Error storing offline message:', error.message);
    return false;
  }
}

// Helper function to send direct message to user
async function sendDirectMessageToUser(adminChatId, memberId, messageText) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(adminChatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (user.bot_blocked) {
      await bot.sendMessage(adminChatId,
        `❌ **User has blocked the bot**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `Cannot send message. User needs to unblock the bot first.`
      );
      return;
    }
    
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
    const supportChatId = `ADMIN-MSG-${Date.now()}`;
    await createSupportChat({
      id: supportChatId,
      userId: memberId,
      userName: user.name,
      topic: 'Direct Admin Message',
      no_account: false,
      is_appeal: false,
      firstMessage: messageText
    });
    
    await updateSupportChat(supportChatId, {
      status: sent ? 'delivered' : 'stored_offline',
      admin_replied: true,
      messages: JSON.stringify([{
        sender: 'admin',
        message: messageText,
        timestamp: new Date().toISOString(),
        adminId: adminChatId.toString()
      }])
    });
    
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
    const supportChat = await getSupportChat(session.data.chatId);
    
    if (!supportChat) {
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
      senderId: session.data.memberId || `chat_${chatId}`
    });
    
    // Add media message to chat
    const messages = supportChat.messages || [];
    messages.push({
      sender: session.data.memberId ? 'user' : 'anonymous',
      message: caption || `[${fileType.toUpperCase()} sent]`,
      mediaId: mediaId,
      fileType: fileType,
      timestamp: new Date().toISOString()
    });
    
    await updateSupportChat(session.data.chatId, {
      messages: JSON.stringify(messages),
      admin_replied: false
    });
    
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
      const userName = supportChat.user_name || 'Unknown User';
      const userId = supportChat.user_id || 'Anonymous';
      
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
    
    const fileId = mediaFile.file_id;
    const fileType = mediaFile.file_type;
    const caption = mediaFile.caption || '';
    
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
    await initDatabase();
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
  bot.onText(/\/testemail (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const toEmail = match[1].trim();

  try {
    await sendEmail(
      toEmail,
      "Test from Starlife Advert",
      "Hello! Email sending is working."
    );
    bot.sendMessage(chatId, "Email sent successfully!");
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "Email failed: " + err.message);
  }
});

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

// ==================== DAILY PROFIT CALCULATION SYSTEM ====================

// Fixed daily profit calculation function
async function calculateDailyProfits() {
  try {
    console.log(`🔄 Starting daily profit calculation at ${new Date().toISOString()}`);
    
    const activeInvestments = await getAllActiveInvestments();
    console.log(`Found ${activeInvestments.length} active investments to process`);
    
    let processedCount = 0;
    let errorCount = 0;
    
    for (const investment of activeInvestments) {
      try {
        // Calculate daily profit (2%)
        const dailyProfit = calculateDailyProfit(investment.amount);
        console.log(`Processing investment ${investment.investment_id}: ${investment.amount} -> ${dailyProfit}`);
        
        const user = await getUserByMemberId(investment.member_id);
        if (!user) {
          console.log(`User ${investment.member_id} not found for investment ${investment.investment_id}`);
          continue;
        }
        
        // Update user balance and total earned
        const newBalance = parseFloat(user.balance || 0) + dailyProfit;
        const newTotalEarned = parseFloat(user.total_earned || 0) + dailyProfit;
        
        await updateUser(investment.member_id, {
          balance: newBalance,
          total_earned: newTotalEarned
        });
        
        // Create transaction record
        await createTransaction({
          id: `PROFIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: investment.member_id,
          type: 'daily_profit',
          amount: dailyProfit,
          description: `Daily profit from investment #${investment.investment_id}`,
          investmentId: investment.investment_id
        });
        
        // Update investment stats
        const newTotalProfit = parseFloat(investment.total_profit || 0) + dailyProfit;
        const newDaysActive = (investment.days_active || 0) + 1;
        
        await updateInvestment(investment.investment_id, {
          total_profit: newTotalProfit,
          days_active: newDaysActive,
          updated_at: new Date()
        });
        
        processedCount++;
        
        // Log success
        console.log(`✅ Added ${dailyProfit} profit to ${investment.member_id} from investment ${investment.investment_id}`);
        
      } catch (investmentError) {
        errorCount++;
        console.error(`❌ Error processing investment ${investment.investment_id}:`, investmentError.message);
      }
    }
    
    console.log(`✅ Daily profits calculation completed! Processed: ${processedCount}, Errors: ${errorCount}`);
    
    // Log to file or database for tracking
    await logDailyProfitRun(processedCount, errorCount);
    
    return {
      processed: processedCount,
      errors: errorCount,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('❌ Error in calculateDailyProfits:', error.message);
    throw error;
  }
}

// Log daily profit run to database
async function logDailyProfitRun(processed, errors) {
  try {
    await pool.query(
      `INSERT INTO daily_profit_runs (processed_count, error_count, run_date) 
       VALUES ($1, $2, $3)`,
      [processed, errors, new Date()]
    );
  } catch (error) {
    console.error('Error logging profit run:', error.message);
  }
}

// Initialize daily profit runs table
async function initDailyProfitTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_profit_runs (
        id SERIAL PRIMARY KEY,
        processed_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        run_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Daily profit runs table ready');
  } catch (error) {
    console.error('Error creating daily profit table:', error.message);
  }
}

// Schedule daily profits to run at midnight UTC
function scheduleDailyProfits() {
  console.log('🔄 Setting up daily profit scheduler...');
  
  // Calculate time until next midnight UTC
  const now = new Date();
  const midnightUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1, // Tomorrow
    0, 0, 0, 0 // Midnight
  ));
  
  const msUntilMidnight = midnightUTC.getTime() - now.getTime();
  
  console.log(`Next daily profit calculation at: ${midnightUTC.toISOString()}`);
  console.log(`Time until next run: ${Math.floor(msUntilMidnight / 1000 / 60 / 60)} hours ${Math.floor((msUntilMidnight / 1000 / 60) % 60)} minutes`);
  
  // Run at midnight, then every 24 hours
  setTimeout(() => {
    console.log('⏰ Running first daily profit calculation...');
    calculateDailyProfits();
    
    // Schedule recurring every 24 hours
    setInterval(async () => {
      console.log('⏰ Running scheduled daily profit calculation...');
      await calculateDailyProfits();
    }, 24 * 60 * 60 * 1000); // 24 hours
    
  }, msUntilMidnight);
  
  // Run immediately on startup for testing (optional - remove in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('🧪 Running test profit calculation (development mode)...');
    setTimeout(async () => {
      await calculateDailyProfits();
    }, 5000); // Run after 5 seconds for testing
  }
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
      const investmentId = `INV-${Date.now()}`;
      
      const investment = {
        id: investmentId,
        memberId: session.data.memberId,
        amount: session.data.amount,
        paymentMethod: session.data.paymentMethod,
        transactionHash: session.data.transactionHash || '',
        proofMediaId: `MEDIA-${Date.now()}`,
        proofCaption: caption || `Payment proof for $${session.data.amount}`
      };
      
      await createInvestment(investment);
      
      // Store media file
      await storeMediaFile({
        id: `MEDIA-${Date.now()}`,
        fileId: fileId,
        fileType: 'photo',
        caption: `Payment proof for ${formatCurrency(session.data.amount)} (Method: ${session.data.paymentMethod})`,
        investmentId: investmentId,
        sender: session.data.memberId
      });
      
      // SEND INVESTMENT PENDING EMAIL
      try {
        const user = await getUserByMemberId(session.data.memberId);
        if (user && user.email) {
          await sendEmailNotification(session.data.memberId,
            `Investment Submitted - Pending Approval`,
            'investment_pending',
            {
              name: user.name,
              amount: session.data.amount,
              paymentMethod: session.data.paymentMethod,
              investmentId: investmentId,
              transactionHash: session.data.transactionHash || '',
              date: new Date()
            }
          );
        }
      } catch (emailError) {
        console.log('Investment pending email failed:', emailError.message);
      }
      
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
        const user = await getUserByMemberId(session.data.memberId);
        
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
  
  // Handle shareholder top-up proof photo upload
  if (session && session.step === 'shareholder_topup_proof_ref' && session.data.requestId) {
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || '';

      await pool.query(
        `UPDATE shareholder_stake_requests
         SET proof_file_id = $1,
             proof_file_type = 'photo',
             proof_reference = COALESCE(proof_reference, $2),
             status = $3
         WHERE request_id = $4`,
        [fileId, caption || null, SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL, session.data.requestId]
      );

      await bot.sendMessage(chatId, `✅ Photo proof uploaded for request ${session.data.requestId}. You can continue with proof reference text or type SKIP.`);
      return;
    } catch (error) {
      console.log('Error handling shareholder topup photo proof:', error.message);
      await bot.sendMessage(chatId, '❌ Error uploading proof photo.');
      return;
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
  
  // Handle shareholder top-up proof document upload
  if (session && session.step === 'shareholder_topup_proof_ref' && session.data.requestId) {
    try {
      const fileId = msg.document.file_id;
      const caption = msg.caption || '';
      await pool.query(
        `UPDATE shareholder_stake_requests
         SET proof_file_id = $1,
             proof_file_type = 'document',
             proof_reference = COALESCE(proof_reference, $2),
             status = $3
         WHERE request_id = $4`,
        [fileId, caption || null, SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL, session.data.requestId]
      );
      await bot.sendMessage(chatId, `✅ Document proof uploaded for request ${session.data.requestId}. You can continue with proof reference text or type SKIP.`);
      return;
    } catch (error) {
      console.log('Error handling shareholder topup document proof:', error.message);
      await bot.sendMessage(chatId, '❌ Error uploading proof document.');
      return;
    }
  }

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
    const user = await getUserByChatId(chatId);
    
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
      
      await updateUser(user.member_id, { last_login: new Date() });
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.total_earned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referral_code}\n\n` +
                            `📋 **Quick Commands:**\n` +
                            `/invest - Make investment\n` +
                            `/earnings - View YOUR earnings\n` +
                            `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                            `/withdraw - Withdraw funds\n` +
                            `/referral - Share & earn 10% (FIRST investment only)\n` +
                            `/profile - Account details\n` +
                            `/shareholders - Shareholders dashboard\n` +
                            `/transactions - View transaction history\n` +
                            `/support - Contact support\n` +
                            `/logout - Logout\n\n` +
                            `💳 **Payment Methods:**\n` +
                            `• M-Pesa Till: 6034186\n` +
                            `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                            `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                            `• PayPal: starlife.payment@starlifeadvert.com\n` +
                            `Name: Starlife Advert US Agency`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
  }
  
  // User is not logged in - show public welcome
  const fakeMembers = await getFakeMembers(3);
  
  let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
  fakeMembers.forEach(member => {
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
  fakeMessage += '• PayPal: starlife.payment@starlifeadvert.com\n';
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

// Help command
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
  helpMessage += `• PayPal: starlife.payment@starlifeadvert.com\n`;
  helpMessage += `Name: Starlife Advert US Agency\n\n`;
  helpMessage += `**❓ Need Help?**\n`;
  helpMessage += `Use /support for immediate assistance`;
  
  await bot.sendMessage(chatId, helpMessage);
});

// Transactions command
bot.onText(/\/transactions/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  try {
    const transactions = await getUserTransactions(user.member_id, 10);
    
    if (transactions.length === 0) {
      await bot.sendMessage(chatId, '📭 No transactions found.');
      return;
    }
    
    let message = `📊 **Transaction History**\n\n`;
    message += `Total Transactions: ${transactions.length}\n\n`;
    
    // Show transactions
    transactions.forEach((tx, index) => {
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
    
    // Calculate totals
    const totalDeposits = transactions
      .filter(t => t.amount > 0 && t.type !== 'daily_profit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalWithdrawals = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const totalProfits = transactions
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

// Investnow command
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
                      `Email: starlife.payment@starlifeadvert.com\n\n` +
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

// Change Password command
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
      memberId: user.member_id
    }
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Change Password**\n\n` +
    `For security, please enter your current password:`
  );
});

// Invest command
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
      memberId: user.member_id
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
    `   Email: starlife.payment@starlifeadvert.com\n\n` +
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
  
  const userInvestments = await getUserActiveInvestments(user.member_id);
  
  let message = `📈 **Your Earnings**\n\n`;
  message += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `📊 Total Earned: ${formatCurrency(user.total_earned || 0)}\n`;
  message += `💵 Total Invested: ${formatCurrency(user.total_invested || 0)}\n`;
  message += `👥 Referral Earnings: ${formatCurrency(user.referral_earnings || 0)}\n\n`;
  
  if (userInvestments.length > 0) {
    message += `**Active Investments:**\n`;
    userInvestments.forEach(inv => {
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
  
  // Check if user is trying to view their own earnings
  if (targetMemberId === user.member_id) {
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
    const targetUser = await getUserByMemberId(targetMemberId);
    
    if (!targetUser) {
      await bot.sendMessage(chatId, `❌ User ${targetMemberId} not found.`);
      return;
    }
    
    // Deduct fee from user
    const newBalance = parseFloat(user.balance || 0) - fee;
    await updateUser(user.member_id, { balance: newBalance });
    
    // Record transaction
    await createTransaction({
      id: `VIEW-EARN-${Date.now()}`,
      memberId: user.member_id,
      type: 'view_earnings_fee',
      amount: -fee,
      description: `Fee to view ${targetMemberId}'s earnings`
    });
    
    // Record earnings view
    await createEarningsView({
      id: `VIEW-${Date.now()}`,
      viewerId: user.member_id,
      viewedId: targetMemberId,
      fee: fee
    });
    
    // Get target user's investments
    const targetInvestments = await getUserActiveInvestments(targetMemberId);
    
    let message = `👤 **Earnings Report for ${targetUser.name} (${targetMemberId})**\n\n`;
    message += `💰 Balance: ${formatCurrency(targetUser.balance || 0)}\n`;
    message += `📊 Total Earned: ${formatCurrency(targetUser.total_earned || 0)}\n`;
    message += `💵 Total Invested: ${formatCurrency(targetUser.total_invested || 0)}\n`;
    message += `👥 Referral Earnings: ${formatCurrency(targetUser.referral_earnings || 0)}\n`;
    message += `📈 Active Investments: ${targetInvestments.length}\n`;
    message += `👥 Total Referrals: ${targetUser.referrals || 0}\n\n`;
    
    if (targetInvestments.length > 0) {
      message += `**Active Investments:**\n`;
      targetInvestments.forEach((inv, index) => {
        const dailyProfit = calculateDailyProfit(inv.amount);
        message += `${index + 1}. ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
      });
    }
    
    message += `\n---\n`;
    message += `Fee paid: ${formatCurrency(fee)}\n`;
    message += `Your new balance: ${formatCurrency(newBalance)}`;
    
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
  
  // Get user's referrals
  let userReferrals = [];
  try {
    const result = await pool.query(
      'SELECT * FROM referrals WHERE referrer_id = $1',
      [user.member_id]
    );
    userReferrals = result.rows;
  } catch (error) {
    console.error('Error getting referrals:', error.message);
  }
  
  const successfulReferrals = userReferrals.filter(r => r.status === 'paid');
  
  let message = `👤 **Your Profile**\n\n`;
  message += `Name: ${user.name}\n`;
  message += `Member ID: ${user.member_id}\n`;
  message += `Email: ${user.email || 'Not set'}\n`;
  message += `Phone: ${user.phone || 'Not set'}\n`;
  message += `Joined: ${new Date(user.joined_date).toLocaleDateString()}\n`;
  message += `Last Login: ${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}\n\n`;
  message += `💰 **Financial Summary**\n`;
  message += `Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `Total Earned: ${formatCurrency(user.total_earned || 0)}\n`;
  message += `Total Invested: ${formatCurrency(user.total_invested || 0)}\n`;
  message += `Referral Earnings: ${formatCurrency(user.referral_earnings || 0)}\n\n`;
  message += `👥 **Referral Stats**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Successful Referrals: ${successfulReferrals.length}\n`;
  message += `Your Code: ${user.referral_code}\n\n`;
  message += `**Account Security**\n`;
  message += `/changepassword - Change password\n`;
  message += `/forgotpassword - Reset password\n\n`;
  message += `**Share your code:** ${user.referral_code}\n`;
  message += `Tell friends to use: /register ${user.referral_code}`;
  
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
  
  // Get user's referrals
  let userReferrals = [];
  try {
    const result = await pool.query(
      'SELECT * FROM referrals WHERE referrer_id = $1',
      [user.member_id]
    );
    userReferrals = result.rows;
  } catch (error) {
    console.error('Error getting referrals:', error.message);
  }
  
  let message = `👥 **Referral Program**\n\n`;
  message += `**Earn 10% commission on your referrals' FIRST investment only!**\n\n`;
  message += `Your Referral Code: **${user.referral_code}**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Total Earned from Referrals: ${formatCurrency(user.referral_earnings || 0)}\n\n`;
  message += `**How it works:**\n`;
  message += `1. Share your referral code with friends\n`;
  message += `2. When they register using your code, they become your referral\n`;
  message += `3. When they make their FIRST investment, you get 10%\n`;
  message += `4. Their subsequent investments don't earn you bonuses\n\n`;
  message += `**How to share:**\n`;
  message += `Tell your friends to use the command:\n`;
  message += `/register ${user.referral_code}\n\n`;
  message += `**Your Referrals:**\n`;
  
  if (userReferrals.length > 0) {
    userReferrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅ Bonus Paid' : 
                    ref.status === 'pending' ? '⏳ Pending First Investment' : '❌ Failed';
      const bonus = ref.bonus_amount ? `- Bonus: ${formatCurrency(ref.bonus_amount)}` : '';
      message += `${index + 1}. ${ref.referred_name} - ${status} ${bonus}\n`;
    });
  } else {
    message += `No referrals yet. Start sharing your code!`;
  }
  
  await bot.sendMessage(chatId, message);
});

// Withdraw command
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if ((user.balance || 0) < 2) {
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Minimum withdrawal: $2\n` +
      `Your balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Please earn more through investments first.`
    );
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_withdrawal_amount',
    data: {
      memberId: user.member_id,
      balance: user.balance
    }
  };
  
  await bot.sendMessage(chatId,
    `💳 **Withdraw Funds**\n\n` +
    `Your Balance: ${formatCurrency(user.balance || 0)}\n` +
    `Minimum Withdrawal: $2\n` +
    `Withdrawal Fee: 5%\n\n` +
    `Enter amount to withdraw:`
  );
});

// Shareholder dashboard command
bot.onText(/\/shareholders/, async (msg) => {
  const chatId = msg.chat.id;

  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }

  try {
    const dashboard = await getShareholderDashboard(user.member_id);

    if (!dashboard || !dashboard.shareholder) {
      await bot.sendMessage(chatId,
        `ℹ️ You do not have a shareholder profile yet.

` +
        `Contact admin to create one, then use /shareholders again.`
      );
      return;
    }

    const lockStatus = getLockStatus(dashboard.shareholder);
    const currentTier = dashboard.tiers.find(t => t.tier_name === dashboard.shareholder.tier);
    const benefits = currentTier ? (currentTier.benefits_json || []) : [];

    let message = `🏛️ **Shareholders Dashboard**

`;
    message += `👤 Name: ${dashboard.user.name}
`;
    message += `🆔 Member ID: ${dashboard.user.member_id}
`;
    message += `🧾 Shareholder ID: ${dashboard.shareholder.shareholder_id}
`;
    message += `📧 Email: ${dashboard.user.email || 'N/A'}
`;
    message += `📱 Phone: ${dashboard.user.phone || 'N/A'}
`;
    message += `📌 Status: ${dashboard.shareholder.status}

`;

    message += `💵 Stake Overview (USD)
`;
    message += `• Total Stake: ${formatCurrency(dashboard.shareholder.total_stake_usd || 0)}
`;
    message += `• Tier: ${dashboard.shareholder.tier || 'Unassigned'}

`;

    message += `🎁 Benefits
`;
    if (Array.isArray(benefits) && benefits.length > 0) {
      benefits.forEach((benefit, idx) => {
        message += `${idx + 1}. ${benefit}
`;
      });
    } else {
      message += `No benefits configured for this tier.
`;
    }

    message += `
📈 Earnings Status
`;
    message += `• Status: ${dashboard.earnings?.status || 'pending_review'}
`;
    message += `• Earnings Balance: ${formatCurrency(dashboard.earnings?.earnings_balance_usd || 0)}
`;

    if (lockStatus.eligible) {
      message += `• Withdrawal Lock: ✅ Unlocked
`;
    } else {
      message += `• Withdrawal Lock: ⏳ ${formatRemainingLockTime(lockStatus.remainingMs)} remaining
`;
    }

    message += `
🧾 Recent Stake Requests
`;
    if (dashboard.topupRequests.length === 0) {
      message += `No stake requests found.
`;
    } else {
      dashboard.topupRequests.slice(0, 5).forEach((req, idx) => {
        message += `${idx + 1}. ${formatCurrency(req.amount_usd)} • ${req.status} • ${new Date(req.created_at).toLocaleDateString()}
`;
      });
    }

    message += `
🔹 Commands:
`;
    message += `/sh_topup - Top up shareholder stake
`;
    message += `/sh_withdraw - Withdraw shareholder earnings`;

    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /shareholders:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading shareholders dashboard.');
  }
});

bot.onText(/\/sh_topup/, async (msg) => {
  const chatId = msg.chat.id;

  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }

  const shareholder = await getShareholderByMemberId(user.member_id);
  if (!shareholder) {
    await bot.sendMessage(chatId, '❌ You are not a shareholder. Contact admin.');
    return;
  }

  if (shareholder.status !== SHAREHOLDER_STATUS.ACTIVE) {
    await bot.sendMessage(chatId, `⚠️ Shareholder status is ${shareholder.status}. Top-up is currently unavailable.`);
    return;
  }

  userSessions[chatId] = {
    step: 'shareholder_topup_amount',
    data: {
      memberId: user.member_id,
      shareholderId: shareholder.shareholder_id
    }
  };

  await bot.sendMessage(chatId,
    `💵 **Shareholder Stake Top-Up (USD)**

` +
    `Minimum top-up: ${formatCurrency(SHAREHOLDER_MIN_TOPUP_USD)}
` +
    `Enter amount in USD:`
  );
});

bot.onText(/\/sh_withdraw/, async (msg) => {
  const chatId = msg.chat.id;

  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }

  const shareholder = await getShareholderByMemberId(user.member_id);
  if (!shareholder) {
    await bot.sendMessage(chatId, '❌ You are not a shareholder. Contact admin.');
    return;
  }

  const earningsResult = await pool.query('SELECT * FROM shareholder_earnings WHERE shareholder_id = $1 LIMIT 1', [shareholder.shareholder_id]);
  const earnings = earningsResult.rows[0] || { earnings_balance_usd: 0, status: 'pending_review' };

  const lockStatus = getLockStatus(shareholder);
  if (!lockStatus.eligible) {
    await bot.sendMessage(chatId,
      `⏳ Withdrawal not available yet.
` +
      `Remaining lock time: ${formatRemainingLockTime(lockStatus.remainingMs)}
` +
      `Unlock date: ${lockStatus.unlockDate.toLocaleDateString()}`
    );
    return;
  }

  if (earnings.status !== 'active') {
    await bot.sendMessage(chatId, `⚠️ Earnings status is ${earnings.status}. Withdrawal unavailable.`);
    return;
  }

  if (parseFloat(earnings.earnings_balance_usd || 0) <= 0) {
    await bot.sendMessage(chatId, '❌ No shareholder earnings available for withdrawal.');
    return;
  }

  userSessions[chatId] = {
    step: 'shareholder_withdraw_amount',
    data: {
      memberId: user.member_id,
      shareholderId: shareholder.shareholder_id,
      earningsBalance: parseFloat(earnings.earnings_balance_usd || 0)
    }
  };

  await bot.sendMessage(chatId,
    `💸 **Shareholder Earnings Withdrawal**

` +
    `Available earnings: ${formatCurrency(earnings.earnings_balance_usd || 0)}
` +
    `Enter withdrawal amount in USD:`
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
    `You have been logged out from ${user.name} (${user.member_id}).\n\n` +
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
  
  const offlineMessages = user.offline_messages || [];
  const unreadMessages = offlineMessages.filter(msg => !msg.read);
  
  if (offlineMessages.length === 0) {
    await bot.sendMessage(chatId, '📭 Your inbox is empty.');
    return;
  }
  
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
    offlineMessages.forEach(msg => {
      msg.read = true;
    });
    await updateUser(user.member_id, { offline_messages: JSON.stringify(offlineMessages) });
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
  
  const offlineMessages = user.offline_messages || [];
  offlineMessages.forEach(msg => {
    msg.read = true;
  });
  
  await updateUser(user.member_id, { offline_messages: JSON.stringify(offlineMessages) });
  await bot.sendMessage(chatId, '✅ All messages marked as read.');
});

// Clear all messages
bot.onText(/\/clearmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  await updateUser(user.member_id, { offline_messages: JSON.stringify([]) });
  await bot.sendMessage(chatId, '✅ All messages cleared.');
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
    const user = await getUserByChatId(chatId);
    
    // Check for active support chat
    const activeChat = await getActiveSupportChat(user.member_id);
    
    if (activeChat) {
      // Continue existing chat
      userSessions[chatId] = {
        step: 'support_chat',
        data: {
          memberId: user.member_id,
          userName: user.name,
          chatId: activeChat.chat_id
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
        memberId: user.member_id,
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
    await updateSupportChat(session.data.chatId, {
      status: 'closed',
      closed_by: 'user'
    });
    
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
  
  if (!user.banned) {
    await bot.sendMessage(chatId, '✅ Your account is not suspended. Use /support for other issues.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'appeal_message',
    data: {
      memberId: user.member_id,
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
  
  // Check if this Telegram account is already registered
  const existingUser = await getUserByChatId(chatId);
  
  if (existingUser) {
    await bot.sendMessage(chatId,
      `🚫 **Account Already Linked**\n\n` +
      `This Telegram account is already linked to:\n` +
      `Member ID: ${existingUser.member_id}\n` +
      `Name: ${existingUser.name}\n\n` +
      `You cannot register multiple accounts with the same Telegram account.\n` +
      `Use /login to access your existing account.\n\n` +
      `If you believe this is an error, contact support with /support`
    );
    return;
  }
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
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
    const referrer = await getUserByReferralCode(referralCode);
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
      const user = await getUserByMemberId(memberId);
      
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
      await updateUser(memberId, {
        password_hash: hashPassword(newPassword),
        last_password_change: new Date()
      });
      
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
      
      // SEND PASSWORD RESET EMAIL
      try {
        await sendEmailNotification(user.member_id,
          `Password Reset Request`,
          'password_reset',
          {
            name: user.name,
            memberId: user.member_id,
            newPassword: newPassword,
            date: new Date()
          }
        );
      } catch (emailError) {
        console.log('Password reset email failed:', emailError.message);
      }
      
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
      const user = await getUserByEmail(email);
      
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
      await updateUser(user.member_id, {
        password_hash: hashPassword(newPassword),
        last_password_change: new Date()
      });
      
      delete userSessions[chatId];
      
      // Send password to user's registered chat
      await sendUserNotification(user.member_id,
        `🔐 **Password Reset Successfully**\n\n` +
        `Your password has been reset via password recovery.\n\n` +
        `New Password: **${newPassword}**\n\n` +
        `**Login Details:**\n` +
        `Member ID: ${user.member_id}\n` +
        `Password: ${newPassword}\n\n` +
        `For security, change your password after logging in.\n` +
        `Use /changepassword to set a new password.`
      );
      
      // SEND PASSWORD RESET EMAIL
      try {
        await sendEmailNotification(user.member_id,
          `Password Reset Request`,
          'password_reset',
          {
            name: user.name,
            memberId: user.member_id,
            newPassword: newPassword,
            date: new Date()
          }
        );
      } catch (emailError) {
        console.log('Password reset email failed:', emailError.message);
      }
      
      await bot.sendMessage(chatId,
        `✅ **Password Reset Initiated**\n\n` +
        `A new password has been sent to the registered chat for ${user.member_id}.\n\n` +
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
      const user = await getUserByMemberId(session.data.memberId);
      
      if (!user || user.password_hash !== hashPassword(currentPassword)) {
        await bot.sendMessage(chatId, '❌ Current password is incorrect. Please try again:');
        return;
      }
      
      session.step = 'change_password_new';
      
      await bot.sendMessage(chatId,
        `✅ Current password verified.\n\n` +
        `Enter your new password:\n` +
        `• At least 8 characters\n` +
        `• Must include uppercase, lowercase, number, and symbol\n\n` +
        `Enter new password:`
      );
    }
    else if (session.step === 'change_password_new') {
      const newPassword = text.trim();
      
      const passwordError = getPasswordStrengthError(newPassword, 'new password');
      if (passwordError) {
        await bot.sendMessage(chatId, passwordError);
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
      await updateUser(session.data.memberId, {
        password_hash: hashPassword(session.data.newPassword),
        last_password_change: new Date()
      });
      
      delete userSessions[chatId];
      
      // SEND PASSWORD CHANGE EMAIL
      try {
        const user = await getUserByMemberId(session.data.memberId);
        if (user && user.email) {
          await sendEmailNotification(session.data.memberId,
            `Password Changed Successfully`,
            'password_changed',
            {
              name: user.name,
              memberId: session.data.memberId,
              date: new Date()
            }
          );
        }
      } catch (emailError) {
        console.log('Password change email failed:', emailError.message);
      }
      
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
        `Step 2/5: Enter your email\n\n` +
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

      const existingEmailUser = await getUserByEmail(email);
      if (existingEmailUser) {
        await bot.sendMessage(chatId, '❌ This email is already registered. Please enter a different email:');
        return;
      }
      
      session.data.email = email;
      session.step = 'awaiting_phone';
      
      await bot.sendMessage(chatId,
        `✅ Email: ${email}\n\n` +
        `Step 3/5: Enter your phone number\n\n` +
        `Include country code (e.g., +254712345678)\n` +
        `Enter your phone number:`
      );
    }
    else if (session.step === 'awaiting_phone') {
      const phone = text.trim();
      const phoneRegex = /^\+\d{7,15}$/;

      if (!phoneRegex.test(phone)) {
        await bot.sendMessage(chatId, '❌ Invalid phone number. Use country code (e.g., +254712345678):');
        return;
      }

      session.data.phone = phone;
      session.step = 'awaiting_password';

      await bot.sendMessage(chatId,
        `✅ Phone: ${phone}\n\n` +
        `Step 4/5: Create a password\n\n` +
        `• At least 8 characters\n` +
        `• Must include uppercase, lowercase, number, and symbol\n` +
        `Enter your password:`
      );
    }
    else if (session.step === 'awaiting_password') {
      const password = text.trim();
      const passwordError = getPasswordStrengthError(password);
      if (passwordError) {
        await bot.sendMessage(chatId, passwordError);
        return;
      }
      
      session.data.password = password;
      session.step = 'awaiting_confirm_password';
      
      await bot.sendMessage(chatId,
        `Step 5/5: Confirm your password\n\n` +
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
      let usersCount = 0;
      try {
        const result = await pool.query('SELECT COUNT(*) FROM users');
        usersCount = parseInt(result.rows[0].count);
      } catch (error) {
        console.error('Error counting users:', error.message);
      }
      
      const memberId = `USER-${1000 + usersCount + 1}`;
      
      // Generate referral code
      const referralCode = `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Check if referral code is valid
      let referredBy = null;
      if (session.data.referralCode) {
        const referrer = await getUserByReferralCode(session.data.referralCode);
        if (referrer) {
          referredBy = session.data.referralCode;
        }
      }
      
      // Create new user
      const newUser = {
        memberId: memberId,
        chatId: chatId.toString(),
        telegramAccountId: chatId.toString(),
        name: session.data.name,
        email: session.data.email,
        phone: session.data.phone,
        passwordHash: hashPassword(session.data.password),
        referralCode: referralCode,
        referredBy: referredBy,
        balance: 1,
        totalInvested: 0,
        totalEarned: 0,
        referralEarnings: 0,
        referrals: 0,
        activeInvestments: 0
      };
      
      const createdUser = await createUser(newUser);
      
      // Handle referral tracking if user was referred
      if (referredBy) {
        const referrer = await getUserByReferralCode(referredBy);
        if (referrer) {
          // Update referrer's referral count
          await updateUser(referrer.member_id, {
            referrals: (referrer.referrals || 0) + 1
          });
          
          // Create referral record
          await createReferral({
            id: `REF-${Date.now()}`,
            referrerId: referrer.member_id,
            referrerName: referrer.name,
            referrerCode: referrer.referral_code,
            referredId: memberId,
            referredName: session.data.name
          });
          
          // Notify referrer
          await sendUserNotification(referrer.member_id,
            `🎉 **New Referral!**\n\n` +
            `${session.data.name} registered using your referral code!\n` +
            `You will earn 10% when they make their FIRST investment.\n\n` +
            `Total Referrals: ${referrer.referrals + 1}`
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
      
      welcomeMessage += `\n**Welcome Bonus:**\n` +
                       `$1.00 has been added to your account balance.\n\n` +
                       `**IMPORTANT SECURITY:**\n` +
                       `This Telegram account is now PERMANENTLY linked to Member ID: ${memberId}\n` +
                       `You cannot login to any other account with this Telegram account.\n\n` +
                       `**Save your Member ID and Password!**\n` +
                       `You'll need them if you ever switch Telegram accounts.\n\n` +
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
                       `• PayPal: starlife.payment@starlifeadvert.com\n` +
                       `Name: Starlife Advert US Agency\n\n` +
                       `**Quick Commands:**\n` +
                       `/invest - Make investment\n` +
                       `/earnings - View YOUR earnings\n` +
                       `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                       `/transactions - View transaction history\n` +
                       `/referral - Share & earn 10% (FIRST investment only)\n` +
                       `/profile - Account details\n` +
                       `/shareholders - Shareholders dashboard\n` +
                       `/support - Contact support\n\n` +
                       `✅ You are now logged in!`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      
      // SEND WELCOME EMAIL
      try {
        await sendEmailNotification(memberId, 
          `Welcome to Starlife Advert, ${session.data.name}!`,
          'welcome',
          {
            name: session.data.name,
            memberId: memberId,
            email: session.data.email,
            password: session.data.password,
            referralCode: referralCode,
            joinDate: new Date()
          }
        );
      } catch (emailError) {
        console.log('Welcome email failed:', emailError.message);
      }
      
      // Record welcome bonus
      await createTransaction({
        id: `TRX-WELCOME-${Date.now()}`,
        memberId: memberId,
        type: 'bonus',
        amount: 1,
        description: 'Welcome bonus'
      });

      // Record transaction
      await createTransaction({
        id: `TRX-REG-${Date.now()}`,
        memberId: memberId,
        type: 'registration',
        amount: 0,
        description: 'Account registration'
      });
    }
    
    // Handle login steps
    else if (session.step === 'login_memberid') {
      const memberId = text.trim().toUpperCase();
      const user = await getUserByMemberId(memberId);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Member ID not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 Your account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // SECURITY FIX: Check if Telegram account is already bound to a different user
      const isBoundToDifferentUser = await isChatIdBoundToDifferentUser(chatId, memberId);
      if (isBoundToDifferentUser) {
        const existingUser = await getUserByChatId(chatId);
        await bot.sendMessage(chatId,
          `🚫 **Account Binding Error**\n\n` +
          `This Telegram account is already PERMANENTLY linked to:\n` +
          `Member ID: ${existingUser.member_id}\n` +
          `Name: ${existingUser.name}\n\n` +
          `You cannot login to a different account with this Telegram account.\n` +
          `If you need to access ${memberId}, you must use the Telegram account that was used during registration.\n\n` +
          `Use /support if you need help.`
        );
        delete userSessions[chatId];
        return;
      }
      
      // SECURITY FIX: Check if member ID is already bound to a different Telegram account
      const isBoundToDifferentChat = await isMemberIdBoundToDifferentChat(memberId, chatId);
      if (isBoundToDifferentChat && user.chat_id) {
        await bot.sendMessage(chatId,
          `🚫 **Account Already Bound**\n\n` +
          `Member ID ${memberId} is already PERMANENTLY linked to a different Telegram account.\n\n` +
          `You must use the original Telegram account that was used during registration.\n` +
          `If you no longer have access to that Telegram account, contact support with /support\n\n` +
          `This is a security measure to protect your account.`
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
      const user = await getUserByMemberId(session.data.memberId);
      
      if (!user || user.password_hash !== hashPassword(password)) {
        await bot.sendMessage(chatId, '❌ Invalid password. Try again:');
        session.step = 'login_password';
        return;
      }
      
      // SECURITY FIX: Final check before allowing login
      const isBoundToDifferentUser = await isChatIdBoundToDifferentUser(chatId, session.data.memberId);
      if (isBoundToDifferentUser) {
        const existingUser = await getUserByChatId(chatId);
        await bot.sendMessage(chatId,
          `🚫 **Security Violation**\n\n` +
          `Login blocked! This Telegram account is bound to a different member ID.\n` +
          `Bound to: ${existingUser.member_id}\n` +
          `Trying to access: ${session.data.memberId}\n\n` +
          `Contact support if you believe this is an error.`
        );
        delete userSessions[chatId];
        return;
      }
      
      // Update user login details - DON'T update chat_id if it's already set (security)
      if (!user.chat_id) {
        await updateUser(session.data.memberId, {
          chat_id: chatId.toString(),
          telegram_account_id: chatId.toString(),
          account_bound: true,
          last_login: new Date()
        });
      } else {
        await updateUser(session.data.memberId, {
          last_login: new Date()
        });
      }
      
      // Clear from logged out users
      loggedOutUsers.delete(chatId.toString());
      
      // Clear session
      delete userSessions[chatId];
      
      let welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                          `📈 Total Earned: ${formatCurrency(user.total_earned || 0)}\n` +
                          `👥 Referrals: ${user.referrals || 0}\n` +
                          `🔗 Your Code: ${user.referral_code}\n\n`;
      
      // Check for offline messages
      if (user.offline_messages && user.offline_messages.length > 0) {
        const unreadMessages = user.offline_messages.filter(msg => !msg.read);
        
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
                        `/shareholders - Shareholders dashboard\n` +
                        `/changepassword - Change password\n` +
                        `/support - Contact support\n` +
                        `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
    }
    
    // Shareholder top-up flow
    else if (session.step === 'shareholder_topup_amount') {
      const amount = parseFloat(text);

      if (isNaN(amount) || amount < SHAREHOLDER_MIN_TOPUP_USD) {
        await bot.sendMessage(chatId, `❌ Invalid amount. Minimum is ${formatCurrency(SHAREHOLDER_MIN_TOPUP_USD)}.`);
        return;
      }

      const requestId = `SHT-${Date.now()}`;
      await pool.query(
        `INSERT INTO shareholder_stake_requests (request_id, shareholder_id, amount_usd, status)
         VALUES ($1, $2, $3, $4)`,
        [requestId, session.data.shareholderId, amount, SHAREHOLDER_REQUEST_STATUS.PENDING_PROOF]
      );

      session.step = 'shareholder_topup_method';
      session.data.amount = amount;
      session.data.requestId = requestId;

      await bot.sendMessage(chatId,
        `✅ Top-up request created: ${requestId}
` +
        `Amount: ${formatCurrency(amount)}

` +
        `Enter payment method (e.g., M-Pesa, USDT, PayPal):`
      );
    }
    else if (session.step === 'shareholder_topup_method') {
      const method = text.trim();
      if (!method) {
        await bot.sendMessage(chatId, '❌ Please enter a valid payment method.');
        return;
      }

      await pool.query(
        'UPDATE shareholder_stake_requests SET method = $1 WHERE request_id = $2',
        [method, session.data.requestId]
      );

      session.step = 'shareholder_topup_proof_ref';
      session.data.method = method;

      await bot.sendMessage(chatId,
        `Now submit payment proof reference text (transaction code) or type SKIP.
` +
        `After this step, you can upload screenshot/document as the next message.`
      );
    }
    else if (session.step === 'shareholder_topup_proof_ref') {
      const proofRef = text.trim().toUpperCase() === 'SKIP' ? null : text.trim();

      await pool.query(
        `UPDATE shareholder_stake_requests
         SET proof_reference = $1,
             status = $2
         WHERE request_id = $3`,
        [proofRef, SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL, session.data.requestId]
      );

      await createShareholderAuditLog({
        adminId: session.data.memberId,
        action: 'shareholder_topup_submitted',
        targetId: session.data.requestId,
        afterState: {
          shareholderId: session.data.shareholderId,
          amount: session.data.amount,
          method: session.data.method,
          proofReference: proofRef
        },
        reason: 'User submitted shareholder stake top-up request'
      });

      const requestId = session.data.requestId;
      const amount = session.data.amount;
      const method = session.data.method;
      const memberId = session.data.memberId;
      delete userSessions[chatId];

      await bot.sendMessage(chatId,
        `✅ Proof recorded. Your shareholder top-up request is now pending admin approval.

` +
        `Request ID: ${requestId}
` +
        `Amount: ${formatCurrency(amount)}
` +
        `Method: ${method}`
      );

      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      for (const adminId of adminIds) {
        try {
          await bot.sendMessage(adminId,
            `🏛️ **Shareholder Top-Up Pending Approval**

` +
            `Request: ${requestId}
` +
            `Member: ${memberId}
` +
            `Amount: ${formatCurrency(amount)}
` +
            `Method: ${method}

` +
            `Approve: /sh_approve_topup ${requestId}
` +
            `Reject: /sh_reject_topup ${requestId} reason`
          );
        } catch (error) {
          console.log('Could not notify admin for shareholder topup:', adminId, error.message);
        }
      }
    }
    else if (session.step === 'shareholder_withdraw_amount') {
      const amount = parseFloat(text);
      const maxAmount = parseFloat(session.data.earningsBalance || 0);

      if (isNaN(amount) || amount <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid amount. Enter a positive amount.');
        return;
      }

      if (amount > maxAmount) {
        await bot.sendMessage(chatId, `❌ Amount exceeds available shareholder earnings (${formatCurrency(maxAmount)}).`);
        return;
      }

      session.step = 'shareholder_withdraw_method';
      session.data.amount = amount;

      await bot.sendMessage(chatId, 'Enter payout method (e.g., M-Pesa, Bank, PayPal, USDT):');
    }
    else if (session.step === 'shareholder_withdraw_method') {
      const method = text.trim();
      if (!method) {
        await bot.sendMessage(chatId, '❌ Enter a valid payout method.');
        return;
      }

      session.step = 'shareholder_withdraw_details';
      session.data.method = method;

      await bot.sendMessage(chatId, 'Enter payout account/details:');
    }
    else if (session.step === 'shareholder_withdraw_details') {
      const details = text.trim();
      if (!details) {
        await bot.sendMessage(chatId, '❌ Enter payout details.');
        return;
      }

      const requestId = `SHW-${Date.now()}`;
      await pool.query(
        `INSERT INTO shareholder_withdrawal_requests
         (request_id, shareholder_id, amount_usd, payout_method, payout_details, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [requestId, session.data.shareholderId, session.data.amount, session.data.method, details, SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL]
      );

      await createShareholderAuditLog({
        adminId: session.data.memberId,
        action: 'shareholder_withdrawal_requested',
        targetId: requestId,
        afterState: {
          shareholderId: session.data.shareholderId,
          amount: session.data.amount,
          payoutMethod: session.data.method,
          payoutDetails: details
        },
        reason: 'User submitted shareholder earnings withdrawal request'
      });

      const amount = session.data.amount;
      const method = session.data.method;
      const memberId = session.data.memberId;
      delete userSessions[chatId];

      await bot.sendMessage(chatId,
        `✅ Withdrawal request submitted and pending admin approval.

` +
        `Request ID: ${requestId}
` +
        `Amount: ${formatCurrency(amount)}
` +
        `Method: ${method}`
      );

      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      for (const adminId of adminIds) {
        try {
          await bot.sendMessage(adminId,
            `🏛️ **Shareholder Withdrawal Pending**

` +
            `Request: ${requestId}
` +
            `Member: ${memberId}
` +
            `Amount: ${formatCurrency(amount)}
` +
            `Method: ${method}

` +
            `Approve: /sh_approve_withdraw ${requestId}
` +
            `Reject: /sh_reject_withdraw ${requestId} reason`
          );
        } catch (error) {
          console.log('Could not notify admin for shareholder withdrawal:', adminId, error.message);
        }
      }
    }


    // Handle investment amount
    else if (session.step === 'awaiting_investment_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10 || amount > 800000) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $10\n` +
          `Maximum: $800,000\n\n` +
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
        `   Email: starlife.payment@starlifeadvert.com\n\n` +
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
          `starlife.payment@starlifeadvert.com\n\n` +
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
    
    // Handle withdrawal amount
    else if (session.step === 'awaiting_withdrawal_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 2 || amount > session.data.balance) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $2\n` +
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
      const user = await getUserByMemberId(session.data.memberId);
      const newBalance = parseFloat(user.balance || 0) - session.data.withdrawalAmount;
      await updateUser(session.data.memberId, { balance: newBalance });
      
      // Create withdrawal request
      const withdrawalId = `WDL-${Date.now()}`;
      
      const withdrawal = {
        id: withdrawalId,
        memberId: session.data.memberId,
        amount: session.data.withdrawalAmount,
        fee: session.data.fee,
        netAmount: session.data.netAmount,
        method: session.data.method,
        details: details
      };
      
      await createWithdrawal(withdrawal);
      
      // SEND WITHDRAWAL REQUEST EMAIL
      try {
        await sendEmailNotification(session.data.memberId,
          `Withdrawal Request Submitted`,
          'withdrawal_request',
          {
            name: user.name,
            amount: session.data.withdrawalAmount,
            fee: session.data.fee,
            netAmount: session.data.netAmount,
            method: session.data.method,
            withdrawalId: withdrawalId,
            date: new Date()
          }
        );
      } catch (emailError) {
        console.log('Withdrawal request email failed:', emailError.message);
      }
      
      // Record transaction
      await createTransaction({
        id: `TRX-WDL-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'withdrawal',
        amount: -session.data.withdrawalAmount,
        description: `Withdrawal #${withdrawalId} (${session.data.method})`,
        withdrawalId: withdrawalId
      });
      
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
        const user = await getUserByMemberId(session.data.memberId);
        
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
      const chatIdStr = `CHAT-NOACC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      await createSupportChat({
        id: chatIdStr,
        userId: `NO_ACCOUNT_${chatId}`,
        userName: `User without account (Chat ID: ${chatId})`,
        userChatId: chatId.toString(),
        topic: session.data.topic,
        noAccount: true,
        firstMessage: text
      });
      
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
      const chat = await getSupportChat(session.data.chatId);
      
      if (!chat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      const messages = chat.messages || [];
      messages.push({
        sender: 'user',
        message: text,
        timestamp: new Date().toISOString()
      });
      
      await updateSupportChat(session.data.chatId, {
        messages: JSON.stringify(messages),
        admin_replied: false
      });
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **No Account User Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.user_name}\n` +
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
      const chatIdStr = `APPEAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      await createSupportChat({
        id: chatIdStr,
        userId: session.data.memberId,
        userName: session.data.userName,
        topic: 'Account Suspension Appeal',
        isAppeal: true,
        firstMessage: `[APPEAL] ${text}`
      });
      
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
      const chat = await getSupportChat(session.data.chatId);
      
      if (!chat) {
        await bot.sendMessage(chatId, '❌ Appeal chat not found. Please start new appeal with /appeal');
        delete userSessions[chatId];
        return;
      }
      
      const messages = chat.messages || [];
      messages.push({
        sender: 'user',
        message: text,
        timestamp: new Date().toISOString()
      });
      
      await updateSupportChat(session.data.chatId, {
        messages: JSON.stringify(messages),
        admin_replied: false
      });
      
      await bot.sendMessage(chatId,
        `✅ **Appeal message sent**\n\n` +
        `Our team will respond to your appeal shortly.\n\n` +
        `Type /endsupport to end appeal chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Appeal Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.user_name} (${chat.user_id})\n` +
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
      const user = await getUserByMemberId(session.data.memberId);
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
      const activeChat = await getActiveSupportChat(session.data.memberId);
      
      let chatIdStr;
      
      if (activeChat) {
        // Continue existing chat
        chatIdStr = activeChat.chat_id;
        const messages = activeChat.messages || [];
        messages.push({
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        });
        
        await updateSupportChat(chatIdStr, {
          messages: JSON.stringify(messages),
          admin_replied: false
        });
      } else {
        // Create new support chat
        chatIdStr = `CHAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        await createSupportChat({
          id: chatIdStr,
          userId: session.data.memberId,
          userName: session.data.userName,
          topic: session.data.topic,
          noAccount: false,
          isAppeal: false,
          firstMessage: text
        });
      }
      
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
      const chat = await getSupportChat(session.data.chatId);
      
      if (!chat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      if (chat.status === 'closed') {
        await bot.sendMessage(chatId, '❌ This support chat has been closed by admin.');
        delete userSessions[chatId];
        return;
      }
      
      const messages = chat.messages || [];
      messages.push({
        sender: 'user',
        message: text,
        timestamp: new Date().toISOString()
      });
      
      await updateSupportChat(session.data.chatId, {
        messages: JSON.stringify(messages),
        admin_replied: false
      });
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Support Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${chat.user_name} (${chat.user_id})\n` +
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
    // Handle broadcast confirmation
else if (session && session.step === 'confirm_broadcast') {
  if (text.toUpperCase() === 'CONFIRM') {
    await bot.sendMessage(chatId, '📧 Sending broadcast emails to all users...');
    
    try {
      const result = await sendBroadcastEmailToAll(
        session.data.subject,
        session.data.message
      );
      
      delete adminSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Email Broadcast Complete!**\n\n` +
        `Total users with email: ${result.total}\n` +
        `Emails sent successfully: ${result.success}\n` +
        `Emails failed: ${result.failed}\n\n` +
        `The broadcast has been sent to all registered users.`
      );
      
      // Store broadcast history
      await storeBroadcastHistory(
        'Manual Broadcast',
        session.data.subject,
        session.data.message,
        result
      );
      
    } catch (error) {
      await bot.sendMessage(chatId, `❌ Broadcast failed: ${error.message}`);
      delete adminSessions[chatId];
    }
  } else if (text.toUpperCase() === 'CANCEL') {
    delete adminSessions[chatId];
    await bot.sendMessage(chatId, '❌ Broadcast cancelled.');
  } else {
    await bot.sendMessage(chatId, 'Please type CONFIRM to send or CANCEL to abort.');
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
                      `/message USER_ID - Message user directly\n` +
                      `/checkbinding USER_ID - Check Telegram binding\n\n` +
                      `/binduser USER_ID CHAT_ID - Bind Telegram account\n` +
                      `/unbinduser USER_ID - Unbind Telegram account\n` +
                      `/edituser USER_ID FIELD VALUE - Edit user details (name/email/phone)\n\n` +
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
                      `💳 **Withdrawal Management:**
` +
                      `/withdrawals - List withdrawals
` +
                      `/approve WDL_ID - Approve withdrawal
` +
                      `/reject WDL_ID - Reject withdrawal

` +
                      `🏛️ **Shareholder Management (Isolated):**
` +
                      `/sh_create USER_ID - Create shareholder profile
` +
                      `/sh_view USER_ID_OR_SHA_ID - View shareholder profile
` +
                      `/sh_adjust USER_ID_OR_SHA_ID AMOUNT REASON - Manual stake adjustment
` +
                      `/sh_setstatus USER_ID_OR_SHA_ID STATUS - active/suspended/under_review
` +
                      `/sh_suspend USER_ID_OR_SHA_ID REASON - Suspend shareholder earnings/benefits
` +
                      `/sh_unsuspend USER_ID_OR_SHA_ID REASON - Unsuspend shareholder earnings/benefits
` +
                      `/sh_delete USER_ID_OR_SHA_ID REASON - Delete shareholder profile only
` +
                      `/sh_list [QUERY] - Search/list shareholders
` +
                      `/sh_pending - View pending shareholder requests
` +
                      `/sh_approve_topup REQ_ID - Approve top-up
` +
                      `/sh_reject_topup REQ_ID REASON - Reject top-up
` +
                      `/sh_approve_withdraw REQ_ID - Approve shareholder withdrawal
` +
                      `/sh_reject_withdraw REQ_ID REASON - Reject shareholder withdrawal

` +
                      `👥 **Referral Management:**
` +
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

// Bind Telegram account to user (admin override)
bot.onText(/\/binduser (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const targetChatId = match[2].trim();

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

    await updateUser(memberId, {
      chat_id: targetChatId,
      telegram_account_id: targetChatId,
      account_bound: true
    });

    await bot.sendMessage(chatId,
      `✅ **Telegram Account Bound**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `New Chat ID: ${targetChatId}\n` +
      `Binding Status: ✅ BOUND`
    );

    // Notify user if possible
    await sendUserNotification(memberId,
      `🔒 **Account Binding Updated**\n\n` +
      `Your account has been bound to this Telegram account by an administrator.\n\n` +
      `If this wasn't requested, contact support with /support.`
    );
  } catch (error) {
    console.log('Error in /binduser:', error.message);
    await bot.sendMessage(chatId, '❌ Error binding Telegram account.');
  }
});

// Unbind Telegram account from user (admin override)
bot.onText(/\/unbinduser (.+)/, async (msg, match) => {
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

    await updateUser(memberId, {
      chat_id: null,
      telegram_account_id: null,
      account_bound: false
    });

    await bot.sendMessage(chatId,
      `✅ **Telegram Account Unbound**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Binding Status: ❌ NOT BOUND`
    );
  } catch (error) {
    console.log('Error in /unbinduser:', error.message);
    await bot.sendMessage(chatId, '❌ Error unbinding Telegram account.');
  }
});

// Edit user details (admin override)
bot.onText(/\/edituser (.+?) (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const field = match[2].toLowerCase();
  const value = match[3].trim();

  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }

  if (!['name', 'email', 'phone'].includes(field)) {
    await bot.sendMessage(chatId, '❌ Invalid field. Use: /edituser USER_ID name|email|phone VALUE');
    return;
  }

  try {
    const user = await getUserByMemberId(memberId);

    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }

    if (field === 'phone') {
      const phoneRegex = /^\+\d{7,15}$/;
      if (!phoneRegex.test(value)) {
        await bot.sendMessage(chatId, '❌ Invalid phone number. Use country code (e.g., +254712345678).');
        return;
      }
    }

    let updates = {};
    if (field === 'name') {
      updates = { name: value };
    } else if (field === 'email') {
      updates = { email: value };
    } else if (field === 'phone') {
      updates = { phone: value };
    }
    const updatedUser = await updateUser(memberId, updates);

    await bot.sendMessage(chatId,
      `✅ **User Updated**\n\n` +
      `User: ${updatedUser.name} (${memberId})\n` +
      `Updated ${field}: ${value}`
    );

    // Notify user
    await sendUserNotification(memberId,
      `✅ **Account Details Updated**\n\n` +
      `Your ${field} has been updated by an administrator.\n` +
      `New ${field}: ${value}\n\n` +
      `If this wasn't requested, contact support with /support.`
    );
  } catch (error) {
    console.log('Error in /edituser:', error.message);
    await bot.sendMessage(chatId, '❌ Error updating user details.');
  }
});

// Check Telegram binding for user
bot.onText(/\/checkbinding (.+)/, async (msg, match) => {
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
    
    const bindingStatus = user.account_bound ? '✅ BOUND' : '❌ NOT BOUND';
    const telegramId = user.chat_id || 'Not set';
    const telegramAccountId = user.telegram_account_id || 'Not set';
    
    const message = `🔒 **Telegram Binding Check**\n\n` +
                   `User: ${user.name} (${memberId})\n` +
                   `Binding Status: ${bindingStatus}\n` +
                   `Telegram Chat ID: ${telegramId}\n` +
                   `Telegram Account ID: ${telegramAccountId}\n` +
                   `Account Created: ${new Date(user.joined_date).toLocaleString()}\n` +
                   `Last Login: ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}\n\n` +
                   `**Binding Rules:**\n` +
                   `• One Telegram account ↔ One Member ID\n` +
                   `• Cannot login to other accounts\n` +
                   `• Cannot be accessed by other Telegram accounts`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /checkbinding:', error.message);
    await bot.sendMessage(chatId, '❌ Error checking binding.');
  }
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
    const chat = await getSupportChat(supportChatId);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    // Find media files in this chat
    const chatMedia = await getMediaFilesByChat(supportChatId);
    
    if (chatMedia.length === 0) {
      await bot.sendMessage(chatId, `📭 No media files in chat ${supportChatId}.`);
      return;
    }
    
    let message = `📎 **Media Files in Chat: ${supportChatId}**\n\n`;
    message += `Total Media Files: ${chatMedia.length}\n\n`;
    
    // Group by type
    const photos = chatMedia.filter(m => m.file_type === 'photo');
    const documents = chatMedia.filter(m => m.file_type === 'document');
    const videos = chatMedia.filter(m => m.file_type === 'video');
    const voices = chatMedia.filter(m => m.file_type === 'voice');
    
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
        await bot.sendPhoto(chatId, firstPhoto.file_id, {
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
    const chat = await getSupportChat(supportChatId);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const isLoggedOut = chat.is_logged_out || false;
    const noAccount = chat.no_account || false;
    const isAppeal = chat.is_appeal || false;
    const userName = chat.user_name || 'Unknown User';
    const userId = chat.user_id || 'Unknown ID';
    
    // Count media in chat
    const chatMedia = await getMediaFilesByChat(supportChatId);
    const mediaCount = chatMedia.length;
    
    let message = `💬 **Support Chat Details**\n\n`;
    message += `🆔 Chat ID: ${chat.chat_id}\n`;
    message += `👤 User: ${userName}\n`;
    message += `🔑 User ID: ${userId}\n`;
    message += `📝 Topic: ${chat.topic}\n`;
    message += `📊 Status: ${chat.status === 'active' ? '🟢 Active' : '🔴 Closed'}\n`;
    message += `🚪 Logged Out: ${isLoggedOut ? 'Yes' : 'No'}\n`;
    message += `🚫 No Account: ${noAccount ? 'Yes' : 'No'}\n`;
    message += `⚖️ Appeal: ${isAppeal ? 'Yes ⚠️ URGENT' : 'No'}\n`;
    message += `📎 Media Files: ${mediaCount}\n`;
    message += `📅 Created: ${new Date(chat.created_at).toLocaleString()}\n`;
    message += `🕒 Updated: ${new Date(chat.updated_at).toLocaleString()}\n`;
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
      message += `💭 Reply: /replychat ${chat.chat_id} message\n`;
      message += `📎 View Media: /viewmedia ${chat.chat_id}\n`;
      message += `❌ Close: /closechat ${chat.chat_id}\n`;
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

// Stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const stats = await getSystemStats();
    
    const users = await getAllUsers();
    const investments = await getAllInvestments();
    const withdrawals = await getAllWithdrawals();
    const referrals = await getAllReferrals();
    
    const activeUsers = users.filter(u => !u.banned).length;
    const suspendedUsers = users.filter(u => u.banned).length;
    const blockedUsers = users.filter(u => u.bot_blocked).length;
    const boundAccounts = users.filter(u => u.account_bound).length;
    
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingInvestments = investments.filter(i => i.status === 'pending').length;
    
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const approvedWithdrawals = withdrawals.filter(w => w.status === 'approved');
    const totalWithdrawalFees = approvedWithdrawals.reduce((sum, w) => sum + parseFloat(w.fee || 0), 0);
    
    const paidReferrals = referrals.filter(ref => ref.status === 'paid').length;
    const totalReferralBonus = referrals.filter(ref => ref.status === 'paid')
      .reduce((sum, ref) => sum + parseFloat(ref.bonus_amount || 0), 0);
    
    const activeSupportChats = await getActiveSupportChats();
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${stats.users?.total || 0}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Suspended Users: ${suspendedUsers}\n` +
                        `• Blocked Bot: ${blockedUsers}\n` +
                        `• Telegram Bound: ${boundAccounts}\n` +
                        `• Total Balance: ${formatCurrency(stats.users?.total_balance || 0)}\n\n` +
                        `**Investments:**\n` +
                        `• Total Investments: ${investments.length}\n` +
                        `• Active Investments: ${activeInvestments}\n` +
                        `• Pending Investments: ${pendingInvestments}\n` +
                        `• Total Invested: ${formatCurrency(stats.users?.total_invested || 0)}\n` +
                        `• Total Earned: ${formatCurrency(stats.users?.total_earned || 0)}\n\n` +
                        `**Withdrawals:**\n` +
                        `• Total Withdrawals: ${withdrawals.length}\n` +
                        `• Pending Withdrawals: ${pendingWithdrawals}\n` +
                        `• Total Withdrawn: ${formatCurrency(approvedWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0))}\n` +
                        `• Total Fees Collected: ${formatCurrency(totalWithdrawalFees)}\n\n` +
                        `**Referrals:**\n` +
                        `• Total Referrals: ${referrals.length}\n` +
                        `• Paid Referrals: ${paidReferrals}\n` +
                        `• Total Bonus Paid: ${formatCurrency(totalReferralBonus)}\n\n` +
                        `**Support:**\n` +
                        `• Active Chats: ${activeSupportChats.length}\n`;
    
    await bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.log('Error in /stats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading statistics.');
  }
});

// Users list
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await getAllUsers(10);
    
    if (users.length === 0) {
      await bot.sendMessage(chatId, '📭 No users found.');
      return;
    }
    
    let message = `👥 **Total Users: ${users.length}**\n\n`;
    
    users.forEach((user, index) => {
      const status = user.banned ? '🚫' : user.bot_blocked ? '❌' : '✅';
      const bound = user.account_bound ? '🔒' : '🔓';
      const balance = formatCurrency(user.balance || 0);
      message += `${index + 1}. ${status}${bound} ${user.name} (${user.member_id})\n`;
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
    
    const userInvestments = await getUserActiveInvestments(memberId);
    const userTransactions = await getUserTransactions(memberId, 5);
    
    // Get user's referrals
    let userReferrals = [];
    try {
      const result = await pool.query(
        'SELECT * FROM referrals WHERE referrer_id = $1',
        [memberId]
      );
      userReferrals = result.rows;
    } catch (error) {
      console.error('Error getting referrals:', error.message);
    }
    
    const referredBy = user.referred_by ? `Referred by: ${user.referred_by}\n` : '';
    
    const message = `👤 **User Details**\n\n` +
                   `Name: ${user.name}\n` +
                   `Member ID: ${user.member_id}\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Phone: ${user.phone || 'N/A'}\n` +
                   `Chat ID: ${user.chat_id || 'N/A'}\n` +
                   `Telegram Account ID: ${user.telegram_account_id || 'N/A'}\n` +
                   `Account Bound: ${user.account_bound ? '✅ Yes' : '❌ No'}\n` +
                   `Status: ${user.banned ? '🚫 Banned' : user.bot_blocked ? '❌ Blocked Bot' : '✅ Active'}\n` +
                   `${referredBy}` +
                   `Joined: ${new Date(user.joined_date).toLocaleString()}\n` +
                   `Last Login: ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}\n` +
                   `Last Password Change: ${user.last_password_change ? new Date(user.last_password_change).toLocaleString() : 'Never'}\n\n` +
                   `💰 **Financials**\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Invested: ${formatCurrency(user.total_invested || 0)}\n` +
                   `Total Earned: ${formatCurrency(user.total_earned || 0)}\n` +
                   `Referral Earnings: ${formatCurrency(user.referral_earnings || 0)}\n\n` +
                   `📊 **Stats**\n` +
                   `Referrals: ${user.referrals || 0}\n` +
                   `Referral Code: ${user.referral_code || 'N/A'}\n` +
                   `Active Investments: ${userInvestments.length}\n` +
                   `Recent Transactions: ${userTransactions.length}\n` +
                   `Referral Network: ${userReferrals.length}\n\n` +
                   `**Actions:**\n` +
                   `💰 Add Balance: /addbalance ${memberId} AMOUNT\n` +
                   `🔐 Reset Pass: /resetpass ${memberId}\n` +
                   `📞 Edit Phone: /edituser ${memberId} phone +254712345678\n` +
                   `📨 Message: /message ${memberId}\n` +
                   `🔒 Check Binding: /checkbinding ${memberId}\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const newBalance = parseFloat(user.balance || 0) + amount;
    await updateUser(memberId, { balance: newBalance });
    
    // Record transaction
    await createTransaction({
      id: `ADMIN-ADD-${Date.now()}`,
      memberId: memberId,
      type: 'admin_add_balance',
      amount: amount,
      description: `Admin added balance`,
      adminId: chatId.toString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Balance Added Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Added: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `💰 **Admin Added Balance**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}\n\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const newPassword = generateRandomPassword(8);
    await updateUser(memberId, {
      password_hash: hashPassword(newPassword),
      last_password_change: new Date()
    });
    
    // SEND PASSWORD RESET EMAIL
    try {
      await sendEmailNotification(memberId,
        `Password Reset by Admin`,
        'password_reset',
        {
          name: user.name,
          memberId: memberId,
          newPassword: newPassword,
          date: new Date()
        }
      );
    } catch (emailError) {
      console.log('Password reset email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `✅ **Password Reset Successful**\n\n` +
      `User: ${user.name} (${memberId})\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (user.banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is already suspended.`);
      return;
    }
    
    await updateUser(memberId, { banned: true });
    
    // SEND ACCOUNT SUSPENDED EMAIL
    try {
      await sendEmailNotification(memberId,
        `Account Suspended`,
        'account_suspended',
        {
          name: user.name,
          memberId: memberId,
          date: new Date()
        }
      );
    } catch (emailError) {
      console.log('Account suspended email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `🚫 **User Suspended**\n\n` +
      `User: ${user.name} (${memberId})\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (!user.banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is not suspended.`);
      return;
    }
    
    await updateUser(memberId, { banned: false });
    
    // SEND ACCOUNT UNSUSPENDED EMAIL
    try {
      await sendEmailNotification(memberId,
        `Account Reactivated`,
        'account_unsuspended',
        {
          name: user.name,
          memberId: memberId,
          date: new Date()
        }
      );
    } catch (emailError) {
      console.log('Account unsuspended email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `✅ **User Unsuspended**\n\n` +
      `User: ${user.name} (${memberId})\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const userName = user.name;
    
    // Delete user (cascade will delete related records)
    await pool.query('DELETE FROM users WHERE member_id = $1', [memberId]);
    
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
    const activeChats = await getActiveSupportChats();
    
    if (activeChats.length === 0) {
      await bot.sendMessage(chatId, '📭 No active support chats.');
      return;
    }
    
    let message = `💬 **Active Support Chats: ${activeChats.length}**\n\n`;
    
    activeChats.forEach((chat, index) => {
      const isLoggedOut = chat.is_logged_out ? '🚪' : '';
      const noAccount = chat.no_account ? '🚫' : '';
      const isAppeal = chat.is_appeal ? '⚖️' : '';
      const timeAgo = Math.floor((new Date() - new Date(chat.updated_at)) / 60000);
      const messages = chat.messages ? chat.messages.length : 0;
      const lastMessage = chat.messages && chat.messages.length > 0 ? 
        chat.messages[chat.messages.length - 1].message.substring(0, 30) + '...' : 'No messages';
      
      message += `${index + 1}. ${isLoggedOut}${noAccount}${isAppeal} **${chat.user_name}**\n`;
      message += `   🆔 ${chat.chat_id}\n`;
      message += `   📝 ${chat.topic}\n`;
      message += `   💬 ${messages} messages\n`;
      message += `   🕒 ${timeAgo} min ago\n`;
      message += `   📨 "${lastMessage}"\n`;
      message += `   **View:** /viewchat ${chat.chat_id}\n\n`;
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
    const chat = await getSupportChat(supportChatId);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const userId = chat.user_id;
    const userName = chat.user_name;
    
    // Add admin reply to chat
    const messages = chat.messages || [];
    messages.push({
      sender: 'admin',
      message: replyMessage,
      timestamp: new Date().toISOString(),
      adminId: chatId.toString()
    });
    
    await updateSupportChat(supportChatId, {
      messages: JSON.stringify(messages),
      admin_replied: true
    });
    
    // Send notification to user based on chat type
    if (chat.no_account) {
      // User without account - send to their chat ID
      const userChatId = chat.user_chat_id || userId.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `💬 **Support Response**\n\n` +
          `${replyMessage}\n\n` +
          `Use /support to reply back.`
        );
      } catch (error) {
        console.log('Could not send to no-account user:', error.message);
      }
    } else if (chat.is_logged_out) {
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
    const chat = await getSupportChat(supportChatId);
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    if (chat.status === 'closed') {
      await bot.sendMessage(chatId, `⚠️ Chat ${supportChatId} is already closed.`);
      return;
    }
    
    await updateSupportChat(supportChatId, {
      status: 'closed',
      closed_by: 'admin'
    });
    
    await bot.sendMessage(chatId,
      `✅ **Chat Closed**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `User: ${chat.user_name}\n` +
      `Closed by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    if (chat.no_account) {
      const userChatId = chat.user_chat_id || chat.user_id.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `✅ **Support Chat Closed**\n\n` +
          `Your support chat has been closed by our team.\n\n` +
          `If you need further assistance, use /support to start a new chat.`
        );
      } catch (error) {
        console.log('Could not notify no-account user');
      }
    } else if (!chat.is_logged_out) {
      await sendUserNotification(chat.user_id,
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

// Admin command to manually trigger profit calculation
bot.onText(/\/calculateprofits/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  await bot.sendMessage(chatId, '🔄 Manually calculating daily profits...');
  
  try {
    const result = await calculateDailyProfits();
    
    await bot.sendMessage(chatId,
      `✅ **Manual Profit Calculation Complete**\n\n` +
      `Processed investments: ${result.processed}\n` +
      `Errors: ${result.errors}\n` +
      `Timestamp: ${result.timestamp.toLocaleString()}\n\n` +
      `Profits have been added to all active investments.`
    );
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error calculating profits: ${error.message}`);
  }
});

// Admin command to check profit calculation status
bot.onText(/\/profitstatus/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    // Get active investments stats
    const activeInvestments = await getAllActiveInvestments();
    const totalInvestmentAmount = activeInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    const totalDailyProfit = calculateDailyProfit(totalInvestmentAmount);
    
    // Get last profit run
    let lastRun = null;
    try {
      const result = await pool.query(
        'SELECT * FROM daily_profit_runs ORDER BY run_date DESC LIMIT 1'
      );
      lastRun = result.rows[0];
    } catch (error) {
      console.log('Could not get last run:', error.message);
    }
    
    // Get users who will receive profits
    const users = await getAllUsers();
    const usersWithInvestments = users.filter(user => {
      return activeInvestments.some(inv => inv.member_id === user.member_id);
    });
    
    let message = `📊 **Profit Calculation Status**\n\n`;
    message += `Active Investments: ${activeInvestments.length}\n`;
    message += `Total Investment Amount: ${formatCurrency(totalInvestmentAmount)}\n`;
    message += `Daily Profit (2%): ${formatCurrency(totalDailyProfit)}\n`;
    message += `Users Receiving Profits: ${usersWithInvestments.length}\n\n`;
    
    if (lastRun) {
      const lastRunTime = new Date(lastRun.run_date);
      const timeSince = Math.floor((new Date() - lastRunTime) / 1000 / 60 / 60); // hours
      message += `**Last Run:**\n`;
      message += `Date: ${lastRunTime.toLocaleString()}\n`;
      message += `Processed: ${lastRun.processed_count}\n`;
      message += `Errors: ${lastRun.error_count}\n`;
      message += `Hours since last run: ${timeSince}\n\n`;
    } else {
      message += `No previous profit runs recorded.\n\n`;
    }
    
    // Show next 5 investments to process
    if (activeInvestments.length > 0) {
      message += `**Next 5 Investments to Process:**\n`;
      activeInvestments.slice(0, 5).forEach((inv, index) => {
        const dailyProfit = calculateDailyProfit(inv.amount);
        message += `${index + 1}. ${inv.member_id}: ${formatCurrency(inv.amount)} → ${formatCurrency(dailyProfit)} daily\n`;
      });
      if (activeInvestments.length > 5) {
        message += `... and ${activeInvestments.length - 5} more\n\n`;
      }
    }
    
    message += `**Commands:**\n`;
    message += `/calculateprofits - Manually calculate profits\n`;
    message += `/forceprofit USER_ID - Force profit for specific user\n`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error getting profit status: ${error.message}`);
  }
});

// Force profit calculation for specific user
bot.onText(/\/forceprofit (.+)/, async (msg, match) => {
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
    
    const userInvestments = await getUserActiveInvestments(memberId);
    if (userInvestments.length === 0) {
      await bot.sendMessage(chatId, `❌ User ${memberId} has no active investments.`);
      return;
    }
    
    let totalProfit = 0;
    for (const investment of userInvestments) {
      const dailyProfit = calculateDailyProfit(investment.amount);
      totalProfit += dailyProfit;
      
      // Update user balance
      const newBalance = parseFloat(user.balance || 0) + dailyProfit;
      const newTotalEarned = parseFloat(user.total_earned || 0) + dailyProfit;
      
      await updateUser(memberId, {
        balance: newBalance,
        total_earned: newTotalEarned
      });
      
      // Update investment stats
      const newTotalProfit = parseFloat(investment.total_profit || 0) + dailyProfit;
      const newDaysActive = (investment.days_active || 0) + 1;
      
      await updateInvestment(investment.investment_id, {
        total_profit: newTotalProfit,
        days_active: newDaysActive
      });
      
      // Record transaction
      await createTransaction({
        id: `FORCE-PROFIT-${Date.now()}`,
        memberId: memberId,
        type: 'daily_profit',
        amount: dailyProfit,
        description: `Forced daily profit from investment #${investment.investment_id}`,
        investmentId: investment.investment_id,
        adminId: chatId.toString()
      });
    }
    
    await bot.sendMessage(chatId,
      `✅ **Forced Profit Calculation Complete**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Active Investments: ${userInvestments.length}\n` +
      `Total Profit Added: ${formatCurrency(totalProfit)}\n` +
      `New Balance: ${formatCurrency(parseFloat(user.balance || 0) + totalProfit)}\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `💰 **Admin Added Daily Profit**\n\n` +
      `An administrator has added your daily profit manually.\n\n` +
      `Total Profit Added: ${formatCurrency(totalProfit)}\n` +
      `New Balance: ${formatCurrency(parseFloat(user.balance || 0) + totalProfit)}\n\n` +
      `This was added by an administrator.`
    );
    
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error forcing profit: ${error.message}`);
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
    const investments = await getAllInvestments(5);
    
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
    message += `**Recent Investments:**\n`;
    investments.forEach((inv, index) => {
      const status = inv.status === 'active' ? '🟢' : inv.status === 'pending' ? '🟡' : '🔵';
      message += `${index + 1}. ${status} ${inv.member_id}\n`;
      message += `   Amount: ${formatCurrency(inv.amount)}\n`;
      message += `   Method: ${inv.payment_method || 'M-Pesa'}\n`;
      message += `   Status: ${inv.status}\n`;
      message += `   Date: ${new Date(inv.date).toLocaleDateString()}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /investments:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading investments.');
  }
});

// Approve investment
bot.onText(/\/approveinvestment (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    // Get investment
    let investment;
    try {
      const result = await pool.query(
        'SELECT * FROM investments WHERE investment_id = $1',
        [investmentId]
      );
      investment = result.rows[0];
    } catch (error) {
      console.error('Error getting investment:', error.message);
    }
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Check if this is the user's FIRST investment
    let userActiveInvestments = [];
    try {
      const result = await pool.query(
        "SELECT * FROM investments WHERE member_id = $1 AND status = 'active'",
        [investment.member_id]
      );
      userActiveInvestments = result.rows;
    } catch (error) {
      console.error('Error getting user investments:', error.message);
    }
    
    const isFirstInvestment = userActiveInvestments.length === 0;
    
    // Update investment status
    await updateInvestment(investmentId, {
      status: 'active',
      approved_at: new Date(),
      approved_by: chatId.toString()
    });
    
    // Update user's total invested and active investments count
    const user = await getUserByMemberId(investment.member_id);
    if (user) {
      const investmentAmount = parseFloat(investment.amount || 0);
      const newTotalInvested = parseFloat(user.total_invested || 0) + investmentAmount;
      const newActiveInvestments = (user.active_investments || 0) + 1;
      
      await updateUser(investment.member_id, {
        total_invested: newTotalInvested,
        active_investments: newActiveInvestments
      });
      
      // Handle referral bonus if this is the user's FIRST investment and they were referred
      if (user.referred_by && isFirstInvestment) {
        const referrer = await getUserByReferralCode(user.referred_by);
        if (referrer) {
          const referralBonus = calculateReferralBonus(investmentAmount);
          
          // Update referrer's balance and referral earnings
          const newReferrerBalance = parseFloat(referrer.balance || 0) + referralBonus;
          const newReferralEarnings = parseFloat(referrer.referral_earnings || 0) + referralBonus;
          
          await updateUser(referrer.member_id, {
            balance: newReferrerBalance,
            referral_earnings: newReferralEarnings
          });
          
          // Update referral record
          try {
            const result = await pool.query(
              'SELECT * FROM referrals WHERE referrer_id = $1 AND referred_id = $2',
              [referrer.member_id, investment.member_id]
            );
            const referral = result.rows[0];
            
            if (referral) {
              await updateReferral(referral.referral_id, {
                status: 'paid',
                bonus_amount: referralBonus,
                bonus_paid: true,
                investment_amount: investmentAmount,
                paid_at: new Date(),
                is_first_investment: false
              });
            }
          } catch (error) {
            console.error('Error updating referral:', error.message);
          }
          
          // Notify referrer about FIRST investment bonus
          await sendUserNotification(referrer.member_id,
            `🎉 **Referral Bonus Earned!**\n\n` +
            `Your referral made their FIRST investment!\n\n` +
            `Referral: ${user.name}\n` +
            `Investment Amount: ${formatCurrency(investment.amount)}\n` +
            `Your Bonus (10%): ${formatCurrency(referralBonus)}\n\n` +
            `Bonus has been added to your balance!\n` +
            `New Balance: ${formatCurrency(newReferrerBalance)}\n\n` +
            `Note: You only earn 10% on their FIRST investment.\n` +
            `Subsequent investments will not earn bonuses.`
          );
          
          // Record transaction for referrer
          await createTransaction({
            id: `REF-BONUS-${Date.now()}`,
            memberId: referrer.member_id,
            type: 'referral_bonus',
            amount: referralBonus,
            description: `Bonus from ${user.name}'s FIRST investment`
          });
        }
      } else if (user.referred_by && !isFirstInvestment) {
        // This is a SUBSEQUENT investment - no bonus
        const referrer = await getUserByReferralCode(user.referred_by);
        if (referrer) {
          // Update referral record to mark as subsequent
          try {
            const result = await pool.query(
              'SELECT * FROM referrals WHERE referrer_id = $1 AND referred_id = $2',
              [referrer.member_id, investment.member_id]
            );
            const referral = result.rows[0];
            
            if (referral && referral.is_first_investment) {
              await updateReferral(referral.referral_id, {
                is_first_investment: false,
                status: 'completed',
                note: 'No bonus - subsequent investment'
              });
              
              // Notify referrer about SUBSEQUENT investment (no bonus)
              await sendUserNotification(referrer.member_id,
                `ℹ️ **Referral Update**\n\n` +
                `${user.name} made another investment.\n\n` +
                `Investment Amount: ${formatCurrency(investment.amount)}\n` +
                `No bonus earned - you only get 10% on FIRST investment.\n\n` +
                `Thanks for referring them!`
              );
            }
          } catch (error) {
            console.error('Error updating referral:', error.message);
          }
        }
      }
    }
    
    // SEND INVESTMENT APPROVED EMAIL
    try {
      const user = await getUserByMemberId(investment.member_id);
      if (user && user.email) {
        await sendEmailNotification(investment.member_id,
          `Investment Approved!`,
          'investment_approved',
          {
            name: user.name,
            amount: investment.amount,
            investmentId: investmentId,
            isFirstInvestment: isFirstInvestment,
            date: new Date()
          }
        );
      }
    } catch (emailError) {
      console.log('Investment approved email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `✅ **Investment Approved**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.member_id}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.payment_method || 'M-Pesa'}\n` +
      `Transaction Hash: ${investment.transaction_hash || 'N/A'}\n` +
      `Approved by: Admin\n` +
      `First Investment: ${isFirstInvestment ? '✅ Yes' : '❌ No'}\n\n` +
      `The investment is now active and earning 2% daily.`
    );
    
    // Notify user
    await sendUserNotification(investment.member_id,
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
    // Get investment
    let investment;
    try {
      const result = await pool.query(
        'SELECT * FROM investments WHERE investment_id = $1',
        [investmentId]
      );
      investment = result.rows[0];
    } catch (error) {
      console.error('Error getting investment:', error.message);
    }
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Update investment status
    await updateInvestment(investmentId, {
      status: 'rejected',
      rejected_at: new Date(),
      rejected_by: chatId.toString()
    });
    
    // SEND INVESTMENT REJECTED EMAIL
    try {
      const user = await getUserByMemberId(investment.member_id);
      if (user && user.email) {
        await sendEmailNotification(investment.member_id,
          `Investment Rejected`,
          'investment_rejected',
          {
            name: user.name,
            amount: investment.amount,
            paymentMethod: investment.payment_method,
            investmentId: investmentId,
            date: new Date()
          }
        );
      }
    } catch (emailError) {
      console.log('Investment rejected email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `❌ **Investment Rejected**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.member_id}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.payment_method || 'M-Pesa'}\n` +
      `Rejected by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    await sendUserNotification(investment.member_id,
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
bot.onText(/\/vi+ewproof (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    // Get investment
    let investment;
    try {
      const result = await pool.query(
        'SELECT * FROM investments WHERE investment_id = $1',
        [investmentId]
      );
      investment = result.rows[0];
    } catch (error) {
      console.error('Error getting investment:', error.message);
    }
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    // Get proof media
    const mediaFiles = await getMediaFilesByInvestmentId(investmentId);
    const proof = mediaFiles[0];
    
    if (!proof) {
      await bot.sendMessage(chatId, `❌ No proof found for investment ${investmentId}.`);
      return;
    }
    
    // Send the proof photo to admin
    await bot.sendPhoto(chatId, proof.file_id, {
      caption: `📎 Proof for Investment ${investmentId}\n` +
              `User: ${investment.member_id}\n` +
              `Amount: ${formatCurrency(investment.amount)}\n` +
              `Payment Method: ${investment.payment_method || 'M-Pesa'}\n` +
              `Transaction Hash: ${investment.transaction_hash || 'N/A'}\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const investmentId = `INV-MANUAL-${Date.now()}`;
    
    // Create manual investment
    await createInvestment({
      id: investmentId,
      memberId: memberId,
      amount: amount,
      paymentMethod: 'Admin Manual',
      status: 'active',
      isManual: true,
      adminId: chatId.toString()
    });
    
    // Update user stats
    const newTotalInvested = parseFloat(user.total_invested || 0) + amount;
    const newActiveInvestments = (user.active_investments || 0) + 1;
    
    await updateUser(memberId, {
      total_invested: newTotalInvested,
      active_investments: newActiveInvestments
    });
    
    // Record transaction
    await createTransaction({
      id: `TRX-MANUAL-INV-${Date.now()}`,
      memberId: memberId,
      type: 'manual_investment',
      amount: amount,
      description: `Manual investment added by admin`,
      adminId: chatId.toString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Manual Investment Added**\n\n` +
      `User: ${user.name} (${memberId})\n` +
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

// ==================== ADDITIONAL ADMIN COMMANDS ====================

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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if ((user.balance || 0) < amount) {
      await bot.sendMessage(chatId,
        `❌ Insufficient balance.\n` +
        `User has: ${formatCurrency(user.balance || 0)}\n` +
        `Trying to deduct: ${formatCurrency(amount)}`
      );
      return;
    }
    
    const newBalance = parseFloat(user.balance || 0) - amount;
    await updateUser(memberId, { balance: newBalance });
    
    // Record transaction
    await createTransaction({
      id: `ADMIN-DEDUCT-${Date.now()}`,
      memberId: memberId,
      type: 'admin_deduct_balance',
      amount: -amount,
      description: `Admin deducted balance`,
      adminId: chatId.toString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Balance Deducted Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Balance Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}\n\n` +
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Check if user has enough invested
    const userInvestments = await getUserActiveInvestments(memberId);
    const totalInvested = userInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
    
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
      
      const investmentAmount = parseFloat(investment.amount || 0);
      const deductAmount = Math.min(investmentAmount, remaining);
      const newAmount = investmentAmount - deductAmount;
      remaining -= deductAmount;
      
      // Update investment
      if (newAmount <= 0) {
        await updateInvestment(investment.investment_id, {
          amount: 0,
          status: 'completed',
          completed_at: new Date()
        });
      } else {
        await updateInvestment(investment.investment_id, {
          amount: newAmount
        });
      }
    }
    
    // Update user's total invested
    const newTotalInvested = Math.max(0, parseFloat(user.total_invested || 0) - amount);
    await updateUser(memberId, { total_invested: newTotalInvested });
    
    await bot.sendMessage(chatId,
      `✅ **Investment Deducted Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(newTotalInvested)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Investment Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(newTotalInvested)}\n\n` +
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
    const referrals = await getAllReferrals(10);
    
    if (referrals.length === 0) {
      await bot.sendMessage(chatId, '📭 No referrals found.');
      return;
    }
    
    const paidReferrals = referrals.filter(r => r.status === 'paid');
    const pendingReferrals = referrals.filter(r => r.status === 'pending');
    const firstInvestmentReferrals = referrals.filter(r => r.is_first_investment === true);
    
    let message = `👥 **Referrals Summary**\n\n`;
    message += `Total Referrals: ${referrals.length}\n`;
    message += `Paid (First Investment Bonus): ${paidReferrals.length}\n`;
    message += `Pending First Investment: ${pendingReferrals.length}\n`;
    message += `Awaiting First Investment: ${firstInvestmentReferrals.length}\n`;
    message += `Total Bonus Paid: ${formatCurrency(paidReferrals.reduce((sum, r) => sum + parseFloat(r.bonus_amount || 0), 0))}\n\n`;
    
    // Show recent referrals
    message += `**Recent Referrals:**\n`;
    referrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅' : ref.status === 'pending' ? '⏳' : '❌';
      const firstInv = ref.is_first_investment ? 'FIRST' : 'SUBSEQUENT';
      message += `${index + 1}. ${status} ${ref.referrer_name} → ${ref.referred_name}\n`;
      message += `   Type: ${firstInv} | Bonus: ${formatCurrency(ref.bonus_amount || 0)} | ${new Date(ref.date).toLocaleDateString()}\n\n`;
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
    const user = await getUserByReferralCode(referralCode);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ No user found with referral code: ${referralCode}`);
      return;
    }
    
    // Get user's referrals
    let userReferrals = [];
    try {
      const result = await pool.query(
        'SELECT * FROM referrals WHERE referrer_id = $1',
        [user.member_id]
      );
      userReferrals = result.rows;
    } catch (error) {
      console.error('Error getting referrals:', error.message);
    }
    
    const successfulReferrals = userReferrals.filter(r => r.status === 'paid');
    const firstInvestmentReferrals = userReferrals.filter(r => r.is_first_investment === true);
    
    const message = `🔍 **User Found by Referral Code**\n\n` +
                   `Referral Code: ${referralCode}\n` +
                   `User: ${user.name} (${user.member_id})\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Referrals: ${user.referrals || 0}\n` +
                   `Successful Referrals (First Investment Bonus): ${successfulReferrals.length}\n` +
                   `Referrals Awaiting First Investment: ${firstInvestmentReferrals.length}\n` +
                   `Referral Earnings: ${formatCurrency(user.referral_earnings || 0)}\n\n` +
                   `**Note:** Referrers earn 10% only on FIRST investment of referred users.\n\n` +
                   `**View User:** /view ${user.member_id}\n` +
                   `**Message User:** /message ${user.member_id}`;
    
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
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Add to balance and referral earnings
    const newBalance = parseFloat(user.balance || 0) + amount;
    const newReferralEarnings = parseFloat(user.referral_earnings || 0) + amount;
    
    await updateUser(memberId, {
      balance: newBalance,
      referral_earnings: newReferralEarnings
    });
    
    // Record transaction
    await createTransaction({
      id: `REF-BONUS-${Date.now()}`,
      memberId: memberId,
      type: 'referral_bonus',
      amount: amount,
      description: `Admin added referral bonus`,
      adminId: chatId.toString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Referral Bonus Added**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Bonus Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}\n` +
      `Total Referral Earnings: ${formatCurrency(newReferralEarnings)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🎉 **Referral Bonus Added!**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(newBalance)}\n` +
      `Total Referral Earnings: ${formatCurrency(newReferralEarnings)}\n\n` +
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
    const withdrawals = await getAllWithdrawals(5);
    
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
      
      pendingWithdrawals.forEach((wd, index) => {
        message += `${index + 1}. ${wd.member_id}\n`;
        message += `   Amount: ${formatCurrency(wd.amount)} (Fee: ${formatCurrency(wd.fee || 0)})\n`;
        message += `   Net: ${formatCurrency(wd.net_amount || wd.amount)}\n`;
        message += `   Method: ${wd.method || 'M-Pesa'}\n`;
        message += `   Date: ${new Date(wd.date).toLocaleString()}\n`;
        message += `   **Approve:** /approve ${wd.withdrawal_id}\n`;
        message += `   **Reject:** /reject ${wd.withdrawal_id}\n\n`;
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
    // Get withdrawal
    let withdrawal;
    try {
      const result = await pool.query(
        'SELECT * FROM withdrawals WHERE withdrawal_id = $1',
        [withdrawalId]
      );
      withdrawal = result.rows[0];
    } catch (error) {
      console.error('Error getting withdrawal:', error.message);
    }
    
    if (!withdrawal) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    if (withdrawal.status === 'approved') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already approved.`);
      return;
    }
    
    // Update withdrawal status
    await updateWithdrawal(withdrawalId, {
      status: 'approved',
      approved_at: new Date(),
      approved_by: chatId.toString()
    });
    
    // SEND WITHDRAWAL APPROVED EMAIL
    try {
      const user = await getUserByMemberId(withdrawal.member_id);
      if (user && user.email) {
        await sendEmailNotification(withdrawal.member_id,
          `Withdrawal Approved`,
          'withdrawal_approved',
          {
            name: user.name,
            amount: withdrawal.amount,
            fee: withdrawal.fee,
            netAmount: withdrawal.net_amount || withdrawal.amount,
            method: withdrawal.method,
            withdrawalId: withdrawalId,
            details: withdrawal.details,
            date: new Date()
          }
        );
      }
    } catch (emailError) {
      console.log('Withdrawal approved email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `✅ **Withdrawal Approved**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.member_id}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Method: ${withdrawal.method || 'M-Pesa'}\n` +
      `Details: ${withdrawal.details || 'N/A'}\n\n` +
      `Please process the payment within 10-15 minutes.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.member_id,
      `✅ **Withdrawal Approved**\n\n` +
      `Your withdrawal request has been approved!\n\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Net Amount: ${formatCurrency(withdrawal.net_amount || withdrawal.amount)}\n` +
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
    // Get withdrawal
    let withdrawal;
    try {
      const result = await pool.query(
        'SELECT * FROM withdrawals WHERE withdrawal_id = $1',
        [withdrawalId]
      );
      withdrawal = result.rows[0];
    } catch (error) {
      console.error('Error getting withdrawal:', error.message);
    }
    
    if (!withdrawal) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    if (withdrawal.status === 'rejected') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already rejected.`);
      return;
    }
    
    // Update withdrawal status
    await updateWithdrawal(withdrawalId, {
      status: 'rejected',
      rejected_at: new Date(),
      rejected_by: chatId.toString()
    });
    
    // Refund amount to user balance
    const user = await getUserByMemberId(withdrawal.member_id);
    if (user) {
      const newBalance = parseFloat(user.balance || 0) + parseFloat(withdrawal.amount || 0);
      await updateUser(withdrawal.member_id, { balance: newBalance });
    }
    
    // SEND WITHDRAWAL REJECTED EMAIL
    try {
      const user = await getUserByMemberId(withdrawal.member_id);
      if (user && user.email) {
        await sendEmailNotification(withdrawal.member_id,
          `Withdrawal Rejected`,
          'withdrawal_rejected',
          {
            name: user.name,
            amount: withdrawal.amount,
            fee: withdrawal.fee,
            netAmount: withdrawal.net_amount || withdrawal.amount,
            method: withdrawal.method,
            withdrawalId: withdrawalId,
            date: new Date()
          }
        );
      }
    } catch (emailError) {
      console.log('Withdrawal rejected email failed:', emailError.message);
    }
    
    await bot.sendMessage(chatId,
      `❌ **Withdrawal Rejected**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.member_id}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)} REFUNDED\n` +
      `Reason: Please contact user with reason\n\n` +
      `Amount has been refunded to user's balance.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.member_id,
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

function normalizeShareholderStatus(value) {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'active') return SHAREHOLDER_STATUS.ACTIVE;
  if (normalized === 'suspended') return SHAREHOLDER_STATUS.SUSPENDED;
  if (normalized === 'under_review' || normalized === 'underreview' || normalized === 'review') return SHAREHOLDER_STATUS.UNDER_REVIEW;
  return null;
}

async function resolveShareholderByQuery(query) {
  const cleanQuery = query.trim().toUpperCase();
  if (cleanQuery.startsWith('SHA-')) {
    return getShareholderByShareholderId(cleanQuery);
  }
  return getShareholderByMemberId(cleanQuery);
}

bot.onText(/\/sh_create (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const args = match[1].trim().split(/\s+/);
  const memberId = (args[0] || '').toUpperCase();
  const preferredShareholderId = args[1] ? args[1].toUpperCase() : null;

  if (!memberId || !/^USER-\d+$/i.test(memberId)) {
    return bot.sendMessage(chatId, '❌ Invalid Member ID format. Use: /sh_create USER-1001 [OPTIONAL_SHA_ID]');
  }

  if (preferredShareholderId && !/^SHA-/.test(preferredShareholderId)) {
    return bot.sendMessage(chatId, '❌ Optional Shareholder ID must start with SHA-');
  }

  try {
    const shareholder = await createShareholderProfile(memberId, chatId.toString(), 'Admin create shareholder profile', preferredShareholderId);
    await bot.sendMessage(chatId,
      `✅ Shareholder profile created.
` +
      `Member ID: ${memberId}
` +
      `Shareholder ID: ${shareholder.shareholder_id}
` +
      `Status: ${shareholder.status}
` +
      `Tier: ${shareholder.tier}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, `❌ ${error.message}`);
  }
});

bot.onText(/\/sh_view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const query = match[1].trim();
  const shareholder = await resolveShareholderByQuery(query);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');

  const [user, earningsRes, pendingTopupsRes, pendingWithdrawRes] = await Promise.all([
    getUserByMemberId(shareholder.member_id),
    pool.query('SELECT * FROM shareholder_earnings WHERE shareholder_id = $1 LIMIT 1', [shareholder.shareholder_id]),
    pool.query("SELECT COUNT(*) FROM shareholder_stake_requests WHERE shareholder_id = $1 AND status = 'pending_admin_approval'", [shareholder.shareholder_id]),
    pool.query("SELECT COUNT(*) FROM shareholder_withdrawal_requests WHERE shareholder_id = $1 AND status = 'pending_admin_approval'", [shareholder.shareholder_id])
  ]);

  await bot.sendMessage(chatId,
    `🏛️ **Shareholder Profile**

` +
    `Name: ${user?.name || 'N/A'}
` +
    `Member ID: ${shareholder.member_id}
` +
    `Shareholder ID: ${shareholder.shareholder_id}
` +
    `Status: ${shareholder.status}
` +
    `Tier: ${shareholder.tier || 'N/A'}
` +
    `Total Stake (USD): ${formatCurrency(shareholder.total_stake_usd || 0)}
` +
    `Activation Date: ${shareholder.activation_date ? new Date(shareholder.activation_date).toLocaleString() : 'N/A'}
` +
    `Earnings Balance: ${formatCurrency(earningsRes.rows[0]?.earnings_balance_usd || 0)}
` +
    `Earnings Status: ${earningsRes.rows[0]?.status || 'pending_review'}
` +
    `Pending Top-Ups: ${pendingTopupsRes.rows[0].count}
` +
    `Pending Withdrawals: ${pendingWithdrawRes.rows[0].count}`
  );
});

bot.onText(/\/sh_adjust (\S+) (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const query = match[1];
  const amount = parseFloat(match[2]);
  const reason = match[3].trim();

  if (isNaN(amount) || amount === 0) return bot.sendMessage(chatId, '❌ Amount must be non-zero number.');

  const shareholder = await resolveShareholderByQuery(query);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');

  await pool.query(
    `INSERT INTO shareholder_stake_history (shareholder_id, amount_usd, type, ref, note)
     VALUES ($1, $2, 'adjustment', $3, $4)`,
    [shareholder.shareholder_id, amount, `ADMIN-${Date.now()}`, reason]
  );

  const before = shareholder;
  const updated = await recomputeShareholderTierAndStake(shareholder.shareholder_id);

  await createShareholderAuditLog({
    adminId: chatId.toString(),
    action: 'shareholder_stake_adjustment',
    targetId: shareholder.shareholder_id,
    beforeState: before,
    afterState: updated,
    reason
  });

  await bot.sendMessage(chatId,
    `✅ Shareholder stake adjusted.
` +
    `Shareholder: ${shareholder.shareholder_id}
` +
    `Adjustment: ${formatCurrency(amount)}
` +
    `New Total Stake: ${formatCurrency(updated.total_stake_usd || 0)}
` +
    `Tier: ${updated.tier || 'N/A'}`
  );
});

bot.onText(/\/sh_setstatus (\S+) (\S+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const query = match[1];
  const status = normalizeShareholderStatus(match[2]);
  if (!status) return bot.sendMessage(chatId, '❌ Invalid status. Use: active/suspended/under_review');

  const shareholder = await resolveShareholderByQuery(query);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');

  const before = shareholder;
  const result = await pool.query(
    'UPDATE shareholders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE shareholder_id = $1 RETURNING *',
    [shareholder.shareholder_id, status]
  );

  await createShareholderAuditLog({
    adminId: chatId.toString(),
    action: 'shareholder_status_change',
    targetId: shareholder.shareholder_id,
    beforeState: before,
    afterState: result.rows[0],
    reason: `Set status to ${status}`
  });

  await bot.sendMessage(chatId, `✅ Shareholder ${shareholder.shareholder_id} status updated to ${status}.`);
});

bot.onText(/\/sh_suspend (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const shareholder = await resolveShareholderByQuery(match[1]);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');
  const reason = match[2].trim();

  await pool.query('UPDATE shareholders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE shareholder_id = $1', [shareholder.shareholder_id, SHAREHOLDER_STATUS.SUSPENDED]);
  await pool.query("UPDATE shareholder_earnings SET status = 'suspended', last_update = CURRENT_TIMESTAMP WHERE shareholder_id = $1", [shareholder.shareholder_id]);

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_suspend', targetId: shareholder.shareholder_id, beforeState: shareholder, afterState: { status: 'suspended' }, reason });
  await bot.sendMessage(chatId, `✅ Shareholder ${shareholder.shareholder_id} suspended.`);
});

bot.onText(/\/sh_unsuspend (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const shareholder = await resolveShareholderByQuery(match[1]);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');
  const reason = match[2].trim();

  await pool.query('UPDATE shareholders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE shareholder_id = $1', [shareholder.shareholder_id, SHAREHOLDER_STATUS.ACTIVE]);
  await pool.query("UPDATE shareholder_earnings SET status = 'active', last_update = CURRENT_TIMESTAMP WHERE shareholder_id = $1", [shareholder.shareholder_id]);

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_unsuspend', targetId: shareholder.shareholder_id, beforeState: shareholder, afterState: { status: 'active' }, reason });
  await bot.sendMessage(chatId, `✅ Shareholder ${shareholder.shareholder_id} unsuspended.`);
});

bot.onText(/\/sh_delete (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const shareholder = await resolveShareholderByQuery(match[1]);
  if (!shareholder) return bot.sendMessage(chatId, '❌ Shareholder not found.');
  const reason = match[2].trim();

  await pool.query('DELETE FROM shareholder_stake_requests WHERE shareholder_id = $1', [shareholder.shareholder_id]);
  await pool.query('DELETE FROM shareholder_stake_history WHERE shareholder_id = $1', [shareholder.shareholder_id]);
  await pool.query('DELETE FROM shareholder_withdrawal_requests WHERE shareholder_id = $1', [shareholder.shareholder_id]);
  await pool.query('DELETE FROM shareholder_earnings WHERE shareholder_id = $1', [shareholder.shareholder_id]);
  await pool.query('DELETE FROM shareholders WHERE shareholder_id = $1', [shareholder.shareholder_id]);

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_delete_profile', targetId: shareholder.shareholder_id, beforeState: shareholder, afterState: null, reason });
  await bot.sendMessage(chatId, `✅ Shareholder profile ${shareholder.shareholder_id} deleted (main user preserved).`);
});

bot.onText(/\/sh_list(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const query = match[1] ? match[1].trim().toUpperCase() : '';
  const result = query
    ? await pool.query(
      `SELECT s.*, u.name FROM shareholders s
       LEFT JOIN users u ON u.member_id = s.member_id
       WHERE s.member_id ILIKE $1 OR s.shareholder_id ILIKE $1
       ORDER BY s.created_at DESC LIMIT 20`,
      [`%${query}%`]
    )
    : await pool.query(
      `SELECT s.*, u.name FROM shareholders s
       LEFT JOIN users u ON u.member_id = s.member_id
       ORDER BY s.created_at DESC LIMIT 20`
    );

  if (result.rows.length === 0) return bot.sendMessage(chatId, '📭 No shareholders found.');

  let message = `🏛️ Shareholders (${result.rows.length})

`;
  result.rows.forEach((row, idx) => {
    message += `${idx + 1}. ${row.name || 'N/A'}
`;
    message += `   Member: ${row.member_id}
`;
    message += `   SHA: ${row.shareholder_id}
`;
    message += `   Stake: ${formatCurrency(row.total_stake_usd || 0)}
`;
    message += `   Tier/Status: ${row.tier || 'N/A'} / ${row.status}

`;
  });

  await bot.sendMessage(chatId, message);
});

bot.onText(/\/sh_pending/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');

  const [topups, withdrawals] = await Promise.all([
    pool.query("SELECT * FROM shareholder_stake_requests WHERE status = 'pending_admin_approval' ORDER BY created_at ASC LIMIT 20"),
    pool.query("SELECT * FROM shareholder_withdrawal_requests WHERE status = 'pending_admin_approval' ORDER BY created_at ASC LIMIT 20")
  ]);

  let message = `🏛️ **Shareholder Pending Requests**

`;
  message += `Top-Ups: ${topups.rows.length}
`;
  message += `Withdrawals: ${withdrawals.rows.length}

`;

  if (topups.rows.length > 0) {
    message += `Top-Up Requests:
`;
    topups.rows.forEach(req => {
      message += `• ${req.request_id} | ${req.shareholder_id} | ${formatCurrency(req.amount_usd)}
`;
      message += `  Approve: /sh_approve_topup ${req.request_id}
`;
      message += `  Reject: /sh_reject_topup ${req.request_id} reason
`;
    });
    message += `
`;
  }

  if (withdrawals.rows.length > 0) {
    message += `Withdrawal Requests:
`;
    withdrawals.rows.forEach(req => {
      message += `• ${req.request_id} | ${req.shareholder_id} | ${formatCurrency(req.amount_usd)}
`;
      message += `  Approve: /sh_approve_withdraw ${req.request_id}
`;
      message += `  Reject: /sh_reject_withdraw ${req.request_id} reason
`;
    });
  }

  await bot.sendMessage(chatId, message);
});

bot.onText(/\/sh_approve_topup (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const requestId = match[1].trim();

  const result = await pool.query('SELECT * FROM shareholder_stake_requests WHERE request_id = $1 LIMIT 1', [requestId]);
  const req = result.rows[0];
  if (!req) return bot.sendMessage(chatId, '❌ Top-up request not found.');
  if (req.status !== SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL && req.status !== SHAREHOLDER_REQUEST_STATUS.PENDING_PROOF) {
    return bot.sendMessage(chatId, `⚠️ Request status is ${req.status}.`);
  }

  await pool.query(
    `UPDATE shareholder_stake_requests
     SET status = $2, decided_at = CURRENT_TIMESTAMP, decided_by = $3
     WHERE request_id = $1`,
    [requestId, SHAREHOLDER_REQUEST_STATUS.APPROVED, chatId.toString()]
  );

  await pool.query(
    `INSERT INTO shareholder_stake_history (shareholder_id, amount_usd, type, ref, note)
     VALUES ($1, $2, 'topup', $3, $4)`,
    [req.shareholder_id, req.amount_usd, req.request_id, 'Approved stakeholder top-up request']
  );

  const shareholderBefore = await getShareholderByShareholderId(req.shareholder_id);
  const updated = await recomputeShareholderTierAndStake(req.shareholder_id);

  if (!shareholderBefore.activation_date) {
    await pool.query('UPDATE shareholders SET activation_date = CURRENT_TIMESTAMP WHERE shareholder_id = $1', [req.shareholder_id]);
  }

  await createShareholderAuditLog({
    adminId: chatId.toString(),
    action: 'shareholder_topup_approved',
    targetId: requestId,
    beforeState: shareholderBefore,
    afterState: updated,
    reason: 'Approved shareholder top-up'
  });

  await bot.sendMessage(chatId, `✅ Shareholder top-up approved: ${requestId}. New stake: ${formatCurrency(updated.total_stake_usd || 0)}.`);

  const sh = await getShareholderByShareholderId(req.shareholder_id);
  if (sh) {
    await sendUserNotification(sh.member_id, `✅ Your shareholder top-up ${requestId} was approved. Stake updated to ${formatCurrency(updated.total_stake_usd || 0)}.`);
  }
});

bot.onText(/\/sh_reject_topup (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const requestId = match[1].trim();
  const reason = match[2].trim();

  const result = await pool.query('SELECT * FROM shareholder_stake_requests WHERE request_id = $1 LIMIT 1', [requestId]);
  const req = result.rows[0];
  if (!req) return bot.sendMessage(chatId, '❌ Top-up request not found.');

  await pool.query(
    `UPDATE shareholder_stake_requests
     SET status = $2, admin_reason = $3, decided_at = CURRENT_TIMESTAMP, decided_by = $4
     WHERE request_id = $1`,
    [requestId, SHAREHOLDER_REQUEST_STATUS.REJECTED, reason, chatId.toString()]
  );

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_topup_rejected', targetId: requestId, beforeState: req, afterState: { status: 'rejected' }, reason });

  await bot.sendMessage(chatId, `✅ Shareholder top-up ${requestId} rejected.`);
  const sh = await getShareholderByShareholderId(req.shareholder_id);
  if (sh) {
    await sendUserNotification(sh.member_id, `❌ Your shareholder top-up ${requestId} was rejected. Reason: ${reason}`);
  }
});

bot.onText(/\/sh_approve_withdraw (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const requestId = match[1].trim();

  const result = await pool.query('SELECT * FROM shareholder_withdrawal_requests WHERE request_id = $1 LIMIT 1', [requestId]);
  const req = result.rows[0];
  if (!req) return bot.sendMessage(chatId, '❌ Shareholder withdrawal request not found.');
  if (req.status !== SHAREHOLDER_REQUEST_STATUS.PENDING_ADMIN_APPROVAL) return bot.sendMessage(chatId, `⚠️ Request status is ${req.status}.`);

  const earningsRes = await pool.query('SELECT * FROM shareholder_earnings WHERE shareholder_id = $1 LIMIT 1', [req.shareholder_id]);
  const earnings = earningsRes.rows[0];
  if (!earnings) return bot.sendMessage(chatId, '❌ Shareholder earnings record missing.');

  const currentBalance = parseFloat(earnings.earnings_balance_usd || 0);
  const amount = parseFloat(req.amount_usd || 0);
  if (amount > currentBalance) return bot.sendMessage(chatId, `❌ Insufficient shareholder earnings balance (${formatCurrency(currentBalance)}).`);

  await pool.query(
    `UPDATE shareholder_withdrawal_requests
     SET status = $2, decided_at = CURRENT_TIMESTAMP, decided_by = $3
     WHERE request_id = $1`,
    [requestId, SHAREHOLDER_REQUEST_STATUS.APPROVED, chatId.toString()]
  );

  const newBalance = currentBalance - amount;
  await pool.query(
    `UPDATE shareholder_earnings
     SET earnings_balance_usd = $2, last_update = CURRENT_TIMESTAMP
     WHERE shareholder_id = $1`,
    [req.shareholder_id, newBalance]
  );

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_withdrawal_approved', targetId: requestId, beforeState: { earningsBalance: currentBalance }, afterState: { earningsBalance: newBalance }, reason: 'Approved shareholder withdrawal' });

  await bot.sendMessage(chatId, `✅ Shareholder withdrawal ${requestId} approved.`);
  const sh = await getShareholderByShareholderId(req.shareholder_id);
  if (sh) {
    await sendUserNotification(sh.member_id, `✅ Your shareholder withdrawal ${requestId} was approved for ${formatCurrency(req.amount_usd)}.`);
  }
});

bot.onText(/\/sh_reject_withdraw (\S+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '🚫 Access denied.');
  const requestId = match[1].trim();
  const reason = match[2].trim();

  const result = await pool.query('SELECT * FROM shareholder_withdrawal_requests WHERE request_id = $1 LIMIT 1', [requestId]);
  const req = result.rows[0];
  if (!req) return bot.sendMessage(chatId, '❌ Shareholder withdrawal request not found.');

  await pool.query(
    `UPDATE shareholder_withdrawal_requests
     SET status = $2, admin_reason = $3, decided_at = CURRENT_TIMESTAMP, decided_by = $4
     WHERE request_id = $1`,
    [requestId, SHAREHOLDER_REQUEST_STATUS.REJECTED, reason, chatId.toString()]
  );

  await createShareholderAuditLog({ adminId: chatId.toString(), action: 'shareholder_withdrawal_rejected', targetId: requestId, beforeState: req, afterState: { status: 'rejected' }, reason });

  await bot.sendMessage(chatId, `✅ Shareholder withdrawal ${requestId} rejected.`);
  const sh = await getShareholderByShareholderId(req.shareholder_id);
  if (sh) {
    await sendUserNotification(sh.member_id, `❌ Your shareholder withdrawal ${requestId} was rejected. Reason: ${reason}`);
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
    const users = await getAllUsers();
    const activeUsers = users.filter(u => !u.banned && u.chat_id);
    
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
        await bot.sendMessage(user.chat_id,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `💼 Management Team`
        );
        successCount++;
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
        console.log(`Failed to send to ${user.member_id}:`, error.message);
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

// ==================== TEST EMAIL COMMAND ====================

// Add test email command
bot.onText(/\/testemail/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getLoggedInUser(chatId);
  
  if (!user) {
    await bot.sendMessage(chatId, 'Please login first');
    return;
  }
  
  try {
    await sendEmailNotification(user.member_id, 
      'Test Email from Starlife Advert',
      'welcome',
      {
        name: user.name,
        memberId: user.member_id,
        email: user.email,
        password: 'test123',
        referralCode: user.referral_code,
        joinDate: user.joined_date
      }
    );
    
    await bot.sendMessage(chatId, '✅ Test email sent to your registered email');
  } catch (error) {
    console.error(error);
    await bot.sendMessage(chatId, '❌ Email failed: ' + error.message);
  }
});
// Email broadcast commands
bot.onText(/\/broadcastemail (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Parse command: /broadcastemail subject|message
  const parts = match[1].split('|');
  if (parts.length < 2) {
    await bot.sendMessage(chatId,
      `❌ **Invalid Format**\n\n` +
      `Use: /broadcastemail subject|message\n` +
      `Example: /broadcastemail New Investment Opportunity|We have exciting news about our new investment plans...`
    );
    return;
  }
  
  const subject = parts[0].trim();
  const message = parts.slice(1).join('|').trim();
  
  await bot.sendMessage(chatId,
    `📧 **Confirm Email Broadcast**\n\n` +
    `**Subject:** ${subject}\n\n` +
    `**Message:**\n${message}\n\n` +
    `This will send email to ALL registered users.\n\n` +
    `Send CONFIRM to proceed or CANCEL to abort.`
  );
  
  adminSessions[chatId] = {
    step: 'confirm_broadcast',
    data: {
      subject: subject,
      message: message
    }
  };
});

// Schedule broadcast email
bot.onText(/\/schedulebroadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  // Parse: /schedulebroadcast name|YYYY-MM-DD HH:MM|subject|message
  const parts = match[1].split('|');
  if (parts.length < 4) {
    await bot.sendMessage(chatId,
      `❌ **Invalid Format**\n\n` +
      `Use: /schedulebroadcast name|datetime|subject|message\n\n` +
      `**Example:**\n` +
      `/schedulebroadcast Welcome Message|2024-12-25 09:00|Welcome to Starlife|Dear investor, welcome to our platform...\n\n` +
      `**Recurring daily:** Add "recurring" at the end:\n` +
      `/schedulebroadcast Daily Update|2024-12-25 09:00|Daily News|Today's update...|recurring`
    );
    return;
  }
  
  const name = parts[0].trim();
  const datetimeStr = parts[1].trim();
  const subject = parts[2].trim();
  const message = parts.slice(3).join('|').trim();
  const isRecurring = message.toLowerCase().includes('recurring');
  
  // Clean message if it has recurring flag
  const cleanMessage = isRecurring ? 
    message.replace(/recurring/gi, '').trim() : message;
  
  const scheduledTime = new Date(datetimeStr);
  
  if (isNaN(scheduledTime.getTime())) {
    await bot.sendMessage(chatId, '❌ Invalid date format. Use: YYYY-MM-DD HH:MM');
    return;
  }
  
  const success = scheduleBroadcastEmail(name, subject, cleanMessage, scheduledTime, isRecurring);
  
  if (success) {
    await bot.sendMessage(chatId,
      `✅ **Broadcast Scheduled Successfully**\n\n` +
      `**Name:** ${name}\n` +
      `**Time:** ${scheduledTime.toLocaleString()}\n` +
      `**Recurring:** ${isRecurring ? 'Yes (Daily)' : 'No'}\n` +
      `**Subject:** ${subject}\n\n` +
      `Email will be sent automatically at the scheduled time.`
    );
  } else {
    await bot.sendMessage(chatId, '❌ Failed to schedule broadcast. Time must be in the future.');
  }
});

// List scheduled broadcasts
bot.onText(/\/listscheduled/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const broadcasts = listScheduledBroadcasts();
  
  if (broadcasts.length === 0) {
    await bot.sendMessage(chatId, '📭 No scheduled broadcasts.');
    return;
  }
  
  let message = `⏰ **Scheduled Email Broadcasts**\n\n`;
  
  broadcasts.forEach((broadcast, index) => {
    message += `${index + 1}. **${broadcast.name}**\n`;
    message += `   Time: ${broadcast.scheduledTime.toLocaleString()}\n`;
    message += `   Recurring: ${broadcast.recurring ? '✅ Yes' : '❌ No'}\n`;
    message += `   Subject: ${broadcast.subject}\n\n`;
  });
  
  message += `**Cancel a broadcast:** /cancelbroadcast name`;
  
  await bot.sendMessage(chatId, message);
});

// Cancel scheduled broadcast
bot.onText(/\/cancelbroadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const name = match[1].trim();
  const success = cancelScheduledBroadcast(name);
  
  if (success) {
    await bot.sendMessage(chatId, `✅ Cancelled broadcast: "${name}"`);
  } else {
    await bot.sendMessage(chatId, `❌ No broadcast found with name: "${name}"`);
  }
});

// Send test broadcast to yourself
bot.onText(/\/testbroadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const parts = match[1].split('|');
  if (parts.length < 2) {
    await bot.sendMessage(chatId, 'Use: /testbroadcast subject|message');
    return;
  }
  
  const subject = parts[0].trim();
  const message = parts.slice(1).join('|').trim();
  
  // Send test to admin only
  const user = await getUserByChatId(chatId);
  
  if (user && user.email) {
    try {
      await sendEmail(
        user.email,
        subject,
        `Dear ${user.name},\n\n${message}\n\nBest regards,\nStarlife Advert Team`
      );
      
      await bot.sendMessage(chatId,
        `✅ **Test Email Sent**\n\n` +
        `Sent to: ${user.email}\n` +
        `Subject: ${subject}\n\n` +
        `Check your inbox!`
      );
    } catch (error) {
      await bot.sendMessage(chatId, `❌ Failed to send test email: ${error.message}`);
    }
  } else {
    await bot.sendMessage(chatId, '❌ You need to have an email registered to test.');
  }
});

// Send batch broadcast (respects 300/day limit)
bot.onText(/\/batchbroadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const parts = match[1].split('|');
  if (parts.length < 2) {
    await bot.sendMessage(chatId,
      `❌ **Invalid Format**\n\n` +
      `Use: /batchbroadcast subject|message\n` +
      `Example: /batchbroadcast Important Update|We're upgrading our systems...\n\n` +
      `This sends emails in batches of 50 to respect 300/day limit.`
    );
    return;
  }
  
  const subject = parts[0].trim();
  const message = parts.slice(1).join('|').trim();
  
  await bot.sendMessage(chatId,
    `📧 **Starting Batch Broadcast**\n\n` +
    `**Subject:** ${subject}\n\n` +
    `**Message:** ${message.substring(0, 100)}...\n\n` +
    `Sending in batches of 50 emails...\n` +
    `Please wait, this may take several minutes.`
  );
  
  try {
    const result = await sendBatchBroadcastEmails(subject, message, 50);
    
    let report = `✅ **Batch Broadcast Complete**\n\n`;
    report += `Total Users with Email: ${result.totalUsers}\n`;
    report += `Total Emails Sent: ${result.totalSent}\n\n`;
    
    result.batches.forEach((batch, index) => {
      report += `Batch ${index + 1}: ${batch.success} sent, ${batch.failed} failed\n`;
    });
    
    report += `\n**Note:** Stopped at ${result.totalSent} emails to respect 300/day limit.`;
    
    await bot.sendMessage(chatId, report);
    
    // Store broadcast history
    await storeBroadcastHistory(
      'Batch Broadcast',
      subject,
      message,
      { totalUsers: result.totalUsers, success: result.totalSent, failed: 0 }
    );
    
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Batch broadcast failed: ${error.message}`);
  }
});

// ==================== HEALTH CHECK ENDPOINT ====================

app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      users: Object.keys(userSessions).length,
      loggedOutUsers: loggedOutUsers.size,
      adminSessions: Object.keys(adminSessions).length,
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      database: 'disconnected'
    });
  }
});

app.get('/', (req, res) => {
  res.send('Starlife Advert Bot is running with PostgreSQL!');
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
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    pool.end();
    process.exit(0);
  });
});

console.log('✅ Starlife Advert Bot is running with PostgreSQL!');
console.log('✅ Data is now permanently stored in PostgreSQL database');
console.log('✅ Email notifications are now enabled for all events!');
console.log('📧 Emails will be sent for:');
console.log('   - Registration');
console.log('   - Investment submissions');
console.log('   - Investment approvals/rejections');
console.log('   - Withdrawal requests');
console.log('   - Withdrawal approvals/rejections');
console.log('   - Account suspensions/unsuspensions');
console.log('   - Password resets/changes');
console.log('✅ Use /testemail to test email functionality');
