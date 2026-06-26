const { fileQueue } = require('../services/queueService');

async function notify(req, res, next) {
    try {
        const { objectKey, destination } = req.body;
        if (!objectKey) {
            return res.status(400).json({ error: 'no object key specified' });
        }

        const entityId = objectKey.split('/')[1] || null;
        await fileQueue.add('process-file', { objectKey, destination: destination || null, entityId });
        res.sendStatus(202);
    } catch (err) {
        next(err);
    }
}

module.exports = { notify };
