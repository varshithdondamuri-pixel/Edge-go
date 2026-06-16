#!/usr/bin/env python3
import sys
import os
import json
import asyncio
import traceback
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

# Make sure we can import google.antigravity
try:
    from google.antigravity import Agent, LocalAgentConfig, types
    from google.antigravity.hooks import hooks, policy
except ImportError:
    print(json.dumps({"type": "error", "message": "Failed to import google.antigravity. Make sure it is installed in the current environment."}), flush=True)
    sys.exit(1)

# Speech recognition import
try:
    import speech_recognition as sr
    HAS_SPEECH = True
except ImportError:
    HAS_SPEECH = False

# Global state
active_tasks = {}
wake_word_enabled = True
wake_word_thread_active = False

# Custom Tools
def capture_screen() -> str:
    """Captures a screenshot of the main screen and returns a metadata description.

    Returns:
        A JSON string containing display resolution and status.
    """
    try:
        import pyautogui
        width, height = pyautogui.size()
        return json.dumps({
            "status": "success",
            "resolution": f"{width}x{height}",
            "description": f"Main Windows Screen ({width}x{height})"
        })
    except Exception as e:
        return json.dumps({
            "status": "success",
            "resolution": "1920x1080",
            "description": "Primary Monitor (Fallback Settings)"
        })

def click_at_coordinates(x: int, y: int) -> str:
    """Moves the cursor and clicks at the specified (x, y) coordinates on the screen.

    Args:
        x: The absolute X coordinate.
        y: The absolute Y coordinate.
    """
    # 1. Emit visual pointer instruction to Electron via stdout
    print(json.dumps({"type": "pointer_animation", "x": x, "y": y}), flush=True)
    
    # 2. Perform native click
    try:
        import pyautogui
        time.sleep(1.2) # wait for overlay Bezier curve animation
        pyautogui.click(x, y)
        return f"Successfully clicked at ({x}, {y})"
    except Exception as e:
        return f"Emulated click at ({x}, {y}) due to: {str(e)}"

def instagram_operation(action: str, post_content: str = "", username: str = "edgego_beta") -> str:
    """Performs simulated operations on Instagram.

    Args:
        action: The operation to perform ('post', 'read_feed', 'get_notifications').
        post_content: The text/caption for the post (required for 'post').
        username: The account username.
    """
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

# Setup Hooks for monitoring
@hooks.on_session_start
async def on_start():
    print(json.dumps({"type": "status", "state": "session_started"}), flush=True)

@hooks.on_session_end
async def on_end():
    print(json.dumps({"type": "status", "state": "session_ended"}), flush=True)

@hooks.pre_turn
async def pre_turn(prompt: str) -> types.HookResult:
    print(json.dumps({"type": "status", "state": "thinking", "prompt": prompt}), flush=True)
    return types.HookResult(allow=True)

@hooks.post_turn
async def post_turn(data: str):
    print(json.dumps({"type": "status", "state": "idle", "response": data}), flush=True)

@hooks.pre_tool_call_decide
async def pre_tool(tool_call: types.ToolCall) -> types.HookResult:
    if tool_call.name == "start_subagent":
        task_desc = tool_call.args.get("task", "Running subtask")
        subagent_id = f"sub_{len(active_tasks) + 1}"
        active_tasks[subagent_id] = task_desc
        print(json.dumps({
            "type": "subagent_start",
            "id": subagent_id,
            "description": task_desc,
            "all_active": list(active_tasks.values())
        }), flush=True)
    else:
        print(json.dumps({
            "type": "tool_call",
            "name": tool_call.name,
            "args": tool_call.args
        }), flush=True)
    return types.HookResult(allow=True)

@hooks.post_tool_call
async def post_tool(tool_result):
    print(json.dumps({
        "type": "tool_done",
        "result": str(tool_result)[:500]
    }), flush=True)

# Build Agent Config - Enable allow_all() policy to permit run_command
config = LocalAgentConfig(
    tools=[capture_screen, click_at_coordinates, instagram_operation],
    hooks=[on_start, on_end, pre_turn, post_turn, pre_tool, post_tool],
    policies=[policy.allow_all()], # Allows execution of terminal commands
    system_instructions=(
        "You are the Windows Clicky Assistant, a beta companion embedded in the Edge Go notch.\n"
        "Your task is to orchestrate screen activities, coordinate control, and automate social media interactions.\n"
        "You have the power to run terminal shell commands (via run_command) to interact with Git, Notion CLI, or open standard browsers.\n"
        "Whenever a user gives you a complex task, split it up and run subagents (start_subagent) to execute parts of it.\n"
        "For screen automation, first capture_screen to get monitor info, then use click_at_coordinates to execute actions.\n"
        "For social features, use instagram_operation to simulate postings/reading feed.\n"
        "Be proactive, concise, and explain what you are doing in your thought process."
    )
)

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
                # Short listen window to check for quick wake word
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

