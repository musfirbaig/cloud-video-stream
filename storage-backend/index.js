const express = require('express');
const bodyParser = require('body-parser');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jwt = require("jsonwebtoken");

// Middleware to handle file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, 
});

const app = express();
// Middleware to enable CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE'); // Allowed methods
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Allowed headers
  if (req.method === 'OPTIONS') {
      // Respond to preflight request
      return res.status(204).send('');
  }
  next();
});

const port = 8080;


const JWT_SECRET ="APAAr/1/sEIVyc+/j/HtgpTVhZD/UXNjyVym0tZbMZM=";

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
  
      // Get files with their metadata
      const fileDetails = await Promise.all(files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        return {
          name: file.name,
          size: parseInt(metadata.size), // size in bytes
          sizeInMB: (parseInt(metadata.size) / (1024 * 1024)).toFixed(2) + ' MB', // size in MB
          uploadedAt: metadata.uploadedAt || metadata.timeCreated, // include upload timestamp
          contentType: metadata.contentType, // include file type
          fileId: metadata.fileId || 'no-id', // Custom UUID
          generation: metadata.generation, // GCP's unique identifier
          originalName: metadata.originalName
        };
      }));
      
      res.json({ objects: fileDetails });
    } catch (err) {
      console.error('Error listing objects in folder:', err);
      res.status(500).json({ error: 'Error listing objects in folder' });
    }
});
  
  // app.get('/stream-video/:folderName/:videoName', async (req, res) => {
  app.get('/stream-video/:videoName', async (req, res) => {
    try {
        
        // const { folderName, videoName } = req.params;
        const { videoName } = req.params;
        const { fileId } = req.query; // Add fileId as query parameter
        const {generation} = req.query;

        const authHeader = req.headers['authorization'];

        // Check if the Authorization header is present
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }

        // Extract the token from the Bearer scheme
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Bearer token missing' });
        }

        const decodedToken = jwt.verify(token, JWT_SECRET);
        const {CLERK_CLIENT_ID, event} = decodedToken;

        if(event != "stream"){
          return res.status(401).send('You are not authorized to stream video');
        }



        // const userId = folderName;
        const folderName = CLERK_CLIENT_ID;

        const bucket = storage.bucket(bucketName);

        // Find file by fileId if provided
        let file;

        if (generation){
          const [files] = await bucket.getFiles({
            prefix: `${folderName}/`,
            autoPaginate: false
          });
          file = files.find(async (f) => {
            const [metadata] = await f.getMetadata();
            return metadata.generation === generation;
          });
        }

        else if (fileId) {
          const [files] = await bucket.getFiles({
            prefix: `${folderName}/`,
            autoPaginate: false
          });
          file = files.find(async (f) => {
            const [metadata] = await f.getMetadata();
            return metadata.fileId === fileId;
          });
        }

        // Fallback to direct path if no fileId or file not found
        if ((!file) && (!generation)) {
          const filePath = `${folderName}/${videoName}`;
          file = bucket.file(filePath);
        }

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

        // logging for starting streaming
      await fetch("https://us-central1-logs-project-445110.cloudfunctions.net/logging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: CLERK_CLIENT_ID,
          event: "stream",
          status: "success",
          fileName: videoName

        }),
      })

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
  // const { name } = req.body; // Folder name
  const file = req.file; // Uploaded file


  const authHeader = req.headers['authorization'];

        // Check if the Authorization header is present
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header missing' });
        }

        // Extract the token from the Bearer scheme

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Bearer token missing' });
        }

        const decodedToken = jwt.verify(token, JWT_SECRET);
        const {CLERK_CLIENT_ID, event} = decodedToken;

        if(event != "upload"){
          return res.status(401).send('You are not authorized to upload video');
        }

  // const CLERK_CLIENT_ID = "test-folder";

  // logging uploading
  await fetch("https://us-central1-logs-project-445110.cloudfunctions.net/logging", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: CLERK_CLIENT_ID,
      event: "upload",
      status: "pending",
      fileName: file.originalname
    }),
  })

  console.log(CLERK_CLIENT_ID);
  if (!CLERK_CLIENT_ID || !file) {
    return res.status(400).json({ error: 'Name and file are required' });
  }

  try {
    const folderPath = `${CLERK_CLIENT_ID}/`;  // Folder path where the file will be uploaded
    const bucket = storage.bucket(bucketName);
    const newFileSize = file.size;
    const newFileSizeInMB = newFileSize / (1024 * 1024);

    // Check limits first
    const response = await fetch("https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: CLERK_CLIENT_ID,
        fileSizeMB: newFileSizeInMB
      }),
    });

    const responseStatus = await response.json();

    // console.log("monitor res: ", responseStatus);

    // Handle limit checks before proceeding with upload
    if (responseStatus.response === 1) {
      return res.status(400).json({
        status: 1,
        error: 'Bandwidth exceeded: Total user bandwidth cannot exceed 100 MB'
      });
    }
    
    if (responseStatus.response === 2) {
      return res.status(400).json({
        status: 2,
        error: 'Limit exceeded: Total folder size cannot exceed 50 MB'
      });
    }

    // Only proceed with upload if responseStatus is 0
    if (responseStatus.response === 0) {
      const destination = `${folderPath}${file.originalname}`;
      const cloudFile = bucket.file(destination);
      const fileId = uuidv4();

      const metadata = {
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        fileId: fileId, // Add custom UUID
        originalName: file.originalname
      };

      await cloudFile.save(file.buffer, {
        metadata: metadata
      });

      // Log successful upload
      await fetch("https://us-central1-logs-project-445110.cloudfunctions.net/logging", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: CLERK_CLIENT_ID,
          event: "upload",
          status: "success",
          fileName: file.originalname
        }),
      });

      return res.json({
        message: `File ${file.originalname} uploaded successfully to ${folderPath}`,
      });
    }

    // If we get here, something went wrong with the response status
    return res.status(500).json({ error: 'Invalid response from resource monitor' });

  } catch (err) {
    console.error('Error uploading file:', err);
    return res.status(500).json({ error: 'Error uploading file to bucket' });
  }
});



