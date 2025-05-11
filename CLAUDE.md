This is a fork of the FindItFaster vscode extension, rebranded as AIPromptCompiler. The main README.md explains how it works.

## Implementation Summary

I've added a new "link file" command to the AIPromptCompiler VS Code extension. This command works similar to "search file" but instead of opening the selected file, it inserts the full path to the file at the current cursor position.

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
6. Added keyboard shortcut (cmd+2 on Mac, ctrl+2 on Windows/Linux)
7. Added settings for path format (absolute vs relative) with options:
   - `linkFile.pathFormat`: Choose between "absolute" or "relative" paths
   - `linkFile.basePath`: Custom base path for relative paths (defaults to workspace folder)

### Extract References CLI Tool

I've also added a companion CLI tool to process documents with embedded file paths:

1. The tool is implemented in TypeScript at `src/extract_references.ts`
2. It processes a source file containing absolute paths in ${} notation and creates a target file where:
   - Paths are replaced with just filenames (e.g., `${/path/to/file.ts}` becomes `${file.ts}`)
   - A "File References" section is added at the end of the document
   - For each referenced file, the complete file contents are included
   - Code blocks use appropriate language hints for syntax highlighting based on file extension

Usage:
```
node out/extract_references.js <source_file> <target_file>
```

The tool is registered as a binary in package.json and can be installed globally after compilation.

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

The link file command is available as "AI Prompt Compiler: link file (insert path at cursor)" in the Command Palette and via the keyboard shortcut cmd+2 (Mac) or ctrl+2 (Windows/Linux).

### Extract References VS Code Command

I've also integrated the extract references tool as a VS Code command:

1. Added a command "AI Prompt Compiler: extract file references" in the extension
2. Implemented the command to run the extract_references.ts script on the currently edited file
3. It generates a target file with the same name as the source file but with ".prompt" added before the extension
4. Added a keyboard shortcut (cmd+3 on Mac, ctrl+3 on Windows/Linux)
5. Enhanced the script to support both absolute and relative paths in ${} notation
6. The command respects the linkFile.pathFormat setting ('absolute' or 'relative')
7. When 'relative' mode is active, it passes the base path to the script

This command allows you to easily extract file references from any document by simply pressing the shortcut key while editing the file. It makes it convenient to use the extract references tool without having to manually run the CLI command.

The extract references tool now works with:
- Absolute paths (e.g., `${/path/to/file.ts}`)
- Relative paths (e.g., `${src/file.ts}`)
- Uses the same base path configuration as the "link file" command for consistency
