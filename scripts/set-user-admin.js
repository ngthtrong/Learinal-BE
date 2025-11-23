/**
 * Script to promote a user to Admin role
 * Usage: node scripts/set-user-admin.js <email>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/user.model');

async function setUserAdmin(email) {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/learinal');
    console.log('Connected to MongoDB');

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { role: 'Admin' },
      { new: true }
    );

    if (!user) {
      console.error(`User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`Successfully updated user ${user.email} to Admin role`);
    console.log(`User ID: ${user._id}`);
    console.log(`Full Name: ${user.fullName}`);
    console.log(`Role: ${user.role}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error updating user:', error);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Please provide an email address');
  console.log('Usage: node scripts/set-user-admin.js <email>');
  process.exit(1);
}

setUserAdmin(email);
