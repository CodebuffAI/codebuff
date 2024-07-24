
# Use an official Node.js runtime as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json files and tsconfig.json
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --production

COPY dist ./

# Expose the port the app runs on
EXPOSE 4242

# Command to run the application
CMD ["yarn", "start-js"]
