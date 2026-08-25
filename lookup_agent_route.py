import re

server_path = r"C:\Users\NEEL\.gemini\antigravity\scratch\wholeup-ai-chatbot\server.js"
with open(server_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "/admin/agent" in line:
        print(f"Line {idx+1}: {line.strip()}")
        # print next 25 lines
        for j in range(1, 30):
            if idx + j < len(lines):
                print(f"Line {idx+j+1}: {lines[idx+j].strip()}")
