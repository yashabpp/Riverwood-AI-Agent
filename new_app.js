/* ================================================
   Riverwood AI Voice Agent — Application Logic
   ================================================ */

// No longer needs hardcoded key or model - handled by Python backend
const API_URL = '/chat';

// ---- State ----
let currentLang = 'en';
let conversationHistory = [];
let isListening = false;
let isSpeaking = false;
let isMuted = false;
let activeAudio = null;
let recognition = null;
let recognitionTimeout = null;
let currentUtterance = null;
let isFetchingResponse = false;

// ---- DOM Elements ----
const chatMessages = document.getElementById('chatMessages');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const langToggle = document.getElementById('langToggle');
const closeDebug = document.getElementById('closeDebug');
const visualizerCanvas = document.getElementById('audioVisualizer');
const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const volumeMonitor = document.getElementById('volumeMonitor');
const volumeFill = document.getElementById('volumeFill');
const startBtn = document.getElementById('startBtn');
const startOverlay = document.getElementById('startOverlay');
const debugConsole = document.getElementById('debugConsole');
const debugLogs = document.getElementById('debugLogs');
let audioCtx = null;
let analyser = null;
let visualizerId = null;
let stream = null;

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    setupEventListeners();
    setupSpeechRecognition();
    debugLog('App Initialized' + (isChrome() ? '' : ' - Warning: Non-Chrome browser detected'), 'info');
});

function isChrome() {
    return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
}

function debugLog(msg, type = 'info') {
    console[type === 'info' ? 'log' : type](msg);
    if (!debugLogs) return;
    // debugConsole.classList.remove('hidden'); // REMOVED: No longer popup automatically
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.appendChild(time);
    const text = document.createElement('span');
    text.textContent = msg;
    entry.appendChild(text);
    debugLogs.appendChild(entry);
    debugLogs.scrollTop = debugLogs.scrollHeight;
}

// ---- Background Particles ----
function createParticles() {
    const container = document.getElementById('bgParticles');
    const colors = ['rgba(52,211,153,0.15)', 'rgba(251,191,36,0.1)', 'rgba(99,102,241,0.08)'];
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 6 + 2;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 15 + 10) + 's';
        p.style.animationDelay = (Math.random() * 10) + 's';
        container.appendChild(p);
    }
}

// ---- Event Listeners ----
function setupEventListeners() {
    sendBtn.addEventListener('click', handleSendText);
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    });

    micBtn.addEventListener('click', toggleListening);

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        muteBtn.classList.toggle('muted', isMuted);
        muteIcon.innerHTML = isMuted 
            ? '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>'
            : '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
        
        if (activeAudio) {
            activeAudio.muted = isMuted;
        }
    });

    // Language toggle
    langToggle.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newLang = btn.dataset.lang;
            if (newLang === currentLang) return;
            currentLang = newLang;
            langToggle.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            textInput.placeholder = currentLang === 'hi' ? 'अपना संदेश लिखें...' : 'Type your message...';
            micLabel.textContent = currentLang === 'hi' ? 'बोलें' : 'Tap to Speak';
            // Reset conversation for the new language
            conversationHistory = [];
            chatMessages.innerHTML = '';
            setTimeout(() => startAgentGreeting(), 600);
        });
    });

    // Start Call Overlay Handle
    startBtn.addEventListener('click', () => {
        startOverlay.classList.add('hidden');
        // Trigger greeting once user has interacted
        setTimeout(() => startAgentGreeting(), 400);
    });

    closeDebug.addEventListener('click', () => {
        debugConsole.classList.add('hidden');
    });
}

// ---- Speech Recognition ----
function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported in this browser.');
        micBtn.style.display = 'none';
        return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true; // Show results as they come

    recognition.onstart = () => {
        debugLog('Microphone is ACTIVE - Speak now', 'info');
    };

    recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        
        // Clear any existing timeout since we got new data
        if (recognitionTimeout) clearTimeout(recognitionTimeout);

        if (result.isFinal) {
            debugLog('Final transcript: ' + transcript, 'info');
            handleFinalSpeech(transcript);
        } else {
            // Interim results - update mic label
            micLabel.textContent = transcript.substring(0, 15) + '...';
            
            // FALLBACK: If we have an interim result but no final result for 500ms, 
            // process it anyway. This helps with short words like "YES".
            recognitionTimeout = setTimeout(() => {
                debugLog('Fallback processing (snappy): ' + transcript, 'info');
                handleFinalSpeech(transcript);
                stopListening(); // Force stop recognition
            }, 500);
        }
    };

    recognition.onerror = (event) => {
        debugLog('Speech error: ' + event.error, 'error');
        
        let tip = '';
        if (event.error === 'no-speech') {
            const noSpeechMsg = currentLang === 'hi' 
                ? 'क्षमा करें, मैं कुछ सुन नहीं पाई। कृपया अपना संदेश टाइप करें।' 
                : 'Sorry, I couldn\'t hear anything. Please type your message.';
            addMessage('agent', noSpeechMsg);
        } else if (event.error === 'not-allowed') {
            tip = 'Microphone access denied. Please click the lock icon in the address bar and allow the microphone.';
            alert(tip);
        } else if (event.error === 'audio-capture') {
            tip = 'No microphone found or mic is being used by another app.';
        }

        if (tip) {
            debugLog('Tip: ' + tip, 'warn');
            micLabel.textContent = tip.substring(0, 25) + '...';
        } else if (event.error !== 'no-speech') {
            micLabel.textContent = 'Error: ' + event.error;
        }
        
        stopListening();
    };

    recognition.onend = () => {
        stopListening();
    };
}

