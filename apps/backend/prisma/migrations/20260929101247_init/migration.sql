-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "CopyMode" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "CopySizingMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "CopyOrderStatus" AS ENUM ('PENDING', 'EXECUTING', 'SUBMITTED', 'CONFIRMED', 'SKIPPED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionKind" AS ENUM ('demo', 'assisted');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "apiTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trader" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "userName" TEXT,
    "profileImage" TEXT,
    "lastTradeAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderSnapshot" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalVolume" DOUBLE PRECISION,
    "tradeCount" INTEGER,
    "averagePosition" DOUBLE PRECISION,
    "largestTrade" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "lastActive" TIMESTAMP(3),
    "categories" TEXT[],
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraderSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "slug" TEXT,
    "eventSlug" TEXT,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "outcomes" TEXT[],
    "tokenIds" TEXT[],
    "outcomePrices" DOUBLE PRECISION[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "marketId" TEXT,
    "conditionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "notional" DOUBLE PRECISION NOT NULL,
    "outcome" TEXT,
    "marketTitle" TEXT,
    "marketSlug" TEXT,
    "eventSlug" TEXT,
    "category" TEXT,
    "transactionHash" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderTrade" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "marketTitle" TEXT,
    "marketSlug" TEXT,
    "outcome" TEXT,
    "category" TEXT,
    "status" "PositionStatus" NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "cost" DOUBLE PRECISION NOT NULL,
    "pnl" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL,
    "roi" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "WatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "newTrades" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "CopyMode" NOT NULL DEFAULT 'MANUAL',
    "sizingMode" "CopySizingMode" NOT NULL DEFAULT 'FIXED',
    "fixedAmount" DECIMAL(20,6) NOT NULL DEFAULT 10,
    "percentage" DECIMAL(12,6) NOT NULL DEFAULT 0.01,
    "minCopyAmount" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "maxPerTrade" DECIMAL(20,6) NOT NULL DEFAULT 20,
    "maxDailyAmount" DECIMAL(20,6) NOT NULL DEFAULT 100,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "minWhaleTrade" DECIMAL(20,6) NOT NULL DEFAULT 10000,
    "maxSlippage" DECIMAL(8,6) NOT NULL DEFAULT 0.03,
    "minBalance" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowedCategories" TEXT[],
    "excludedMarkets" TEXT[],
    "walletAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "sourceTradeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "confirmIdempotencyKey" TEXT,
    "conditionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "marketTitle" TEXT,
    "marketUrl" TEXT,
    "outcome" TEXT,
    "category" TEXT,
    "side" "OrderSide" NOT NULL,
    "whaleSize" DECIMAL(24,6) NOT NULL,
    "whalePrice" DECIMAL(12,6) NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "estimatedShares" DECIMAL(24,6) NOT NULL,
    "status" "CopyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "execution" "ExecutionKind" NOT NULL,
    "failureReason" TEXT,
    "externalOrderId" TEXT,
    "transactionHash" TEXT,
    "fillPrice" DECIMAL(12,6),
    "filledShares" DECIMAL(24,6),
    "currentPrice" DECIMAL(12,6),
    "pnl" DECIMAL(20,6),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traderAddress" TEXT,
    "copyOrderId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_apiTokenHash_key" ON "User"("apiTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Trader_address_key" ON "Trader"("address");

-- CreateIndex
CREATE INDEX "TraderSnapshot_traderId_period_createdAt_idx" ON "TraderSnapshot"("traderId", "period", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Market_conditionId_key" ON "Market"("conditionId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_sourceId_key" ON "Trade"("sourceId");

-- CreateIndex
CREATE INDEX "Trade_traderId_timestamp_idx" ON "Trade"("traderId", "timestamp");

-- CreateIndex
CREATE INDEX "Trade_conditionId_idx" ON "Trade"("conditionId");

-- CreateIndex
CREATE INDEX "TraderTrade_traderId_closedAt_idx" ON "TraderTrade"("traderId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TraderTrade_traderId_positionKey_key" ON "TraderTrade"("traderId", "positionKey");

-- CreateIndex
CREATE INDEX "Watchlist_traderId_status_idx" ON "Watchlist"("traderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_traderId_key" ON "Watchlist"("userId", "traderId");

-- CreateIndex
CREATE UNIQUE INDEX "CopySettings_userId_key" ON "CopySettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CopyOrder_idempotencyKey_key" ON "CopyOrder"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CopyOrder_confirmIdempotencyKey_key" ON "CopyOrder"("confirmIdempotencyKey");

-- CreateIndex
CREATE INDEX "CopyOrder_userId_status_idx" ON "CopyOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "CopyOrder_userId_createdAt_idx" ON "CopyOrder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopyOrder_userId_sourceTradeId_key" ON "CopyOrder"("userId", "sourceTradeId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_traderId_period_key" ON "AnalyticsSnapshot"("traderId", "period");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "TraderSnapshot" ADD CONSTRAINT "TraderSnapshot_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderTrade" ADD CONSTRAINT "TraderTrade_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopySettings" ADD CONSTRAINT "CopySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyOrder" ADD CONSTRAINT "CopyOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyOrder" ADD CONSTRAINT "CopyOrder_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyOrder" ADD CONSTRAINT "CopyOrder_sourceTradeId_fkey" FOREIGN KEY ("sourceTradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "Trader"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
