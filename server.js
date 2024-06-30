const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: {
    origin: 'https://online-coding-app-client-pw9l.onrender.com',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: 'https://online-coding-app-client-pw9l.onrender.com',
}));

const dbPath = path.resolve(__dirname, './codeblocks.db');

// Connect to SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to the SQLite database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Object to track mentors for each code block
const mentors = {};

// Function to handle joining a block
const handleJoin = (socket, blockId) => {
  if (!blockId) {
    socket.emit('error', { message: 'blockId is undefined' });
    return;
  }

  db.get('SELECT * FROM codeblocks WHERE blockId = ?', [blockId], (err, block) => {
    if (err) {
      socket.emit('error', { message: `Error fetching block ${blockId}` });
      return;
    }

    if (!block) {
      socket.emit('error', { message: `No block found with blockId ${blockId}` });
      return;
    }

    if (!mentors[blockId]) {
      mentors[blockId] = socket.id;
      socket.emit('role', { role: 'mentor', block });
    } else {
      socket.emit('role', { role: 'student', block });
    }
  });
};

// Function to handle code changes
const handleCodeChange = (code, blockId) => {
  db.get('SELECT correctCode FROM codeblocks WHERE blockId = ?', [blockId], (err, row) => {
    if (err) return;

    const correctCode = row.correctCode.replace(/\s/g, '');
    const modifiedCode = code.replace(/\s/g, '');

    io.emit('codeUpdate', { code, isCorrect: correctCode === modifiedCode });
  });
};

// API endpoint to get all code blocks
app.get('/api/codeblocks', (req, res) => {
  db.all('SELECT blockId AS id, title FROM codeblocks', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API endpoint to get a single code block by blockId
app.get('/api/codeblock/:blockId', (req, res) => {
  const { blockId } = req.params;
  db.get('SELECT * FROM codeblocks WHERE blockId = ?', [blockId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row);
  });
});

// Handle Socket.IO connections
io.on('connection', (socket) => {
  socket.on('join', ({ blockId }) => handleJoin(socket, blockId));

  socket.on('leave', ({ role, blockId }) => {
    if (role === 'mentor' && mentors[blockId] === socket.id) {
      delete mentors[blockId];
    }
  });

  socket.on('codeChange', (data) => {
    const { code, blockId } = data;
    handleCodeChange(code, blockId);
  });

  socket.on('disconnect', () => {
    for (const blockId in mentors) {
      if (mentors[blockId] === socket.id) {
        delete mentors[blockId];
        break;
      }
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Close the database connection when the Node.js process is terminated
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed the database connection.');
    process.exit(0);
  });
});