// ---- Process Captured Speech ----
function handleFinalSpeech(transcript) {
    if (recognitionTimeout) clearTimeout(recognitionTimeout);
    
    const normalized = transcript.trim().toLowerCase().replace(/[.,!?;]$/, "");
    if (!normalized) return;
    
    // Prevent double-processing within a short window (1s)
    const now = Date.now();
    if (window.lastProcessedSpeech === normalized && (now - (window.lastProcessedTime || 0)) < 1500) {
        debugLog('Ignoring duplicate speech: ' + transcript, 'warn');
        return;
    }
    
    window.lastProcessedSpeech = normalized;
    window.lastProcessedTime = now;

    debugLog('Confirming speech: ' + transcript, 'info');
    addMessage('user', transcript);
    getAgentResponse(transcript);
}

function toggleListening() {
    if (isSpeaking) {
        // Stop TTS if speaking
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (activeAudio) {
            activeAudio.pause();
            activeAudio = null;
        }
        isSpeaking = false;
        micBtn.classList.remove('speaking');
        debugLog('Interrupted Priya speaking', 'info');
    }

    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

function startListening() {
    if (!recognition) return;
    isListening = true;
    micBtn.classList.add('listening');
    micLabel.textContent = currentLang === 'hi' ? 'सुन रहे हैं...' : 'Listening...';
    recognition.lang = currentLang === 'hi' ? 'hi-IN' : 'en-IN';
    try {
        recognition.start();
        startVisualizer();
    } catch (e) {
        // Already started
        stopListening();
    }
}

function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    micLabel.textContent = currentLang === 'hi' ? 'बोलें' : 'Tap to Speak';
    try {
        recognition.stop();
        stopVisualizer();
    } catch (e) { /* ignore */ }
}

async function startVisualizer() {
    if (!visualizerCanvas) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const ctx = visualizerCanvas.getContext('2d');
        
        const draw = () => {
            if (!isListening) return;
            visualizerId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            // Calculate peak volume for the monitor bar
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const volumePercent = Math.min(100, (average / 128) * 100);
            if (volumeFill) volumeFill.style.width = volumePercent + '%';
            if (volumeMonitor) volumeMonitor.classList.add('active');

            ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
            
            // Draw circle visualization
            const centerX = visualizerCanvas.width / 2;
            const centerY = visualizerCanvas.height / 2;
            const radius = 25;
            
            ctx.beginPath();
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                const angle = (i * 2 * Math.PI) / bufferLength;
                const x = centerX + Math.cos(angle) * (radius + barHeight / 4);
                const y = centerY + Math.sin(angle) * (radius + barHeight / 4);
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            
            ctx.closePath();
            ctx.stroke();
        };
        
        draw();
        debugLog('Audio Visualizer started', 'info');
    } catch (err) {
        debugLog('Visualizer error: ' + err.message, 'error');
    }
}

function stopVisualizer() {
    if (visualizerId) cancelAnimationFrame(visualizerId);
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (visualizerCanvas) {
        const ctx = visualizerCanvas.getContext('2d');
        ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    }
    if (volumeMonitor) volumeMonitor.classList.remove('active');
    if (volumeFill) volumeFill.style.width = '0%';
}

function stopAllSpeech() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio = null;
    }
    isSpeaking = false;
    micBtn.classList.remove('speaking');
}

