import re

server_path = r"C:\Users\NEEL\.gemini\antigravity\scratch\wholeup-ai-chatbot\server.js"
with open(server_path, 'r', encoding='utf-8') as f:
    code = f.read()

# find all app.get or router.get
routes = re.findall(r'app\.(get|post|use)\([\'"]([^\'"]+)[\'"]', code)
for r in routes:
    print(r)
