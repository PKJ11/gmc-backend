// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*'
}));
app.use(express.json());

const mongoose = require('mongoose');
const User = require('./models/User'); // You'll need to create this model

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://pratikkumarjhavnit:cBkOwgGUuMB4ZMia@cluster0.sxfhet5.mongodb.net/gmc?retryWrites=true&w=majority').then(()=>{console.log("backend connected ")});

// User data endpoint
app.post('/api/users', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
app.get('/api/users/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    console.log("api is hitted")
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found',
        completed: false
      });
    }
    
    // Check if required fields are filled
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

app.get('/', (req, res) => {
  res.json({
    message: 'InterviewDost backend is running ✅',
    port: PORT,
    environment: {
      GMAIL_USER: process.env.GMAIL_USER,
      // ⚠️ Never expose passwords in production
      GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
      NODE_ENV: process.env.NODE_ENV,
    }
  });
});


// Email endpoint
app.post('/api/send-email', async (req, res) => {
  const { subject, html, text, recipients } = req.body;
  console.log('Recipients:', recipients); // Add this line


  // Validate input
  if (!subject || !html || !text || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing required fields' 
    });
  }

  // Validate at least one recipient exists
  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No valid recipients provided'
    });
  }

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER || "pratikkumarjhavnit@gmail.com",
        pass: process.env.GMAIL_PASSWORD || "apvp cjeq ljax nurr",
      },
    });

    // Send mail to all recipients
    const info = await transporter.sendMail({
      from: `"InterviewDost" <${process.env.GMAIL_USER}>`,
      to: recipients.join(', '),
      subject,
      text,
      html,
    });

    console.log('Message sent: %s', info.messageId);
    res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully to all recipients' 
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send email',
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});