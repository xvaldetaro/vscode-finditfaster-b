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
async function extractReferences(sourceFilePath: string, targetFilePath: string): Promise<void> {
    try {
        // Check if source file exists
        if (!fs.existsSync(sourceFilePath)) {
            console.error(`Error: Source file '${sourceFilePath}' does not exist`);
            process.exit(1);
        }

        // Read the source file
        const sourceContent = fs.readFileSync(sourceFilePath, 'utf8');

        // Replace backtick paths with just the filenames
        // Find all paths enclosed in backticks using regex
        const pathRegex = /\`(\/[^`]+)\`/g;
        let match;
        const embeddedPaths: string[] = [];

        // Find all embedded paths
        while ((match = pathRegex.exec(sourceContent)) !== null) {
            embeddedPaths.push(match[1]);
        }

        // Create the target content with replaced paths
        let targetContent = sourceContent.replace(pathRegex, (match, filePath) => {
            const fileName = path.basename(filePath);
            return `\`${fileName}\``;
        });

        // Add File References section
        targetContent += '\n\n# File References\n';

        // Process each embedded path
        for (const filePath of embeddedPaths) {
            // Skip if file doesn't exist
            if (!fs.existsSync(filePath)) {
                console.warn(`Warning: File not found: ${filePath}`);
                continue;
            }

            try {
                // Read the file contents
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const fileName = path.basename(filePath);
                const languageHint = getLanguageHint(filePath);

                // Add file section to the target content with language hint for syntax highlighting
                const codeBlock = languageHint ? `\`\`\`${languageHint}` : '```';
                targetContent += `\n## ${fileName} contents\n\n${codeBlock}\n${fileContent}\n\`\`\`\n`;
            } catch (error) {
                console.warn(`Warning: Unable to read file: ${filePath}`);
            }
        }

        // Write the processed content to the target file
        fs.writeFileSync(targetFilePath, targetContent);

        console.log(`File created: ${targetFilePath}`);
    } catch (error) {
        console.error(`Error processing files: ${error}`);
        process.exit(1);
    }
}

// Main function
function main(): void {
    // Check for proper arguments
    if (process.argv.length !== 4) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <source_file> <target_file>`);
        process.exit(1);
    }
    
    const sourceFile = process.argv[2];
    const targetFile = process.argv[3];
    
    extractReferences(sourceFile, targetFile)
        .catch(error => {
            console.error(`Unhandled error: ${error}`);
            process.exit(1);
        });
}

// Execute the main function
main();