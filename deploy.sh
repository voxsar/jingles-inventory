#!/bin/bash
set -e  # Exit on any error

echo "🚀 Starting deployment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to project root
cd /var/www/federation-inventory/jingles-inventory

# Step 1: Pull latest from main
echo -e "${BLUE}📥 Pulling latest from main...${NC}"
git pull origin main
echo ""

# Step 2: Install dependencies if package.json changed
echo -e "${BLUE}📦 Checking for dependency updates...${NC}"
npm install
echo ""

# Step 3: Build shared package first
echo -e "${BLUE}🔨 Building shared package...${NC}"
npm run build:shared
echo ""

# Step 4: Run database migrations
echo -e "${BLUE}🗄️  Running database migrations...${NC}"
cd packages/backend
npx prisma migrate deploy
echo ""

# Step 5: Generate Prisma Client
echo -e "${BLUE}⚙️  Generating Prisma Client...${NC}"
npx prisma generate
echo ""

# Step 6: Build backend
echo -e "${BLUE}🔨 Building backend...${NC}"
npm run build
echo ""

# Step 7: Restart PM2
echo -e "${BLUE}🔄 Restarting PM2 process...${NC}"
pm2 restart jingles-backend
echo ""

# Step 8: Build web frontend
echo -e "${BLUE}🔨 Building web frontend...${NC}"
cd ../web
npm run build
echo ""

# Step 9: Show PM2 status
echo -e "${BLUE}📊 PM2 Status:${NC}"
pm2 list
echo ""

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Check logs with: pm2 logs jingles-backend${NC}"
