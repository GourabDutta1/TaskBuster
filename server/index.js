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
      }));
      
      const topIntent = intentScores?.sort((a,b)=> b.score - a.score)[0];
      const intent = topIntent?.score > 0.4 ? topIntent.score : 'unknown';

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
          result = 'Emailing not implemented yet';
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
