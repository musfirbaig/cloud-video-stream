// const CLERK_USER_ID = "usr_xxj9bjsz8i2p2w7flmda8xl3f";

// clerk client id is the virtual directory 
// so for testing i am using clerk id as test-folder 



// let CLERK_CLIENT_ID = "test-folder";

const express = require('express');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
require('dotenv/config');
const cors = require('cors');




const { v4: uuidv4 } = require('uuid'); // For generating unique file IDs

const { Storage } = require('@google-cloud/storage');
const multer = require('multer');

// Middleware to handle file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, 
  });

const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newline characters are properly handled
    },
  });






const { ClerkExpressWithAuth } = require('@clerk/clerk-sdk-node');

// const cors = require('cors');

// Add logging utility function
async function logEvent(event, status, userId, fileName=null) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    // logging getting filenames
    // await fetch("https://us-central1-logs-project-445110.cloudfunctions.net/logging", {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({
    //       user_id: userId,
    //       event: "get_files",
    //       status: "success"

    //     }),
    //   })

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`https://asia-south1-logs-project-445110.cloudfunctions.net/logging-2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    event,
                    status,
                    timestamp: new Date().toISOString(),
                    user_id: userId,
                    fileName
                })
            });
            
            if (response.ok) {
                return true;
            }
        } catch (error) {
            console.log(`Logging attempt ${attempt} failed:`, error.message);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    return false;
}

exports.controller = async (req, res) => {
    // console.log("METHOD " , req.method, ' URL', req.url);

    // clerk client id below (which is also the folderName of the bucket) is the virtual directory
    // so for testing i am using clerk id as test-folder
    

    const { userId } = req.auth;
    console.log("authObj: ", req.auth);
    let CLERK_CLIENT_ID = userId;

    // let CLERK_CLIENT_ID = "testing123";

    // console.log("user id: ", userId);

    console.log(userId);

    if (!req.auth || !req.auth.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
      }

    const { body } = req;
    
    // here event can be "upload, get-all-videos, delete, delete-all, stream"
    const { event } = body;

    // console.log("event: ", event);

    const JWT_SECRET ="APAAr/1/sEIVyc+/j/HtgpTVhZD/UXNjyVym0tZbMZM=";
    let token;


    try {

        switch (event) {
            // case "upload":





            //     break;
            case "get-all-videos":
                // get all videos

                // Log start of operation

                logEvent("get-all-videos", "pending", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                
                    // it will get all files name and metadata from the resource monitor service
                const response = await fetch(`https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/files?userId=${CLERK_CLIENT_ID}`)

                const data = await response.json();

                console.log("get all videos : ",data);

                // Log completion
                if (response.ok) {
                    logEvent("get-all-videos", "success", CLERK_CLIENT_ID)
                        .catch(err => console.log("Warning: Logging failed:", err.message));
                } else {
                    logEvent("get-all-videos", "failed", CLERK_CLIENT_ID)
                        .catch(err => console.log("Warning: Logging failed:", err.message));
                }

                return res.json(data);

                break;

            case "delete":
                // delete video
               { const {fileName} = body;
                    console.log("fileName: ", fileName);
                logEvent("delete", "pending", CLERK_CLIENT_ID, fileName)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                {
                    

                    console.log("fileName: ", fileName);
                    
                    const response = await fetch(`https://storage-service-796253357501.asia-south1.run.app/objects?name=${CLERK_CLIENT_ID}&fileName=${fileName}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    const msg = await response.json();


                    // Log completion
                    if (response.ok) {
                        logEvent("delete", "success", CLERK_CLIENT_ID, fileName)
                            .catch(err => console.log("Warning: Logging failed:", err.message));
                    } else {
                        logEvent("delete", "failed", CLERK_CLIENT_ID, fileName)
                            .catch(err => console.log("Warning: Logging failed:", err.message));
                    }


                    return res.json(msg);
                }}

                
                break;
            case "delete-all":
                // delete all videos

                logEvent("delete", "pending", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                {
                    const response = await fetch(`https://storage-service-796253357501.asia-south1.run.app/folder?name=${CLERK_CLIENT_ID}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    const msg = await response.json();

                    // Log completion
                    if (response.ok) {
                        logEvent("delete-all", "success", CLERK_CLIENT_ID)
                            .catch(err => console.log("Warning: Logging failed:", err.message));
                    } else {
                        logEvent("delete-all", "failed", CLERK_CLIENT_ID)
                            .catch(err => console.log("Warning: Logging failed:", err.message));
                    }

                    return res.json(msg);
                }

                
                
                break;

            // case "stream":
            //     //  fileId, userId
            //     // stream video

            //     let {fileName, fileId} = body;




            //     if (!fileName) {
            //         return res.status(400).json({ error: 'FileName is required' });
            //       }


                


            //     const [files] = await storage.bucket(bucketName).getFiles({ prefix: fullFilePath});


            //     token = jwt.sign({CLERK_CLIENT_ID, event}, JWT_SECRET, {expiresIn: '60m'});
            //     return res.json({token});
            //     break;

            case "monitoring":
                logEvent("request-resource-monitor", "success", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                    {const response = await fetch(`https://asia-south1-resource-monitor-service.cloudfunctions.net/resource-monitor-2/usage?userId=${CLERK_CLIENT_ID}`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    const msg = await response.json();

                    return res.json(msg);
                    }

                    break;

            default:
                break;
        }
        
    } catch (error) {
        // Log error
        logEvent(event, "error", CLERK_CLIENT_ID)
            .catch(err => console.log("Warning: Logging failed:", err.message));
            
        console.log("Error in controller function: ", error);
        res.status(500).json({
            message: "Error in controller function",
            time: new Date().toISOString()
        });
    }

    // res.json({
    //     message: "controller function called",
    //     time: new Date().toISOString()
    // })

};

