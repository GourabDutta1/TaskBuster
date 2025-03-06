const express = require('express');
const multer = require('multer');
const cors = require('cors');
const {HfInference}=require('@huggingface/inference')
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = 5000;
const upload = multer({dest: 'uploads/'});
const hf = new HfInference(process.env.HF_API_TOKEN);

app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Email Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
});

app.post('/api/task',upload.single('file'),async(req,res)=>{
    const { task } = req.body;
    const file = req.file;
  
    if (!task) return res.status(400).json({ error: 'Task is required' });

    // Step 1: NLP Intent Detection

    const intents = ['summarize','extract','email','create chart'];
    try{
      const classification = await hf.zeroShotClassification({
        model: 'facebook/bart-large-mnli',
        inputs: task,
        parameters: {
          candidate_labels: intents, // Explicitly pass as parameters object
        },
      })

      //Get the intent with the highest score
      const intentScores = classification.labels?.map((label,idx)=>({
        intent: label,
        score: classification.scores[idx],
      })) || [];
      console.log('Intent Scores', intentScores);
      
      const topIntent = intentScores?.sort((a,b)=> b.score - a.score)[0];
      let intent = topIntent?.score > 0.4 ? topIntent.intent : 'unknown';

      // Fallback: Keyword-based check if confidence is low
    if (intent === 'unknown') {
      const taskLower = task.toLowerCase();
      if (taskLower.includes('summarize') || taskLower.includes('summary')) {
        intent = 'summarize';
      } else if (taskLower.includes('extract') || taskLower.includes('data')) {
        intent = 'extract';
      } else if (taskLower.includes('email') || taskLower.includes('send')) {
        intent = 'email';
      } else if (taskLower.includes('chart') || taskLower.includes('visualize')) {
        intent = 'create chart';
      }
    }

      if (intent === 'unknown') {
         return res.status(400).json({ error: `Intent not recognized. Supported: ${intents.join(', ')}` });
        }

      // Step 2: Process File (if provided)
      let textToProcess = 'No file provided.';
      if (file && file.mimetype === 'text/plain') {
        const fs = require('fs');
        textToProcess = fs.readFileSync(file.path, 'utf-8');
        fs.unlinkSync(file.path); // Clean up
      }

      // Step 3: Execute Based on the Intent
      let result;
      switch (intent) {
        case 'summarize':
          const summary = await hf.summarization({
            model:'facebook/bart-large-cnn',
            inputs: textToProcess,
            parameters: { max_length: 100 },
          });
          result = summary.summary_text;
          break;
        case 'extract':
          result = 'Extraction not implemented yet';
          break;
        case 'email':
          if(!file){
            result = 'Please upload a file to email';
          }
          else{
            const summaryForEmail = await hf.summarization({
              model:'facebook/bart-large-cnn',
              inputs: textToProcess,
              parameters: { max_length: 100 },
            });
            const emailOptions ={
              from: process.env.GMAIL_USER,
              to: 'gourabdutta.smart56@gmail.com',
              subject: 'TaskBuster Summary',
              text: summaryForEmail.summary_text,
            };
            const info = await transporter.sendMail(emailOptions);
            result = 'Email Sent successfully';
          }
          break;
        case 'create chart':
          result = 'Chart creation not implemented yet';
          break;
        default:
          result = 'Action Not supported';
      }
      res.json({result,detectedIntent: intent});
    }
      catch (error) {
      console.error('Processing Error:', error);
      res.status(500).json({ error: 'Failed to process task' });
    }
  });
  
  app.listen(port, () => console.log(`Server running on port ${port}`));
