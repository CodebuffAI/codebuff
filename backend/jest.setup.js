
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

// You can add more setup code here if needed in the future
console.log('Jest setup: Environment variables loaded');