/**
 * Route: Delete an object from the bucket
 * Method: DELETE
 * URL: /objects?name=folderName&fileName=filename
 */
app.delete('/objects', async (req, res) => {
    const { name, fileName } = req.query; // Get folder name and file name from query parameters

    const userId = name;
  
    if (!name || !fileName) {
      return res.status(400).json({ error: 'Folder name and file name are required' });
    }
  
    try {
      const filePath = `${name}/${fileName}`; // Construct the full file path
      const file = storage.bucket(bucketName).file(filePath);

      const[metadata] = await file.getMetadata();
      const fileSizeInMB = parseInt(metadata.size) / (1024 * 1024); // Convert bytes to MB
      console.log(`File size: ${fileSizeInMB.toFixed(2)} MB`);
  
      // Delete the file
      await file.delete();

      // after deleting update the usage monitoring (call resource-monitor service)
      const response = await fetch("https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId,
          fileSizeMB: -fileSizeInMB // according to api when we delete its negative value (its size should be negative otherwise if positive then it will be added to consumed instead of freeing quota of user)
        }),
      })

      await response.json(); // if return 0 then success
  
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

      // Calculate total size
      let totalSizeInMB = 0;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const fileSizeInMB = parseInt(metadata.size) / (1024 * 1024); // Convert bytes to MB
        totalSizeInMB += fileSizeInMB;
      }

      console.log(`Total folder size: ${totalSizeInMB.toFixed(2)} MB`);

      // Delete all files in the folder
      await Promise.all(files.map(file => file.delete()));

      // after deleting update the usage monitoring (call resource-monitor service)
      const response = await fetch("https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId,
          fileSizeMB: -totalSizeInMB // according to api when we delete its negative value (its size should be negative otherwise if positive then it will be added to consumed instead of freeing quota of user)
        }),
      })

      await response.json(); // if return 0 then success
  
      res.json({ 
        message: `Folder ${name} and all its contents (${totalSizeInMB.toFixed(2)} MB) deleted successfully` 
      });
    } catch (err) {
      console.error('Error deleting folder:', err);
      res.status(500).json({ error: `Error deleting folder: ${name}` });
    }
  });
  
// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
