async function callParser(pdfBuffer, fileName) {
    const parserUrl = process.env.PARSER_URL || 'http://localhost:8000/parse';
    const formData = new FormData();
    formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    try {
        const response = await fetch(parserUrl, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Parser error ${response.status}: ${text}`);
        }
        return response.json();
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { callParser };
