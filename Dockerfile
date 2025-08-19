FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY dist/ ./dist/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S g4converter -u 1001 -G nodejs

# Create directories for input/output with proper permissions
RUN mkdir -p /app/input /app/output && \
    chown -R g4converter:nodejs /app

# Switch to non-root user
USER g4converter

# Set default command
ENTRYPOINT ["node", "dist/g4-to-ebnf.js"]

# Default help command if no args provided
CMD ["--help"]

# Labels for metadata
LABEL maintainer="g4-to-ebnf"
LABEL description="Convert ANTLR4 grammar files (.g4) to Extended Backus-Naur Form (EBNF)"
LABEL version="1.0.0"