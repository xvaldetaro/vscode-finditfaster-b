#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';

// Function to determine language hint based on file extension
function getLanguageHint(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase().substring(1);

    // Map of file extensions to language hints for syntax highlighting
    const languageMap: { [key: string]: string } = {
        // Programming languages
        'ts': 'typescript',
        'js': 'javascript',
        'py': 'python',
        'rb': 'ruby',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'php': 'php',
        'rs': 'rust',
        'swift': 'swift',
        'kt': 'kotlin',

        // Web technologies
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'sass',
        'less': 'less',
        'json': 'json',
        'xml': 'xml',
        'svg': 'svg',

        // Config files
        'yml': 'yaml',
        'yaml': 'yaml',
        'toml': 'toml',
        'ini': 'ini',
        'md': 'markdown',
        'sh': 'bash',
        'bash': 'bash',
        'ps1': 'powershell',
        'sql': 'sql',
        'dockerfile': 'dockerfile',
    };

    return languageMap[extension] || '';
}

// Function to process a file and extract references
async function extractReferences(sourceFilePath: string, targetFilePath: string, basePath: string = ''): Promise<void> {
    try {
        // Check if source file exists
        if (!fs.existsSync(sourceFilePath)) {
            console.error(`Error: Source file '${sourceFilePath}' does not exist`);
            process.exit(1);
        }

        // Read the source file
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');

        // Replace ${path} patterns with just the filenames
        // Find all paths enclosed in ${} using regex - handle both absolute (/path/to/file) and relative (path/to/file) paths
        // Also handle line range references in the format ${path[start-end]}
        const pathRegex = /\${([^}\[]+)(?:\[(\d+)-(\d+)\])?}/g;
        let match;
        const embeddedPaths: string[] = [];
        const lineRanges: Map<string, {start: number, end: number}> = new Map();

        // Find all embedded paths
        while ((match = pathRegex.exec(sourceContent)) !== null) {
            const pathFromMatch = match[1];
            const startLine = match[2] ? parseInt(match[2]) : undefined;
            const endLine = match[3] ? parseInt(match[3]) : undefined;

            // Determine if this is a path and not just a code snippet or interpolation
            // Very basic heuristic: if it has file extension and no obvious code characters like (){}=
            if (path.extname(pathFromMatch) && !/[(){};=]/.test(pathFromMatch)) {
                embeddedPaths.push(pathFromMatch);

                // Store line ranges if they exist
                if (startLine !== undefined && endLine !== undefined) {
                    lineRanges.set(pathFromMatch, {start: startLine, end: endLine});
                }
            }
        }

        // Create a set of files that actually exist
        const existingFiles = new Set<string>();
        for (const filePath of embeddedPaths) {
            // Resolve the file path - if it's absolute, use it directly, if relative, resolve against basePath
            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);
            if (fs.existsSync(resolvedPath)) {
                existingFiles.add(filePath);
            }
        }

        // Create the target content with replaced paths - only replace paths for files that exist
        let targetContent = sourceContent.replace(pathRegex, (match, filePath, startLine, endLine) => {
            // Only replace if it's a file path we've identified AND the file exists
            if (embeddedPaths.includes(filePath) && existingFiles.has(filePath)) {
                const fileName = path.basename(filePath);
                if (startLine && endLine) {
                    return `@${fileName}[${startLine}-${endLine}]`;
                } else {
                    return `@${fileName}`;
                }
            }
            // Return unchanged if not a file path or file doesn't exist
            return match;
        });

        // Add File References section
        targetContent += '\n\n# File References\n';

        // Process each embedded path
        for (const filePath of embeddedPaths) {
            // Resolve the file path - if it's absolute, use it directly, if relative, resolve against basePath
            const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);

            // Skip if file doesn't exist
            if (!fs.existsSync(resolvedPath)) {
                console.warn(`Warning: File not found: ${resolvedPath} (original: ${filePath})`);
                continue;
            }

            try {
                // Read the file contents
                const fileContent = fs.readFileSync(resolvedPath, 'utf8');
                const fileName = path.basename(filePath);
                const languageHint = getLanguageHint(filePath);

                // Check if we have a line range for this file
                let contentToInclude = fileContent;
                let headerSuffix = '';

                if (lineRanges.has(filePath)) {
                    const range = lineRanges.get(filePath)!;
                    const lines = fileContent.split('\n');

                    // Adjust for 1-based line numbers (coming from the editor) to 0-based array indices
                    const startIdx = Math.max(0, range.start - 1);
                    const endIdx = Math.min(lines.length, range.end);

                    // Extract only the specified line range
                    contentToInclude = lines.slice(startIdx, endIdx).join('\n');
                    headerSuffix = ` (lines ${range.start}-${range.end})`;
                }

                // Add file section to the target content with language hint for syntax highlighting
                const codeBlock = languageHint ? `\`\`\`${languageHint}` : '```';
                targetContent += `\n## ${fileName}${headerSuffix} contents\n\n${codeBlock}\n${contentToInclude}\n\`\`\`\n`;
            } catch (error) {
                console.warn(`Warning: Unable to read file: ${resolvedPath} (original: ${filePath})`);
            }
        }

        // Check if target file already exists and remove it
        if (fs.existsSync(targetFilePath)) {
            try {
                fs.unlinkSync(targetFilePath);
                console.log(`Removed existing target file: ${targetFilePath}`);
            } catch (error) {
                console.warn(`Warning: Could not remove existing target file: ${targetFilePath}`);
            }
        }

        // Write the processed content to the target file
        fs.writeFileSync(targetFilePath, targetContent);

        console.log(`File created: ${targetFilePath}`);
        console.log(`Processed ${embeddedPaths.length} file references`);
    } catch (error) {
        console.error(`Error processing files: ${error}`);
        process.exit(1);
    }
}

// Main function
function main(): void {
    // Parse command line arguments
    let sourceFile = '';
    let targetFile = '';
    let basePath = '';

    // Process command-line arguments
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];

        if (arg === '--base-path' || arg === '-b') {
            if (i + 1 < process.argv.length) {
                basePath = process.argv[i + 1];
                i++; // Skip the next argument as it's the base path value
            } else {
                console.error('Error: --base-path flag requires a path value');
                process.exit(1);
            }
        } else if (!sourceFile) {
            sourceFile = arg;
        } else if (!targetFile) {
            targetFile = arg;
        }
    }

    // Validate required arguments
    if (!sourceFile || !targetFile) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <source_file> <target_file> [--base-path|-b <base_path>]`);
        process.exit(1);
    }

    // If no base path specified, use the source file's directory
    if (!basePath) {
        basePath = path.dirname(sourceFile);
    }

    extractReferences(sourceFile, targetFile, basePath)
        .catch(error => {
            console.error(`Unhandled error: ${error}`);
            process.exit(1);
        });
}

// Execute the main function
main();