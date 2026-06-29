import os
import gc
import json
import uuid
import logging
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import fitz
import torch
from bs4 import BeautifulSoup
from fastapi.responses import JSONResponse
from fastapi import FastAPI, UploadFile, File, HTTPException
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.config.parser import ConfigParser
from marker.output import text_from_rendered

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

torch.set_num_threads(1)

config_parser = ConfigParser({"output_format": "json"})
config = config_parser.generate_config_dict()
config["pdftext_workers"] = 1
converter = None

jobs = {}
executor = ThreadPoolExecutor(max_workers=1)


def extract_text(block: dict) -> str:
    soup = BeautifulSoup(block.get("html", ""), "html.parser")
    return soup.get_text(" ", strip=True)


def traverse(node: dict) -> list[str]:
    results = []
    text = extract_text(node)
    if text:
        results.append(text)
    for child in node.get("children", []) or []:
        results.extend(traverse(child))
    return results


def slice_first_last(input_path: str, output_path: str) -> int:
    src = fitz.open(input_path)
    dst = fitz.open()
    dst.insert_pdf(src, from_page=0, to_page=0)
    if len(src) > 1:
        dst.insert_pdf(src, from_page=len(src) - 1, to_page=len(src) - 1)
    total_pages = len(src)
    dst.save(output_path)
    src.close()
    dst.close()
    return total_pages


def get_converter():
    global converter
    if converter is None:
        logger.info("Loading models for the first time...")
        converter = PdfConverter(
            artifact_dict=create_model_dict(),
            config=config,
            renderer=config_parser.get_renderer(),
        )
        logger.info("Models loaded successfully.")
    return converter


def process_pdf_sync(job_id: str, tmp_path: str, sliced_path: str, filename: str):
    try:
        total_pages = slice_first_last(tmp_path, sliced_path)
        logger.info("Sliced to first+last page (original: %d pages) for: %s", total_pages, filename)
        logger.info("Starting PDF conversion for: %s", filename)
        with torch.inference_mode():
            rendered = get_converter()(sliced_path)
        logger.info("Conversion complete. Extracting text...")
        output, _, _ = text_from_rendered(rendered)
        parsed_json = json.loads(output)
        content = traverse(parsed_json)
        logger.info("Text extraction done. Blocks extracted: %d", len(content))
        jobs[job_id] = {
            "status": "done",
            "result": {"output": content, "metadata": rendered.metadata, "total_pages": total_pages},
        }
    except Exception as e:
        logger.error("Conversion failed for %s: %s", filename, e, exc_info=True)
        jobs[job_id] = {"status": "error", "error": str(e)}
    finally:
        os.unlink(tmp_path)
        if os.path.exists(sliced_path):
            os.unlink(sliced_path)
        gc.collect()
        logger.info("Cleaned up temp files for: %s", filename)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Preloading models on startup...")
    get_converter()
    logger.info("Models ready.")
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/")
async def health_check():
    return {"status": "ok", "converter_loaded": converter is not None}


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    logger.info("Received file: %s (size: %d bytes)", file.filename, file.size or -1)
    contents = await file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
    sliced_path = tmp_path + "_sliced.pdf"

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "processing"}

    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, process_pdf_sync, job_id, tmp_path, sliced_path, file.filename)

    logger.info("Job %s started for file: %s", job_id, file.filename)
    return {"job_id": job_id}


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": job["status"]}


@app.get("/result/{job_id}")
async def get_result(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] == "processing":
        raise HTTPException(status_code=202, detail="Still processing")
    if job["status"] == "error":
        raise HTTPException(status_code=500, detail=job["error"])
    result = job["result"]
    del jobs[job_id]
    return JSONResponse(content=result)
