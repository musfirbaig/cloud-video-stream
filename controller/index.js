// const CLERK_USER_ID = "usr_xxj9bjsz8i2p2w7flmda8xl3f";

// clerk client id is the virtual directory 
// so for testing i am using clerk id as test-folder 



// let CLERK_CLIENT_ID = "test-folder";

const express = require('express');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
require('dotenv/config');

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
            const response = await fetch(`https://us-central1-logs-project-445110.cloudfunctions.net/logging`, {
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

    // console.log("user id: ", userId);

    

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
            case "upload":

                // upload video
                token = jwt.sign({CLERK_CLIENT_ID, event}, JWT_SECRET, {expiresIn: '30m'});


                return res.json({token});

                break;
            case "get-all-videos":
                // get all videos

                // Log start of operation
                logEvent("get-all-videos", "pending", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                const response = await fetch(`https://storage-microservice-796253357501.us-central1.run.app/all_name?name=${CLERK_CLIENT_ID}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                const data = await response.json();

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
                const {fileName} = body;

                logEvent("delete", "pending", CLERK_CLIENT_ID, fileName)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                {
                    

                    console.log("fileName: ", fileName);
                    
                    const response = await fetch(`https://storage-microservice-796253357501.us-central1.run.app/objects?name=${CLERK_CLIENT_ID}&fileName=${fileName}`, {
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
                }

                
                break;
            case "delete-all":
                // delete all videos

                logEvent("delete", "pending", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                {
                    const response = await fetch(`https://storage-microservice-796253357501.us-central1.run.app/folder?name=${CLERK_CLIENT_ID}`, {
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
            case "stream":
                // stream video
                token = jwt.sign({CLERK_CLIENT_ID, event}, JWT_SECRET, {expiresIn: '60m'});
                return res.json({token});
                break;

            case "monitoring":
                logEvent("request-resource-monitor", "success", CLERK_CLIENT_ID)
                    .catch(err => console.log("Warning: Logging failed:", err.message));

                    {const response = await fetch(`https://us-central1-resource-monitor-service.cloudfunctions.net/resource-monitor/usage?userId=${CLERK_CLIENT_ID}`, {
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

app.listen(3000, ()=> console.log("server running on port: 3000"));