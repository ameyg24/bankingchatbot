from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import fitz  # PyMuPDF
from openai import OpenAI
import os
from typing import List, Dict
from dotenv import load_dotenv
import json

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

documents: Dict[str, List[str]] = {}  # user_email -> list of PDF texts

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

def get_pdf_summary(user_email: str):
    user_docs = documents.get(user_email, [])
    if not user_docs:
        return "No PDF statements have been uploaded yet."
    kb_text = "\n".join(user_docs)
    if len(kb_text) > 1000:
        return kb_text[:1000] + "... [truncated]"
    return kb_text

@app.post("/upload_pdf/")
async def upload_pdf(file: UploadFile = File(...), user_email: str = Depends(get_user_email)):
    content = await file.read()
    doc = fitz.open(stream=content, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    documents.setdefault(user_email, []).append(text)
    return {"message": "PDF processed and added to knowledge base."}

@app.post("/chat/")
async def chat(message: str = Form(...), user_email: str = Depends(get_user_email)):
    pdf_context = get_pdf_summary(user_email)
    system_prompt = (
        "You are BankBot, a helpful, concise, and professional AI banking assistant. "
        "You can answer questions about banking, statements, and transactions. "
        "If the user has uploaded a PDF bank statement, use the following extracted content as context. "
        "If the answer is not in the PDF, use your general banking knowledge. "
        "Always format your answers clearly and concisely.\n"
        f"PDF context (may be truncated):\n{pdf_context}"
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": message}
    ]
    response = client.chat.completions.create(
        model="gpt-4",
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
