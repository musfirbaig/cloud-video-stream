const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 8081;

const DAILY_LIMIT_MB = 100;
const STORAGE_LIMIT_MB = 50;

app.use(express.json());

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

const firestore = admin.firestore();
const usersCollection = firestore.collection('users');

/**
 * Resets the daily usage for a user if the last reset was on a different day.
 * @param {Object} userDoc - The Firestore document reference for the user.
 */
async function resetDailyUsage(userDoc) {
  const now = new Date();
  const user = userDoc.data();

  if (user.lastReset && new Date(user.lastReset.toDate()).toDateString() !== now.toDateString()) {
    await userDoc.ref.update({
      dailyUsageMB: 0,
      lastReset: now,
    });
  }
}

/**
 * Checks if the user meets the upload criteria (daily limit and storage limit).
 * @param {Object} user - The user document.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 * @returns {Number} - 0 if criteria are met, 1 if BandWidth exceeded, 2 if DataStorage exceeded.
 */
function meetsUploadCriteria(user, fileSizeMB) {
  if (user.dailyUsageMB + (fileSizeMB > 0 ? fileSizeMB : 0) > DAILY_LIMIT_MB) {
    return 1;
  }
  if (user.dataStoredMB + fileSizeMB > STORAGE_LIMIT_MB) {
    return 2;
  }
  return 0;
}

/**
 * Updates the user's usage and storage values.
 * @param {Object} userDoc - The Firestore document reference for the user.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 */
async function updateUserUsage(userDoc, fileSizeMB) {
  const user = userDoc.data();
  const updates = {};

  if (fileSizeMB > 0) {
    updates.dailyUsageMB = (user.dailyUsageMB || 0) + fileSizeMB;
  }
  updates.dataStoredMB = (user.dataStoredMB || 0) + fileSizeMB;
  await userDoc.ref.update(updates);
}

/**
 * @param {String} userId - The user document.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 * @returns {Number} - 0 if criteria are met, 1 if BandWidth exceeded, 2 if DataStorage exceeded.
 */
app.post('/usage', async (req, res) => {
  const { userId, fileSizeMB } = req.body; // For delete request, provide the fileSizeMB as -ve value.
  if (!userId || fileSizeMB === undefined) {
    return res.status(400).json({ error: 'User ID and file size are required' });
  }

  try {
    const userDoc = usersCollection.doc(userId);
    let userSnapshot = await userDoc.get();

    if (!userSnapshot.exists) {
      await userDoc.set({ userId, dailyUsageMB: 0, dataStoredMB: 0, lastReset: new Date() });
      userSnapshot = await userDoc.get();
    }

    await resetDailyUsage(userSnapshot);

    const user = userSnapshot.data();
    const return_code = meetsUploadCriteria(user, fileSizeMB);

    if (return_code) {
      return res.json({ response: return_code });
    }

    await updateUserUsage(userSnapshot, fileSizeMB);
    return res.json({ response: 0 });
  } catch (err) {
    console.error('Error processing usage request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @param {Query} userId - The userID.
 * @returns {Number} - Remaining Storage and BandWidth.
 */
app.get('/usage', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const userDoc = usersCollection.doc(userId);
    let userSnapshot = await userDoc.get();

    if (!userSnapshot.exists) {
      await userDoc.set({ userId, dailyUsageMB: 0, dataStoredMB: 0, lastReset: new Date() });
      userSnapshot = await userDoc.get();
    }

    const user = userSnapshot.data();
    return res.json({
      remainingStorage: STORAGE_LIMIT_MB - user.dataStoredMB,
      remainingBandWidth: DAILY_LIMIT_MB - user.dailyUsageMB,
    });
  } catch (err) {
    console.error('Error processing usage request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Resource Monitor Service running on http://localhost:${port}`);
});