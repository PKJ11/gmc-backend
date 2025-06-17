require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const User = require("./models/User");
const multer = require("multer");
const upload = multer();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const TestResponse = require("./models/TestResponse");

// Enhanced Middleware
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB with improved settings
mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb+srv://pratikkumarjhavnit:cBkOwgGUuMB4ZMia@cluster0.sxfhet5.mongodb.net/gmc?retryWrites=true&w=majority",
    {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  )
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Update your login-with-phone endpoint
app.post("/api/auth/login-with-phone", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: "Phone number and Firebase UID are required",
      });
    }

    // Find user by phone number
    const user = await User.findOne({ mobileNumber: phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Phone number not registered",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      token,
      data: user,
    });
  } catch (error) {
    console.error("Phone login error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update your existing login endpoint to support phone login
app.post("/api/auth/login", async (req, res) => {
  try {
    const {  phone, password } = req.body;

    // Check if email or phone exists
    if ((!phone) || !password) {
      return res.status(400).json({
        success: false,
        error: "Please provide email/phone and password",
      });
    }

    // Find user by email or phone
    const user = await User.findOne({
      $or: [ { mobileNumber: phone }],
    }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        error: "Incorrect credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id,  username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Remove password from output
    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      data: user,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const authMiddleware = async (req, res, next) => {
  try {
    // 1) Getting token and check if it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "You are not logged in! Please log in to get access.",
      });
    }

    // 2) Verification token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: "The user belonging to this token does no longer exist.",
      });
    }

    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid token. Please log in again.",
    });
  }
};

// Add this to your backend
app.get("/api/auth/verify", authMiddleware, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

app.post("/api/users", async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      "username",
      "password",
      "fullName",
      "grade",
      "dob",
      "school",
      "mobileNumber",
    ];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Check if user already exists (email, username, or mobile number)

    const existingUser = await User.findOne({
      $or: [
        { username: req.body.username },
        { mobileNumber: req.body.mobileNumber },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error:
          existingUser.username === req.body.username
            ? "Username already exists"
            : "Mobile number already exists",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 12);

    // Create new user
    const user = new User({
      ...req.body,
      password: hashedPassword,
      alternatePhoneNumber: req.body.alternatePhoneNumber || undefined,
      dob: req.body.dob,
    });
    console.log("JWT_SECRET:", process.env.JWT_SECRET);
    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id,  username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // Remove password from output
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      token,
      data: userResponse,
    });
  } catch (error) {
    console.error("User creation error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Server error during user creation",
    });
  }
});

app.get("/api/users/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        completed: false,
      });
    }

    const isProfileComplete =
      user.fullName && user.grade && user.dob && user.school;
    res.status(200).json({
      success: true,
      data: user,
      completed: isProfileComplete,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      completed: false,
    });
  }
});

// Enhanced Email Endpoint with all improvements
app.post("/api/send-email", async (req, res) => {
  const { subject, text, recipients } = req.body;

  console.log("new code genrated");

  // Validate input
  if (!subject || !text || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields",
    });
  }

  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: "No valid recipients provided",
    });
  }

  // Generate professional HTML template
  const html = generateEmailTemplate(subject, text);

  try {
    // Configure transporter with enhanced settings
    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
      },
      dkim: {
        domainName: process.env.EMAIL_DOMAIN,
        keySelector: "email1",
        privateKey: process.env.DKIM_PRIVATE_KEY,
      },
    });

    // Enhanced mail options
    const mailOptions = {
      from: `"Global Maths Challenge" <no-reply@${process.env.EMAIL_DOMAIN}>`,
      to: recipients.join(", "),
      subject: `GMC: ${subject}`,
      text: text,
      html: html,
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "high",
        "List-Unsubscribe": `<mailto:unsubscribe@${process.env.EMAIL_DOMAIN}>`,
        "X-Entity-Ref-ID": uuidv4(),
        "X-Mailer": "Global Maths Challenge Server",
      },
      priority: "high",
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("Message sent: %s", info.messageId);
    res.status(200).json({
      success: true,
      message: "Email sent successfully",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send email",
      error: error.message,
    });
  }
});

