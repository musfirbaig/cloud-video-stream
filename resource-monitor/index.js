const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8081;

// Middleware
app.use(bodyParser.json());
app.use(require('cors')());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Mongoose Schema for tracking user storage usage
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  dailyUsageMB: { type: Number, default: 0 },
  lastReset: { type: Date, default: new Date() },
});
const User = mongoose.model('User', userSchema);

// Reset usage for a user if a new day has started
async function resetDailyUsage(user) {
  const now = new Date();
  if (user.lastReset.toDateString() !== now.toDateString()) {
    user.dailyUsageMB = 0;
    user.lastReset = now;
    await user.save();
  }
}


app.get('/usage', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId });
    }

    await resetDailyUsage(user);

    res.json({
      userId: user.userId,
      dailyUsageMB: user.dailyUsageMB,
      lastReset: user.lastReset,
    });
  } catch (err) {
    console.error('Error fetching user usage:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API: Update User Usage
app.post('/usage', async (req, res) => {
  const { userId, usageMB } = req.body;

  if (!userId || usageMB === undefined) {
    return res.status(400).json({ error: 'User ID and usageMB are required' });
  }

  try {
    let user = await User.findOne({ userId });

    if (!user) {
      // Create new user if not found
      user = new User({ userId });
    }

    await resetDailyUsage(user);

    const DAILY_LIMIT_MB = parseInt(process.env.DAILY_LIMIT_MB, 10);
    if (user.dailyUsageMB + usageMB > DAILY_LIMIT_MB) {
      return res.status(403).json({ error: 'Daily limit exceeded' });
    }

    user.dailyUsageMB += usageMB;
    await user.save();

    res.json({
      message: 'Usage updated successfully',
      currentDailyUsageMB: user.dailyUsageMB,
    });
  } catch (err) {
    console.error('Error updating usage:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Resource Monitor Service running on http://localhost:${port}`);
});
