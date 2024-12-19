# Base image - use a slimmer variant
FROM node:18-slim

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy only the necessary application code
COPY . .

# Expose the port your application will run on
EXPOSE 8080

# Define the command to start the application
CMD ["npm", "start"]
