const AWS = require('aws-sdk');

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

async function fetchFromS3(objectKey) {
    const data = await s3.getObject({
        Bucket: process.env.S3_BUCKET,
        Key: objectKey,
    }).promise();
    return data;
}

function getFileStream(objectKey) {
    return s3.getObject({
        Bucket: process.env.S3_BUCKET,
        Key: objectKey,
    });
}

module.exports = { fetchFromS3, getFileStream };
