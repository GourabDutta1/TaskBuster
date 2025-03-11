const express = require('express');
const multer = require('multer');
const cors = require('cors');
const {HfInference} = require('@huggingface/inference');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const fs = require('fs').promises;
require('dotenv').config();

// Validate environment variables
const requiredEnvVars = ['HF_API_TOKEN', 'GMAIL_USER', 'GMAIL_PASSWORD'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();
const port = process.env.PORT || 5000;

// Configure multer with file type validation
const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(limiter);

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
});

const hf = new HfInference(process.env.HF_API_TOKEN);

// Helper function to clean up uploaded files
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`Cleaned up file: ${filePath}`);
  } catch (error) {
    logger.error(`Error cleaning up file ${filePath}:`, error);
  }
};

app.post('/api/task', upload.single('file'), async (req, res) => {
  const { task } = req.body;
  const file = req.file;
  
  if (!task) {
    logger.warn('Request received without task');
    return res.status(400).json({ error: 'Task is required' });
  }

  // Input validation
  if (task.length > 500) {
    return res.status(400).json({ error: 'Task description too long. Maximum 500 characters allowed.' });
  }

  // Step 1: NLP Intent Detection
  const intentMap = {
    'summarize': ['create a summary', 'summarize this text', 'give me a summary', 'provide key points', 'brief overview'],
    'extract': ['extract data', 'pull out information', 'find key details', 'get data points', 'extract important information'],
    'email': ['send an email', 'email this content', 'forward via email', 'share through email', 'mail this information'],
    'create chart': ['create a visualization', 'make a chart', 'plot this data', 'visualize information', 'generate a graph'],
    'analyze': ['analyze this text', 'provide analysis', 'evaluate content', 'assess this information'],
  };

  try {
    // Use main intents as candidate labels instead of all examples
    const candidateLabels = Object.keys(intentMap);

    let intent = 'unknown';
    try {
      const classification = await hf.zeroShotClassification({
        model: 'facebook/bart-large-mnli',
        inputs: task,
        parameters: {
          candidate_labels: candidateLabels,
          multi_label: false,
        },
      });

      logger.info('Classification response:', classification);

      // Extract the actual classification result from the nested response
      const classificationResult = classification['0'] || classification;

      // Check if we have valid classification results
      if (classificationResult && Array.isArray(classificationResult.labels) && Array.isArray(classificationResult.scores)) {
        // Find the highest scoring intent
        let maxScore = 0;
        let maxIndex = 0;
        
        classificationResult.scores.forEach((score, index) => {
          if (score > maxScore) {
            maxScore = score;
            maxIndex = index;
          }
        });

        if (maxScore > 0.35) {
          intent = classificationResult.labels[maxIndex];
          logger.info('Selected intent through classification:', { intent, score: maxScore });
        }
      } else {
        logger.warn('Invalid classification result structure:', classificationResult);
      }
    } catch (classificationError) {
      logger.error('Classification error:', classificationError);
      // Continue with fallback method
    }

    // Fallback to keyword-based matching if classification failed or confidence is low
    if (intent === 'unknown') {
      const taskLower = task.toLowerCase();
      let maxScore = 0;
      let bestIntent = 'unknown';

      // Check each intent's keywords
      for (const [currentIntent, keywords] of Object.entries(intentMap)) {
        const score = keywords.reduce((acc, keyword) => {
          return acc + (taskLower.includes(keyword.toLowerCase()) ? 1 : 0);
        }, 0);

        if (score > maxScore) {
          maxScore = score;
          bestIntent = currentIntent;
        }
      }

      if (maxScore > 0) {
        intent = bestIntent;
      }
    }

    if (intent === 'unknown') {
      logger.warn('Unknown intent detected', { task });
      return res.status(400).json({ 
        error: `Intent not recognized. Supported actions: ${Object.keys(intentMap).join(', ')}`,
        suggestion: 'Try being more specific with your request.'
      });
    }

    logger.info('Detected intent:', intent);

    // Step 2: Process File (if provided)
    let textToProcess = 'No file provided.';
    if (file) {
      try {
        textToProcess = await fs.readFile(file.path, 'utf-8');
        await cleanupFile(file.path);
      } catch (error) {
        logger.error('Error processing file:', error);
        return res.status(500).json({ error: 'Failed to process file' });
      }
    }

    // Step 3: Execute Based on the Intent
    let result;
    switch (intent) {
      case 'summarize':
        const summary = await hf.summarization({
          model: 'facebook/bart-large-cnn',
          inputs: textToProcess,
          parameters: { max_length: 100 },
        });
        result = summary.summary_text;
        break;

      case 'extract':
        // Implement extraction using a suitable model
        const extraction = await hf.textClassification({
          model: 'facebook/bart-large-mnli',
          inputs: textToProcess,
          parameters: {
            candidate_labels: ['important information', 'key details', 'main points'],
          },
        });
        result = extraction.labels.join(', ');
        break;

      case 'email':
        if (!file) {
          result = 'Please upload a file to email';
        } else {
          const summaryForEmail = await hf.summarization({
            model: 'facebook/bart-large-cnn',
            inputs: textToProcess,
            parameters: { max_length: 100 },
          });
          const emailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.EMAIL_RECIPIENT || 'gourabdutta.smart56@gmail.com',
            subject: 'TaskBuster Summary',
            text: summaryForEmail.summary_text,
          };
          await transporter.sendMail(emailOptions);
          result = 'Email sent successfully';
        }
        break;

      case 'create chart':
        // Implement chart creation logic here
        result = 'Chart creation feature coming soon';
        break;

      case 'analyze':
        const analysis = await hf.textClassification({
          model: 'facebook/bart-large-mnli',
          inputs: textToProcess,
          parameters: {
            candidate_labels: ['positive', 'negative', 'neutral'],
          },
        });
        result = `Analysis: ${analysis.labels.join(', ')}`;
        break;

      default:
        result = 'Action not supported';
    }

    logger.info('Task completed successfully', { intent, task });
    res.json({ result, detectedIntent: intent });
  } catch (error) {
    logger.error('Processing Error:', error);
    res.status(500).json({ error: 'Failed to process task' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
