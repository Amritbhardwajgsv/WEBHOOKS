const IORedis = require('ioredis');
const { Queue } = require('bullmq');

const redisConnection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        maxRetriesPerRequest: null,
    });

const fileQueue = new Queue('file-processing', { connection: redisConnection });

module.exports = { fileQueue, redisConnection };
