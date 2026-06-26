const {
    listExtractedElements,
    findExtractedElementsByObjectKey,
    findExtractedElementsByEntity,
} = require('../db');

async function list(req, res, next) {
    try {
        const limit = Math.min(Number(req.query.limit || 20), 100);
        const extractions = await listExtractedElements(limit);
        res.json({ extractions });
    } catch (err) {
        next(err);
    }
}

async function byEntity(req, res, next) {
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
}

async function byObjectKey(req, res, next) {
    try {
        const { objectKey } = req.query;
        if (!objectKey) {
            return res.status(400).json({ error: 'no objectKey specified' });
        }
        const extractions = await findExtractedElementsByObjectKey(objectKey);
        res.json({ extractions });
    } catch (err) {
        next(err);
    }
}

module.exports = { list, byEntity, byObjectKey };
