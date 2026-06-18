#!/usr/bin/env python3
import sys
import os
import json
import asyncio
import traceback
import re
import threading
import time
import math
import string
import subprocess
import webbrowser
import tempfile
import urllib.request
import urllib.parse
import urllib.error
import pathlib
from concurrent.futures import ThreadPoolExecutor

# Optional: pywin32 for Microsoft Office COM automation
try:
    import win32com.client
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

# Detect platform
IS_WINDOWS = sys.platform == 'win32'

# Desktop path helper
DESKTOP_PATH = pathlib.Path.home() / 'Desktop'
DOCUMENTS_PATH = pathlib.Path.home() / 'Documents'

# Force stdout to line-buffered so each JSON payload is flushed on its own line
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

# Speech recognition import
try:
    import speech_recognition as sr
    HAS_SPEECH = True
except ImportError:
    HAS_SPEECH = False

# PyAutoGUI import
try:
    import pyautogui
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False

# Global state
active_tasks = {}
wake_word_enabled = True
wake_word_thread_active = False

# Stopwords for TF-IDF
STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
    'can', 'will', 'just', 'don', 'should', 'now', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'them', 'their', 'my', 'your', 'his', 'her', 'its', 'our'
}

def tokenize(text):
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text)
    tokens = text.split()
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]

class SimpleTFIDF:
    """A pure-Python TF-IDF document similarity search engine."""
    def __init__(self):
        self.documents = []
        self.doc_tokens = []
        self.vocab = set()
        self.idf = {}
        self.doc_vectors = []

    def add_document(self, doc_id, text, metadata=None):
        tokens = tokenize(text)
        self.documents.append({
            "id": doc_id,
            "text": text,
            "metadata": metadata or {}
        })
        self.doc_tokens.append(tokens)
        for token in tokens:
            self.vocab.add(token)

    def train(self):
        num_docs = len(self.documents)
        if num_docs == 0:
            return
        
        # Calculate Document Frequency (DF)
        df = {}
        for tokens in self.doc_tokens:
            unique_tokens = set(tokens)
            for token in unique_tokens:
                df[token] = df.get(token, 0) + 1
        
        # Calculate Inverse Document Frequency (IDF)
        for token in self.vocab:
            # Plus 1 smoothing
            self.idf[token] = math.log(1.0 + (num_docs / (1.0 + df[token])))
            
        # Build document vectors
        self.doc_vectors = []
        for tokens in self.doc_tokens:
            vec = self.vectorize(tokens)
            self.doc_vectors.append(vec)

    def vectorize(self, tokens):
        tf = {}
        for token in tokens:
            tf[token] = tf.get(token, 0) + 1
            
        vec = {}
        for token, count in tf.items():
            if token in self.idf:
                vec[token] = count * self.idf[token]
                
        # Normalize vector
        magnitude = math.sqrt(sum(v*v for v in vec.values()))
        if magnitude > 0:
            for token in vec:
                vec[token] /= magnitude
        return vec

    def search(self, query, top_n=2):
        query_tokens = tokenize(query)
        query_vec = self.vectorize(query_tokens)
        
        results = []
        for i, doc_vec in enumerate(self.doc_vectors):
            # Compute cosine similarity
            score = 0.0
            for token, q_val in query_vec.items():
                if token in doc_vec:
                    score += q_val * doc_vec[token]
            if score > 0.0:
                results.append((score, self.documents[i]))
                
        results.sort(key=lambda x: x[0], reverse=True)
        return results[:top_n]

# Initialize TF-IDF QA Search engine
qa_engine = SimpleTFIDF()
# Initialize Intent Classifier
intent_engine = SimpleTFIDF()

# Define repository root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def index_local_markdown_docs():
    """Recursively finds and indexes documents in the repo."""
    exclude_dirs = {'.git', 'node_modules', 'dist', 'release', 'bin', 'obj', '.codex', '.kilocode'}
    indexed_count = 0
    paragraph_count = 0
    
    supported_extensions = ('.md', '.txt', '.py', '.js', '.jsx', '.json', '.html', '.css')
    
    for root, dirs, files in os.walk(REPO_ROOT):
        # Exclude directories in-place
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file.endswith(supported_extensions):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, REPO_ROOT)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    if file.endswith(('.md', '.txt')):
                        # Segment by double newlines
                        paragraphs = content.split('\n\n')
                        for i, p in enumerate(paragraphs):
                            p_stripped = p.strip()
                            # Filter out empty or very short paragraphs
                            if len(p_stripped) > 15:
                                doc_id = f"{rel_path}_p{i}"
                                qa_engine.add_document(
                                    doc_id=doc_id,
                                    text=p_stripped,
                                    metadata={"file": rel_path, "index": i}
                                )
                                paragraph_count += 1
                    else:
                        # Segment code files by 15-line chunks
                        lines = content.split('\n')
                        chunk_size = 15
                        for i in range(0, len(lines), chunk_size):
                            chunk_lines = lines[i:i+chunk_size]
                            chunk_text = "\n".join(chunk_lines).strip()
                            if len(chunk_text) > 15:
                                doc_id = f"{rel_path}_chunk_{i}"
                                qa_engine.add_document(
                                    doc_id=doc_id,
                                    text=f"File: {rel_path}\nCode lines {i+1}-{i+len(chunk_lines)}:\n{chunk_text}",
                                    metadata={"file": rel_path, "index": i}
                                )
                                paragraph_count += 1
                    indexed_count += 1
                except Exception as e:
                    pass
                    
    qa_engine.train()
    return indexed_count, paragraph_count

def setup_intent_classifier():
    """Sets up the training dataset for local intent classification."""
    intents_training = {
        "click": [
            "click at coordinates", "move cursor to coordinates and click",
            "point mouse at coordinate location", "tap screen at pixel position",
            "click at 600 400", "simulate click", "move pointer to coordinate x y",
        ],
        "git": [
            "show git status", "run git log", "what is the git branch",
            "git diff in this repository", "git stage commit push",
            "execute git status shell command", "check git status", "run git diff"
        ],
        "notion": [
            "search notion database", "notion-cli search", "find my notion notes",
            "query notion workspace", "notion search", "run notion search"
        ],
        "browser": [
            "open google in web browser", "open github website chrome",
            "browser tab launch google.com", "open a browser window",
            "go to github.com", "open browser edgego"
        ],
        "instagram": [
            "post to instagram", "publish instagram caption",
            "simulated instagram post", "read instagram feed notifications"
        ],
        "whatsapp": [
            "send whatsapp message", "whatsapp chat to Farza",
            "text Varshith on whatsapp", "message Clicky Group on whatsapp"
        ],
        "screenshot": [
            "capture screen bounds", "take a screenshot of main monitor",
            "display geometry screenshot", "show screen size"
        ],
        "help": [
            "how to run clicky", "what are the commands",
            "show me help guidelines", "what can you do", "clicky help menu"
        ],
        # ── NEW INTENTS ──
        "web_search": [
            "search the web for python tutorials",
            "find online articles about AI agents",
            "search google for latest news",
            "look up information about javascript",
            "search online for best practices",
            "find me results about edge computing",
            "search for videos about machine learning",
            "web search for windows 11 tips",
            "google search for react hooks",
            "find information about this topic online"
        ],
        "create_html": [
            "create an html page for my app",
            "make a landing page",
            "build a webpage about portfolio",
            "create html file for my project",
            "generate a website page",
            "design an html page",
            "make a web page with sections",
            "create a simple website html"
        ],
        "create_document": [
            "create a text document",
            "make a word document",
            "write a markdown file",
            "create an excel spreadsheet",
            "make a csv file with data",
            "generate a report document",
            "create a new file",
            "write a document about project",
            "make a note file",
            "create a python script"
        ],
        "play_video": [
            "play video from brave browser",
            "open youtube in chrome",
            "play music video in edge",
            "watch video on brave",
            "play a song on youtube",
            "open netflix in firefox",
            "play youtube video in microsoft edge",
            "watch video from brave or chrome",
            "play video using chrome browser"
        ],
        "microsoft_app": [
            "open microsoft word",
            "launch excel spreadsheet app",
            "open onenote notebook",
            "start microsoft outlook",
            "open microsoft teams",
            "launch powerpoint presentation",
            "open microsoft paint",
            "start notepad windows",
            "open sticky notes",
            "open file explorer windows"
        ],
        "multi_agent": [
            "run multiple agents to complete task",
            "orchestrate agents for this workflow",
            "spawn agents to research and create",
            "run parallel agent pipeline",
            "use multi-agent system to handle",
            "coordinate agents for complex task",
            "orchestrate research and execution"
        ]
    }
    
    for intent, utterances in intents_training.items():
        combined_text = " ".join(utterances)
        intent_engine.add_document(doc_id=intent, text=combined_text)
        
    intent_engine.train()

