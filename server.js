const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Create hasil folder if it doesn't exist
const hasilFolder = path.join(__dirname, 'hasil');
if (!fs.existsSync(hasilFolder)) {
  fs.mkdirSync(hasilFolder, { recursive: true });
  console.log('✅ Created hasil folder:', hasilFolder);
}

// Endpoint to save blob with raw binary data
app.post('/api/save-blob', express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  try {
    const rawFilename = req.query.filename;

    if (!rawFilename) {
      console.error('❌ Missing filename query parameter');
      return res.status(400).json({ error: 'Missing filename query parameter' });
    }

    // Sanitize: strip path components and illegal characters to prevent directory traversal
    const safeFilename = path.basename(rawFilename).replace(/[/\\:*?"<>|]/g, '_');

    if (!safeFilename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(hasilFolder, safeFilename);
    fs.writeFileSync(filePath, req.body);

    console.log(`✅ File saved: ${filePath}`);
    res.json({ success: true, message: `File saved: ${safeFilename}` });
  } catch (error) {
    console.error('❌ Error saving blob:', error);
    res.status(500).json({ error: 'Failed to save file', details: error.message });
  }
});

// Endpoint to save files with base64
app.post('/api/save-file', (req, res) => {
  try {
    const { filename, fileData } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Missing filename or fileData' });
    }

    // Convert base64 to buffer if needed
    let buffer;
    if (typeof fileData === 'string') {
      if (fileData.startsWith('data:')) {
        // Data URL format
        const base64Data = fileData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        // Already base64
        buffer = Buffer.from(fileData, 'base64');
      }
    } else {
      buffer = fileData;
    }

    const filePath = path.join(hasilFolder, filename);
    fs.writeFileSync(filePath, buffer);

    console.log(`✅ File saved: ${filePath}`);
    res.json({ success: true, message: `File saved: ${filename}` });
  } catch (error) {
    console.error('❌ Error saving file:', error);
    res.status(500).json({ error: 'Failed to save file', details: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server running', 
    hasilFolder,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🎉 Photobooth server running on http://localhost:${PORT}`);
  console.log(`📁 Files will be saved to: ${hasilFolder}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
