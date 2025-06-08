require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const User = require("./models/User");
const multer = require("multer");
const upload = multer();

const app = express();
const PORT = process.env.PORT || 5000;

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

// Make sure this path is correct

app.post("/api/users", async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = [
      "email",
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

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: req.body.email }, { username: req.body.username }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error:
          existingUser.email === req.body.email
            ? "Email already exists"
            : "Username already exists",
      });
    }

    // Create new user
    const user = new User({
      ...req.body,
      // Convert dob string to Date if needed
      dob: req.body.dob, // Now accepts string directly
    });

    await user.save();

    // Return success response (excluding password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
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

const sampleTests = {
  Grade4: [
    // Multiple-choice
    {
      id: "q1",
      type: "multiple-choice",
      question: "What is 5 + 7?",
      options: [
        { id: "a", text: "10" },
        { id: "b", text: "11" },
        { id: "c", text: "12" },
        { id: "d", text: "13" },
      ],
      correctAnswer: "c",
    },
    {
      id: "q2",
      type: "multiple-choice",
      question: "Which number is a multiple of 3?",
      options: [
        { id: "a", text: "8" },
        { id: "b", text: "9" },
        { id: "c", text: "14" },
        { id: "d", text: "17" },
      ],
      correctAnswer: "b",
    },

    // Short-answer
    {
      id: "q3",
      type: "short-answer",
      question: "What is 15 minus 8?",
      correctAnswer: "7",
    },
    {
      id: "q4",
      type: "short-answer",
      question: "What is the square of 6?",
      correctAnswer: "36",
    },

    // Drag-and-drop
    {
      id: "q5",
      type: "drag-and-drop",
      question: "Arrange these numbers from smallest to largest:",
      items: [
        { id: "item1", content: "3.5" },
        { id: "item2", content: "3.05" },
        { id: "item3", content: "3.25" },
        { id: "item4", content: "3.0" },
      ],
      correctOrder: ["item4", "item2", "item3", "item1"],
    },

    // Match-pairs
    {
      id: "q6",
      type: "match-pairs",
      question: "Match each shape with its number of sides:",
      pairs: [
        { id: "pair1", left: "Triangle", right: "3 sides" },
        { id: "pair2", left: "Square", right: "4 sides" },
        { id: "pair3", left: "Pentagon", right: "5 sides" },
        { id: "pair4", left: "Hexagon", right: "6 sides" },
      ],
    },
  ],

  Grade5: [
    // Multiple-choice
    {
      id: "q1",
      type: "multiple-choice",
      question: "What is the value of 3² + 4²?",
      options: [
        { id: "a", text: "12" },
        { id: "b", text: "18" },
        { id: "c", text: "25" },
        { id: "d", text: "30" },
      ],
      correctAnswer: "c",
    },
    {
      id: "q2",
      type: "multiple-choice",
      question: "Which of these is a prime number?",
      options: [
        { id: "a", text: "21" },
        { id: "b", text: "25" },
        { id: "c", text: "29" },
        { id: "d", text: "33" },
      ],
      correctAnswer: "c",
    },

    // Short-answer
    {
      id: "q3",
      type: "short-answer",
      question: "Solve for x: x + 5 = 12",
      correctAnswer: "7",
    },
    {
      id: "q4",
      type: "short-answer",
      question: "What is 100 divided by 4?",
      correctAnswer: "25",
    },

    // Drag-and-drop
    {
      id: "q5",
      type: "drag-and-drop",
      question: "Arrange these fractions from smallest to largest:",
      items: [
        { id: "item1", content: "1/2" },
        { id: "item2", content: "1/4" },
        { id: "item3", content: "3/4" },
        { id: "item4", content: "1/8" },
      ],
      correctOrder: ["item4", "item2", "item1", "item3"],
    },

    // Match-pairs
    {
      id: "q6",
      type: "match-pairs",
      question: "Match each measurement with its equivalent:",
      pairs: [
        { id: "pair1", left: "1 meter", right: "100 centimeters" },
        { id: "pair2", left: "1 kilogram", right: "1000 grams" },
        { id: "pair3", left: "1 liter", right: "1000 milliliters" },
        { id: "pair4", left: "1 kilometer", right: "1000 meters" },
      ],
    },
  ],

  Grade6: [
    // Multiple-choice
    {
      id: "q1",
      type: "multiple-choice",
      question: "What is the least common multiple of 6 and 8?",
      options: [
        { id: "a", text: "12" },
        { id: "b", text: "24" },
        { id: "c", text: "36" },
        { id: "d", text: "48" },
      ],
      correctAnswer: "b",
    },
    {
      id: "q2",
      type: "multiple-choice",
      question: "Which fraction is equivalent to 0.75?",
      options: [
        { id: "a", text: "1/4" },
        { id: "b", text: "2/3" },
        { id: "c", text: "3/4" },
        { id: "d", text: "4/5" },
      ],
      correctAnswer: "c",
    },

    // Short-answer
    {
      id: "q3",
      type: "short-answer",
      question: "Solve for y: 2y - 3 = 7",
      correctAnswer: "5",
    },
    {
      id: "q4",
      type: "short-answer",
      question: "What is 30% of 150?",
      correctAnswer: "45",
    },

    // Drag-and-drop
    {
      id: "q5",
      type: "drag-and-drop",
      question: "Arrange these numbers in descending order:",
      items: [
        { id: "item1", content: "-2" },
        { id: "item2", content: "0" },
        { id: "item3", content: "3" },
        { id: "item4", content: "-5" },
      ],
      correctOrder: ["item3", "item2", "item1", "item4"],
    },

    // Match-pairs
    {
      id: "q6",
      type: "match-pairs",
      question: "Match each equation with its solution:",
      pairs: [
        { id: "pair1", left: "x + 3 = 7", right: "x = 4" },
        { id: "pair2", left: "2x = 14", right: "x = 7" },
        { id: "pair3", left: "3x - 6 = 9", right: "x = 5" },
        { id: "pair4", left: "x/2 = 3", right: "x = 6" },
      ],
    },
  ],

  Grade7: [
    // Multiple-choice
    {
      id: "q1",
      type: "multiple-choice",
      question: "What is the solution to 3x + 5 = 20?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "5" },
        { id: "c", text: "7" },
        { id: "d", text: "9" },
      ],
      correctAnswer: "b",
    },
    {
      id: "q2",
      type: "multiple-choice",
      question: "Which is a solution to x² - 9 = 0?",
      options: [
        { id: "a", text: "1" },
        { id: "b", text: "2" },
        { id: "c", text: "3" },
        { id: "d", text: "4" },
      ],
      correctAnswer: "c",
    },

    // Short-answer
    {
      id: "q3",
      type: "short-answer",
      question: "What is the value of |-8| + |5|?",
      correctAnswer: "13",
    },
    {
      id: "q4",
      type: "short-answer",
      question: "What is the slope of y = 2x + 3?",
      correctAnswer: "2",
    },

    // Drag-and-drop
    {
      id: "q5",
      type: "drag-and-drop",
      question:
        "Arrange these mathematical operations in correct order of operations:",
      items: [
        { id: "item1", content: "Parentheses" },
        { id: "item2", content: "Exponents" },
        { id: "item3", content: "Multiplication" },
        { id: "item4", content: "Addition" },
      ],
      correctOrder: ["item1", "item2", "item3", "item4"],
    },

    // Match-pairs
    {
      id: "q6",
      type: "match-pairs",
      question: "Match each geometric shape with its property:",
      pairs: [
        {
          id: "pair1",
          left: "Circle",
          right: "All points equidistant from center",
        },
        {
          id: "pair2",
          left: "Square",
          right: "All sides equal, all angles 90°",
        },
        {
          id: "pair3",
          left: "Rectangle",
          right: "Opposite sides equal, all angles 90°",
        },
        {
          id: "pair4",
          left: "Rhombus",
          right: "All sides equal, opposite angles equal",
        },
      ],
    },
  ],

  default: [
    // Multiple-choice
    {
      id: "q1",
      type: "multiple-choice",
      question: "What is 2 + 2?",
      options: [
        { id: "a", text: "3" },
        { id: "b", text: "4" },
        { id: "c", text: "5" },
        { id: "d", text: "6" },
      ],
      correctAnswer: "b",
    },
    {
      id: "q2",
      type: "multiple-choice",
      question: "What is 5 × 3?",
      options: [
        { id: "a", text: "8" },
        { id: "b", text: "12" },
        { id: "c", text: "15" },
        { id: "d", text: "20" },
      ],
      correctAnswer: "c",
    },

    // Short-answer
    {
      id: "q3",
      type: "short-answer",
      question: "What is 10 minus 3?",
      correctAnswer: "7",
    },
    {
      id: "q4",
      type: "short-answer",
      question: "What is 12 divided by 4?",
      correctAnswer: "3",
    },

    // Drag-and-drop
    {
      id: "q5",
      type: "drag-and-drop",
      question: "Arrange these numbers from smallest to largest:",
      items: [
        { id: "item1", content: "1.2" },
        { id: "item2", content: "0.8" },
        { id: "item3", content: "1.5" },
        { id: "item4", content: "0.5" },
      ],
      correctOrder: ["item4", "item2", "item1", "item3"],
    },

    // Match-pairs
    {
      id: "q6",
      type: "match-pairs",
      question: "Match each shape with its name:",
      pairs: [
        { id: "pair1", left: "△", right: "Triangle" },
        { id: "pair2", left: "□", right: "Square" },
        { id: "pair3", left: "⬭", right: "Circle" },
        { id: "pair4", left: "◇", right: "Diamond" },
      ],
    },
  ],
};

