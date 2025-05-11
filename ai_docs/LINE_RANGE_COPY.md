# Command to copy references to blocks of text in files.

The goal of this command is to be able to quickly collect an appendix of references to code snippets in a codebase.
It works by:

- Select a block of text in a file
  ${/Users/xvaldetaro/dev/vscode-finditfaster-b/src/extract_references.ts}
- Press Cmd+4 and it will insert into the clipboard a reference to the file and the lines that are selected.
- So the text that will go to clipboard should be like: <clipboard>${/path/to/file.ext[33-45]}</clipboard>
