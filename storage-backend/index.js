const express = require('express');
const bodyParser = require('body-parser');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const path = require('path');

// Middleware to handle file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, 
});
const app = express();
const port = 8080;

app.use(bodyParser.json());
require('dotenv').config(); 

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  credentials: {
    client_email: process.env.GCP_CLIENT_EMAIL,
    private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newline characters are properly handled
  },
});

const bucketName = '50mbbucket'; // Bucket name

/**
 * Route: List all objects in a specific folder in the bucket
 * Method: GET
 */
app.get('/all_name', async (req, res) => {
    const { name } = req.query; 
  
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
  
    try {
      const folderPath = `${name}/`; // Prefix for the folder
      const [files] = await storage.bucket(bucketName).getFiles({ prefix: folderPath });
  
      // Filter out only files within the specified folder
      const fileNames = files.map(file => file.name);
  
      res.json({ objects: fileNames });
    } catch (err) {
      console.error('Error listing objects in folder:', err);
      res.status(500).json({ error: 'Error listing objects in folder' });
    }
  });
  
  app.get('/stream-video/:folderName/:videoName', async (req, res) => {
    try {
        const { folderName, videoName } = req.params;

        const filePath = `${folderName}/${videoName}`;

        // Create a reference to the file in the bucket
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filePath);

        // Check if the file exists
        const [exists] = await file.exists();
        if (!exists) {
            return res.status(404).send('Video not found');
        }

        // Get metadata for the video file
        const [metadata] = await file.getMetadata();

        // Set response headers for video streaming
        res.setHeader('Content-Type', metadata.contentType || 'video/mp4');
        res.setHeader('Content-Length', metadata.size);

        // Stream video file from Google Cloud Storage
        const readStream = file.createReadStream();

        // Pipe the stream to the response
        readStream
            .on('error', (err) => {
                console.error('Error streaming file:', err);
                res.status(500).send('Error streaming video');
            })
            .pipe(res);
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Internal server error');
    }
});


app.post('/upload', upload.single('file'), async (req, res) => {
  const { name } = req.body; // Folder name
  const file = req.file; // Uploaded file
  console.log(name);
  if (!name || !file) {
    return res.status(400).json({ error: 'Name and file are required' });
  }

  try {
    const folderPath = `${name}/`;  // Folder path where the file will be uploaded
    const bucket = storage.bucket(bucketName);

    // Check total size of the folder (check if folder exists and calculate total size)
    const [files] = await bucket.getFiles({ prefix: folderPath });
    const totalSize = await files.reduce(async (accPromise, currentFile) => {
      const acc = await accPromise;
      const [metadata] = await currentFile.getMetadata();
      return acc + parseInt(metadata.size, 10); // Add file size in bytes
    }, Promise.resolve(0));

    // Check if adding the new file exceeds 50 MB limit
    const newFileSize = file.size; // Uploaded file size in bytes
    if (totalSize + newFileSize > 50 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Limit exceeded: Total folder size cannot exceed 50 MB',
      });
    }

    // Upload the file to the bucket (folder is implicitly created when uploading)
    const destination = `${folderPath}${file.originalname}`;
    const cloudFile = bucket.file(destination);
    await cloudFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    res.json({
      message: `File ${file.originalname} uploaded successfully to ${folderPath}`,
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Error uploading file to bucket' });
  }
});



/**
 * Route: Delete an object from the bucket
 * Method: DELETE
 * URL: /objects?name=folderName&fileName=filename
 */
app.delete('/objects', async (req, res) => {
    const { name, fileName } = req.query; // Get folder name and file name from query parameters
  
    if (!name || !fileName) {
      return res.status(400).json({ error: 'Folder name and file name are required' });
    }
  
    try {
      const filePath = `${name}/${fileName}`; // Construct the full file path
      const file = storage.bucket(bucketName).file(filePath);
  
      // Delete the file
      await file.delete();
  
      res.json({ message: `File ${filePath} deleted successfully` });
    } catch (err) {
      console.error('Error deleting file:', err);
      res.status(500).json({ error: `Error deleting file: ${name}/${fileName}` });
    }
  });
  
/**
 * Route: Delete an entire folder from the bucket
 * Method: DELETE
 * URL: /folder?name=folderName
 */
app.delete('/folder', async (req, res) => {
    const { name } = req.query; // Get the folder name from the query parameters
  
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
  
    try {
      const folderPath = `${name}/`; // Prefix for the folder
      const bucket = storage.bucket(bucketName);
  
      // Get all files within the folder
      const [files] = await bucket.getFiles({ prefix: folderPath });
  
      if (files.length === 0) {
        return res.status(404).json({ message: `Folder ${name} is empty or does not exist` });
      }
  
      // Delete all files in the folder
      await Promise.all(files.map(file => file.delete()));
  
      res.json({ message: `Folder ${name} and all its contents deleted successfully` });
    } catch (err) {
      console.error('Error deleting folder:', err);
      res.status(500).json({ error: `Error deleting folder: ${name}` });
    }
  });
  
// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
