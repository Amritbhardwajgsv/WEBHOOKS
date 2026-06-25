require('dotenv').config();
console.log('REDIS_URL loaded:', !!process.env.REDIS_URL);

const AWS = require('aws-sdk');
const IORedis = require('ioredis');
const express = require('express');
const { Queue, Worker } = require('bullmq');
const {
    saveExtractedElements,
    listExtractedElements,
    findExtractedElementsByObjectKey,
    findExtractedElementsByEntity,
} = require('./db');

const app = express();
const port =  process.env.port ||process.env.PORT || 3000;

const s3 = new AWS.S3({
    region: process.env.AWS_REGION
});

const redisConnection = process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
    : new IORedis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        maxRetriesPerRequest: null,
    });

const fileQueue = new Queue('file-processing', {
    connection: redisConnection
});

const worker = new Worker('file-processing', async (job) => {
    const { objectKey, destination, entityId } = job.data;
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: objectKey
    };

    const data = await s3.getObject(params).promise();
    console.log('processing file:', objectKey);
    console.log('size:', data.Body.length, 'bytes');

    const parserUrl = process.env.PARSER_URL || 'http://localhost:8000/parse';
    const formData = new FormData();
    const blob = new Blob([data.Body], { type: 'application/pdf' });
    formData.append('file', blob, objectKey.split('/').pop());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes
    let response;
    try {
        response = await fetch(parserUrl, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Parser error ${response.status}: ${text}`);
    }

    const parsed = await response.json();
    const saved = await saveExtractedElements({
        objectKey,
        destination,
        parsed,
        jobId: job.id,
        entityId,
    });

    console.log('parsed result:', parsed.metadata);
    console.log('saved extracted elements:', saved._id.toString());
    return {
        objectKey,
        extractedElementsId: saved._id.toString(),
        metadata: saved.metadata,
    };
}, {
    connection: redisConnection
});

worker.on('completed', (job) => console.log('done:', job.data.objectKey));
worker.on('failed', (job, err) => console.error('failed:', job.data.objectKey, err.message));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/notify', async (req, res, next) => {
    try {
        const { objectKey, destination } = req.body;
        if (!objectKey) {
            return res.status(400).json({ error: 'no object key specified' });
        }

        // path shape: tenders/{entityId}/{year}/{month}/{filename}
        const entityId = objectKey.split('/')[1] || null;

        await fileQueue.add('process-file', { objectKey, destination: destination || null, entityId });
        res.sendStatus(202);
    } catch (err) {
        next(err);
    }
});

app.get('/extractions', async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit || 20), 100);
        const extractions = await listExtractedElements(limit);
        res.json({ extractions });
    } catch (err) {
        next(err);
    }
});

app.get('/extractions/by-entity', async (req, res, next) => {
    try {
        const { entityId } = req.query;
        if (!entityId) {
            return res.status(400).json({ error: 'no entityId specified' });
        }

        const limit = Math.min(Number(req.query.limit || 20), 100);
        const extractions = await findExtractedElementsByEntity(entityId, limit);
        res.json({ entityId, extractions });
    } catch (err) {
        next(err);
    }
});

app.get('/extractions/by-object-key', async (req, res, next) => {
    try {
        const { objectKey } = req.query;
        if (!objectKey) {
            return res.status(400).json({ error: 'no object key specified' });
        }

        const extractions = await findExtractedElementsByObjectKey(objectKey);
        res.json({ extractions });
    } catch (err) {
        next(err);
    }
});

app.get('/s3/get', (req, res) => {
    const filetofind = req.query.file;
    if (!filetofind) {
        return res.status(400).json({
            error: 'no file specified'
        });
    }

    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: filetofind
    };

    s3.getObject(params, (err, data) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                error: 'couldnt find file',
                details: err.message
            });
        }

        const fileName = filetofind.split('/').pop();
        res.setHeader('Content-Type', data.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(data.Body);
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal server error' });
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