const app = express();

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
app.use(cors({
    origin: '*', // Replace '*' with your frontend domain for added security
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Include 'Authorization' for sessionToken
}));

app.use(express.json());

// Add CORS middleware

// app.use(cors({
//     origin: 'http://your-frontend-domain.com',
//     credentials: true
// }));

// Middleware to verify the Clerk session


// Use the middleware


app.use(
    ClerkExpressWithAuth()
  );

app.all('/controller', exports.controller);


app.post('/upload', upload.single('file'), async (req, res) => {
    

    const { userId } = req.auth;
    // const userId = "testing123";

    console.log("authObj: ", req.auth);
    let CLERK_CLIENT_ID = userId;

    const bucketName = "50mbbucket";

    // console.log("user id: ", userId);

    

    if (!req.auth || !req.auth.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
      }

    // const { body } = req;

    const file = req.file; // Uploaded file

  
    if (!CLERK_CLIENT_ID || !file) {
      return res.status(400).json({ error: 'User ID and file are required' });
    }
  
    try {
      const folderPath = `${CLERK_CLIENT_ID}/`; // User-specific folder path
      const bucket = storage.bucket(bucketName);
      const fileSizeInMB = file.size / (1024 * 1024);
  
      // Check limits first

    //   const response = await fetch("https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage", {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({
    //       userId: CLERK_CLIENT_ID,
    //       fileSizeMB: fileSizeInMB,
    //     }),
    //   });
  
    //   const responseStatus = await response.json();
  
    //   if (responseStatus.response === 1) {
    //     return res.status(400).json({
    //       status: 1,
    //       error: 'Bandwidth exceeded: Total user bandwidth cannot exceed 100 MB',
    //     });
    //   }
  
    //   if (responseStatus.response === 2) {
    //     return res.status(400).json({
    //       status: 2,
    //       error: 'Limit exceeded: Total folder size cannot exceed 50 MB',
    //     });
    //   }
  
    //   if (responseStatus.response === 0) {
        const fileId = uuidv4(); // Generate a unique ID for the file
        const destination = `${folderPath}${fileId}`; // Store file by userId/fileId
        const cloudFile = bucket.file(destination);
  
        const metadata = {
          contentType: file.mimetype,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          fileId: fileId, // Store the unique file ID in metadata
          originalName: file.originalname, // Store the original name in metadata
        };
  
        await cloudFile.save(file.buffer, {
          metadata: metadata,
        });
  
        // Log successful upload


        // await fetch("https://us-central1-logs-project-445110.cloudfunctions.net/logging", {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json",
        //   },
        //   body: JSON.stringify({
        //     user_id: CLERK_CLIENT_ID,
        //     event: "upload",
        //     status: "success",
        //     fileName: file.originalname,
        //   }),
        // });


        // now we are calling the resource monitor service
        const responseFromResourceMonitorService = await fetch(
            "https://asia-south1-resource-monitor-service.cloudfunctions.net/resource-monitor-2/usage",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userId: CLERK_CLIENT_ID,
                    event: "upload",
                    fileId: fileId,
                    fileSizeMB: file.size / (1024 * 1024), // Convert to MB
                    fileName: file.originalname,
                }),
            }
        );

        await responseFromResourceMonitorService.json();
        // console.log("responseFromResourceMonitorService: ", responseFromResourceMonitorService);



  
        return res.json({
          message: `File ${file.originalname} uploaded successfully with ID ${fileId}`,
          fileId: fileId, // Return the fileId for client reference
        });
    //   }
  
      return res.status(500).json({ error: 'Invalid response from resource monitor' });
    } catch (err) {
      console.error('Error uploading file:', err);
      return res.status(500).json({ error: 'Error uploading file to bucket' });
    }
  });


app.get('/stream/:fileId', async (req, res) => {
    try {
      const { fileId } = req.params;
    //   const userId = "testing123"; // Replace with the actual logic to fetch the user's ID, e.g., from `req.auth`

    const { userId } = req.auth;

      const bucketName = "50mbbucket";
  
      if (!fileId || !userId) {
        return res.status(400).json({ error: 'File ID and user ID are required' });
      }
  
      // Construct the file path in the bucket
      const folderPath = `${userId}/`; // User-specific folder path
      const filePath = `${folderPath}${fileId}`;
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(filePath);
  
      // Check if the file exists
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: 'File not found' });
      }
  
      // Generate a signed URL for streaming
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // URL valid for 15 minutes
      });
  
      return res.json({ signedUrl: url });
    } catch (err) {
      console.error('Error generating signed URL:', err);
      return res.status(500).json({ error: 'Error generating signed URL for file' });
    }
  });
  
  

app.listen(5000, ()=> console.log("server running on port: 5000"));