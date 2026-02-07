# Banking Chatbot

This project is a full-stack LLM-powered chatbot system for banking use cases.

## Features

- **Frontend:** React (Vite, TypeScript) real-time chat interface
- **Backend:** Python (FastAPI) with endpoints for chat and PDF upload
- **LLM Integration:** OpenAI GPT-4 for conversational intelligence
- **PDF Ingestion:** PyMuPDF for extracting knowledge from uploaded PDFs

## Getting Started

### 1) Clone and enter repo

```sh
git clone <your-repo-url>
cd bankingchatbot
```

### 2) Create environment file

Copy `.env.example` to `.env` and set real values:

```sh
cp .env.example .env
```

Required keys in `.env`:

- `OPENAI_API_KEY`: used by backend (`backend/main.py`)
- `VITE_GOOGLE_CLIENT_ID`: used by frontend Google login

### 3) Start backend (Terminal 1)

```sh
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend docs: `http://localhost:8000/docs`

### 4) Start frontend (Terminal 2)

```sh
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Project Structure

- `src/` - React frontend code
- `backend/` - Python FastAPI backend

## Google OAuth Setup (Required)

In Google Cloud Console, create/use an OAuth 2.0 **Web application** client and set:

- Authorized JavaScript origins: `http://localhost:5173`
- Authorized redirect URIs: `http://localhost:5173`

---

This project is under active development.
