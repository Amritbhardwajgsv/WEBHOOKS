const { MongoClient } = require('mongodb');

let clientPromise;
let indexesReady = false;

function getMongoSettings() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        throw new Error('Missing MONGODB_URI or MONGO_URI environment variable');
    }

    return {
        uri,
        dbName: process.env.MONGODB_DB || process.env.MONGO_DB_NAME || 'excelanddashboardprocessor',
        collectionName: process.env.MONGODB_COLLECTION || 'extracted_elements',
    };
}

async function getMongoClient() {
    if (!clientPromise) {
        const { uri } = getMongoSettings();
        const client = new MongoClient(uri);
        clientPromise = client.connect();
    }

    return clientPromise;
}

async function getExtractedElementsCollection() {
    const { dbName, collectionName } = getMongoSettings();
    const client = await getMongoClient();
    const collection = client.db(dbName).collection(collectionName);

    if (!indexesReady) {
        await collection.createIndexes([
            { key: { objectKey: 1, createdAt: -1 }, name: 'objectKey_createdAt' },
            { key: { createdAt: -1 }, name: 'createdAt_desc' },
            { key: { entityId: 1, createdAt: -1 }, name: 'entityId_createdAt' },
        ]);
        indexesReady = true;
    }

    return collection;
}

async function saveExtractedElements({ objectKey, destination, parsed, jobId, entityId }) {
    const collection = await getExtractedElementsCollection();
    const now = new Date();
    const fileName = objectKey.split('/').pop();

    const document = {
        objectKey,
        destination: destination || null,
        fileName,
        entityId: entityId || null,
        jobId,
        metadata: parsed.metadata || {},
        extractedElements: parsed.output,
        createdAt: now,
        updatedAt: now,
    };

    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId };
}

async function listExtractedElements(limit = 20) {
    const collection = await getExtractedElementsCollection();
    return collection
        .find({})
        .project({ extractedElements: 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
}

async function findExtractedElementsByObjectKey(objectKey) {
    const collection = await getExtractedElementsCollection();
    return collection.find({ objectKey }).sort({ createdAt: -1 }).toArray();
}

async function findExtractedElementsByEntity(entityId, limit = 20) {
    const collection = await getExtractedElementsCollection();
    return collection
        .find({ entityId })
        .project({ extractedElements: 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
}

module.exports = {
    saveExtractedElements,
    listExtractedElements,
    findExtractedElementsByObjectKey,
    findExtractedElementsByEntity,
};
