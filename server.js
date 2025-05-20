require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  grade: { type: String, required: true },
  dob: { type: Date, required: true },
  school: { type: String, required: true },
  branch: { type: String },
  email: { type: String, required: true, unique: true },
  registrationId: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate random credentials
function generateCredentials() {
  const registrationId = `GMC${Math.floor(100000 + Math.random() * 900000)}`;
  const password = Math.random().toString(36).slice(-8);
  return { registrationId, password };
}

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, grade, dob, school, branch, email } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate temporary password (will be replaced after email verification)
    const tempPassword = Math.random().toString(36).slice(-8);

    // In a real app, you would create the user in Clerk here
    // For this example, we'll just store in MongoDB
    const newUser = new User({
      fullName,
      grade,
      dob: new Date(dob),
      school,
      branch,
      email,
      registrationId: `TEMP-${Date.now()}`
    });

    await newUser.save();

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'GMC Registration - Verify Your Email',
      html: `
        <p>Hello ${fullName},</p>
        <p>Your OTP for GMC registration is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
      `
    });

    res.json({ success: true, userId: newUser._id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/verify-email', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    
    // In a real app, you would verify the OTP here
    // For this example, we'll assume OTP is valid
    
    // Generate final credentials
    const { registrationId, password } = generateCredentials();
    
    // Update user in MongoDB
    const user = await User.findByIdAndUpdate(userId, { 
      registrationId 
    }, { new: true });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create the user in Clerk (pseudo-code)
    // const clerkUser = await clerkClient.users.createUser({
    //   emailAddress: [user.email],
    //   password,
    //   username: registrationId,
    //   // other user data
    // });

    // Send credentials email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Your GMC Account Credentials',
      html: `
        <p>Hello ${user.fullName},</p>
        <p>Your GMC account has been created successfully.</p>
        <p>Here are your login credentials:</p>
        <p><strong>Registration ID:</strong> ${registrationId}</p>
        <p><strong>Password:</strong> ${password}</p>
        <p>Please keep these credentials secure.</p>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Protected route example
app.get('/api/user', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const user = await User.findOne({ clerkUserId });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));