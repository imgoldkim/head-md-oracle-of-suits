# Quick local server (if Live Server not available)

This project contains a tiny `serve.sh` script and a VS Code task so you can run a local static server without the Live Server extension.

How to use

- Make the script executable (run once):

```bash
chmod +x serve.sh
```

- Start the server from VS Code:
  - Open Command Palette (Cmd+Shift+P) → Run Task → "Serve Demo (python3)"
  - Or run the script from the terminal in the `Demo` folder: `./serve.sh`

What it does

- Starts a Python 3 `http.server` on port 5500 bound to 127.0.0.1 and attempts to open the default browser (macOS `open`).

Notes

- This provides a quick alternative if you don't have the Live Server extension installed or it doesn't show the context menu.
- For hot reload or advanced features, install the Live Server extension or use a Node-based dev server like `browser-sync` or `live-server`.