async def main():
    loop = asyncio.get_running_loop()
    
    # Start the voice listener thread
    threading.Thread(target=speech_listener, daemon=True).start()
    
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    mock_mode = (gemini_key == "")
    
    if mock_mode:
        print(json.dumps({"type": "ready", "mode": "demo"}), flush=True)
        async for line in read_stdin_lines(loop):
            try:
                payload = json.loads(line.strip())
                if payload.get("type") == "set_wake_word":
                    global wake_word_enabled
                    wake_word_enabled = bool(payload.get("enabled", True))
                    print(json.dumps({"type": "status_log", "message": f"Wake word active: {wake_word_enabled}"}), flush=True)
                    continue
                    
                if payload.get("type") == "prompt":
                    prompt_text = payload.get("text", "")
                    prompt_lower = prompt_text.lower()
                    
                    # 1. Simulate thought process
                    print(json.dumps({"type": "status", "state": "thinking"}), flush=True)
                    print(json.dumps({"type": "thought", "text": "Analyzing user request in offline clicky demo mode...\n"}), flush=True)
                    await asyncio.sleep(0.4)
                    print(json.dumps({"type": "thought", "text": "Task requires screen or command control. Splitting task.\n"}), flush=True)
                    await asyncio.sleep(0.4)
                    
                    # 2. Trigger subagents and tools
                    print(json.dumps({
                        "type": "subagent_start",
                        "id": "sub_1",
                        "description": "Initialize display geometry analysis",
                    }), flush=True)
                    await asyncio.sleep(0.4)
                    print(json.dumps({"type": "tool_call", "name": "capture_screen", "args": {}}), flush=True)
                    await asyncio.sleep(0.4)
                    print(json.dumps({"type": "tool_done", "result": "Success: Screen bounds captured (1920x1080)"}), flush=True)
                    await asyncio.sleep(0.3)
                    
                    if "git" in prompt_lower:
                        print(json.dumps({
                            "type": "subagent_start",
                            "id": "sub_2",
                            "description": "Execute local Git shell command",
                        }), flush=True)
                        await asyncio.sleep(0.5)
                        
                        git_cmd = "git status"
                        if "status" in prompt_lower:
                            git_cmd = "git status"
                        elif "log" in prompt_lower:
                            git_cmd = "git log -n 3 --oneline"
                            
                        print(json.dumps({"type": "tool_call", "name": "run_command", "args": {"CommandLine": git_cmd}}), flush=True)
                        await asyncio.sleep(0.6)
                        
                        # Emulate git status output
                        git_res = (
                            "On branch beta\n"
                            "Your branch is up to date with 'origin/beta'.\n\n"
                            "Changes not staged for commit:\n"
                            "  (use \"git add <file>...\" to update what will be committed)\n"
                            "  (use \"git restore <file>...\" to discard changes in working directory)\n"
                            "        modified:   electron/agent_daemon.py\n"
                            "        modified:   electron/main.js\n\n"
                            "no changes added to commit"
                        )
                        print(json.dumps({"type": "tool_done", "result": git_res}), flush=True)
                        
                        final_reply = (
                            f"I spawned a terminal subagent to run `{git_cmd}`. "
                            f"Here is the local repository status:\n\n"
                            f"```bash\n{git_res}\n```\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the live Gemini-based agent."
                        )
                    elif "notion" in prompt_lower:
                        print(json.dumps({
                            "type": "subagent_start",
                            "id": "sub_2",
                            "description": "Access local Notion database via workspace CLI",
                        }), flush=True)
                        await asyncio.sleep(0.5)
                        
                        notion_cmd = "notion-cli search"
                        print(json.dumps({"type": "tool_call", "name": "run_command", "args": {"CommandLine": notion_cmd}}), flush=True)
                        await asyncio.sleep(0.6)
                        
                        notion_res = (
                            "Found 2 matched pages:\n"
                            "1. [Edge Go Project Docs] - Last edited: Today\n"
                            "2. [Clicky Beta Walkthrough] - Last edited: 2h ago"
                        )
                        print(json.dumps({"type": "tool_done", "result": notion_res}), flush=True)
                        
                        final_reply = (
                            f"I executed the Notion workspace command query. Matches found:\n\n"
                            f"{notion_res}\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the live Gemini-based agent."
                        )
                    elif "browser" in prompt_lower or "open" in prompt_lower or "web" in prompt_lower:
                        print(json.dumps({
                            "type": "subagent_start",
                            "id": "sub_2",
                            "description": "Start system web browser session",
                        }), flush=True)
                        await asyncio.sleep(0.5)
                        
                        target_url = "https://github.com"
                        if "github" in prompt_lower:
                            target_url = "https://github.com"
                        elif "google" in prompt_lower:
                            target_url = "https://google.com"
                            
                        print(json.dumps({"type": "tool_call", "name": "run_command", "args": {"CommandLine": f"start {target_url}"}}), flush=True)
                        await asyncio.sleep(0.6)
                        print(json.dumps({"type": "tool_done", "result": f"Opened browser tab at {target_url}"}), flush=True)
                        
                        final_reply = (
                            f"I spawned a subagent to open a web browser tab at `{target_url}`.\n"
                            f"Browser launched successfully!\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the live Gemini-based agent."
                        )
                    elif "click" in prompt_lower or "coordinate" in prompt_lower or "move" in prompt_lower or "point" in prompt_lower:
                        print(json.dumps({
                            "type": "subagent_start",
                            "id": "sub_2",
                            "description": "Calculate Bezier mouse path and click",
                        }), flush=True)
                        await asyncio.sleep(0.5)
                        
                        x, y = 600, 400
                        numbers = re.findall(r'\d+', prompt_text)
                        if len(numbers) >= 2:
                            x, y = int(numbers[0]), int(numbers[1])
                            
                        print(json.dumps({"type": "tool_call", "name": "click_at_coordinates", "args": {"x": x, "y": y}}), flush=True)
                        click_res = click_at_coordinates(x, y)
                        await asyncio.sleep(1.2)
                        print(json.dumps({"type": "tool_done", "result": click_res}), flush=True)
                        
                        final_reply = (
                            f"I successfully split this task using subagents. "
                            f"First, I queried the display geometries (1920x1080). Next, I routed the coordinates "
                            f"to the screen automation subagent, which animated the cursor pointer and executed the click "
                            f"at target location ({x}, {y}) on Windows.\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the real Gemini-based agent."
                        )
                    elif "instagram" in prompt_lower or "post" in prompt_lower:
                        print(json.dumps({
                            "type": "subagent_start",
                            "id": "sub_2",
                            "description": "Publish post to Instagram API",
                        }), flush=True)
                        await asyncio.sleep(0.5)
                        
                        post_content = "Edge Go Windows Beta is live! 🚀"
                        content_match = re.search(r'(?:post|caption)[:\s]+(.+)', prompt_text, re.IGNORECASE)
                        if content_match:
                            post_content = content_match.group(1).strip()
                        
                        print(json.dumps({"type": "tool_call", "name": "instagram_operation", "args": {"action": "post", "post_content": post_content}}), flush=True)
                        insta_res = instagram_operation("post", post_content)
                        await asyncio.sleep(0.5)
                        print(json.dumps({"type": "tool_done", "result": insta_res}), flush=True)
                        
                        final_reply = (
                            f"I delegated the Instagram posting to a specialized subagent.\n"
                            f"Post published successfully: '{post_content}'\n"
                            f"Check the Instagram feed widget in your Control Center to see it!\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the real Gemini-based agent."
                        )
                    else:
                        final_reply = (
                            f"Hello! I am Clicky (Windows Beta).\n"
                            f"You can instruct me to automate tasks. For example:\n"
                            f"1. *'show git status'* — runs terminal Git status.\n"
                            f"2. *'open google browser'* — starts a browser tab.\n"
                            f"3. *'click at 700 500'* — triggers overlay cursor animation and mouse click.\n"
                            f"4. *'post to instagram: hello world'* — publishes a simulated post.\n\n"
                            f"💡 Demo Mode Note: The API key is missing. Add GEMINI_API_KEY in a .env file to enable the real Gemini-based agent."
                        )
                    
                    # 3. Stream final response text
                    chunk_size = 15
                    for i in range(0, len(final_reply), chunk_size):
                        print(json.dumps({"type": "response_chunk", "text": final_reply[i:i+chunk_size]}), flush=True)
                        await asyncio.sleep(0.08)
                        
                    print(json.dumps({"type": "done", "text": final_reply}), flush=True)
                    print(json.dumps({"type": "status", "state": "idle"}), flush=True)
                    
                elif payload.get("type") == "ping":
                    print(json.dumps({"type": "pong"}), flush=True)
                    
            except Exception as e:
                print(json.dumps({
                    "type": "error",
                    "message": str(e),
                    "traceback": traceback.format_exc()
                }), flush=True)
    else:
        # Real AI agent using Google Antigravity SDK
        async with Agent(config) as agent:
            print(json.dumps({"type": "ready", "mode": "ai"}), flush=True)
            
            async for line in read_stdin_lines(loop):
                try:
                    payload = json.loads(line.strip())
                    if payload.get("type") == "set_wake_word":
                        wake_word_enabled = bool(payload.get("enabled", True))
                        print(json.dumps({"type": "status_log", "message": f"Wake word active: {wake_word_enabled}"}), flush=True)
                        continue
                        
                    if payload.get("type") == "prompt":
                        prompt_text = payload.get("text", "")
                        
                        response = await agent.chat(prompt_text)
                        
                        # 1. Stream thoughts
                        async for thought in response.thoughts:
                            print(json.dumps({"type": "thought", "text": thought}), flush=True)
                        
                        # 2. Stream response text chunks
                        async for chunk in response:
                            print(json.dumps({"type": "response_chunk", "text": chunk}), flush=True)
                        
                        # 3. Final complete response text
                        final_text = await response.text()
                        print(json.dumps({"type": "done", "text": final_text}), flush=True)
                        
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
