This is a fork of the FindItFaster vscode extension. The main README.md explains how it works.

## Implementation Summary

I've added a new "link file" command to the FindItFaster VS Code extension. This command works similar to "search file" but instead of opening the selected file, it inserts the full path to the file at the current cursor position.

### How the Extension Handles File Selection

The extension uses a file watcher mechanism to communicate between the terminal scripts and the VS Code extension:

1. When a user selects a file in the terminal (using fzf), the shell script writes the selected file path to a "canary file"
2. The extension watches this canary file and triggers the `handleCanaryFileChange()` function when a change is detected
3. This function reads the file contents and calls `openFiles()` if the command was successful
4. The `openFiles()` function normally opens the selected files in VS Code

### The "Link File" Implementation

For the new command:

1. Added a new `linkFile` command in the `commands` object
2. Added `isLinkFileMode` flag to the configuration
3. Modified `executeTerminalCommand()` to set this flag when the command is executed
4. Enhanced `openFiles()` to insert the file path at cursor instead of opening the file when in link file mode
5. Updated package.json to register the new command with VS Code

### Testing in Development Window Issue

The extension doesn't work properly in the VS Code extension development window because:
- The development window doesn't have a proper workspace/project path
- Without a workspace context, the extension falls back to searching the root directory
- This causes issues with file path resolution and temporary file handling

### How to Test the Extension

Instead of using the development window, package and install the extension:

1. Run the provided `rebuild_and_install.sh` script which:
   - Compiles the TypeScript code
   - Packages the extension into a VSIX file
   - Installs the extension in VS Code
2. Test the extension in a regular VS Code window with a real workspace
3. After making changes, run the script again and reload your VS Code windows

The new command is available as "Find It Faster: link file (insert path at cursor)" in the Command Palette.
