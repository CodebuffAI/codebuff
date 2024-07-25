
# Use an official Node.js runtime as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json yarn.lock .env ./

RUN yarn install --production

COPY dist ./dist

# Debug: List contents of the app directory
RUN ls -la /usr/src/app && echo "Contents of dist:" && ls -la /usr/src/app/dist
# Expose the port the app runs on
EXPOSE 4242

# Command to run the application
CMD ["yarn", "start-js"]
