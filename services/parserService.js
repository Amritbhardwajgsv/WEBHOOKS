async function callParser(pdfBuffer, fileName) {
    const baseUrl = (process.env.PARSER_URL || 'http://localhost:8000/parse').replace(/\/parse$/, '');
    const formData = new FormData();
    formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

    const submitRes = await fetch(`${baseUrl}/parse`, { method: 'POST', body: formData });
    if (!submitRes.ok) {
        const text = await submitRes.text();
        throw new Error(`Parser submit error ${submitRes.status}: ${text}`);
    }
    const { job_id } = await submitRes.json();

    const maxWait = 15 * 60 * 1000;
    const pollInterval = 15_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const statusRes = await fetch(`${baseUrl}/status/${job_id}`);
        if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.status}`);
        const { status } = await statusRes.json();
        if (status === 'done') break;
        if (status === 'error') throw new Error(`Parser job failed for ${fileName}`);
    }

    const resultRes = await fetch(`${baseUrl}/result/${job_id}`);
    if (!resultRes.ok) {
        const text = await resultRes.text();
        throw new Error(`Parser result error ${resultRes.status}: ${text}`);
    }
    return resultRes.json();
}

module.exports = { callParser };
