require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB with improved settings
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://pratikkumarjhavnit:cBkOwgGUuMB4ZMia@cluster0.sxfhet5.mongodb.net/gmc?retryWrites=true&w=majority', {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
.then(() => console.log("MongoDB connected successfully"))
.catch(err => console.error("MongoDB connection error:", err));

// User Model endpoints remain the same
const User = require('./models/User'); // Make sure this path is correct

app.post('/api/users', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['email', 'username', 'password', 'fullName', 'grade', 'dob', 'school', 'mobileNumber'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: req.body.email },
        { username: req.body.username }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: existingUser.email === req.body.email 
          ? 'Email already exists' 
          : 'Username already exists'
      });
    }

    // Create new user
    const user = new User({
      ...req.body,
      // Convert dob string to Date if needed
      dob: req.body.dob // Now accepts string directly
    });

    await user.save();
    
    // Return success response (excluding password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({ 
      success: true, 
      data: userResponse 
    });

  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error during user creation'
    });
  }
});

app.get('/api/users/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found',
        completed: false
      });
    }
    
    const isProfileComplete = user.fullName && user.grade && user.dob && user.school;
    res.status(200).json({ 
      success: true, 
      data: user,
      completed: isProfileComplete
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      completed: false
    });
  }
});

// Enhanced Email Endpoint with all improvements
app.post('/api/send-email', async (req, res) => {
  const { subject, text, recipients } = req.body;

  console.log("new code genrated")
  
  // Validate input
  if (!subject || !text || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing required fields' 
    });
  }

  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid recipients provided'
    });
  }

  // Generate professional HTML template
  const html = generateEmailTemplate(subject, text);

  try {
    // Configure transporter with enhanced settings
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2"
      },
      dkim: {
        domainName: process.env.EMAIL_DOMAIN,
        keySelector: 'email1',
        privateKey: process.env.DKIM_PRIVATE_KEY
      }
    });

    // Enhanced mail options
    const mailOptions = {
      from: `"Global Maths Challenge" <no-reply@${process.env.EMAIL_DOMAIN}>`,
      to: recipients.join(', '),
      subject: `GMC: ${subject}`,
      text: text,
      html: html,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'List-Unsubscribe': `<mailto:unsubscribe@${process.env.EMAIL_DOMAIN}>`,
        'X-Entity-Ref-ID': uuidv4(),
        'X-Mailer': 'Global Maths Challenge Server'
      },
      priority: 'high'
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('Message sent: %s', info.messageId);
    res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send email',
      error: error.message 
    });
  }
});

// Professional HTML Email Template Generator
function generateEmailTemplate(subject, text) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 25px; background-color: #f9fafb; }
        .footer { background-color: #e5e7eb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .button { background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; }
        .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Global Math Challenge</h2>
    </div>
    <div class="content">
        <h3>${subject}</h3>
        <div class="divider"></div>
        <p>${text.replace(/\n/g, '<br>')}</p>
        <div class="divider"></div>
        <p>If you have any questions, please contact our support team.</p>
    </div>
    <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Global Maths Challenge. All rights reserved.</p>
        <p>
            <a href="https://${process.env.EMAIL_DOMAIN}/privacy" style="color: #6b7280; text-decoration: none;">Privacy Policy</a> | 
            <a href="https://${process.env.EMAIL_DOMAIN}/terms" style="color: #6b7280; text-decoration: none;">Terms of Service</a>
        </p>
        <p>
            <small>
                This email was sent to you as part of your Global Maths Challenge account. 
                <a href="https://${process.env.EMAIL_DOMAIN}/unsubscribe" style="color: #6b7280;">Unsubscribe</a>
            </small>
        </p>
    </div>
</body>
</html>
  `;
}

app.get('/', (req, res) => {
  res.json({
    message: 'Global Maths Challenge backend is running ✅',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});