As a companion to the link file command, we write a script that:

- receives <source_file> and <target_file> as args. <source_file> is expected to have some embedded paths from usage of the link file command.
- Create the <target_file>. Copy all content from <source_file> to it, but replace the embedded paths with just file names. So `/path/to/my/file.ext` becomes `file.ext`.
- Create an appendix section at the end of <target_file> with a `# File References` header.
- For each embedded paths of <source_file> (e.g. `/current/embedded/path/file1.ext`):
  - Read the full file contents.
  - Add a subsection in <target_file>'s appendix with the title `# file1.ext contents`
