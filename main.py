import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from groq import Groq
import uvicorn
from dotenv import load_dotenv
import httpx
import io

load_dotenv()

app = FastAPI(title="Riverwood AI Voice Agent")

# Initialize Groq client
# Using the key provided earlier or environment variable
GROQ_API_KEY = os.getenv("GROQ_API_KEY") # Get from .env file
client = Groq(api_key=GROQ_API_KEY)

MODEL = "llama-3.3-70b-versatile"

# System prompts moved to backend for security and modularity
SYSTEM_PROMPTS = {
    "en": """You are Stella, a warm and professional AI voice agent representing Riverwood Projects LLP. You are calling a valued customer to provide personalized updates about Riverwood Estate.

ABOUT RIVERWOOD ESTATE:
- 25-acre plotted residential township in Sector 7, Kharkhauda, Haryana
- Approved under Deen Dayal Jan Awas Yojana (DDJAY) by the Haryana government
- Located near the upcoming IMT Kharkhauda industrial hub, anchored by Maruti Suzuki's manufacturing facility
- Plots available from 50 to 200 sq. yards at competitive prices
- Amenities: 24/7 security, landscaped parks, wide internal roads, underground water supply & electricity

CURRENT CONSTRUCTION PROGRESS:
- Boundary wall: 100% complete
- Road network: 85% complete (expected completion in 2 weeks)
- Water supply infrastructure: 70% complete
- Electricity grid: 60% complete
- Landscaping and parks: 40% complete (new saplings planted last week)
- Overall project completion: ~75%

YOUR BEHAVIOR:
- Be warm, friendly, and conversational — like a trusted advisor, NOT a salesperson
- Start by greeting the customer and introducing the purpose of your call
- Share construction progress updates enthusiastically
- Ask if they have questions or would like to visit the site
- If they mention visiting, offer to schedule a visit and share directions
- Keep responses concise (2-3 sentences max) since this is a voice call
- Use simple, clear English
- Show genuine care for the customer's investment
- If asked about pricing, mention plots start from very affordable rates and suggest connecting with the sales team for specific pricing
- Riverwood's philosophy: "Building Foundations, Creating Relationships"
- CRITICAL: Never include text in brackets like (pause) or (smiles) in your output. Only output what should be spoken.
- CRITICAL: Use clear punctuation (commas, periods, question marks) to ensure natural and expressive speech.
- CRITICAL: When scheduling a visit, you MUST always ask for both a specific day AND a specific time or time range that works for the customer.
""",

    "hi": """आप स्टेला हैं, Riverwood Projects LLP की एक गर्मजोशी भरी और पेशेवर AI वॉइस एजेंट। आप एक मूल्यवान ग्राहक को Riverwood Estate के बारे में व्यक्तिगत अपडेट देने के लिए कॉल कर रही हैं।

RIVERWOOD ESTATE के बारे में:
- सेक्टर 7, खरखौदा, हरियाणा में 25 एकड़ का प्लॉटेड रेजिडेंशियल टाउनशिप
- हरियाणा सरकार द्वारा दीन दयाल जन आवास योजना (DDJAY) के तहत अनुमोदित
- आगामी IMT खरखौदा इंडस्ट्रियल हब के पास, जहाँ मारुति सुजुकी की मैन्युफैकरणिंग सुविधा है
- 50 से 200 वर्ग गज तक प्लॉट उपलब्ध
- सुविधाएँ: 24/7 सुरक्षा, लैंडस्केप्ड पार्क, चौड़ी सड़कें, भूमिगत जल आपूर्ति और बिजली

वर्तमान निर्माण प्रगति:
- बाउंड्री वॉल: 100% पूर्ण
- सड़क नेटवर्क: 85% पूर्ण
- जल आपूर्ति: 70% पूर्ण
- बिजली ग्रिड: 60% पूर्ण
- लैंडस्केपिंग: 40% पूर्ण

आपका व्यवहार:
- गर्मजोशी भरी, दोस्ताना बातचीत करें — एक विश्वसनीय सलाहकार की तरह
- ग्राहक का अभिवादन करें और कॉल का उद्देश्य बताएं
- निर्माण प्रगति अपडेट उत्साह से साझा करें
- पूछें कि क्या वे साइट विजिट करना चाहेंगे
- जवाब हिंदी में दें, छोटे और स्पष्ट वाक्यों में (2-3 वाक्य अधिकतम)
- Riverwood का दर्शन: "नींव बनाना, रिश्ते बनाना"
- महत्वपूर्ण: कभी भी (pause) या (smiles) जैसे ब्रैकेट वाले शब्दों का उपयोग न करें।
- महत्वपूर्ण: विजिट शेड्यूल करते समय, दिन और समय स्पष्ट रूप से पूछें।
""",
}

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    language: str = "en"

class TTSRequest(BaseModel):
    text: str
    language: str = "en"

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        messages_for_api = [
            {"role": "system", "content": SYSTEM_PROMPTS.get(request.language, SYSTEM_PROMPTS["en"])}
        ]
        
        for msg in request.messages:
            messages_for_api.append({"role": msg.role, "content": msg.content})
            
        chat_completion = client.chat.completions.create(
            messages=messages_for_api,
            model=MODEL,
            temperature=0.7,
            max_tokens=300,
            top_p=0.9,
        )
        
        return {"reply": chat_completion.choices[0].message.content}
    except Exception as e:
        print(f"Chat Endpoint Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts")
async def tts_endpoint(request: TTSRequest):
    try:
        # User confirmed this is a Deepgram key
        DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY") # Get from .env file
        
        # Clean text
        import re
        clean_text = re.sub(r'[\(\[].*?[\)\]]', '', request.text).strip()
        if not clean_text:
             return {"status": "skipped", "message": "No speakable text"}

        # Using 'aura-stella-en' (English, US, Stella - Female)
        model = "aura-stella-en"
        
        url = f"https://api.deepgram.com/v1/speak?model={model}"
        headers = {
            "Authorization": f"Token {DEEPGRAM_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "text": clean_text
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload, timeout=30.0)
            
            if response.status_code != 200:
                error_detail = response.text
                try:
                    error_detail = response.json().get('err_msg', response.text)
                except:
                    pass
                print(f"Deepgram Error ({response.status_code}): {error_detail}")
                raise HTTPException(status_code=response.status_code, detail=f"Deepgram API Error: {error_detail}")
            
            from fastapi.responses import StreamingResponse
            # Deepgram returns audio/wav by default or based on container. 
            # Aura returns linear16/wav by default if not specified.
            return StreamingResponse(io.BytesIO(response.content), media_type="audio/wav")

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"TTS Endpoint Exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files (style.css, app.js)
# We assume they are in the same directory for simplicity in this prototype
# In production, move to a 'static' folder
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path in ["/", "/new_app.js", "/style.css", "/index.html"]:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