app.post("/api/send-email-with-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const { email, subject, text } = req.body;
    const pdfFile = req.file;

    // Validate input
    if (!email || !subject || !text || !pdfFile) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Generate professional HTML template
    const html = generatePdfEmailTemplate(subject, text);

    // Configure transporter with enhanced settings
    const transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
      },
      dkim: {
        domainName: process.env.EMAIL_DOMAIN,
        keySelector: "email1",
        privateKey: process.env.DKIM_PRIVATE_KEY,
      },
    });

    // Professional mail options
    const mailOptions = {
      from: `"Global Maths Challenge" <no-reply@${process.env.EMAIL_DOMAIN}>`,
      to: email,
      subject: `GMC: ${subject}`,
      text: text,
      html: html,
      attachments: [
        {
          filename: "math_test_report.pdf",
          content: pdfFile.buffer,
          contentType: "application/pdf",
        },
      ],
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "high",
        "List-Unsubscribe": `<mailto:unsubscribe@${process.env.EMAIL_DOMAIN}>`,
        "X-Entity-Ref-ID": uuidv4(),
        "X-Mailer": "Global Maths Challenge Server",
      },
      priority: "high",
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("PDF email sent: %s", info.messageId);
    res.status(200).json({
      success: true,
      message: "Email with PDF sent successfully",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("PDF email sending error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send email with PDF",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// assuming express is already set up
app.post("/api/webhook/interakt", (req, res) => {
  console.log("Received webhook:", req.body);
  res.sendStatus(200); // Respond with 200 to acknowledge receipt
});

// Check if user can take level 1 test
app.get("/api/tests/level1/eligibility", async (req, res) => {
  try {
    const existingResponse = await TestResponse.findOne({
      userId: req.user._id,
      testType: "level1",
    });

    res.status(200).json({
      success: true,
      eligible: !existingResponse,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Submit level 1 test
app.post("/api/tests/level1/submit", authMiddleware, async (req, res) => {
  try {
    const { responses, grade, score, totalQuestions } = req.body;

    // Validate input
    if (!Array.isArray(responses)) {
      return res.status(400).json({
        success: false,
        error: "Invalid responses format",
      });
    }

    if (typeof score !== "number" || typeof totalQuestions !== "number") {
      return res.status(400).json({
        success: false,
        error: "Invalid score or totalQuestions",
      });
    }

    // Check if user already took the test
    const existingResponse = await TestResponse.findOne({
      userId: req.user._id,
      testType: "level1",
    });

    if (existingResponse) {
      return res.status(400).json({
        success: false,
        error: "You have already completed Level 1 test",
      });
    }

    // Process responses (without calculating score)
    const processedResponses = [];

    for (const response of responses) {
      const question = await Question.findById(response.questionId);
      if (!question) continue;

      processedResponses.push({
        questionId: response.questionId,
        answer: response.answer,
        timeTaken: response.timeTaken || 0,
      });
    }

    // Save test response with score from frontend
    const testResponse = new TestResponse({
      userId: req.user._id,
      testType: "level1",
      grade,
      responses: processedResponses,
      score, // Using score from frontend
      totalQuestions, // Using totalQuestions from frontend
    });

    await testResponse.save();

    // Update user's completed tests
    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        completedTests: {
          testType: "level1",
          completedAt: new Date(),
          score,
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        score,
        totalQuestions,
        percentage: Math.round((score / totalQuestions) * 100),
      },
    });
  } catch (error) {
    console.error("Test submission error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to submit test. Please try again.",
    });
  }
});

app.get("/api/users/:id/tests", authMiddleware, async (req, res) => {
  try {
    const tests = await TestResponse.find({ userId: req.params.id })
      .sort({ completedAt: -1 })
      .populate("responses.questionId", "question type");

    res.status(200).json({
      success: true,
      data: tests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Question Model (create models/Question.js)
const questionSchema = new mongoose.Schema({
  testType: {
    type: String,
    enum: ["sample", "live"],
    default: "sample",
    required: true,
  },
  grade: {
    type: String,
    required: true,
    enum: [
      "Grade4",
      "Grade5",
      "Grade6",
      "Grade7",
      "Grade8",
      "Grade9",
      "Grade10",
      "default",
    ],
  },
  type: {
    type: String,
    required: true,
    enum: ["multiple-choice", "short-answer", "drag-and-drop", "match-pairs"],
  },
  question: {
    type: String,
    required: true,
  },
  image: {
    type: String, // ✅ Add this to store Cloudinary image URL
  },
  options: {
    type: [mongoose.Schema.Types.Mixed], // Accept both objects and strings
    required: function () {
      return this.type === "multiple-choice" || this.type === "drag-and-drop";
    },
  },
  items: {
    // Add separate field for drag-and-drop items
    type: [String],
    required: function () {
      return this.type === "drag-and-drop";
    },
  },
  correctOrder: {
    type: [String],
    required: function () {
      return this.type === "drag-and-drop";
    },
  },
  correctAnswer: mongoose.Schema.Types.Mixed, // Can be string, array, etc. depending on question type

  pairs: [
    {
      // For match-pairs
      id: String,
      left: String,
      right: String,
    },
  ],
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium",
  },
  tags: [String],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Question = mongoose.model("Question", questionSchema);

app.get("/api/questions", async (req, res) => {
  try {
    const { grade, testType, type, difficulty } = req.query;
    const query = {};

    if (grade) query.grade = grade;
    if (testType) query.testType = testType;
    if (type) query.type = type;
    if (difficulty) query.difficulty = difficulty;

    const questions = await Question.find(query).sort({
      grade: 1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get question statistics (updated to include testType)
app.get("/api/questions/stats", async (req, res) => {
  try {
    const totalQuestions = await Question.countDocuments();
    const sampleQuestions = await Question.countDocuments({
      testType: "sample",
    });
    const liveQuestions = await Question.countDocuments({ testType: "live" });
    const gradeLevels = await Question.distinct("grade");
    const questionTypes = await Question.distinct("type");
    const difficultyLevels = await Question.distinct("difficulty");

    res.status(200).json({
      success: true,
      data: {
        totalQuestions,
        sampleQuestions,
        liveQuestions,
        gradeLevels: gradeLevels.length,
        questionTypes: questionTypes.length,
        difficultyLevels: difficultyLevels.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create a new question (updated to include testType)
app.post("/api/questions", async (req, res) => {
  try {
    const { grade, type, question, testType = "sample", image = "" } = req.body;

    if (!grade || !type || !question) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields (grade, type, question)",
      });
    }

    // Validate based on question type
    let validationError;
    switch (type) {
      case "multiple-choice":
        if (
          !req.body.options ||
          req.body.options.length < 2 ||
          !req.body.correctAnswer
        ) {
          validationError =
            "Multiple-choice questions require options array (min 2) and correctAnswer";
        }
        break;
      case "short-answer":
        if (!req.body.correctAnswer) {
          validationError = "Short-answer questions require correctAnswer";
        }
        break;
      case "drag-and-drop":
        if (
          !req.body.items ||
          req.body.items.length < 2 ||
          !req.body.correctOrder
        ) {
          validationError =
            "Drag-and-drop questions require items array (min 2) and correctOrder";
        }
        break;
      case "match-pairs":
        if (!req.body.pairs || req.body.pairs.length < 2) {
          validationError = "Match-pairs questions require pairs array (min 2)";
        }
        break;
    }

    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    // Transform data based on question type
    const questionData = {
      grade,
      type,
      question,
      testType,
      image, // Add image field
      difficulty: req.body.difficulty || "medium",
      tags: req.body.tags || [],
      ...(type === "multiple-choice" && {
        options: req.body.options,
        correctAnswer: req.body.correctAnswer,
      }),
      ...(type === "short-answer" && {
        correctAnswer: req.body.correctAnswer,
      }),
      ...(type === "drag-and-drop" && {
        items: req.body.items,
        correctOrder: req.body.correctOrder,
      }),
      ...(type === "match-pairs" && {
        pairs: req.body.pairs,
      }),
    };

    const newQuestion = new Question(questionData);
    await newQuestion.save();

    res.status(201).json({
      success: true,
      data: newQuestion,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
// Get a single question by ID
app.get("/api/questions/:id", async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: "Question not found",
      });
    }

    res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update a question
app.put("/api/questions/:id", async (req, res) => {
  try {
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updatedQuestion) {
      return res.status(404).json({
        success: false,
        error: "Question not found",
      });
    }

    res.status(200).json({
      success: true,
      data: updatedQuestion,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete a question
app.delete("/api/questions/:id", async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);

    if (!deletedQuestion) {
      return res.status(404).json({
        success: false,
        error: "Question not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Sample test endpoint
app.get("/api/sample-test/:grade", async (req, res) => {
  try {
    const grade = req.params.grade;
    const questions = await Question.find({
      grade,
      testType: "sample",
    }).limit(10); // Get 10 sample questions for the grade

    if (questions.length === 0) {
      // Fallback to default if no questions found for grade
      const defaultQuestions = await Question.find({
        grade: "default",
        testType: "sample",
      }).limit(10);
      return res.status(200).json({
        success: true,
        data: defaultQuestions,
      });
    }

    res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Live test endpoint
app.get("/api/live-test/:grade", async (req, res) => {
  try {
    const grade = req.params.grade;
    const questions = await Question.find({
      grade,
      testType: "live",
    }).limit(20); // Get 20 live questions for the grade

    if (questions.length === 0) {
      // Fallback to default if no questions found for grade
      const defaultQuestions = await Question.find({
        grade: "default",
        testType: "live",
      }).limit(20);
      return res.status(200).json({
        success: true,
        data: defaultQuestions,
      });
    }

    res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Custom HTML template for PDF emails
function generatePdfEmailTemplate(subject, text) {
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
        .attachment { background: #f0f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Global Math Challenge</h2>
    </div>
    <div class="content">
        <h3>${subject}</h3>
        <div class="divider"></div>
        <p>${text.replace(/\n/g, "<br>")}</p>
        
        <div class="attachment">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
            <strong>Attached:</strong> math_test_report.pdf
        </div>
        
        <div class="divider"></div>
        <p>You can also view your results in your account dashboard.</p>
    </div>
    <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Global Maths Challenge. All rights reserved.</p>
        <p>
            <a href="https://${
              process.env.EMAIL_DOMAIN
            }/privacy" style="color: #6b7280; text-decoration: none;">Privacy Policy</a> | 
            <a href="https://${
              process.env.EMAIL_DOMAIN
            }/terms" style="color: #6b7280; text-decoration: none;">Terms of Service</a>
        </p>
        <p>
            <small>
                This email was sent to you as part of your Global Maths Challenge account. 
                <a href="https://${
                  process.env.EMAIL_DOMAIN
                }/unsubscribe" style="color: #6b7280;">Unsubscribe</a>
            </small>
        </p>
    </div>
</body>
</html>
  `;
}
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
        <p>${text.replace(/\n/g, "<br>")}</p>
        <div class="divider"></div>
        <p>If you have any questions, please contact our support team.</p>
    </div>
    <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Global Maths Challenge. All rights reserved.</p>
        <p>
            <a href="https://${
              process.env.EMAIL_DOMAIN
            }/privacy" style="color: #6b7280; text-decoration: none;">Privacy Policy</a> | 
            <a href="https://${
              process.env.EMAIL_DOMAIN
            }/terms" style="color: #6b7280; text-decoration: none;">Terms of Service</a>
        </p>
        <p>
            <small>
                This email was sent to you as part of your Global Maths Challenge account. 
                <a href="https://${
                  process.env.EMAIL_DOMAIN
                }/unsubscribe" style="color: #6b7280;">Unsubscribe</a>
            </small>
        </p>
    </div>
</body>
</html>
  `;
}

app.get("/", (req, res) => {
  res.json({
    message: "Global Maths Challenge backend is running ✅",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
