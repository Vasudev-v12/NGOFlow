FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy application source
COPY . .

# Default port (matches src/server.js)
ENV PORT=5001
EXPOSE 5001

# Start the server
CMD ["node", "src/server.js"]