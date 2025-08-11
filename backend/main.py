from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import fitz  # PyMuPDF
from openai import OpenAI
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv
import json
import uuid
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Only allow frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# In-memory user data (replace with DB in production)
user_data: Dict[str, Dict] = {}
security = HTTPBearer()

# store id, filename, text, summary, data
documents: Dict[str, List[Dict]] = {}

MAX_DOC_TEXT_STORED = 60_000
MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB limit per file (demo)
SUMMARY_MODEL = "gpt-4"
CHAT_MODEL = "gpt-4"

def get_user_email(token: HTTPAuthorizationCredentials = Depends(security)):
    # For demo: decode Google JWT (no verification, do in prod!)
    import base64
    try:
        payload = token.credentials.split('.')[1]
        padded = payload + '=' * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        data = json.loads(decoded)
        return data['email']
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid token')

def summarize_text(filename: str, text: str) -> str:
    snippet = text[:4000]
    prompt = (
        "Provide a concise 2-4 sentence summary of the bank statement or PDF content. "
        "If it appears to be transactional data, mention date range & key categories if visible.\n\n"
        f"Filename: {filename}\nContent snippet:\n{snippet}"
    )
    try:
        resp = client.chat.completions.create(
            model=SUMMARY_MODEL,
            messages=[{"role": "system", "content": "You summarize documents succinctly."}, {"role": "user", "content": prompt}],
            max_tokens=180,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return "Summary unavailable."


def build_pdf_context(user_email: str) -> str:
    user_docs = documents.get(user_email, [])
    if not user_docs:
        return "No PDF statements have been uploaded yet."
    parts = []
    for d in user_docs:
        text_part = d['text'][:1200]
        parts.append(f"Document: {d['filename']}\nSummary: {d['summary']}\nExcerpt:\n{text_part}")
    joined = "\n\n".join(parts)
    if len(joined) > 9000:
        joined = joined[:9000] + "... [truncated]"
    return joined

@app.post("/upload_pdf/")
async def upload_pdf(file: UploadFile = File(...), user_email: str = Depends(get_user_email)):
    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF too large (max 5MB in demo)")
    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF")
    raw_text = "\n".join(page.get_text() for page in doc)
    trimmed = raw_text[:MAX_DOC_TEXT_STORED]
    # Check for existing filename to overwrite
    user_docs = documents.setdefault(user_email, [])
    existing = next((d for d in user_docs if d['filename'] == file.filename), None)
    overwritten = False
    if existing:
        existing['text'] = trimmed
        existing['summary'] = summarize_text(file.filename, trimmed)
        existing['data'] = content
        doc_id = existing['id']
        summary = existing['summary']
        overwritten = True
    else:
        doc_id = str(uuid.uuid4())
        summary = summarize_text(file.filename, trimmed)
        entry = {"id": doc_id, "filename": file.filename, "text": trimmed, "summary": summary, "data": content}
        user_docs.append(entry)
    return {"message": "PDF processed and added to knowledge base." if not overwritten else "Existing PDF overwritten.", "overwritten": overwritten, "document": {"id": doc_id, "filename": file.filename, "summary": summary}}

@app.get("/documents")
async def list_documents(user_email: str = Depends(get_user_email)):
    return [{"id": d['id'], "filename": d['filename'], "summary": d['summary']} for d in documents.get(user_email, [])]

@app.get("/documents/{doc_id}")
async def get_document(doc_id: str, user_email: str = Depends(get_user_email)):
    for d in documents.get(user_email, []):
        if d['id'] == doc_id:
            return {"id": d['id'], "filename": d['filename'], "summary": d['summary']}
    raise HTTPException(status_code=404, detail="Document not found")

@app.get("/documents/{doc_id}/file")
async def get_document_file(doc_id: str, user_email: str = Depends(get_user_email)):
    for d in documents.get(user_email, []):
        if d['id'] == doc_id:
            return StreamingResponse(io.BytesIO(d['data']), media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={d['filename']}"})
    raise HTTPException(status_code=404, detail="Document not found")

@app.get("/documents/search")
async def search_documents(q: str = Query(..., min_length=2), doc_id: Optional[str] = None, user_email: str = Depends(get_user_email)):
    results = []
    user_docs = documents.get(user_email, [])
    for d in user_docs:
        if doc_id and d['id'] != doc_id:
            continue
        # naive case-insensitive search collecting matching lines
        matches = []
        for line in d['text'].splitlines():
            if q.lower() in line.lower():
                matches.append(line.strip())
            if len(matches) >= 20:
                break
        if matches:
            results.append({"document_id": d['id'], "filename": d['filename'], "matches": matches[:20]})
    return {"query": q, "results": results}

@app.post("/chat/")
async def chat(message: str = Form(...), user_email: str = Depends(get_user_email)):
    pdf_context = build_pdf_context(user_email)
    system_prompt = (
        "You are BankBot, a helpful, concise, and professional AI banking assistant. "
        "You can answer questions about banking, statements, and transactions. "
        "Use the provided document summaries & excerpts when relevant. If information is missing, say you don't have it rather than hallucinating.\n"
        f"DOCUMENT CONTEXT:\n{pdf_context}"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message}
    ]
    response = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=messages
    )
    answer = response.choices[0].message.content
    return JSONResponse(content={"answer": answer})

@app.post("/persist/chat")
async def persist_chat(history: List[dict], user_email: str = Depends(get_user_email)):
    user_data.setdefault(user_email, {})['chat'] = history
    return {"status": "ok"}

@app.get("/persist/chat")
async def get_chat(user_email: str = Depends(get_user_email)):
    return user_data.get(user_email, {}).get('chat', [])

@app.get("/persist/docs")
async def get_docs(user_email: str = Depends(get_user_email)):
    return documents.get(user_email, [])

@app.delete("/documents")
async def clear_documents(user_email: str = Depends(get_user_email)):
    documents[user_email] = []
    return {"status": "cleared"}
