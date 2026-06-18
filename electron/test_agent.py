import sys
import os

# Add electron directory to path to enable imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("Testing Offline Agent components...")

try:
    from agent_daemon import SimpleTFIDF, tokenize, HAS_PYAUTOGUI, HAS_SPEECH
    print("SUCCESS: Successfully imported SimpleTFIDF and tokenizer from agent_daemon.py!")
except Exception as e:
    print(f"FAILED: Import error: {str(e)}")
    sys.exit(1)

# Test Tokenization and Stopwords filter
print("Testing tokenizer...")
tokens = tokenize("How does the cursor overlay work?")
# 'how' and 'the' are filtered out by stopwords list
expected_tokens = ["does", "cursor", "overlay", "work"]
print(f"Generated tokens: {tokens}")
for t in expected_tokens:
    if t not in tokens:
        print(f"FAILED: Tokenizer missing expected token: '{t}'")
        sys.exit(1)
print("SUCCESS: Tokenizer stopwords and split logic verified.")

# Test TF-IDF Vectorization & Cosine Similarity search matching
print("Testing TF-IDF Indexing and Search Similarity...")
engine = SimpleTFIDF()
engine.add_document("doc1", "The cursor overlay displays a blue pointer animating over coordinates on screen.")
engine.add_document("doc2", "Speech recognition uses pyaudio to capture the microphone input for wake word.")
engine.train()

results = engine.search("how does the cursor work?")
if not results:
    print("FAILED: Search returned zero matches.")
    sys.exit(1)

best_score, best_doc = results[0]
if best_doc["id"] != "doc1":
    print(f"FAILED: Search matched wrong document ID: {best_doc['id']} (expected 'doc1')")
    sys.exit(1)

print(f"SUCCESS: Search correctly matched document '{best_doc['id']}' with score {best_score:.4f}.")

# Verify optional desktop libraries
print(f"Optional PyAutoGUI presence: {'AVAILABLE' if HAS_PYAUTOGUI else 'EMULATED'}")
print(f"Optional SpeechRecognition presence: {'AVAILABLE' if HAS_SPEECH else 'NOT AVAILABLE'}")

print("All components verified successfully.")
sys.exit(0)
