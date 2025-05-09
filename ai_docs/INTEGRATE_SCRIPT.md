Lets create a vscode shortcut that runs `src/extract_references.ts` for the currently edited file in vscode. It will automatically create a target_file with the same name and path of the source_file, but add a `.prompt` to it. So for example if I'm editing `prompts/create_something.md`, it will create `prompts/create_something.prompt.md` in the same directory and use that as the target_file for `src/extract_references.ts`

I'm not sure if this can be done without creating an extension easily. Otherwise let's just add the functionality as another command in this extension.
