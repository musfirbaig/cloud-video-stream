const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8081;

const DAILY_LIMIT_MB = 100;
const STORAGE_LIMIT_MB = 50;

app.use(bodyParser.json());
app.use(require('cors')());

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  dailyUsageMB: { type: Number, default: 0 },
  dataStoredMB: { type: Number, default: 0 },
  lastReset: { type: Date, default: new Date() },
});
const User = mongoose.model('User', userSchema);

async function resetDailyUsage(user) 
{
  const now = new Date();
  if (user.lastReset.toDateString() !== now.toDateString()) 
  {
    user.dailyUsageMB = 0;
    user.lastReset = now;
    await user.save();
  }
}

/**
 * Checks if the user meets the upload criteria (daily limit and storage limit).
 * @param {Object} user - The user document.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 * @returns {Number} - 0 if criteria are met, 1 if BandWidth exceeded, 2 if DataStorage exceeded.
 */
function meetsUploadCriteria(user, fileSizeMB) 
{
  if (user.dailyUsageMB + ((fileSizeMB > 0) ? fileSizeMB : 0) > DAILY_LIMIT_MB)
  {
    return 1;
  }
  if (user.dataStoredMB + fileSizeMB > STORAGE_LIMIT_MB)
  {
    return 2;
  }
  return 0;
}

/**
 * Updates the user's usage and storage values.
 * @param {Object} user - The user document.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 */
async function updateUserUsage(user, fileSizeMB) 
{ 
    if (fileSizeMB > 0)
    {
        user.dailyUsageMB += fileSizeMB;
    }
    user.dataStoredMB += fileSizeMB;
    await user.save();
}

/**
 * @param {String} userID - The user document.
 * @param {Number} fileSizeMB - The size of the file being uploaded.
 * @returns {Number} - 0 if criteria are met, 1 if BandWidth exceeded, 2 if DataStorage exceeded.
 */
app.post('/usage', async (req, res) => {
  const { userId, fileSizeMB } = req.body; // for delete request provide the fileSizeMB as -ve value.
  if (!userId || fileSizeMB === undefined) 
  {
    return res.status(400).json({ error: 'User ID and file size are required' });
  }
  try 
  {
    let user = await User.findOne({ userId });
    if (!user) 
    {
      user = new User({ userId });
    }
    await resetDailyUsage(user);
    let return_code = meetsUploadCriteria(user, fileSizeMB)
    if (return_code) 
    {
      return res.json({ response: return_code });
    }
    await updateUserUsage(user, fileSizeMB);

    return res.json({ response: return_code });
  } 
  catch (err) 
  {
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
    if (!userId) 
    {
        return res.status(400).json({ error: 'User ID is required' });
    }
    try 
    {
        let user = await User.findOne({ userId });
        if (!user) 
        {
          user = new User({ userId });
        }
        await user.save();
        return res.json({ remainingStorage: (STORAGE_LIMIT_MB - user.dataStoredMB),
                            remainingBandWidth: (DAILY_LIMIT_MB - user.dailyUsageMB) })
    } 
    catch (err) 
    {
        console.error('Error processing usage request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
  });

app.listen(port, () => {
  console.log(`Resource Monitor Service running on http://localhost:${port}`);
});