// ---- Text-to-Speech ----
function speakText(text) {
    // Stop any current speaking before starting new one
    stopAllSpeech();

    if (isMuted) {
        debugLog('Speaking skipped (muted)', 'info');
        return Promise.resolve();
    }
    
    // Client-side filter: Remove text in brackets/parentheses
    const cleanText = text.replace(/[\(\[].*?[\)\]]/g, '').trim();
    if (!cleanText) return Promise.resolve();

    return new Promise(async (resolve) => {
        const fallbackSpeak = (txt) => {
            debugLog('Using Browser Native TTS Fallback', 'warn');
            if (!window.speechSynthesis) {
                console.error("Browser does not support SpeechSynthesis");
                resolve();
                return;
            }

            // Cancel any ongoing speech
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(txt);
            // Default to Indian English or English if Hindi voice is missing
            utterance.lang = currentLang === 'hi' ? 'hi-IN' : 'en-IN';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            utterance.onstart = () => {
                isSpeaking = true;
                micBtn.classList.add('speaking');
                micLabel.textContent = currentLang === 'hi' ? 'बोल रहे हैं...' : 'Speaking...';
            };

            utterance.onend = () => {
                isSpeaking = false;
                micBtn.classList.remove('speaking');
                micLabel.textContent = currentLang === 'hi' ? 'बोलें' : 'Tap to Speak';
                debugLog('Fallback speech finished', 'info');
                
                // Auto-resume listening
                setTimeout(() => {
                    if (!isSpeaking && !isListening) startListening();
                }, 600);
                resolve();
            };

            utterance.onerror = (err) => {
                console.error('SpeechSynthesis Error:', err);
                isSpeaking = false;
                micBtn.classList.remove('speaking');
                micLabel.textContent = currentLang === 'hi' ? 'बोलें' : 'Tap to Speak';
                resolve();
            };

            window.speechSynthesis.speak(utterance);
        };

        try {
            // Important: Resume AudioContext for ElevenLabs playback
            if (audioCtx && audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            isSpeaking = true;
            micBtn.classList.add('speaking');
            micLabel.textContent = currentLang === 'hi' ? 'बोल रहे हैं...' : 'Speaking...';
            
            debugLog('Requesting ElevenLabs TTS...', 'info');

            // Call our TTS endpoint with a timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // Increased to 8s for Multilingual v2

            const response = await fetch('/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: cleanText,
                    language: currentLang
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({detail: response.statusText}));
                throw new Error(`TTS server error: ${response.status} - ${errData.detail}`);
            }

            const audioBlob = await response.blob();
            if (audioBlob.type.indexOf('audio') === -1) {
                throw new Error("Response was not an audio file");
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            activeAudio = new Audio(audioUrl);
            activeAudio.playbackRate = 0.95; // Slightly slower feels more natural than 0.85
            activeAudio.muted = isMuted;

            activeAudio.onended = () => {
                isSpeaking = false;
                activeAudio = null;
                micBtn.classList.remove('speaking');
                micLabel.textContent = currentLang === 'hi' ? 'बोलें' : 'Tap to Speak';
                URL.revokeObjectURL(audioUrl);
                debugLog('ElevenLabs speech finished', 'info');
                
                setTimeout(() => {
                    if (!isSpeaking && !isListening) startListening();
                }, 600); 
                
                resolve();
            };

            activeAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                URL.revokeObjectURL(audioUrl);
                fallbackSpeak(cleanText);
            };

            await activeAudio.play();
        } catch (error) {
            debugLog('TTS Error: ' + error.message, 'error');
            fallbackSpeak(cleanText);
        }
    });
}

// ---- Chat UI ----
function addMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'agent' ? '🏡' : '👤';

    const content = document.createElement('div');
    content.className = 'msg-content';

    const textNode = document.createElement('span');
    textNode.textContent = text;
    content.appendChild(textNode);

    const time = document.createElement('span');
    time.className = 'msg-time';
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    content.appendChild(time);

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(content);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-msg agent';
    typingDiv.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = '🏡';

    const content = document.createElement('div');
    content.className = 'msg-content typing-indicator';
    content.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

    typingDiv.appendChild(avatar);
    typingDiv.appendChild(content);
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

// ---- Text Input Handler ----
function handleSendText() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    addMessage('user', text);
    getAgentResponse(text);
}

// ---- Agent Greeting ----
async function startAgentGreeting() {
    const greeting = currentLang === 'hi'
        ? 'नमस्ते! मैं स्टेला हूँ, Riverwood Projects से बोल रही हूँ। कैसे हैं आप? मैं आपको Riverwood Estate के निर्माण प्रगति के बारे में अपडेट देने के लिए कॉल कर रही हूँ।'
        : 'Hello! This is Stella from Riverwood Projects. How are you today? I\'m calling to share some exciting construction progress updates about Riverwood Estate!';

    // Add to conversation history
    conversationHistory.push({
        role: 'assistant',
        content: greeting
    });

    addMessage('agent', greeting);
    speakText(greeting);
}

// ---- Python API Backend Call ----
async function getAgentResponse(userMessage) {
    if (isFetchingResponse) {
        debugLog('Duplicate request ignored (already fetching)', 'warn');
        return;
    }
    isFetchingResponse = true;

    // Add user message to conversation history
    conversationHistory.push({
        role: 'user',
        content: userMessage
    });

    showTypingIndicator();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: conversationHistory,
                language: currentLang
            })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        const agentReply = data.reply;

        // Start fetching and speaking IMMEDIATELY
        const ttsPromise = speakText(agentReply);

        // Add to conversation history
        conversationHistory.push({
            role: 'assistant',
            content: agentReply
        });

        removeTypingIndicator();
        addMessage('agent', agentReply);
    } catch (error) {
        console.error('Error calling backend:', error);
        removeTypingIndicator();

        const errorMsg = currentLang === 'hi'
            ? 'क्षमा करें, सर्वर से जुड़ने में समस्या हुई। कृपया फिर से कोशिश करें।'
            : 'I apologize, I\'m having a brief connection issue with my brain. Could you please try again?';

        addMessage('agent', errorMsg);
    } finally {
        isFetchingResponse = false;
    }
}

// ---- Load voices on page load (Chrome needs this) ----
if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}