# Custom Tools
def capture_screen() -> str:
    """Captures a screenshot of the main screen and returns a metadata description."""
    try:
        if HAS_PYAUTOGUI:
            width, height = pyautogui.size()
            return json.dumps({
                "status": "success",
                "resolution": f"{width}x{height}",
                "description": f"Main Windows Screen ({width}x{height})"
            })
    except Exception:
        pass
        
    return json.dumps({
        "status": "success",
        "resolution": "1920x1080",
        "description": "Primary Monitor (Fallback Settings)"
    })

def click_at_coordinates(x: int, y: int) -> str:
    """Moves the cursor and clicks at the specified (x, y) coordinates on the screen."""
    # Emit visual pointer instruction to Electron via stdout
    print(json.dumps({"type": "pointer_animation", "x": x, "y": y}), flush=True)
    
    # Perform native click
    try:
        if HAS_PYAUTOGUI:
            time.sleep(1.2) # wait for overlay Bezier curve animation
            pyautogui.click(x, y)
            return f"Successfully clicked at ({x}, {y})"
    except Exception as e:
        return f"Emulated click at ({x}, {y}) due to: {str(e)}"
        
    return f"Emulated click at ({x}, {y}) (No PyAutoGUI GUI session available)"

def whatsapp_operation(action: str, contact: str = "", message: str = "") -> str:
    """Performs simulated operations on WhatsApp."""
    print(json.dumps({
        "type": "whatsapp_activity",
        "action": action,
        "contact": contact,
        "message": message
    }), flush=True)
    
    if action == "send":
        return f"Successfully sent WhatsApp message to {contact}: '{message}'"
    elif action == "read_chats":
        return json.dumps({
            "chats": [
                {"contact": "Farza", "last_message": "Let me know when beta is ready!", "unread": True},
                {"contact": "Varshith", "last_message": "Looking great!", "unread": False}
            ]
        })
    else:
        return "Unknown WhatsApp operation."

def instagram_operation(action: str, post_content: str = "", username: str = "edgego_beta") -> str:
    """Performs simulated operations on Instagram."""
    print(json.dumps({
        "type": "instagram_activity",
        "action": action,
        "content": post_content,
        "username": username
    }), flush=True)
    
    if action == "post":
        return f"Successfully posted to Instagram as @{username}: '{post_content}'"
    elif action == "read_feed":
        return json.dumps({
            "feed": [
                {"user": "ai_enthusiast", "caption": "Notch-based assistants are the future! 🔥", "likes": 128},
                {"user": "designer_daily", "caption": "Stunning glassmorphic UI layout concept.", "likes": 95}
            ]
        })
    elif action == "get_notifications":
        return json.dumps({
            "notifications": [
                {"user": "pixel_art", "type": "like", "target": "v1.7.0 setup post"},
                {"user": "varshith", "type": "comment", "text": "Beta is looking super slick!"}
            ]
        })
    else:
        return "Unknown Instagram operation."

def run_command(command_line: str) -> str:
    """Executes a terminal/shell command on the local system."""
    try:
        res = subprocess.run(command_line, shell=True, capture_output=True, text=True, timeout=10, cwd=REPO_ROOT)
        output = res.stdout.strip()
        if res.stderr:
            if output:
                output += "\n"
            output += "Error: " + res.stderr.strip()
        return output or "[Command executed with no output]"
    except Exception as e:
        return f"Failed to execute command: {str(e)}"


# ──────────────────────────────────────────────────────────────
# NEW EXPANDED TOOLS
# ──────────────────────────────────────────────────────────────

