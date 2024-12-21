const express = require('express');
const bodyParser = require('body-parser');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const path = require('path');

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

    // const userId = name;
  
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
          sizeInMB: (parseInt(metadata.size) / (1024 * 1024)).toFixed(2) + ' MB' // size in MB
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

    // Check total size of the folder (check if folder exists and calculate total size)

    // const [files] = await bucket.getFiles({ prefix: folderPath });

    // const totalSize = await files.reduce(async (accPromise, currentFile) => {
    //   const acc = await accPromise;
    //   const [metadata] = await currentFile.getMetadata();
    //   return acc + parseInt(metadata.size, 10); // Add file size in bytes
    // }, Promise.resolve(0));

    // Check if adding the new file exceeds 50 MB limit
    const newFileSize = file.size; // Uploaded file size in bytes

    // if (totalSize + newFileSize > 50 * 1024 * 1024) {
    //   return res.status(400).json({
    //     error: 'Limit exceeded: Total folder size cannot exceed 50 MB',
    //   });
    // }


    // before uploading update the usage monitoring (call resource-monitor service)

    const newFileSizeInMB = newFileSize / (1024 * 1024); // Convert bytes to MB

    const response = await fetch("https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: CLERK_CLIENT_ID,
        fileSizeMB: newFileSizeInMB
      }),
    })

    const responseStatus = await response.json(); // if return 0 then success

    if(responseStatus != 0){
    if(responseStatus == 2){
      return res.status(400).json({
        status: 2,
        error: 'Limit exceeded: Total folder size cannot exceed 50 MB',
      });
      }else if(responseStatus == 1){
        return res.status(400).json({
          status: 1,
          error: 'Bandwidth exceeded: Total user bandwidth cannot exceed 100 MB',
        });

      }
    }

    // -------------------------------

    // Upload the file to the bucket (folder is implicitly created when uploading)
    const destination = `${folderPath}${file.originalname}`;
    const cloudFile = bucket.file(destination);

    // Add custom metadata
    const metadata = {
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    // If it's a video/audio file, you could add duration
    // Note: You'll need additional libraries like 'get-video-duration' 
    // to actually get the duration before uploading

    await cloudFile.save(file.buffer, {
      metadata: metadata
    });

    // logging uploading completed
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
  })

    

    res.json({
      message: `File ${file.originalname} uploaded successfully to ${folderPath}`,
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: `Error uploading file to bucket` });
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
