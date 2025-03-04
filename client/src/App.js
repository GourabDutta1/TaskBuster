import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [task, setTask] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('task', task);
    if (file) formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:5000/api/task', formData);
      setResult(response.data.result);
    } catch (error) {
      console.error('Error:', error.response?.data);
      setResult(error.response?.data?.error || 'Something went wrong!');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4">TaskBuster</h1>
        <form onSubmit={handleSubmit}>
          <textarea
            className="w-full p-2 border rounded mb-4"
            placeholder="Enter your task (e.g., Summarize this file)"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <input
            type="file"
            className="mb-4"
            onChange={(e) => setFile(e.target.files[0])}
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Run Task
          </button>
        </form>
        {result && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <h2 className="font-semibold">Result:</h2>
            <p>{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;