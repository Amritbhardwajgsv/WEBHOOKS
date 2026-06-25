import os
import tempfile
from fastapi.responses import JSONResponse
from fastapi import FastAPI, UploadFile, File, HTTPException
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from marker.config.parser import ConfigParser
from marker.output import text_from_rendered


app = FastAPI()
config_parser = ConfigParser({"output_format": "json"})
config = config_parser.generate_config_dict()
config["pdftext_workers"] = 1
converter = None


def get_converter():
    global converter
    if converter is None:
        converter = PdfConverter(
            artifact_dict=create_model_dict(),
            config=config,
            renderer=config_parser.get_renderer(),
        )
    return converter


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        rendered = get_converter()(tmp_path)
        output, _, _ = text_from_rendered(rendered)
        return JSONResponse(content={
            "output": output,
            "metadata": rendered.metadata,
        })
    finally:
        os.unlink(tmp_path)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PARSER_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
