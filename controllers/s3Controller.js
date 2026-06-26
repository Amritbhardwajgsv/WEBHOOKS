const { getFileStream } = require('../services/s3Service');

function getFile(req, res) {
    const filetofind = req.query.file;
    if (!filetofind) {
        return res.status(400).json({ error: 'no file specified' });
    }

    const request = getFileStream(filetofind);
    request.on('httpHeaders', (statusCode, headers) => {
        res.setHeader('Content-Type', headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filetofind.split('/').pop()}"`);
    });

    request.createReadStream()
        .on('error', (err) => {
            console.error(err);
            res.status(500).json({ error: 'could not find file', details: err.message });
        })
        .pipe(res);
}

module.exports = { getFile };
