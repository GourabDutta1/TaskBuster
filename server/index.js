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
  
    // Step 1: Simple NLP Parsing (for MVP, we’ll assume summarization intent)
    const intent = task.toLowerCase().includes('summarize') ? 'summarize' : 'unknown';
    if (intent === 'unknown') {
      return res.status(400).json({ error: 'Only summarization supported for now' });
    }
  
    // Step 2: Process File (if provided)
    let textToSummarize = 'No file provided.';
    if (file && file.mimetype === 'text/plain') {
      const fs = require('fs');
      textToSummarize = fs.readFileSync(file.path, 'utf-8');
      fs.unlinkSync(file.path); // Clean up
    }
  
    // Step 3: Summarize with Hugging Face
    try {
      const summary = await hf.summarization({
        model: 'facebook/bart-large-cnn',
        inputs: textToSummarize,
        parameters: { max_length: 100 },
      });
      res.json({ result: summary.summary_text });
    } catch (error) {
      console.error('Summarization Error:', error);
      res.status(500).json({ error: 'Failed to summarize' });
    }
  });
  
  app.listen(port, () => console.log(`Server running on port ${port}`));
