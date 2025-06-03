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
    methods: ["GET", "POST", "OPTIONS"],
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

const otpRouter = express.Router();

otpRouter.post("/send-otp", async (req, res) => {
  const { mobileNumber } = req.body;

  if (!mobileNumber) {
    return res.status(400).json({ error: "Mobile number is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save OTP in DB or cache here if needed
  console.log(`OTP for ${mobileNumber}: ${otp}`);

  try {
    await axios.post(
      "https://api.interakt.ai/v1/public/message/",
      {
        countryCode: "91",
        phoneNumber: mobileNumber,
        callbackData: "send-otp",
        type: "Template",
        template: {
          name: "otp_template",
          languageCode: "en",
          bodyValues: [otp],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERAKT_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Error sending OTP:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.use("/api", otpRouter);

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
