import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [task, setTask] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_FILE_TYPES = ['text/plain'];
  const MAX_TASK_LENGTH = 500;

  // Add API configuration
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  const validateFile = (file) => {
    if (!file) return true;
    
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError('Only .txt files are allowed');
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('File size should not exceed 5MB');
      return false;
    }

    return true;
  };

  const validateTask = (taskText) => {
    if (!taskText.trim()) {
      setError('Task description is required');
      return false;
    }

    if (taskText.length > MAX_TASK_LENGTH) {
      setError(`Task description should not exceed ${MAX_TASK_LENGTH} characters`);
      return false;
    }

    return true;
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError(null);
    
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
    } else {
      e.target.value = null;
      setFile(null);
      setFileName('');
    }
  };

  const handleTaskChange = (e) => {
    setTask(e.target.value);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (!validateTask(task)) return;
    if (!validateFile(file)) return;

    const formData = new FormData();
    formData.append('task', task);
    if (file) formData.append('file', file);

    setLoading(true);
    try {
      console.log('Sending request to:', `${API_URL}/api/task`);
      console.log('Task:', task);
      console.log('File:', file ? file.name : 'No file');

      const response = await axios.post(`${API_URL}/api/task`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Response:', response.data);
      setResult(response.data.result);
      setIntent(response.data.detectedIntent);
    } catch (error) {
      console.error('Full error object:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
      
      let errorMessage = 'Something went wrong! Please try again.';
      
      if (error.response) {
        // Server responded with error
        errorMessage = error.response.data.error || error.response.data.message || errorMessage;
      } else if (error.request) {
        // Request made but no response
        errorMessage = 'No response from server. Please check if the server is running.';
      } else {
        // Error in request setup
        errorMessage = error.message;
      }

      setError(errorMessage);
      setResult('');
      setIntent('');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTask('');
    setFile(null);
    setFileName('');
    setResult('');
    setIntent('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">TaskBuster</h1>
          {(task || file || result) && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Reset
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500 transition-colors"
              placeholder="Enter your task (e.g., Summarize this file)"
              value={task}
              onChange={handleTaskChange}
              rows="4"
              disabled={loading}
            />
            <p className="text-sm text-gray-500 mt-1">
              {task.length}/{MAX_TASK_LENGTH} characters
            </p>
          </div>

          <div className="relative">
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".txt"
              id="file-upload"
              disabled={loading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex items-center justify-center w-full p-3 border-2 border-dashed rounded-lg hover:border-blue-500 transition-colors"
            >
              {fileName ? (
                <span className="text-blue-600">{fileName}</span>
              ) : (
                <span className="text-gray-500">Choose a text file...</span>
              )}
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
              <p className="text-xs text-red-500 mt-1">
                If the error persists, please check the console for more details.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              'Run Task'
            )}
          </button>
        </form>

        {result && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-500">Intent:</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                {intent || 'N/A'}
              </span>
            </div>
            <div>
              <h2 className="font-semibold text-gray-700 mb-2">Result:</h2>
              <p className="text-gray-600 whitespace-pre-wrap">{result}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;