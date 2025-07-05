# Banking Chatbot

This project is a full-stack LLM-powered chatbot system for banking use cases.

## Features

- **Frontend:** React (Vite, TypeScript) real-time chat interface
- **Backend:** Python (FastAPI) with endpoints for chat and PDF upload
- **LLM Integration:** OpenAI GPT-4 for conversational intelligence
- **PDF Ingestion:** PyMuPDF for extracting knowledge from uploaded PDFs

## Getting Started

### Frontend

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the development server:
   ```sh
   npm run dev
   ```

### Backend

1. Create a Python virtual environment and activate it:
   ```sh
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install backend dependencies:
   ```sh
   pip install fastapi uvicorn openai pymupdf python-multipart
   ```
3. Start the backend server:
   ```sh
   uvicorn backend.main:app --reload
   ```

## Project Structure

- `src/` - React frontend code
- `backend/` - Python FastAPI backend (to be created)

## Configuration

- Set your OpenAI API key as an environment variable: `OPENAI_API_KEY`

---

This project is under active development.
