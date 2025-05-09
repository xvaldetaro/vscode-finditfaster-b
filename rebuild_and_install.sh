#!/bin/bash
set -e

echo "Compiling extension..."
npm run compile

echo "Packaging extension..."
npm run vscode:package

echo "Installing extension..."
code --install-extension find-it-faster-0.0.39.vsix

echo "Done! Extension has been rebuilt and reinstalled."
echo "You may need to reload VS Code windows to see the changes."