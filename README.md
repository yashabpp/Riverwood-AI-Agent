# Riverwood AI Voice Agent Prototype (Stella)

An AI-powered voice agent for **Riverwood Projects LLP** that calls customers with personalized construction progress updates about Riverwood Estate, Kharkhauda.

## Features

- **Stella - AI Voice Agent**: A warm, professional persona representing Riverwood.
- **Python Backend**: Powered by **FastAPI** for robust session management and LLM orchestration.
- **Low Latency**: Integration with **Groq SDK** (Llama 3.3 70B) for sub-second response times.
- **Micro-Latency TTS**: Powered by **Deepgram Aura** for near-instant voice responses.
- **Premium UI**: Dark mode, glassmorphism, and smooth animations using vanilla technologies.
- **Multi-lingual**: Full support for Hindi and English.
- **Voice-First**: Integrated Speech-to-Text (Web API) and Text-to-Speech (Deepgram).

## Tech Stack

- **Backend**: Python 3.10+, FastAPI, Groq SDK
- **LLM**: Llama 3.3 70B (via Groq)
- **TTS Engine**: Deepgram Aura (Stella voice model)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Speech Recognition**: Web Speech API (Browser-native)

## System Architecture

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Client (JS)    │ <───> │  FastAPI (Py)   │ <───> │  Groq API (LLM) │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─ Web Speech (STT) ──────┴── Deepgram (TTS) ───────┘
```

## Scaling to 1000 Daily Calls

To handle 1000 calls every morning (e.g., between 9 AM and 10 AM), we would use the following design:

### Infrastructure Plan

1.  **Call Orchestrator**: A Python microservice (FastAPI) that pulls customer contacts from a CRM database.
2.  **Task Queue**: Uses **Redis + Celery** to manage call jobs.
3.  **Concurrency**: Deploy 50-100 worker containers (Docker/Kubernetes) to initiate calls simultaneously via **Twilio Programmable Voice**.
4.  **Real-time Audio**: Use **Twilio Voice Webhooks + WebSockets** to stream audio directly between the telephony layer and the AI agent logic.
5.  **Voice Processing**: 
    - **STT**: Deepgram (extremely fast streaming speech-to-text).
    - **LLM**: Llama 3.3 70B on Groq (ultra-low latency).
    - **TTS**: Deepgram Aura (high-speed, natural sounding voices).

## How to Run

1.  Clone this repository.
2.  Install requirements: `pip install -r requirements.txt`
3.  Set your API keys in your environment or a `.env` file:
    - `GROQ_API_KEY`: Your Groq API key (the "brain").
    - `DEEPGRAM_API_KEY`: Your Deepgram API key (the "voice").
4.  Run the application: `python main.py`
5.  Open `http://localhost:8000` in your browser.