// Add to your existing server.js (or create a new model and routes)

// Question Model (create models/Question.js)
const questionSchema = new mongoose.Schema({
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

// Add these routes to your existing Express app

// Get all questions (with optional grade filter)
app.get("/api/questions", async (req, res) => {
  try {
    const { grade } = req.query;
    const query = grade ? { grade } : {};

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

app.get("/api/questions/stats", async (req, res) => {
  try {
    const totalQuestions = await Question.countDocuments();
    const gradeLevels = await Question.distinct("grade");
    const questionTypes = await Question.distinct("type");
    const difficultyLevels = await Question.distinct("difficulty");

    res.status(200).json({
      success: true,
      data: {
        totalQuestions,
        gradeLevels: gradeLevels.length,
        questionTypes: questionTypes.length,
        difficultyLevels: difficultyLevels.length,
      },
    });
  } catch (error) {
    console.error(error);
  }
});

// Create a new question
app.post("/api/questions", async (req, res) => {
  try {
    const { grade, type, question } = req.body;

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

// Update your sample test endpoint to pull from database
app.get("/api/sample-test/:grade", async (req, res) => {
  try {
    const grade = req.params.grade || "default";
    const questions = await Question.find({ grade }).limit(10); // Get 10 questions for the grade

    if (questions.length === 0) {
      // Fallback to default if no questions found for grade
      const defaultQuestions = await Question.find({ grade: "default" }).limit(
        10
      );
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
