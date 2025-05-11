# AIPromptCompiler

[![CI pipeline - release](https://github.com/tomrijndorp/vscode-finditfaster/actions/workflows/ci.yml/badge.svg?branch=release)](https://github.com/tomrijndorp/vscode-finditfaster/actions?query=branch%3Amain)
![Platform support](<https://img.shields.io/badge/platform-macos%20%7C%20linux%20%7C%20windows%20(wsl)%20%7C%20windows%20powershell%20(experimental)-334488>)

A VS Code extension for creating AI prompts with code references from large codebases. Navigate files quickly, insert file paths into your prompts, and compile referenced files into comprehensive AI-ready prompts.

This extension is a fork of FindItFaster with added functionality for AI prompt creation. Make sure to check the [Requirements](#requirements) below (TL;DR: have `fzf`, `rg`, `bat` on your `PATH`).

<hr />

Default key bindings:

- `cmd+shift+j` / `ctrl+shift+j` to search files,
- `cmd+shift+u` / `ctrl+shift+u` to search for text within files,
- `cmd+shift+ctrl+u` / `ctrl+shift+alt+u` to search for text within files with type pre-filtering,
- `cmd+2` / `ctrl+2` to insert file path at cursor,
- `cmd+3` / `ctrl+3` to extract file references from the current file,
- `cmd+4` / `ctrl+4` to copy a line range reference to clipboard.

You can change these using VS Code's keyboard shortcuts.

Recommended settings:

- set `ai-prompt-compiler.general.useTerminalInEditor` to true to have the extension window open in the
  editor panel rather than in the terminal panel.

<hr />

Native Windows support is now implemented (experimental)! Also see
[Known Issues](#known_issues).

<hr />

## Features

This extension is designed for creating AI prompts with code references from large monorepos. It combines fast file navigation with specialized tools for AI prompt creation:

1. **Fast file navigation** - Quickly find and reference files in large codebases using `fzf` and `ripgrep`
2. **Path insertion** - Insert file paths directly into your prompts with the "link file" command
3. **AI prompt compilation** - Extract code from referenced files and compile them into a comprehensive prompt
4. **Line range references** - Specify exact code sections by referencing specific line ranges

This plugin is particularly useful if you deal with very large projects with lots of files (which makes VS Code's
search functionality quite slow), or when you need to create detailed AI prompts that reference multiple code files.

This extension exposes seven commands:

1. **Search file** - Find and open files quickly using a combination of `fzf`, `rg`, and `bat`.
2. **Search within files** - Find text within files and open the matches. Uses `fzf`, `rg`, and `bat`.
3. **Search within files with type filter** - Like above, but limit searches to specific file types.
4. **Link file** - Search for a file and insert its path (in `${path}` format) at the cursor position. Configure absolute or relative paths in settings.
5. **Resume search** - Repeat the last command with the previous query pre-populated.
6. **Extract file references** - Process a document containing file paths in `${path}` notation and create a compiled prompt document with all referenced file contents included.
7. **Copy line range reference** - Copy a reference to the selected line range in the format `${/path/to/file.ext[33-45]}` to the clipboard. If no selection, it copies just the file path.

If your active text editor has a selection, it will be used as the initial query (you can disable
this setting).

⬇️ &nbsp;**Find files**
![Find Files](media/find_files.gif)

⬇️ &nbsp;**Find text within files**
![Find Within Files](media/find_within_files.gif)

⬇️ &nbsp;**Find text within files, with file type filter**
![Find Within Files](media/find_within_files_with_filter.gif)

This extension has also been tested on remote workspaces (e.g. SSH sessions).

<hr />

<a name="requirements"></a>

## Requirements

This plugin opens a terminal inside VS Code. Make sure that you can run `fzf`, `rg`, `bat`, and
`sed` by running these commands directly in your terminal. If those work, this plugin will work as
expected. If it doesn't, confirm that you are running recent versions of all three tools.

If you're not familiar with these command line tools, you might want to check them out. They are
awesome tools that can be individually used and make you more productive. And when combined such as
for instance in this extension, they're very powerful. They're available for many platforms and easy
to install using package managers or by simply installing a binary.

- [`fzf` ("command-line fuzzy finder")](https://github.com/junegunn/fzf)
- [`rg` ("ripgrep")](https://github.com/BurntSushi/ripgrep)
- [`bat` ("a cat clone with wings")](https://github.com/sharkdp/bat)

I have no affiliation with any of these tools, but hugely appreciate them, and wanted to bring them
into a VS Code context.

<hr />

## Extension Settings

See the settings for this extension in the GUI.
You might want to play with `fzf`, `rg` and `bat` on the command line and read their manuals in
order to get a better understanding of some of the settings in this extension. It will be worth
your time.

`fzf` can also be configured through various environment variables. This extension does nothing to
disable that behavior, so feel free to use those. You can also check whether `fzf` is running inside
this extension by checking whether the `AI_PROMPT_COMPILER_ACTIVE` environment variable is set.

<hr />

## AI Prompt Workflow

This extension facilitates a streamlined workflow for creating AI prompts with code references:

1. **Create a prompt document** - Start with a document where you'll write your prompt to the AI
2. **Reference files** - Use the "Link file" command (cmd+2/ctrl+2) to quickly insert file references in `${path}` format
3. **Reference line ranges** - Use the "Copy line range reference" command (cmd+4/ctrl+4) to copy specific code sections
4. **Compile the prompt** - Use the "Extract file references" command (cmd+3/ctrl+3) to generate a complete prompt with all referenced code

The compiled prompt file will have:
- All file paths simplified to just filenames (e.g., `${file.ts}` instead of `${/path/to/file.ts}`)
- A "File References" section appended with all referenced file contents
- Proper language syntax highlighting for each code block based on file extension

This workflow is particularly useful when working with large codebases and AI models that don't have direct access to your filesystem.
