# FindItFaster

[![CI pipeline - release](https://github.com/tomrijndorp/vscode-finditfaster/actions/workflows/ci.yml/badge.svg?branch=release)](https://github.com/tomrijndorp/vscode-finditfaster/actions?query=branch%3Amain)
![Platform support](<https://img.shields.io/badge/platform-macos%20%7C%20linux%20%7C%20windows%20(wsl)%20%7C%20windows%20powershell%20(experimental)-334488>)

Finds files and text within files, but faster than VS Code normally does.

Make sure to check the [Requirements](#requirements) below (TL;DR: have `fzf`, `rg`, `bat` on your
`PATH`).

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

- set `find-it-faster.general.useTerminalInEditor` to true to have the extension window open in the
  editor panel rather than in the terminal panel.

<hr />

Native Windows support is now implemented (experimental)! Also see
[Known Issues](#known_issues).

<hr />

## Features

This plugin is useful if you deal with very large projects with lots of files (which makes VS Code's
search functionality quite slow), or when you simply love using `fzf` and `rg` and would like to
bring those tools inside VS Code, similar to how the excellent `fzf.vim` plugin works for Vim.

This extension exposes seven commands:

1. Search for files and open them. Uses a combination of `fzf`, `rg`, and `bat`.
2. Search within files for text and open them. Uses a combination of `fzf`, `rg`, and `bat`.
3. Like 2., but you can limit the file types that will be searched.
4. Link file - search for a file and insert its path at the cursor position. Can be configured to use absolute or relative paths in settings.
5. Resume search. Repeats the last run command with the previous query prepopulated.
6. Extract references - processes a file containing file paths in backticks, creates a new file with the same name plus `.prompt` extension that includes the contents of all referenced files.
7. Line range copy - copies a reference to the selected line range in the format `${/path/to/file.ext[33-45]}` to the clipboard. If no text is selected, it will just copy the file path as `${/path/to/file.ext}`.

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
this extension by checking whether the `FIND_IT_FASTER_ACTIVE` environment variable is set.

<hr />