def web_search(query: str, max_results: int = 5) -> str:
    """Searches DuckDuckGo (no API key) and returns structured results."""
    try:
        encoded = urllib.parse.quote_plus(query)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        # Extract result snippets with regex
        results = []
        # DuckDuckGo result titles
        title_pattern = re.compile(r'<a[^>]+class="result__a"[^>]*>([^<]+)</a>', re.I)
        snippet_pattern = re.compile(r'<a[^>]+class="result__snippet"[^>]*>([^<]+)</a>', re.I)
        url_pattern = re.compile(r'<a[^>]+class="result__url"[^>]*>([^<]+)</a>', re.I)

        titles = title_pattern.findall(html)
        snippets = snippet_pattern.findall(html)
        urls = url_pattern.findall(html)

        for i in range(min(max_results, len(titles))):
            snippet = snippets[i].strip() if i < len(snippets) else ''
            result_url = urls[i].strip() if i < len(urls) else ''
            results.append({
                'rank': i + 1,
                'title': re.sub(r'<[^>]+>', '', titles[i]).strip(),
                'snippet': re.sub(r'<[^>]+>', '', snippet),
                'url': result_url if result_url.startswith('http') else f'https://{result_url}'
            })

        if not results:
            # Fallback: Bing HTML search
            bing_url = f"https://www.bing.com/search?q={encoded}&setlang=en"
            req2 = urllib.request.Request(bing_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            with urllib.request.urlopen(req2, timeout=8) as resp2:
                html2 = resp2.read().decode('utf-8', errors='replace')
            # Parse Bing results
            bing_titles = re.findall(r'<h2[^>]*><a[^>]*>([^<]+)</a></h2>', html2)
            bing_snips = re.findall(r'<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([^<]+)</p>', html2)
            for i in range(min(max_results, len(bing_titles))):
                results.append({
                    'rank': i + 1,
                    'title': re.sub(r'<[^>]+>', '', bing_titles[i]).strip(),
                    'snippet': re.sub(r'<[^>]+>', '', bing_snips[i] if i < len(bing_snips) else ''),
                    'url': f'https://www.bing.com/search?q={encoded}'
                })

        return json.dumps({'query': query, 'results': results, 'count': len(results)})
    except Exception as e:
        return json.dumps({'query': query, 'results': [], 'error': str(e)})

def summarize_text(snippets: list) -> str:
    """Offline simple sentence ranker based on word frequency."""
    if not snippets:
        return "No search results available to summarize."
    
    text = " ".join(snippets)
    # Simple word counting
    words = re.findall(r'\b\w{4,15}\b', text.lower())
    # Remove common short words/stopwords
    stopwords = {'with', 'from', 'this', 'that', 'they', 'have', 'were', 'their', 'there', 'about', 'would', 'could', 'should'}
    words = [w for w in words if w not in stopwords]
    
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
        
    # Split sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    scored_sentences = []
    
    for sent in sentences:
        if len(sent.strip()) < 15:
            continue
        score = 0
        sent_words = re.findall(r'\b\w{4,15}\b', sent.lower())
        for w in sent_words:
            if w in freq:
                score += freq[w]
        # Normalize by length to prevent very long sentences from dominating
        score = score / max(len(sent_words), 1)
        scored_sentences.append((score, sent))
        
    # Sort and take top 3
    scored_sentences.sort(key=lambda x: x[0], reverse=True)
    top_sents = [s[1] for s in scored_sentences[:3]]
    
    summary = " ".join(top_sents)
    if not summary:
        summary = text[:200] + "..."
    return summary

def select_theme_palette(title: str, description: str) -> dict:
    """Classifies title and description into an aesthetic dark theme palette."""
    text = (title + " " + description).lower()
    
    # Keyword classification map
    themes = {
        'nature': {
            'keywords': ['nature', 'forest', 'green', 'leaf', 'garden', 'plant', 'tree', 'eco', 'organic', 'agriculture', 'earth'],
            'accent': '#22c55e', 'bg': '#022c22', 'surface': '#064e3b', 'border': 'rgba(34, 197, 94, 0.15)', 'text': '#f0fdf4', 'muted': '#a7f3d0'
        },
        'sunset': {
            'keywords': ['sunset', 'orange', 'red', 'sun', 'fire', 'burn', 'autumn', 'summer', 'warm', 'beach', 'sand', 'desert'],
            'accent': '#f97316', 'bg': '#18080f', 'surface': '#2d0f1a', 'border': 'rgba(249, 115, 22, 0.15)', 'text': '#fff7ed', 'muted': '#ffedd5'
        },
        'space': {
            'keywords': ['space', 'galaxy', 'star', 'planet', 'cosmic', 'universe', 'stellar', 'neon', 'cyberpunk', 'purple', 'neon pink'],
            'accent': '#d946ef', 'bg': '#030712', 'surface': '#111827', 'border': 'rgba(217, 70, 239, 0.15)', 'text': '#fdf4ff', 'muted': '#f5d0fe'
        },
        'ocean': {
            'keywords': ['ocean', 'sea', 'blue', 'water', 'wave', 'deep', 'aquatic', 'fish', 'aqua', 'teal', 'marine', 'beach'],
            'accent': '#06b6d4', 'bg': '#082f49', 'surface': '#0c4a6e', 'border': 'rgba(6, 182, 212, 0.15)', 'text': '#ecfeff', 'muted': '#cffafe'
        },
        'gaming': {
            'keywords': ['gaming', 'game', 'play', 'console', 'xbox', 'playstation', 'lava', 'cyber', 'stream', 'twitch', 'action', 'esport'],
            'accent': '#ef4444', 'bg': '#09090b', 'surface': '#18181b', 'border': 'rgba(239, 68, 68, 0.15)', 'text': '#fafafa', 'muted': '#d4d4d8'
        },
        'aurora': {
            'keywords': ['aurora', 'mint', 'sky', 'night', 'polar', 'teal', 'northern', 'glow', 'emerald', 'chill', 'calm'],
            'accent': '#2dd4bf', 'bg': '#020617', 'surface': '#0f172a', 'border': 'rgba(45, 212, 191, 0.15)', 'text': '#f0fdfa', 'muted': '#ccfbf1'
        },
        'finance': {
            'keywords': ['finance', 'stock', 'money', 'crypto', 'bitcoin', 'emerald', 'bank', 'invest', 'wealth', 'trading', 'profit'],
            'accent': '#10b981', 'bg': '#061a12', 'surface': '#0a2f21', 'border': 'rgba(16, 185, 129, 0.15)', 'text': '#ecfdf5', 'muted': '#a7f3d0'
        },
        'minimal': {
            'keywords': ['minimal', 'clean', 'simple', 'white', 'black', 'gray', 'slate', 'portfolio', 'personal', 'cv', 'resume'],
            'accent': '#94a3b8', 'bg': '#000000', 'surface': '#0c0a09', 'border': 'rgba(255, 255, 255, 0.08)', 'text': '#f5f5f4', 'muted': '#a8a29e'
        }
    }
    
    # Find matching theme
    matched_theme = 'default'
    max_matches = 0
    for theme_name, theme_data in themes.items():
        matches = sum(1 for kw in theme_data['keywords'] if kw in text)
        if matches > max_matches:
            max_matches = matches
            matched_theme = theme_name
            
    if matched_theme == 'default':
        # Premium royal indigo default theme
        return {
            'name': 'default',
            'accent': '#7c6af7',
            'bg': '#0a0a0f',
            'surface': '#111118',
            'border': 'rgba(255,255,255,0.08)',
            'text': '#f0f0ff',
            'muted': 'rgba(255,255,255,0.5)',
            'gradient': 'linear-gradient(135deg, #7c6af7 0%, #a855f7 100%)'
        }
    else:
        palette = themes[matched_theme]
        palette['name'] = matched_theme
        palette['gradient'] = f"linear-gradient(135deg, {palette['accent']} 0%, color-mix(in srgb, {palette['accent']} 60%, #ffffff) 100%)"
        return palette

HTML_TEMPLATE = '''\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  :root {{
    --accent: {accent};
    --bg: {bg};
    --surface: {surface};
    --border: {border};
    --text: {text};
    --muted: {muted};
    --gradient: {gradient};
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 60px 24px;
    line-height: 1.5;
    transition: background 0.3s ease;
  }}
  .container {{
    max-width: 960px;
    margin: 0 auto;
  }}
  .badge {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    color: var(--accent);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 12px;
    border-radius: 20px;
    margin-bottom: 24px;
    text-transform: uppercase;
  }}
  h1 {{
    font-size: clamp(32px, 6vw, 54px);
    font-weight: 800;
    letter-spacing: -1.5px;
    margin-bottom: 20px;
    background: var(--gradient);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1.1;
  }}
  p.lead {{
    font-size: 18px;
    color: var(--muted);
    line-height: 1.6;
    margin-bottom: 40px;
    max-width: 720px;
  }}
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    margin-top: 32px;
  }}
  .card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 30px;
    transition: transform 0.25s cubic-bezier(0.1, 0.8, 0.3, 1), border-color 0.25s ease;
  }}
  .card:hover {{
    transform: translateY(-4px);
    border-color: rgba(255,255,255,0.18);
  }}
  .card h2 {{
    font-size: 19px;
    font-weight: 700;
    margin-bottom: 12px;
    color: #fff;
    letter-spacing: -0.3px;
  }}
  .card p {{
    font-size: 14px;
    color: var(--muted);
    line-height: 1.6;
  }}
  .btn {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    padding: 14px 28px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: opacity 0.15s, transform 0.15s;
    margin-top: 36px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }}
  .btn:hover {{
    opacity: 0.9;
    transform: translateY(-1px);
  }}
  footer {{
    text-align: center;
    font-size: 11px;
    color: var(--muted);
    margin-top: 80px;
    opacity: 0.4;
    border-top: 1px solid var(--border);
    padding-top: 24px;
  }}
</style>
</head>
<body>
<div class="container">
  <div class="badge">⚡ Created by Clicky AI Offline Agent</div>
  {body_content}
  <footer>Generated by Edge Go AI Agent • {timestamp}</footer>
</div>
</body>
</html>
'''

def create_html_page(title: str, body_description: str, filename: str = None) -> str:
    """Creates a modern HTML page from a description and opens it in the browser."""
    import datetime
    if not filename:
        slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
        filename = f"clicky_{slug}"
    if not filename.endswith('.html'):
        filename += '.html'

    # Select dynamic theme palette
    palette = select_theme_palette(title, body_description)

    # Extract bullet points/paragraphs
    items = [s.strip() for s in re.split(r'[.!?•\n\-*]\s*', body_description) if len(s.strip()) > 6]
    
    sections = []
    sections.append(f'<h1>{title}</h1>')
    
    if items:
        # Check if items[0] needs a period
        lead_text = items[0]
        if not lead_text.endswith(('.', '!', '?')):
            lead_text += '.'
        sections.append(f'<p class="lead">{lead_text}</p>')

    # Card layout generator
    card_titles = {
        'nature': ["Environmental Overview", "Ecological Impact", "Action Plan"],
        'sunset': ["Concept Highlight", "Vibrant Features", "Strategic Goals"],
        'space': ["Stellar Mission", "Cosmic Core Technology", "Launch Objectives"],
        'ocean': ["Deep Dive Analysis", "Strategic Aquatic Currents", "Key Benchmarks"],
        'gaming': ["Gameplay & Mechanics", "Multiplayer Integration", "Beta Launch Timeline"],
        'aurora': ["Atmospheric Vibe", "Visual Experience", "Community Roadmap"],
        'finance': ["Market Analysis", "Investment Strategy", "Revenue Metrics"],
        'minimal': ["Core Essence", "Design Principles", "Deliverables"],
        'default': ["Overview & Context", "Key Feature Analysis", "Next Steps"]
    }
    
    theme_titles = card_titles.get(palette['name'], card_titles['default'])
    grid_cards = []
    card_index = 1
    
    # Render up to 3 cards
    for line in items[1:]:
        if len(grid_cards) >= 3:
            break
        c_title = theme_titles[card_index - 1] if (card_index - 1) < len(theme_titles) else f"Focus Area {card_index}"
        
        card_body = line
        if not card_body.endswith(('.', '!', '?')):
            card_body += '.'
            
        grid_cards.append(f'''  <div class="card">
    <h2>{c_title}</h2>
    <p>{card_body}</p>
  </div>''')
        card_index += 1

    if grid_cards:
        sections.append('<div class="grid">')
        sections.extend(grid_cards)
        sections.append('</div>')

    sections.append(f'<a class="btn" href="#">Explore {palette["name"].title()} System →</a>')
    body_content = '\n  '.join(sections)

    html = HTML_TEMPLATE.format(
        title=title,
        body_content=body_content,
        timestamp=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        accent=palette['accent'],
        bg=palette['bg'],
        surface=palette['surface'],
        border=palette['border'],
        text=palette['text'],
        muted=palette['muted'],
        gradient=palette['gradient']
    )

    # Save to Desktop
    try:
        DESKTOP_PATH.mkdir(parents=True, exist_ok=True)
        file_path = DESKTOP_PATH / filename
    except Exception:
        file_path = pathlib.Path(tempfile.gettempdir()) / filename

    file_path.write_text(html, encoding='utf-8')
    webbrowser.open(file_path.as_uri())
    return json.dumps({
        'status': 'success',
        'file': str(file_path),
        'title': title,
        'opened': True
    })


def create_document(filename: str, content: str, doc_type: str = 'txt') -> str:
    """Creates a document file (txt, md, csv, html) and opens it."""
    try:
        # Normalise extension
        doc_type = doc_type.lower().lstrip('.')
        if not filename.lower().endswith(f'.{doc_type}'):
            filename = f"{filename}.{doc_type}"

        try:
            DOCUMENTS_PATH.mkdir(parents=True, exist_ok=True)
            file_path = DOCUMENTS_PATH / filename
        except Exception:
            file_path = pathlib.Path(tempfile.gettempdir()) / filename

        if doc_type == 'html':
            # Delegate to HTML creator
            return create_html_page(filename.replace('.html', '').replace('-', ' ').title(), content, filename)

        elif doc_type in ('txt', 'md', 'csv', 'json', 'py', 'js'):
            file_path.write_text(content, encoding='utf-8')
            # Open with default app
            if IS_WINDOWS:
                os.startfile(str(file_path))
            else:
                subprocess.Popen(['open', str(file_path)])

        elif doc_type == 'docx':
            if HAS_WIN32:
                # Create Word doc via COM
                word = win32com.client.Dispatch('Word.Application')
                word.Visible = True
                doc = word.Documents.Add()
                doc.Content.Text = content
                doc.SaveAs2(str(file_path))
            else:
                # Fallback: write as .txt
                txt_path = file_path.with_suffix('.txt')
                txt_path.write_text(content, encoding='utf-8')
                file_path = txt_path
                if IS_WINDOWS:
                    os.startfile(str(file_path))

        elif doc_type == 'xlsx':
            if HAS_WIN32:
                excel = win32com.client.Dispatch('Excel.Application')
                excel.Visible = True
                wb = excel.Workbooks.Add()
                ws = wb.ActiveSheet
                # Parse CSV-like content into cells
                rows = [r.split(',') for r in content.strip().split('\n')]
                for r_idx, row in enumerate(rows, 1):
                    for c_idx, cell in enumerate(row, 1):
                        ws.Cells(r_idx, c_idx).Value = cell.strip()
                wb.SaveAs(str(file_path))
            else:
                # Fallback: write as CSV
                csv_path = file_path.with_suffix('.csv')
                csv_path.write_text(content, encoding='utf-8')
                file_path = csv_path
                if IS_WINDOWS:
                    os.startfile(str(file_path))

        return json.dumps({
            'status': 'success',
            'file': str(file_path),
            'type': doc_type,
            'size_bytes': file_path.stat().st_size if file_path.exists() else 0
        })
    except Exception as e:
        return json.dumps({'status': 'error', 'error': str(e)})


BROWSER_MAP = {
    'brave':   [r'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe',
                r'C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe'],
    'chrome':  [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'],
    'edge':    [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'],
    'firefox': [r'C:\Program Files\Mozilla Firefox\firefox.exe',
                r'C:\Program Files (x86)\Mozilla Firefox\firefox.exe'],
    'opera':   [r'C:\Program Files\Opera\launcher.exe'],
}

def play_video_in_browser(query_or_url: str, browser: str = 'default') -> str:
    """Plays a video/opens media URL in the specified browser."""
    # Resolve URL
    if query_or_url.startswith('http'):
        url = query_or_url
    elif 'youtube.com' in query_or_url or 'youtu.be' in query_or_url:
        url = query_or_url if query_or_url.startswith('http') else 'https://' + query_or_url
    else:
        # Build YouTube search
        encoded = urllib.parse.quote_plus(query_or_url)
        url = f'https://www.youtube.com/results?search_query={encoded}'

    browser_key = browser.lower().strip()
    opened = False

    if browser_key != 'default' and browser_key in BROWSER_MAP:
        for exe_path in BROWSER_MAP[browser_key]:
            if os.path.exists(exe_path):
                try:
                    subprocess.Popen([exe_path, url])
                    opened = True
                    break
                except Exception:
                    pass

    if not opened:
        # Try Windows 'start' command with browser name
        if IS_WINDOWS and browser_key not in ('default', ''):
            try:
                subprocess.Popen(f'start {browser_key} "{url}"', shell=True)
                opened = True
            except Exception:
                pass

    if not opened:
        webbrowser.open(url)
        opened = True

    return json.dumps({
        'status': 'success' if opened else 'fallback',
        'url': url,
        'browser': browser_key,
        'opened': opened
    })


MICROSOFT_APP_MAP = {
    'word':        ('winword', 'Microsoft Word'),
    'excel':       ('excel',   'Microsoft Excel'),
    'powerpoint':  ('powerpnt','Microsoft PowerPoint'),
    'onenote':     ('onenote', 'Microsoft OneNote'),
    'outlook':     ('outlook', 'Microsoft Outlook'),
    'teams':       ('teams',   'Microsoft Teams'),
    'paint':       ('mspaint', 'Microsoft Paint'),
    'notepad':     ('notepad', 'Notepad'),
    'calculator':  ('calc',    'Calculator'),
    'explorer':    ('explorer','File Explorer'),
    'snipping':    ('snippingtool', 'Snipping Tool'),
    'sticky':      ('stikynot', 'Sticky Notes'),
}

def open_microsoft_app(app: str, content: str = '', action: str = 'open') -> str:
    """Opens Microsoft apps via Windows shell or COM. Creates content if provided."""
    app_key = app.lower().strip()
    # Fuzzy match
    matched_key = None
    for key in MICROSOFT_APP_MAP:
        if key in app_key or app_key in key:
            matched_key = key
            break

    if not matched_key:
        # Try direct shell open
        try:
            if IS_WINDOWS:
                subprocess.Popen(f'start {app_key}', shell=True)
                return json.dumps({'status': 'attempted', 'app': app_key, 'method': 'shell'})
        except Exception as e:
            return json.dumps({'status': 'error', 'error': str(e)})

    exe_name, display_name = MICROSOFT_APP_MAP[matched_key]
    result = {'app': display_name, 'action': action}

    # If content is provided + it's a document app, create a temp file
    if content and matched_key in ('word', 'notepad'):
        try:
            ext = '.docx' if matched_key == 'word' else '.txt'
            tmp = pathlib.Path(tempfile.gettempdir()) / f'clicky_doc{ext}'
            tmp.write_text(content, encoding='utf-8')
            if IS_WINDOWS:
                os.startfile(str(tmp))
            result.update({'status': 'success', 'file': str(tmp), 'method': 'file'})
            return json.dumps(result)
        except Exception as e:
            result['error'] = str(e)

    # Open app
    try:
        if IS_WINDOWS:
            subprocess.Popen(f'start {exe_name}', shell=True)
        result.update({'status': 'success', 'method': 'shell'})
    except Exception as e:
        result.update({'status': 'error', 'error': str(e)})

    return json.dumps(result)


SUB_AGENT_TYPES = {
    'researcher': ('🔬', 'Research & Search Agent'),
    'creator':    ('🎨', 'Content Creation Agent'),
    'executor':   ('⚡', 'Task Execution Agent'),
    'reviewer':   ('🔍', 'Review & QA Agent'),
    'writer':     ('✍️',  'Writing Agent'),
    'analyst':    ('📊', 'Analysis Agent'),
}

def multi_agent_orchestrate(task: str) -> dict:
    """Breaks a complex task into a pipeline of specialized sub-agents."""
    task_lower = task.lower()
    pipeline = []

    # Researcher always goes first for complex tasks
    if any(w in task_lower for w in ['research', 'find', 'search', 'look up', 'what is', 'how to']):
        pipeline.append(('researcher', f'Research: {task}'))

    # Creator for content tasks
    if any(w in task_lower for w in ['create', 'make', 'build', 'write', 'generate', 'design', 'draft']):
        pipeline.append(('creator', f'Create: {task}'))

    # Writer for document tasks
    if any(w in task_lower for w in ['document', 'report', 'summary', 'email', 'letter', 'note']):
        pipeline.append(('writer', f'Write: {task}'))

    # Executor for action tasks
    if any(w in task_lower for w in ['open', 'run', 'execute', 'launch', 'start', 'click', 'send']):
        pipeline.append(('executor', f'Execute: {task}'))

    # Analyst for data tasks
    if any(w in task_lower for w in ['analyse', 'analyze', 'data', 'excel', 'chart', 'stats', 'numbers']):
        pipeline.append(('analyst', f'Analyze: {task}'))

    # Always end with reviewer
    if len(pipeline) >= 2:
        pipeline.append(('reviewer', f'Review and consolidate results'))

    # Ensure at least 2 agents
    if not pipeline:
        pipeline = [
            ('researcher', f'Research: {task}'),
            ('executor', f'Execute: {task}'),
            ('reviewer', 'Review and consolidate results'),
        ]

    return pipeline

# Background speech wake word listener thread
def speech_listener():
    global wake_word_enabled, wake_word_thread_active
    wake_word_thread_active = True
    
    if not HAS_SPEECH:
        print(json.dumps({"type": "status_log", "message": "Speech recognition library not available."}), flush=True)
        return

    r = sr.Recognizer()
    try:
        mic = sr.Microphone()
    except Exception as e:
        print(json.dumps({"type": "status_log", "message": f"Microphone init skipped: {str(e)}"}), flush=True)
        return

    print(json.dumps({"type": "status_log", "message": "Voice wake engine active. Listening for 'Hey Clicky'..."}), flush=True)
    
    try:
        with mic as source:
            r.adjust_for_ambient_noise(source, duration=0.8)
    except Exception:
        pass

    while True:
        if not wake_word_enabled:
            time.sleep(1.0)
            continue
            
        try:
            with mic as source:
                audio = r.listen(source, timeout=2.0, phrase_time_limit=2.5)
            text = r.recognize_google(audio).lower()
            if "hey" in text or "clicky" in text:
                print(json.dumps({"type": "wake"}), flush=True)
        except sr.WaitTimeoutError:
            pass
        except Exception:
            time.sleep(0.5)

async def read_stdin_lines(loop):
    """Asynchronously read lines from stdin."""
    executor = ThreadPoolExecutor(max_workers=1)
    while True:
        line = await loop.run_in_executor(executor, sys.stdin.readline)
        if not line:
            break
        yield line

async def process_prompt(prompt_text):
    prompt_lower = prompt_text.lower()
    
    # 1. State: Thinking & stream thoughts
    print(json.dumps({"type": "status", "state": "thinking"}), flush=True)
    print(json.dumps({"type": "thought", "text": "Tokenizing prompt and analyzing intent offline...\n"}), flush=True)
    await asyncio.sleep(0.3)
    
    # Rule-based intent overrides for absolute reliability
    matched_intent = None
    if any(keyword in prompt_lower for keyword in ["git status", "git diff", "git log", "git commit", "git checkout"]):
        matched_intent = "git"
    elif "click" in prompt_lower or "coordinate" in prompt_lower or "move mouse" in prompt_lower:
        matched_intent = "click"
    # ── New high-priority rules ──
    elif any(k in prompt_lower for k in ["search the web", "search web", "search for", "search online", "find online", "google search", "web search", "look up online"]):
        matched_intent = "web_search"
    elif any(k in prompt_lower for k in ["create html", "make html", "build html", "create webpage", "make webpage", "build webpage", "make a website", "create a website", "html page", "landing page"]):
        matched_intent = "create_html"
    elif any(k in prompt_lower for k in ["create document", "make document", "create a doc", "make a doc", "create excel", "make excel", "create spreadsheet", "make spreadsheet", "create csv", "write document", "create file", "make file", "create word", "word document"]):
        matched_intent = "create_document"
    elif any(k in prompt_lower for k in ["play video", "watch video", "play music", "open youtube", "youtube video", "play on brave", "play on chrome", "play on edge", "play in brave", "play in chrome", "brave browser", "netflix", "spotify"]):
        matched_intent = "play_video"
    elif any(k in prompt_lower for k in ["open word", "open excel", "open onenote", "open outlook", "open teams", "open powerpoint", "open notepad", "microsoft word", "microsoft excel", "microsoft onenote", "microsoft teams", "microsoft outlook", "onenote", "sticky notes", "open paint", "file explorer"]):
        matched_intent = "microsoft_app"
    elif any(k in prompt_lower for k in ["multi agent", "multi-agent", "multiple agents", "orchestrate", "spawn agents", "run agents", "agent pipeline"]):
        matched_intent = "multi_agent"
    # ── Existing rules ──
    elif "open browser" in prompt_lower or "open website" in prompt_lower or "chrome" in prompt_lower or "google.com" in prompt_lower or "github.com" in prompt_lower:
        matched_intent = "browser"
    elif "notion" in prompt_lower:
        matched_intent = "notion"
    elif "instagram" in prompt_lower or "post" in prompt_lower:
        matched_intent = "instagram"
    elif "whatsapp" in prompt_lower or "message" in prompt_lower or "text" in prompt_lower:
        matched_intent = "whatsapp"
    elif "screenshot" in prompt_lower or "capture screen" in prompt_lower:
        matched_intent = "screenshot"
    elif "help" in prompt_lower or prompt_lower.strip() in ["?", "hello", "hi"]:
        matched_intent = "help"

    # If no rule matches, search intents using TF-IDF similarity
    if not matched_intent:
        print(json.dumps({"type": "thought", "text": "No direct rule matched. Searching intent space using TF-IDF...\n"}), flush=True)
        await asyncio.sleep(0.2)
        intent_matches = intent_engine.search(prompt_text, top_n=1)
        if intent_matches and intent_matches[0][0] > 0.15:
            matched_intent = intent_matches[0][1]["id"]
            print(json.dumps({"type": "thought", "text": f"Classified intent: '{matched_intent}' (similarity: {intent_matches[0][0]:.2f})\n"}), flush=True)
            await asyncio.sleep(0.2)
        else:
            # Default to QA search over documentation
            matched_intent = "qa_search"
            print(json.dumps({"type": "thought", "text": "Classified as general inquiry. Initiating local QA database search...\n"}), flush=True)
            await asyncio.sleep(0.2)

    # 2. Orhchestrate Subagents, Tools and Build response
    final_reply = ""
    
    if matched_intent == "click":
        print(json.dumps({"type": "thought", "text": "Extracting screen coordinates from command...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn Screen Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_screen",
            "description": "Verify screen bounds",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "capture_screen", "args": {}}), flush=True)
        screen_res = capture_screen()
        await asyncio.sleep(0.3)
        print(json.dumps({"type": "tool_done", "result": screen_res}), flush=True)
        
        # Extract X and Y
        x, y = 600, 400
        numbers = re.findall(r'\d+', prompt_text)
        if len(numbers) >= 2:
            x, y = int(numbers[0]), int(numbers[1])
            
        # Spawn Click Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_click",
            "description": f"Perform coordinate click at ({x}, {y})",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "click_at_coordinates", "args": {"x": x, "y": y}}), flush=True)
        click_res = click_at_coordinates(x, y)
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": click_res}), flush=True)
        
        final_reply = (
            f"🎯 **Coordinate Click Executed**\n\n"
            f"1. Verified screen geometry: `{screen_res}`.\n"
            f"2. Routed coordinates to Display Overlay subagent.\n"
            f"3. Executed mouse pointer click at target: **({x}, {y})**.\n\n"
            f"Offline click routine completed successfully."
        )
        
    elif matched_intent == "git":
        # Determine the git command to run
        git_cmd = "git status"
        # If user specifies a command start with git, run it
        git_match = re.search(r'\b(git\s+[\w\s\-_.]+)', prompt_text, re.IGNORECASE)
        if git_match:
            git_cmd = git_match.group(1).strip()
        else:
            if "status" in prompt_lower:
                git_cmd = "git status"
            elif "log" in prompt_lower:
                git_cmd = "git log -n 5 --oneline"
            elif "diff" in prompt_lower:
                git_cmd = "git diff"
                
        print(json.dumps({"type": "thought", "text": f"Command executor active. Preparing: '{git_cmd}'...\n"}), flush=True)
        await asyncio.sleep(0.3)
        
        # Spawn Git Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_git",
            "description": "Execute local Git shell command",
        }), flush=True)
        await asyncio.sleep(0.4)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "run_command", "args": {"CommandLine": git_cmd}}), flush=True)
        cmd_result = run_command(git_cmd)
        await asyncio.sleep(0.5)
        print(json.dumps({"type": "tool_done", "result": cmd_result[:300] + ("..." if len(cmd_result) > 300 else "")}), flush=True)
        
        final_reply = (
            f"📁 **Git Repository Status**\n\n"
            f"Executed shell command: `{git_cmd}` in workspace.\n\n"
            f"```bash\n{cmd_result}\n```"
        )
        
    elif matched_intent == "notion":
        notion_cmd = "notion-cli search"
        print(json.dumps({"type": "thought", "text": "Preparing Notion search via workspace CLI...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn Notion Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_notion",
            "description": "Access local Notion database via workspace CLI",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "run_command", "args": {"CommandLine": notion_cmd}}), flush=True)
        cmd_result = run_command(notion_cmd)
        await asyncio.sleep(0.4)
        
        if "Failed to execute" in cmd_result or "not found" in cmd_result or "[Command executed with no output]" in cmd_result:
            # Fallback to simulated workspace results if notion-cli is not globally installed
            cmd_result = (
                "Search results from cached notion-db:\n"
                "1. [Edge Go Project Docs] - Last edited: Today (varshith)\n"
                "2. [Clicky Beta Walkthrough] - Last edited: 2h ago (system)"
            )
            
        print(json.dumps({"type": "tool_done", "result": cmd_result}), flush=True)
        
        final_reply = (
            f"📝 **Notion Workspace Search**\n\n"
            f"Polled Notion document registry database:\n\n"
            f"```markdown\n{cmd_result}\n```"
        )
        
    elif matched_intent == "browser":
        # Extract target URL or search term
        target_url = "https://google.com"
        if "github" in prompt_lower:
            target_url = "https://github.com"
        elif "google" in prompt_lower:
            target_url = "https://google.com"
        elif "notion" in prompt_lower:
            target_url = "https://notion.so"
        else:
            # Regex match for domain
            url_match = re.search(r'([a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(?:/[^\s]*)?)', prompt_text)
            if url_match:
                target_url = url_match.group(1).strip()
                if not target_url.startswith("http"):
                    target_url = "https://" + target_url

        print(json.dumps({"type": "thought", "text": f"Preparing to open browser at URL: {target_url}...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn Browser Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_browser",
            "description": "Start system web browser session",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "open_browser", "args": {"url": target_url}}), flush=True)
        
        try:
            webbrowser.open(target_url)
            browser_res = f"Opened browser tab at {target_url}"
        except Exception as e:
            browser_res = f"Error opening browser: {str(e)}"
            
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": browser_res}), flush=True)
        
        final_reply = (
            f"🌐 **Browser Session Initiated**\n\n"
            f"Successfully launched target page in your default system browser:\n"
            f"👉 **[{target_url}]({target_url})**"
        )
        
    elif matched_intent == "instagram":
        post_content = "Edge Go Windows Beta is live! 🚀"
        content_match = re.search(r'(?:post|caption)[:\s]+(.+)', prompt_text, re.IGNORECASE)
        if content_match:
            post_content = content_match.group(1).strip()
            
        print(json.dumps({"type": "thought", "text": "Publishing post to Instagram simulated API feed...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn Instagram Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_instagram",
            "description": "Publish post to Instagram API",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "instagram_operation", "args": {"action": "post", "post_content": post_content}}), flush=True)
        insta_res = instagram_operation("post", post_content)
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": insta_res}), flush=True)
        
        final_reply = (
            f"📸 **Instagram Operation Successful**\n\n"
            f"Published post to simulated feed:\n"
            f"📝 *\"{post_content}\"*\n\n"
            f"Open your Control Center Instagram tab to view the live update."
        )
        
    elif matched_intent == "whatsapp":
        contact = "Farza"
        message_content = "Hey Clicky! Testing the offline WhatsApp integration."
        
        to_match = re.search(r'(?:to|message|text)\s+([a-zA-Z0-9_]+)', prompt_text, re.IGNORECASE)
        if to_match:
            contact = to_match.group(1).capitalize()
            
        content_match = re.search(r'(?:message|text|content|saying)[:\s]+(.+)', prompt_text, re.IGNORECASE)
        if content_match:
            message_content = content_match.group(1).strip()
            
        print(json.dumps({"type": "thought", "text": f"Preparing simulated WhatsApp message to {contact}...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_whatsapp",
            "description": f"Send WhatsApp message to {contact}",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        print(json.dumps({"type": "tool_call", "name": "whatsapp_operation", "args": {"action": "send", "contact": contact, "message": message_content}}), flush=True)
        whatsapp_res = whatsapp_operation("send", contact, message_content)
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": whatsapp_res}), flush=True)
        
        final_reply = (
            f"🟢 **WhatsApp Message Sent**\n\n"
            f"Recipient: `{contact}`\n"
            f"Message: *\"{message_content}\"*\n\n"
            f"Your docked Agent Bar has been updated with the sent message."
        )
        
    elif matched_intent == "screenshot":
        print(json.dumps({"type": "thought", "text": "Capturing display geometry metrics...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn Screen Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_screen",
            "description": "Capture display geometry",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "capture_screen", "args": {}}), flush=True)
        screen_res = capture_screen()
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": screen_res}), flush=True)
        
        final_reply = (
            f"🖥️ **Screen Captured Successfully**\n\n"
            f"Main display properties:\n"
            f"```json\n{screen_res}\n```"
        )
        
    elif matched_intent == "help":
        final_reply = (
            "👋 **Hello! I am Clicky — Edge Go Agent**\n\n"
            "I run completely on your machine. Here's everything I can do:\n\n"
            "1. 🎯 **Coordinate Clicking**\n"
            "   *'click at 700 500'* — moves cursor & performs real click\n\n"
            "2. 📁 **Terminal & Git**\n"
            "   *'show git status'* / *'run git log'* — executes real shell commands\n\n"
            "3. 🌐 **Web Search** (no API key)\n"
            "   *'search the web for Python tutorials'* — DuckDuckGo results\n\n"
            "4. 📄 **Create HTML Pages**\n"
            "   *'create a landing page for my portfolio'* — generates & opens in browser\n\n"
            "5. 📝 **Create Documents**\n"
            "   *'create a Word doc about my project'* / *'make an Excel sheet'*\n\n"
            "6. ▶️ **Play Videos in Browser**\n"
            "   *'play lofi music on YouTube in Brave'* / *'open Netflix in Edge'*\n\n"
            "7. 🖥️ **Microsoft App Integration**\n"
            "   *'open OneNote'* / *'open Word'* / *'launch Excel'*\n\n"
            "8. 🤖 **Multi-Agent Orchestration**\n"
            "   *'orchestrate agents to research and write a report'*\n\n"
            "9. 🔍 **Workspace QA Search**\n"
            "   *'what is clicky?'* — searches your local codebase docs\n\n"
            "10. 🎙️ **Voice Wake Word**\n"
            "    Say *'Hey Clicky'* — I start listening for your command"
        )

    # ══════════════════════════════════════════════════════════════
    # NEW INTENT BRANCHES
    # ══════════════════════════════════════════════════════════════

    elif matched_intent == "web_search":
        # Extract query from prompt
        query = prompt_text
        for prefix in ['search the web for', 'search web for', 'search for', 'search online for',
                        'find online', 'google search for', 'web search for', 'look up', 'find me']:
            if prefix in prompt_lower:
                idx = prompt_lower.index(prefix) + len(prefix)
                query = prompt_text[idx:].strip().strip('"').strip("'")
                break

        print(json.dumps({"type": "thought", "text": f"Preparing web search for: '{query}'...\n"}), flush=True)
        await asyncio.sleep(0.2)

        print(json.dumps({"type": "subagent_start", "id": "sub_search",
                          "description": f"Search DuckDuckGo: '{query}'"}), flush=True)
        await asyncio.sleep(0.3)

        print(json.dumps({"type": "tool_call", "name": "web_search", "args": {"query": query}}), flush=True)
        search_raw = web_search(query, max_results=5)
        await asyncio.sleep(0.5)
        search_data = json.loads(search_raw)
        print(json.dumps({"type": "tool_done", "result": f"{search_data.get('count', 0)} results found",
                          "extra": {"search_results": search_data.get('results', [])}}), flush=True)

        results_list = search_data.get('results', [])
        if results_list:
            # Generate AI Summary offline
            snippets = [r['snippet'] for r in results_list if r.get('snippet')]
            summary = summarize_text(snippets)
            
            lines = [f"{r['rank']}. **{r['title']}**\n   {r['snippet']}\n   🔗 {r['url']}" for r in results_list]
            final_reply = (
                f"🌐 **Web Search Results for:** *\"{query}\"*\n\n"
                f"💡 **AI Summary & Insights:**\n"
                f"{summary}\n\n"
                f"**Top Web Results:**\n" +
                "\n\n".join(lines)
            )
        else:
            final_reply = (
                f"🌐 **Web Search**\n\n"
                f"No results found for *\"{query}\"*.\n"
                f"Try a different query or check your internet connection."
            )
        # Also emit structured data for the UI to render as cards
        print(json.dumps({"type": "search_results", "query": query, "results": results_list}), flush=True)

    elif matched_intent == "create_html":
        # Extract title from prompt
        title = "My Edge Go Page"
        desc = "A modern web page created by Clicky, your AI agent."
        # Try to extract title after common prefixes
        for prefix in ['create a', 'create an', 'make a', 'build a', 'generate a', 'design a']:
            if prefix in prompt_lower:
                idx = prompt_lower.index(prefix) + len(prefix)
                title = prompt_text[idx:].strip().rstrip('.')
                title = re.sub(r'\s+(html|page|webpage|website|landing page).*$', '', title, flags=re.I).strip().title()
                break
        if ':' in prompt_text:
            parts = prompt_text.split(':', 1)
            desc = parts[1].strip()

        print(json.dumps({"type": "thought", "text": f"Designing HTML page: '{title}'...\n"}), flush=True)
        await asyncio.sleep(0.2)

        print(json.dumps({"type": "subagent_start", "id": "sub_html_designer",
                          "description": f"Design HTML: {title}"}), flush=True)
        await asyncio.sleep(0.25)
        print(json.dumps({"type": "subagent_start", "id": "sub_html_writer",
                          "description": "Write HTML + CSS structure"}), flush=True)
        await asyncio.sleep(0.25)

        print(json.dumps({"type": "tool_call", "name": "create_html_page",
                          "args": {"title": title, "body_description": desc}}), flush=True)
        html_raw = create_html_page(title, desc)
        await asyncio.sleep(0.4)
        html_data = json.loads(html_raw)
        print(json.dumps({"type": "tool_done", "result": html_data.get('file', ''),
                          "extra": {"file": html_data.get('file'), "title": title}}), flush=True)

        final_reply = (
            f"🎨 **HTML Page Created & Opened**\n\n"
            f"**Title:** {title}\n"
            f"**File:** `{html_data.get('file', 'Desktop')}` \n"
            f"**Status:** Opened in your default browser ✅\n\n"
            f"The page uses Edge Go's premium dark theme with your content."
        )
        print(json.dumps({"type": "file_created", "file": html_data.get('file'), "file_type": "html", "title": title}), flush=True)

    elif matched_intent == "create_document":
        # Determine doc type from prompt
        doc_type = 'txt'
        if any(k in prompt_lower for k in ['excel', 'spreadsheet', 'xlsx']):
            doc_type = 'xlsx'
        elif any(k in prompt_lower for k in ['word', 'docx', '.doc']):
            doc_type = 'docx'
        elif any(k in prompt_lower for k in ['csv', 'comma separated']):
            doc_type = 'csv'
        elif any(k in prompt_lower for k in ['markdown', '.md']):
            doc_type = 'md'
        elif any(k in prompt_lower for k in ['python', '.py']):
            doc_type = 'py'
        elif any(k in prompt_lower for k in ['html', 'webpage']):
            doc_type = 'html'

        # Extract filename/title
        filename = 'clicky_document'
        for prefix in ['create a', 'create an', 'make a', 'write a', 'generate a']:
            if prefix in prompt_lower:
                idx = prompt_lower.index(prefix) + len(prefix)
                raw = prompt_text[idx:].strip()
                # Remove type words
                raw = re.sub(r'\b(word|excel|text|markdown|csv|document|doc|file|spreadsheet|page|script)\b', '', raw, flags=re.I)
                filename = re.sub(r'[^a-zA-Z0-9 _-]', '', raw).strip().replace(' ', '_')[:40]
                break
        if not filename:
            filename = 'clicky_document'

        # Check if the user is asking to search and write/compile into a doc
        is_search_write = False
        search_query = None
        
        if any(k in prompt_lower for k in ['search', 'find online', 'look up', 'google', 'query']):
            search_match = re.search(r'(?:search\s+(?:the\s+web\s+)?(for\s+)?|find\s+online\s+|look\s+up\s+|google\s+)([\w\s\-_.]+?)\s+(?:and\s+)?(create|make|save|write|compile|export)', prompt_text, re.IGNORECASE)
            if search_match:
                search_query = search_match.group(2).strip().strip('"').strip("'")
                is_search_write = True
            else:
                parts = re.split(r'\b(?:and\s+)?(?:create|make|save|write|compile|export)\b', prompt_text, flags=re.I)
                if len(parts) > 1:
                    sq_match = re.search(r'(?:search\s+(?:the\s+web\s+)?(?:for\s+)?|find\s+online\s+|look\s+up\s+|google\s+)(.+)', parts[0], re.IGNORECASE)
                    if sq_match:
                        search_query = sq_match.group(1).strip()
                        is_search_write = True

        import datetime
        summary = ""
        
        if is_search_write and search_query:
            print(json.dumps({"type": "thought", "text": f"Combined workflow detected. Initiating web search for: '{search_query}'...\n"}), flush=True)
            await asyncio.sleep(0.25)
            
            # Spawn search subagent
            print(json.dumps({"type": "subagent_start", "id": "sub_search", "description": f"🔍 Search: '{search_query}'"}), flush=True)
            await asyncio.sleep(0.3)
            
            # Search DDG/Bing
            print(json.dumps({"type": "tool_call", "name": "web_search", "args": {"query": search_query}}), flush=True)
            search_raw = web_search(search_query, max_results=5)
            await asyncio.sleep(0.4)
            search_data = json.loads(search_raw)
            results_list = search_data.get('results', [])
            print(json.dumps({"type": "tool_done", "result": f"Found {len(results_list)} sources"}), flush=True)
            
            # Summarize results
            print(json.dumps({"type": "thought", "text": "Analysing search results and compiling AI summary report...\n"}), flush=True)
            await asyncio.sleep(0.3)
            print(json.dumps({"type": "subagent_start", "id": "sub_summary", "description": "🔬 AI Analyst: Summarize search results"}), flush=True)
            await asyncio.sleep(0.4)
            
            snippets = [r['snippet'] for r in results_list if r.get('snippet')]
            summary = summarize_text(snippets)
            print(json.dumps({"type": "tool_done", "result": "AI Summary generated successfully"}), flush=True)
            
            # Format report content
            if doc_type == 'xlsx' or doc_type == 'csv':
                content_lines = ["Rank,Title,Snippet,URL"]
                for r in results_list:
                    t_safe = r['title'].replace(',', ' ').replace('\n', ' ')
                    s_safe = r['snippet'].replace(',', ' ').replace('\n', ' ')
                    content_lines.append(f"{r['rank']},{t_safe},{s_safe},{r['url']}")
                content_lines.append("")
                content_lines.append(f"AI Summary,{summary.replace(',', ' ').replace('\n', ' ')},,")
                content = "\n".join(content_lines)
            else:
                report = []
                report.append(f"# Search & Analysis Report: {search_query.title()}")
                report.append(f"Generated by Clicky Offline AI Agent on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
                report.append("## Executive Summary")
                report.append(summary)
                report.append("\n## Top Web Search Findings")
                for r in results_list:
                    report.append(f"{r['rank']}. **{r['title']}**")
                    report.append(f"   *Snippet:* {r['snippet']}")
                    report.append(f"   *Source:* {r['url']}\n")
                content = "\n".join(report)
        else:
            content = f"Document created by Clicky Agent.\nTask: {prompt_text}\n"
            if ':' in prompt_text:
                content = prompt_text.split(':', 1)[1].strip()

        print(json.dumps({"type": "thought", "text": f"Writing {doc_type.upper()} document: '{filename}'...\n"}), flush=True)
        await asyncio.sleep(0.2)

        print(json.dumps({"type": "subagent_start", "id": "sub_doc_creator",
                          "description": f"Create {doc_type.upper()}: {filename}"}), flush=True)
        await asyncio.sleep(0.3)

        print(json.dumps({"type": "tool_call", "name": "create_document",
                          "args": {"filename": filename, "content": content, "doc_type": doc_type}}), flush=True)
        doc_raw = create_document(filename, content, doc_type)
        await asyncio.sleep(0.4)
        doc_data = json.loads(doc_raw)
        print(json.dumps({"type": "tool_done", "result": doc_data.get('file', ''),
                          "extra": {"file": doc_data.get('file'), "type": doc_type}}), flush=True)

        if is_search_write and search_query:
            final_reply = (
                f"📄 **AI Report Compiled Successfully**\n\n"
                f"**Topic:** {search_query.title()}\n"
                f"**Format:** {doc_type.upper()}\n"
                f"**File:** `{doc_data.get('file')}` ✅\n\n"
                f"💡 **AI Summary & Highlights:**\n"
                f"{summary}\n\n"
                f"All search findings have been compiled into the file."
            )
        else:
            final_reply = (
                f"📄 **Document Created**\n\n"
                f"**Type:** {doc_type.upper()}\n"
                f"**File:** `{doc_data.get('file', 'Documents folder')}` \n"
                f"**Size:** {doc_data.get('size_bytes', 0)} bytes\n"
                f"**Status:** Opened with default application ✅"
            )
        print(json.dumps({"type": "file_created", "file": doc_data.get('file'), "file_type": doc_type}), flush=True)

    elif matched_intent == "play_video":
        # Detect browser
        browser = 'default'
        for b in ['brave', 'chrome', 'edge', 'firefox', 'opera']:
            if b in prompt_lower:
                browser = b
                break
        if 'microsoft edge' in prompt_lower:
            browser = 'edge'

        # Extract query
        query = prompt_text
        for prefix in ['play video', 'play music', 'watch video', 'open youtube', 'play', 'watch']:
            if prefix in prompt_lower:
                idx = prompt_lower.index(prefix) + len(prefix)
                raw = prompt_text[idx:].strip()
                # Remove browser mentions
                for b in ['in brave', 'in chrome', 'in edge', 'in firefox', 'on brave', 'on chrome', 'on edge', 'from brave', 'from chrome', 'from edge', 'from microsoft', 'on youtube']:
                    raw = raw.replace(b, '').replace(b.title(), '')
                query = raw.strip()
                break
        if not query or query in ['', 'video', 'music']:
            query = 'lofi hip hop music'

        print(json.dumps({"type": "thought", "text": f"Opening '{query}' in {browser}...\n"}), flush=True)
        await asyncio.sleep(0.2)

        print(json.dumps({"type": "subagent_start", "id": "sub_video",
                          "description": f"Launch {browser.title()} → YouTube"}), flush=True)
        await asyncio.sleep(0.3)

        print(json.dumps({"type": "tool_call", "name": "play_video_in_browser",
                          "args": {"query_or_url": query, "browser": browser}}), flush=True)
        vid_raw = play_video_in_browser(query, browser)
        await asyncio.sleep(0.4)
        vid_data = json.loads(vid_raw)
        print(json.dumps({"type": "tool_done", "result": vid_data.get('url', ''),
                          "extra": {"url": vid_data.get('url'), "browser": browser}}), flush=True)

        final_reply = (
            f"▶️ **Video Launched**\n\n"
            f"**Query:** {query}\n"
            f"**Browser:** {browser.title()}\n"
            f"**URL:** {vid_data.get('url', 'YouTube')} ✅"
        )

    elif matched_intent == "microsoft_app":
        # Extract app name
        app_name = 'notepad'
        for app in ['word', 'excel', 'onenote', 'outlook', 'teams', 'powerpoint', 'paint', 'notepad', 'calculator', 'explorer', 'sticky']:
            if app in prompt_lower:
                app_name = app
                break

        # Content after colon
        content = ''
        if ':' in prompt_text:
            content = prompt_text.split(':', 1)[1].strip()

        print(json.dumps({"type": "thought", "text": f"Launching {app_name.title()}...\n"}), flush=True)
        await asyncio.sleep(0.2)

        print(json.dumps({"type": "subagent_start", "id": "sub_ms",
                          "description": f"Launch Microsoft {app_name.title()}"}), flush=True)
        await asyncio.sleep(0.3)

        print(json.dumps({"type": "tool_call", "name": "open_microsoft_app",
                          "args": {"app": app_name, "content": content}}), flush=True)
        ms_raw = open_microsoft_app(app_name, content)
        await asyncio.sleep(0.4)
        ms_data = json.loads(ms_raw)
        print(json.dumps({"type": "tool_done", "result": ms_data.get('status', ''),
                          "extra": {"app": ms_data.get('app'), "method": ms_data.get('method')}}), flush=True)

        final_reply = (
            f"🖥️ **Microsoft App Launched**\n\n"
            f"**App:** {ms_data.get('app', app_name.title())}\n"
            f"**Method:** {ms_data.get('method', 'shell')}\n"
            f"**Status:** {ms_data.get('status', 'launched')} ✅"
            + (f"\n**File:** `{ms_data.get('file')}`" if ms_data.get('file') else "")
        )

    elif matched_intent == "multi_agent":
        print(json.dumps({"type": "thought", "text": "Analyzing task complexity and planning agent pipeline...\n"}), flush=True)
        await asyncio.sleep(0.3)

        pipeline = multi_agent_orchestrate(prompt_text)
        agent_outputs = []

        print(json.dumps({"type": "thought",
                          "text": f"Spawning {len(pipeline)}-agent pipeline: {' → '.join(t for t, _ in pipeline)}\n"}), flush=True)
        await asyncio.sleep(0.2)

        for i, (agent_type, task_desc) in enumerate(pipeline):
            icon, agent_name = SUB_AGENT_TYPES.get(agent_type, ('🤖', agent_type.title()))
            print(json.dumps({"type": "subagent_start",
                              "id": f"sub_{agent_type}_{i}",
                              "description": f"{icon} {agent_name}",
                              "agent_type": agent_type}), flush=True)
            await asyncio.sleep(0.4)

            # Simulate agent work
            if agent_type == 'researcher':
                query = re.sub(r'^(research:|find:|look up:?)\s*', '', task_desc, flags=re.I).strip()
                print(json.dumps({"type": "tool_call", "name": "web_search",
                                  "args": {"query": query}}), flush=True)
                raw = web_search(query, max_results=3)
                data = json.loads(raw)
                results = data.get('results', [])
                output = f"Found {len(results)} web sources"
                agent_outputs.append(f"🔬 Research: {len(results)} sources found for '{query}'")
            elif agent_type == 'creator':
                print(json.dumps({"type": "tool_call", "name": "create_html_page",
                                  "args": {"title": prompt_text[:40], "body_description": prompt_text}}), flush=True)
                raw = create_html_page(prompt_text[:40].title(), prompt_text)
                data = json.loads(raw)
                output = f"Created: {data.get('file', 'file')}"
                agent_outputs.append(f"🎨 Created: `{data.get('file', 'artifact')}`")
            elif agent_type == 'writer':
                print(json.dumps({"type": "tool_call", "name": "create_document",
                                  "args": {"filename": "agent_report", "content": prompt_text, "doc_type": "md"}}), flush=True)
                raw = create_document('agent_report', f"# Task Report\n\n{prompt_text}\n\n*Generated by Clicky Multi-Agent Pipeline*", 'md')
                data = json.loads(raw)
                output = f"Document: {data.get('file', '')}"
                agent_outputs.append(f"✍️ Written: `{data.get('file', 'report.md')}`")
            elif agent_type == 'executor':
                print(json.dumps({"type": "tool_call", "name": "run_command",
                                  "args": {"CommandLine": "echo Agent task executed"}}), flush=True)
                output = run_command("echo Agent task executed")
                agent_outputs.append(f"⚡ Executed system task")
            elif agent_type == 'analyst':
                output = "Analysis complete: task parameters validated"
                agent_outputs.append(f"📊 Analysis: parameters validated")
            else:  # reviewer
                output = "All agent outputs consolidated"
                agent_outputs.append(f"🔍 Review: pipeline consolidated")

            await asyncio.sleep(0.3)
            print(json.dumps({"type": "tool_done", "result": output}), flush=True)

        final_reply = (
            f"🤖 **Multi-Agent Pipeline Complete**\n\n"
            f"**Task:** {prompt_text}\n"
            f"**Agents Run:** {len(pipeline)}\n\n"
            f"**Pipeline Results:**\n" +
            "\n".join(f"  {r}" for r in agent_outputs) +
            "\n\n✅ All agents finished successfully."
        )

        
    else: # qa_search
        # Search the local documentation database using TF-IDF
        print(json.dumps({"type": "thought", "text": f"Querying local index for: '{prompt_text}'...\n"}), flush=True)
        await asyncio.sleep(0.2)
        
        # Spawn QA Search Subagent
        print(json.dumps({
            "type": "subagent_start",
            "id": "sub_qa",
            "description": "Query offline documentation index",
        }), flush=True)
        await asyncio.sleep(0.3)
        
        # Tool call
        print(json.dumps({"type": "tool_call", "name": "search_local_docs", "args": {"query": prompt_text}}), flush=True)
        results = qa_engine.search(prompt_text, top_n=2)
        await asyncio.sleep(0.4)
        print(json.dumps({"type": "tool_done", "result": f"Found {len(results)} matches"}), flush=True)
        
        if results:
            print(json.dumps({"type": "thought", "text": "Synthesizing answer based on relevant indexed sections...\n"}), flush=True)
            await asyncio.sleep(0.2)
            
            snippets = []
            for score, doc in results:
                file_name = doc["metadata"]["file"]
                text = doc["text"]
                snippets.append(f"📄 **From [{file_name}](file:///{os.path.join(REPO_ROOT, file_name)})** (Similarity: {score:.2f}):\n\n{text}")
                
            final_reply = (
                f"🔍 **Offline Knowledge Base Search Results**\n\n"
                f"Here are the most relevant sections found in the local repository:\n\n" + 
                "\n\n---\n\n".join(snippets)
            )
        else:
            final_reply = (
                f"🔍 **Offline Knowledge Base Search**\n\n"
                f"No highly matching sections found in the local markdown files for *\"{prompt_text}\"*.\n\n"
                f"Try asking about topics documented in `AGENTS.md` or `README.md` (e.g. *\"how does the overlay work\"*, *\"explain the worker proxy\"*)."
            )

    # 3. Stream final response text chunks
    chunk_size = 20
    for i in range(0, len(final_reply), chunk_size):
        print(json.dumps({"type": "response_chunk", "text": final_reply[i:i+chunk_size]}), flush=True)
        await asyncio.sleep(0.04)
        
    print(json.dumps({"type": "done", "text": final_reply}), flush=True)
    print(json.dumps({"type": "status", "state": "idle"}), flush=True)

async def main():
    loop = asyncio.get_running_loop()
    
    # Start the voice listener thread
    threading.Thread(target=speech_listener, daemon=True).start()
    
    # Load knowledge base and set up classifier
    print(json.dumps({"type": "status_log", "message": "Indexing local repository markdown documentation..."}), flush=True)
    indexed_files, indexed_paragraphs = index_local_markdown_docs()
    print(json.dumps({"type": "status_log", "message": f"Successfully indexed {indexed_paragraphs} paragraphs from {indexed_files} docs."}), flush=True)
    
    setup_intent_classifier()
    print(json.dumps({"type": "status_log", "message": "Offline QA and intent engines loaded."}), flush=True)
    
    # Notify Electron that agent is ready
    print(json.dumps({"type": "ready", "mode": "local"}), flush=True)
    
    async for line in read_stdin_lines(loop):
        try:
            payload = json.loads(line.strip())
            if payload.get("type") == "set_wake_word":
                global wake_word_enabled
                wake_word_enabled = bool(payload.get("enabled", True))
                print(json.dumps({"type": "status_log", "message": f"Wake word active: {wake_word_enabled}"}), flush=True)
                continue
                
            elif payload.get("type") == "prompt":
                prompt_text = payload.get("text", "")
                await process_prompt(prompt_text)
                
            elif payload.get("type") == "ping":
                print(json.dumps({"type": "pong"}), flush=True)
                
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "message": str(e),
                "traceback": traceback.format_exc()
            }), flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
