const { Worker } = require('bullmq');
const { redisConnection } = require('./queueService');
const { fetchFromS3 } = require('./s3Service');
const { callParser } = require('./parserService');
const { appendExcelRow } = require('./excelService');
const { saveExtractedElements } = require('../db');

const worker = new Worker('file-processing', async (job) => {
    const { objectKey, destination, entityId } = job.data;
    const fileName = objectKey.split('/').pop();

    const s3Data = await fetchFromS3(objectKey);
    console.log('processing file:', objectKey);
    console.log('size:', s3Data.Body.length, 'bytes');

    const parsed = await callParser(s3Data.Body, fileName);
    const saved = await saveExtractedElements({ objectKey, destination, parsed, jobId: job.id, entityId });

    console.log('parsed result:', parsed.metadata);
    console.log('saved extracted elements:', saved._id.toString());

    await appendExcelRow({ objectKey, entityId, fileName, parsed }).catch(err =>
        console.error('excel append failed (non-fatal):', err.message)
    );

    return {
        objectKey,
        extractedElementsId: saved._id.toString(),
        metadata: saved.metadata,
    };
}, { connection: redisConnection });

worker.on('completed', (job) => console.log('done:', job.data.objectKey));
worker.on('failed', (job, err) => console.error('failed:', job.data.objectKey, err.message));

module.exports = { worker };
