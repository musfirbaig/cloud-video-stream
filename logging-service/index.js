const express = require("express");
const fetch = require("node-fetch");
const admin = require('firebase-admin');

// Add service account verification with better error handling
try {
    const serviceAccount = require('./firebaseKey.json');

    console.log("service account: ", serviceAccount);
    
    // admin.initializeApp({
    //     credential: admin.credential.cert(serviceAccount)
    //   });

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

} catch (error) {
    console.error('Firebase initialization failed:', {
        message: error.message,
        stack: error.stack
    });
    process.exit(1);
}

const db = admin.firestore();

// More robust error handling for Firestore operations
exports.loggingService = async (req, res) => {
    const { body } = req;
    const {event, status, timestamp, user_id} = body;

    

    console.log('Received request with body:', body); // Debug log

    if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
    }

    try {
        const userRef = db.collection('logs').doc(user_id);
        
        const newLogEntry = {
            event,
            status,
            timestamp: timestamp || admin.firestore.Timestamp.now()
        };

        if(event == "upload" || event == "stream" || event == "delete") {
            newLogEntry["fileName"] = body.fileName;
        }

        // Use set with merge option to handle both new and existing documents
        await userRef.set({
            logs: admin.firestore.FieldValue.arrayUnion(newLogEntry)
        }, { merge: true });

        console.log('Log entry stored successfully for user:', user_id);
        res.status(200).json({ message: 'Logs stored successfully' });
        
    } catch (error) {
        console.error('Detailed error:', {
            code: error.code,
            message: error.message,
            details: error.details,
            stack: error.stack
        });

        // Check for specific error types
        if (error.code === 5) { // NOT_FOUND
            try {
                // Attempt to create the document explicitly
                const userRef = db.collection('logs').doc(user_id);
                await userRef.set({
                    logs: [{
                        event,
                        status,
                        timestamp: timestamp || admin.firestore.Timestamp.now()
                    }]
                });
                return res.status(200).json({ message: 'Logs stored successfully (retry)' });
            } catch (retryError) {
                console.error('Retry failed:', retryError);
            }
        }

        res.status(500).json({ 
            error: 'Failed to store logs',
            details: error.message
        });
    }
}

const app = express();

app.use(express.json());

app.all("/logging", exports.loggingService);

const PORT = 5000;

// Add connection test on startup
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        const testRef = db.collection('test').doc('connectivity');
        await testRef.set({ timestamp: admin.firestore.Timestamp.now() });
        console.log('✅ Firestore connection test successful');
    } catch (error) {
        console.error('❌ Firestore connection test failed:');
    }
});