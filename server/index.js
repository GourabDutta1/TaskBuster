const express = require('express');
const multer = require('multer');
const cors = require('cors');
const {HfInference}=require('@huggingface/inference')
require('dotenv').config();

const app = express();
const port = 5000;
const upload = multer({dest: 'uploads/'});
const hf = new HfInference(process.env.HF_API_TOKEN);

app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

const supportedIntents = ['summarize','extract','email'];

app.post('/api/task',upload.single('file'),async(req,res)=>{
    const { task } = req.body;
    const file = req.file;
  
    if (!task) return res.status(400).json({ error: 'Task is required' });

    // Step 1: NLP Intent Detection
    try{
      const nlpResult = await hf.textClassification({
        model: 'distilbert-base-uncased-finetuned-sst-2-english',
        inputs: task,
      })

      //For now, keyword-based fallback
      const intent = supportedIntents.find(i => task.toLowerCase().includes(i)) || 'unknown';
        
      if (intent === 'unknown') {
         return res.status(400).json({ error: `Intent not recognized. Supported: ${supportedIntents.join(', ')}` });
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
          result = 'Emailing not implemented yet';
          break;
        default:
          result = 'Action Not supported';
      }
      res.json({result});
    }
      catch (error) {
      console.error('Processing Error:', error);
      res.status(500).json({ error: 'Failed to process task' });
    }
  });
  
  app.listen(port, () => console.log(`Server running on port ${port}`));
