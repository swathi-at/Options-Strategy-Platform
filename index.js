const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = 3001;

app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Middleware to parse JSON

app.use('/api', routes); // All routes will be prefixed with /api

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});