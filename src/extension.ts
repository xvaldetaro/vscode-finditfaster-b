/**
 * TODO:
 * [ ] Show relative paths whenever possible
 *     - This might be tricky. I could figure out the common base path of all dirs we search, I guess?
 *
 * Feature options:
 * [ ] Buffer of open files / show currently open files / always show at bottom => workspace.textDocuments is a bit curious / borked
 */

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// Let's keep it DRY and load the package here so we can reuse some data from it
let PACKAGE: any;
// Reference to the terminal we use
let term: vscode.Terminal;
let previousActiveTerminal: vscode.Terminal | null;
let isExtensionChangedTerminal = false;

//
// Define the commands we expose. URIs are populated upon extension activation
// because only then we'll know the actual paths.
//
interface Command {
    script: string,
    uri: vscode.Uri | undefined,
    preRunCallback: undefined | (() => boolean | Promise<boolean>),
    postRunCallback: undefined | (() => void),
}
const commands: { [key: string]: Command } = {
    findFiles: {
        script: 'find_files',  // we append a platform-specific extension later
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    findFilesWithType: {
        script: 'find_files',
        uri: undefined,
        preRunCallback: selectTypeFilter,
        postRunCallback: () => { CFG.useTypeFilter = false; },
    },
    findWithinFiles: {
        script: 'find_within_files',
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    findWithinFilesWithType: {
        script: 'find_within_files',
        uri: undefined,
        preRunCallback: selectTypeFilter,
        postRunCallback: () => { CFG.useTypeFilter = false; },
    },
    linkFile: {
        script: 'find_files',  // reuse the same script as findFiles
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    listSearchLocations: {
        script: 'list_search_locations',
        uri: undefined,
        preRunCallback: writePathOriginsFile,
        postRunCallback: undefined,
    },
    flightCheck: {
        script: 'flight_check',
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    resumeSearch: {
        script: 'resume_search', // Dummy. We will set the uri from the last-run script. But we will use this value to check whether we are resuming.
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    extractReferences: {
        script: 'extract_references', // This is a dummy script name since we'll execute directly via Node
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
    lineRangeCopy: {
        script: 'line_range_copy', // This is a dummy script name since we'll handle everything in the extension
        uri: undefined,
        preRunCallback: undefined,
        postRunCallback: undefined,
    },
};

type WhenCondition = 'always' | 'never' | 'noWorkspaceOnly';
enum PathOrigin {
    cwd = 1 << 0,
    workspace = 1 << 1,
    settings = 1 << 2,
}

function getTypeOptions() {
    const result = cp.execSync('rg --type-list').toString();
    return result.split('\n').map(line => {
        const [typeStr, typeInfo] = line.split(':');
        return new FileTypeOption(typeStr, typeInfo, CFG.findWithinFilesFilter.has(typeStr));
    }).filter(x => x.label.trim().length !== 0);
}

class FileTypeOption implements vscode.QuickPickItem {
    label: string;
    description: string;
    picked: boolean;

    constructor(typeStr: string, types: string, picked: boolean = false) {
        this.label = typeStr;
        this.description = types;
        this.picked = picked;
    }
}

async function selectTypeFilter() {
    const opts = getTypeOptions();
    return await new Promise<boolean>((resolve, _) => {
        const qp = vscode.window.createQuickPick();
        let hasResolved = false;  // I don't understand why this is necessary... Seems like I can resolve twice?

        qp.items = opts;
        qp.title = `Type one or more type identifiers below and press Enter,
        OR select the types you want below. Example: typing "py cpp<Enter>"
        (without ticking any boxes will search within python and C++ files.
        Typing nothing and selecting those corresponding entries will do the
        same. Typing "X" (capital x) clears all selections.`;
        qp.placeholder = 'enter one or more types...';
        qp.canSelectMany = true;
        // https://github.com/microsoft/vscode/issues/103084
        // https://github.com/microsoft/vscode/issues/119834
        qp.selectedItems = qp.items.filter(x => CFG.findWithinFilesFilter.has(x.label));
        qp.value = [...CFG.findWithinFilesFilter.keys()].reduce((x, y) => x + ' ' + y, '');
        qp.matchOnDescription = true;
        qp.show();
        qp.onDidChangeValue(() => {
            if (qp.value.length > 0 && qp.value[qp.value.length - 1] === 'X') {
                // This is where we're fighting with VS Code a little bit.
                // When you don't reassign the items, the "X" will still be filtering the results,
                // which we obviously don't want. Currently (6/2021), this works as expected.
                qp.value = '';
                qp.selectedItems = [];
                qp.items = qp.items;  // keep this
            }
        });
        qp.onDidAccept(() => {
            CFG.useTypeFilter = true;
            console.log(qp.activeItems);
            CFG.findWithinFilesFilter.clear();  // reset
            if (qp.selectedItems.length === 0) {
                // If there are no active items, use the string that was entered.
                // split on empty string yields an array with empty string, catch that
                const types = qp.value === '' ? [] : qp.value.trim().split(/\s+/);
                types.forEach(x => CFG.findWithinFilesFilter.add(x));
            } else {
                // If there are active items, use those.
                qp.selectedItems.forEach(x => CFG.findWithinFilesFilter.add(x.label));
            }
            hasResolved = true;
            resolve(true);
            qp.dispose();
        });
        qp.onDidHide(() => {
            qp.dispose();
            if (!hasResolved) {
                resolve(false);
            }
        });
    });
}

/** Global variable cesspool erm, I mean, Configuration Data Structure! It does the job for now. */
type PathFormat = 'absolute' | 'relative';

interface Config {
    extensionName: string | undefined,
    searchPaths: string[],
    searchPathsOrigins: { [key: string]: PathOrigin },
    disableStartupChecks: boolean,
    useEditorSelectionAsQuery: boolean,
    useGitIgnoreExcludes: boolean,
    useWorkspaceSearchExcludes: boolean,
    findFilesPreviewEnabled: boolean,
    findFilesPreviewCommand: string,
    findFilesPreviewWindowConfig: string,
    findWithinFilesPreviewEnabled: boolean,
    findWithinFilesPreviewCommand: string,
    findWithinFilesPreviewWindowConfig: string,
    findWithinFilesFilter: Set<string>,
    workspaceSettings: {
        folders: string[],
    },
    canaryFile: string,
    selectionFile: string,
    lastQueryFile: string,
    lastPosFile: string,
    hideTerminalAfterSuccess: boolean,
    hideTerminalAfterFail: boolean,
    clearTerminalAfterUse: boolean,
    showMaximizedTerminal: boolean,
    flightCheckPassed: boolean,
    additionalSearchLocations: string[],
    additionalSearchLocationsWhen: WhenCondition,
    searchCurrentWorkingDirectory: WhenCondition,
    searchWorkspaceFolders: boolean,
    extensionPath: string,
    tempDir: string,
    useTypeFilter: boolean,
    lastCommand: string,
    batTheme: string,
    openFileInPreviewEditor: boolean,
    killTerminalAfterUse: boolean,
    fuzzRipgrepQuery: boolean,
    restoreFocusTerminal: boolean,
    useTerminalInEditor: boolean,
    shellPathForTerminal: string,
    shellArgsForTerminal: string[] | undefined,
    isLinkFileMode: boolean,
    linkFilePathFormat: PathFormat,
    linkFileBasePath: string,
    isLineRangeCopyMode: boolean,
};
const CFG: Config = {
    extensionName: undefined,
    searchPaths: [],
    searchPathsOrigins: {},
    disableStartupChecks: false,
    useEditorSelectionAsQuery: true,
    useGitIgnoreExcludes: true,
    useWorkspaceSearchExcludes: true,
    findFilesPreviewEnabled: true,
    findFilesPreviewCommand: '',
    findFilesPreviewWindowConfig: '',
    findWithinFilesPreviewEnabled: true,
    findWithinFilesPreviewCommand: '',
    findWithinFilesPreviewWindowConfig: '',
    findWithinFilesFilter: new Set(),
    workspaceSettings: {
        folders: [],
    },
    canaryFile: '',
    selectionFile: '',
    lastQueryFile: '',
    lastPosFile: '',
    hideTerminalAfterSuccess: false,
    hideTerminalAfterFail: false,
    clearTerminalAfterUse: false,
    showMaximizedTerminal: false,
    flightCheckPassed: false,
    additionalSearchLocations: [],
    additionalSearchLocationsWhen: 'never',
    searchCurrentWorkingDirectory: 'never',
    searchWorkspaceFolders: true,
    extensionPath: '',
    tempDir: '',
    useTypeFilter: false,
    lastCommand: '',
    batTheme: '',
    openFileInPreviewEditor: false,
    killTerminalAfterUse: false,
    fuzzRipgrepQuery: false,
    restoreFocusTerminal: false,
    useTerminalInEditor: false,
    shellPathForTerminal: '',
    shellArgsForTerminal: undefined,
    isLinkFileMode: false,
    linkFilePathFormat: 'absolute',
    linkFileBasePath: '',
    isLineRangeCopyMode: false,
};

/** Ensure that whatever command we expose in package.json actually exists */
function checkExposedFunctions() {
    for (const x of PACKAGE.contributes.commands) {
        const fName = x.command.substring(PACKAGE.name.length + '.'.length);
        assert(fName in commands);
    }
}

/** We need the extension context to get paths to our scripts. We do that here. */
function setupConfig(context: vscode.ExtensionContext) {
    CFG.extensionName = PACKAGE.name;
    assert(CFG.extensionName);
    const localScript = (x: string) => vscode.Uri.file(path.join(context.extensionPath, x) + (os.platform() === 'win32' ? '.ps1' : '.sh'));
    commands.findFiles.uri = localScript(commands.findFiles.script);
    commands.findFilesWithType.uri = localScript(commands.findFiles.script);
    commands.findWithinFiles.uri = localScript(commands.findWithinFiles.script);
    commands.findWithinFilesWithType.uri = localScript(commands.findWithinFiles.script);
    commands.linkFile.uri = localScript(commands.linkFile.script);
    commands.listSearchLocations.uri = localScript(commands.listSearchLocations.script);
    commands.flightCheck.uri = localScript(commands.flightCheck.script);

    // For extractReferences, we don't need an actual script since we're executing it directly in executeExtractReferences
    commands.extractReferences.uri = vscode.Uri.file(path.join(context.extensionPath, 'out', 'extract_references.js'));
}

/** Register the commands we defined with VS Code so users have access to them */
function registerCommands() {
    Object.keys(commands).map((k) => {
        vscode.commands.registerCommand(`${CFG.extensionName}.${k}`, () => {
            executeTerminalCommand(k);
        });
    });
}

/** Entry point called by VS Code */
export function activate(context: vscode.ExtensionContext) {
    CFG.extensionPath = context.extensionPath;
    const local = (x: string) => vscode.Uri.file(path.join(CFG.extensionPath, x));

    // Load our package.json
    PACKAGE = JSON.parse(fs.readFileSync(local('package.json').fsPath, 'utf-8'));
    setupConfig(context);
    checkExposedFunctions();

    handleWorkspaceSettingsChanges();
    handleWorkspaceFoldersChanges();

    registerCommands();
    reinitialize();
}

/* Called when extension is deactivated by VS Code */
export function deactivate() {
    term?.dispose();
    fs.rmSync(CFG.canaryFile, { force: true });
    fs.rmSync(CFG.selectionFile, { force: true });
    if (fs.existsSync(CFG.lastQueryFile)) {
        fs.rmSync(CFG.lastQueryFile, { force: true });
    }
    if (fs.existsSync(CFG.lastPosFile)) {
        fs.rmSync(CFG.lastPosFile, { force: true });
    }
}

/** Map settings from the user-configurable settings to our internal data structure */
function updateConfigWithUserSettings() {
    function getCFG<T>(key: string) {
        const userCfg = vscode.workspace.getConfiguration();
        const ret = userCfg.get<T>(`${CFG.extensionName}.${key}`);
        assert(ret !== undefined);
        return ret;
    }

    CFG.disableStartupChecks = getCFG('advanced.disableStartupChecks');
    CFG.useEditorSelectionAsQuery = getCFG('advanced.useEditorSelectionAsQuery');
    CFG.useWorkspaceSearchExcludes = getCFG('general.useWorkspaceSearchExcludes');
    CFG.useGitIgnoreExcludes = getCFG('general.useGitIgnoreExcludes');
    CFG.additionalSearchLocations = getCFG('general.additionalSearchLocations');
    CFG.additionalSearchLocationsWhen = getCFG('general.additionalSearchLocationsWhen');
    CFG.searchCurrentWorkingDirectory = getCFG('general.searchCurrentWorkingDirectory');
    CFG.searchWorkspaceFolders = getCFG('general.searchWorkspaceFolders');
    CFG.hideTerminalAfterSuccess = getCFG('general.hideTerminalAfterSuccess');
    CFG.hideTerminalAfterFail = getCFG('general.hideTerminalAfterFail');
    CFG.clearTerminalAfterUse = getCFG('general.clearTerminalAfterUse');
    CFG.killTerminalAfterUse = getCFG('general.killTerminalAfterUse');
    CFG.showMaximizedTerminal = getCFG('general.showMaximizedTerminal');
    CFG.batTheme = getCFG('general.batTheme');
    CFG.openFileInPreviewEditor = getCFG('general.openFileInPreviewEditor'),
        CFG.findFilesPreviewEnabled = getCFG('findFiles.showPreview');
    CFG.findFilesPreviewCommand = getCFG('findFiles.previewCommand');
    CFG.findFilesPreviewWindowConfig = getCFG('findFiles.previewWindowConfig');
    CFG.findWithinFilesPreviewEnabled = getCFG('findWithinFiles.showPreview');
    CFG.findWithinFilesPreviewCommand = getCFG('findWithinFiles.previewCommand');
    CFG.findWithinFilesPreviewWindowConfig = getCFG('findWithinFiles.previewWindowConfig');
    CFG.fuzzRipgrepQuery = getCFG('findWithinFiles.fuzzRipgrepQuery');
    CFG.restoreFocusTerminal = getCFG('general.restoreFocusTerminal');
    CFG.useTerminalInEditor = getCFG('general.useTerminalInEditor');
    CFG.shellPathForTerminal = getCFG('general.shellPathForTerminal');
    CFG.shellArgsForTerminal = getCFG('general.shellArgsForTerminal');
    CFG.linkFilePathFormat = getCFG('linkFile.pathFormat');
    CFG.linkFileBasePath = getCFG('linkFile.basePath');
}

function collectSearchLocations() {
    const locations: string[] = [];
    // searchPathsOrigins is for diagnostics only
    CFG.searchPathsOrigins = {};
    const setOrUpdateOrigin = (path: string, origin: PathOrigin) => {
        if (CFG.searchPathsOrigins[path] === undefined) {
            CFG.searchPathsOrigins[path] = origin;
        } else {
            CFG.searchPathsOrigins[path] |= origin;
        }
    };
    // cwd
    const addCwd = () => {
        const cwd = process.cwd();
        locations.push(cwd);
        setOrUpdateOrigin(cwd, PathOrigin.cwd);
    };
    switch (CFG.searchCurrentWorkingDirectory) {
        case 'always':
            addCwd();
            break;
        case 'never':
            break;
        case 'noWorkspaceOnly':
            if (vscode.workspace.workspaceFolders === undefined) {
                addCwd();
            }
            break;
        default:
            assert(false, 'Unhandled case');
    }

    // additional search locations from extension settings
    const addSearchLocationsFromSettings = () => {
        locations.push(...CFG.additionalSearchLocations);
        CFG.additionalSearchLocations.forEach(x => setOrUpdateOrigin(x, PathOrigin.settings));
    };
    switch (CFG.additionalSearchLocationsWhen) {
        case 'always':
            addSearchLocationsFromSettings();
            break;
        case 'never':
            break;
        case 'noWorkspaceOnly':
            if (vscode.workspace.workspaceFolders === undefined) {
                addSearchLocationsFromSettings();
            }
            break;
        default:
            assert(false, 'Unhandled case');
    }

    // add the workspace folders
    if (CFG.searchWorkspaceFolders && vscode.workspace.workspaceFolders !== undefined) {
        const dirs = vscode.workspace.workspaceFolders.map(x => {
            const uri = decodeURIComponent(x.uri.toString());
            if (uri.substring(0, 7) === 'file://') {
                if (os.platform() === 'win32') {
                    return uri.substring(8)
                        .replace(/\//g, "\\")
                        .replace(/%3A/g, ":");
                } else {
                    return uri.substring(7);
                }
            } else {
                vscode.window.showErrorMessage('Non-file:// uri\'s not currently supported...');
                return '';
            }
        });
        locations.push(...dirs);
        dirs.forEach(x => setOrUpdateOrigin(x, PathOrigin.workspace));
    }

    return locations;
}

/** Produce a human-readable string explaining where the search paths come from */
function explainSearchLocations(useColor = false) {
    const listDirs = (which: PathOrigin) => {
        let str = '';
        Object.entries(CFG.searchPathsOrigins).forEach(([k, v]) => {
            if ((v & which) !== 0) {
                str += `- ${k}\n`;
            }
        });
        if (str.length === 0) {
            str += '- <none>\n';
        }
        return str;
    };

    const maybeBlue = (s: string) => {
        return useColor ? `\\033[36m${s}\\033[0m` : s;
    };

    let ret = '';
    ret += maybeBlue('Paths added because they\'re the working directory:\n');
    ret += listDirs(PathOrigin.cwd);
    ret += maybeBlue('Paths added because they\'re defined in the workspace:\n');
    ret += listDirs(PathOrigin.workspace);
    ret += maybeBlue('Paths added because they\'re the specified in the settings:\n');
    ret += listDirs(PathOrigin.settings);

    return ret;
}

function writePathOriginsFile() {
    fs.writeFileSync(path.join(CFG.tempDir, 'paths_explain'), explainSearchLocations(os.platform() !== 'win32'));
    return true;
}

function handleWorkspaceFoldersChanges() {

    CFG.searchPaths = collectSearchLocations();

    // Also re-update when anything changes
    vscode.workspace.onDidChangeWorkspaceFolders(event => {
        console.log('workspace folders changed: ', event);
        CFG.searchPaths = collectSearchLocations();
    });
}

function handleWorkspaceSettingsChanges() {
    updateConfigWithUserSettings();

    // Also re-update when anything changes
    vscode.workspace.onDidChangeConfiguration(_ => {
        updateConfigWithUserSettings();
        // This may also have affected our search paths
        CFG.searchPaths = collectSearchLocations();
        // We need to update the env vars in the terminal
        reinitialize();
    });
}

/** Check seat belts are on. Also, check terminal commands are on PATH */
function doFlightCheck(): boolean {
    const parseKeyValue = (line: string) => {
        return line.split(': ', 2);
    };

    if (!commands.flightCheck || !commands.flightCheck.uri) {
        vscode.window.showErrorMessage('Failed to find flight check script. This is a bug. Please report it.');
        return false;
    }

    try {
        let errStr = '';
        const kvs: any = {};
        let out = "";
        if (os.platform() === 'win32') {
            out = cp.execFileSync("powershell.exe", ['-ExecutionPolicy', 'Bypass', '-File', `"${commands.flightCheck.uri.fsPath}"`], { shell: true }).toString('utf-8');
        } else {
            out = cp.execFileSync(commands.flightCheck.uri.fsPath, { shell: true }).toString('utf-8');
        }
        out.split('\n').map(x => {
            const maybeKV = parseKeyValue(x);
            if (maybeKV.length === 2) {
                kvs[maybeKV[0]] = maybeKV[1];
            }
        });
        if (kvs['bat'] === undefined || kvs['bat'] === 'not installed') {
            errStr += 'bat not found on your PATH. ';
        }
        if (kvs['fzf'] === undefined || kvs['fzf'] === 'not installed') {
            errStr += 'fzf not found on your PATH. ';
        }
        if (kvs['rg'] === undefined || kvs['rg'] === 'not installed') {
            errStr += 'rg not found on your PATH. ';
        }
        if (os.platform() !== 'win32' && (kvs['sed'] === undefined || kvs['sed'] === 'not installed')) {
            errStr += 'sed not found on your PATH. ';
        }
        if (errStr !== '') {
            vscode.window.showErrorMessage(`Failed to activate plugin! Make sure you have the required command line tools installed as outlined in the README. ${errStr}`);
        }

        return errStr === '';
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to run checks before starting extension. Maybe this is helpful: ${error}`);
        return false;
    }
}

/**
 * All the logic that's the same between starting the plugin and re-starting
 * after user settings change
 */
function reinitialize() {
    term?.dispose();
    updateConfigWithUserSettings();
    // console.log('plugin config:', CFG);
    if (!CFG.flightCheckPassed && !CFG.disableStartupChecks) {
        CFG.flightCheckPassed = doFlightCheck();
    }

    if (!CFG.flightCheckPassed && !CFG.disableStartupChecks) {
        return false;
    }

    //
    // Set up a file watcher. Its contents tell us what files the user selected.
    // It also means the command was completed so we can do stuff like
    // optionally hiding the terminal.
    //
    CFG.tempDir = fs.mkdtempSync(`${tmpdir()}${path.sep}${CFG.extensionName}-`);
    CFG.canaryFile = path.join(CFG.tempDir, 'snitch');
    CFG.selectionFile = path.join(CFG.tempDir, 'selection');
    CFG.lastQueryFile = path.join(CFG.tempDir, 'last_query');
    CFG.lastPosFile = path.join(CFG.tempDir, 'last_position');
    fs.writeFileSync(CFG.canaryFile, '');
    fs.watch(CFG.canaryFile, (eventType) => {
        if (eventType === 'change') {
            handleCanaryFileChange();
        } else if (eventType === 'rename') {
            vscode.window.showErrorMessage(`Issue detected with AIPromptCompiler extension. You may have to reload it.`);
        }
    });
    return true;
}

/**
 * Gets the base path for relative paths based on configuration
 * @returns The base path to use for relative paths
 */
function getBasePath(): string {
    if (CFG.linkFileBasePath) {
        // Use the custom base path if specified
        return CFG.linkFileBasePath;
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        // Use the first workspace folder as the base path
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    // Fall back to empty string if no base path is available
    return '';
}

/**
 * Converts an absolute file path to a relative path based on the base path
 * @param filePath The absolute file path
 * @returns The relative file path
 */
function getRelativePath(filePath: string): string {
    const basePath = getBasePath();
    if (basePath) {
        return path.relative(basePath, filePath);
    }
    // Fall back to absolute path if no base path is available
    return filePath;
}

/** Interpreting the terminal output and turning them into a vscode command */
function openFiles(data: string) {
    const filePaths = data.split('\n').filter(s => s !== '');
    assert(filePaths.length > 0);

    // Handle linkFile mode - insert file path at cursor instead of opening file
    if (CFG.isLinkFileMode) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                // Insert each file path at the cursor position
                // Note: For multiple files, they'll be inserted one after another
                filePaths.forEach((p, index) => {
                    let [file] = p.split(':', 1);
                    file = file.trim();

                    // Convert to relative path if configured
                    if (CFG.linkFilePathFormat === 'relative') {
                        file = getRelativePath(file);
                    }

                    // For multiple files, add a newline between them (except the first one)
                    editBuilder.insert(editor.selection.active, "${" + file + "}");
                });
            });
        } else {
            vscode.window.showErrorMessage('No active text editor to insert file path');
        }

        // Reset the link file mode
        CFG.isLinkFileMode = false;
        return;
    }

    // Regular mode - open the files
    filePaths.forEach(p => {
        let [file, lineTmp, charTmp] = p.split(':', 3);
        // On windows we sometimes get extra characters that confound
        // the file lookup.
        file = file.trim();
        let selection = undefined;
        if (lineTmp !== undefined) {
            let char = 0;
            if (charTmp !== undefined) {
                char = parseInt(charTmp) - 1;  // 1 based in rg, 0 based in VS Code
            }
            let line = parseInt(lineTmp) - 1;  // 1 based in rg, 0 based in VS Code
            assert(line >= 0);
            assert(char >= 0);
            selection = new vscode.Range(line, char, line, char);
        }
        vscode.window.showTextDocument(
            vscode.Uri.file(file),
            { preview: CFG.openFileInPreviewEditor, selection: selection });
    });
}

/** Logic of what to do when the user completed a command invocation on the terminal */
function handleCanaryFileChange() {
    if (CFG.clearTerminalAfterUse) {
        term.sendText('clear');
    }

    if (CFG.killTerminalAfterUse) {
        // Some folks like having a constant terminal open. This will kill ours such that VS Code will
        // switch back to theirs. We don't have more control over the terminal so this is the best we
        // can do. This is not the default because creating a new terminal is sometimes expensive when
        // people use e.g. powerline or other fancy PS1 stuff.
        //
        // We set a timeout here to address #56. Don't have a good hypothesis as to why this works but
        // it seems to fix the issue consistently.
        setTimeout(() => term.dispose(), 100);
    }

    fs.readFile(CFG.canaryFile, { encoding: 'utf-8' }, (err, data) => {
        if (err) {
            // We shouldn't really end up here. Maybe leave the terminal around in this case...
            vscode.window.showWarningMessage('Something went wrong but we don\'t know what... Did you clean out your /tmp folder?');
        } else {
            const commandWasSuccess = data.length > 0 && data[0] !== '1';

            // open the file(s)
            if (commandWasSuccess) {
                openFiles(data);
            }

            if (CFG.restoreFocusTerminal && previousActiveTerminal) {
                handleTerminalFocusRestore(commandWasSuccess);
                return;
            }

            if (commandWasSuccess && CFG.hideTerminalAfterSuccess) {
                term.hide();
            } else if (!commandWasSuccess && CFG.hideTerminalAfterFail) {
                term.hide();
            } else {
                // Don't hide the terminal and make clippy angry
            }
        }
    });
}

function handleTerminalFocusRestore(commandWasSuccess: boolean) {
    const shouldHideTerminal = (commandWasSuccess && CFG.hideTerminalAfterSuccess) || (!commandWasSuccess && CFG.hideTerminalAfterFail);

    if (shouldHideTerminal) {
        const disposable = vscode.window.onDidChangeActiveTerminal(activeTerminal => {
            if (isExtensionChangedTerminal && activeTerminal === previousActiveTerminal) {
                previousActiveTerminal?.hide();
                previousActiveTerminal = null;
                isExtensionChangedTerminal = false;
                disposable.dispose();
            }
        });
    }

    isExtensionChangedTerminal = true;
    previousActiveTerminal?.show();
}

function createTerminal() {
    const terminalOptions: vscode.TerminalOptions = {
        name: 'AIPromptCompiler',
        location: CFG.useTerminalInEditor ? vscode.TerminalLocation.Editor : vscode.TerminalLocation.Panel,
        hideFromUser: !CFG.useTerminalInEditor, // works only for terminal panel, not editor stage
        env: {
            /* eslint-disable @typescript-eslint/naming-convention */
            AI_PROMPT_COMPILER_ACTIVE: '1',
            HISTCONTROL: 'ignoreboth',  // bash
            // HISTORY_IGNORE: '*',        // zsh
            EXTENSION_PATH: CFG.extensionPath,
            FIND_FILES_PREVIEW_ENABLED: CFG.findFilesPreviewEnabled ? '1' : '0',
            FIND_FILES_PREVIEW_COMMAND: CFG.findFilesPreviewCommand,
            FIND_FILES_PREVIEW_WINDOW_CONFIG: CFG.findFilesPreviewWindowConfig,
            FIND_WITHIN_FILES_PREVIEW_ENABLED: CFG.findWithinFilesPreviewEnabled ? '1' : '0',
            FIND_WITHIN_FILES_PREVIEW_COMMAND: CFG.findWithinFilesPreviewCommand,
            FIND_WITHIN_FILES_PREVIEW_WINDOW_CONFIG: CFG.findWithinFilesPreviewWindowConfig,
            USE_GITIGNORE: CFG.useGitIgnoreExcludes ? '1' : '0',
            GLOBS: CFG.useWorkspaceSearchExcludes ? getIgnoreString() : '',
            CANARY_FILE: CFG.canaryFile,
            SELECTION_FILE: CFG.selectionFile,
            LAST_QUERY_FILE: CFG.lastQueryFile,
            LAST_POS_FILE: CFG.lastPosFile,
            EXPLAIN_FILE: path.join(CFG.tempDir, 'paths_explain'),
            BAT_THEME: CFG.batTheme,
            FUZZ_RG_QUERY: CFG.fuzzRipgrepQuery ? '1' : '0',
            /* eslint-enable @typescript-eslint/naming-convention */
        },
    };
    // Use provided terminal from settings, otherwise use default terminal profile
    if (CFG.shellPathForTerminal !== '') {
        terminalOptions.shellPath = CFG.shellPathForTerminal;
    }

    if (CFG.shellArgsForTerminal !== undefined) {
        terminalOptions.shellArgs = CFG.shellArgsForTerminal;
    }

    term = vscode.window.createTerminal(terminalOptions);
}

function getWorkspaceFoldersAsString() {
    // For bash invocation. Need to wrap in quotes so spaces within paths don't
    // split the path into two strings.
    return CFG.searchPaths.reduce((x, y) => x + ` '${y}'`, '');
}

function getCommandString(cmd: Command, withArgs: boolean = true, withTextSelection: boolean = true) {
    assert(cmd.uri);
    let ret = '';
    const cmdPath = cmd.uri.fsPath;
    if (CFG.useEditorSelectionAsQuery && withTextSelection) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            if (!selection.isEmpty) {
                //
                // Fun story on text selection:
                // My first idea was to use an env var to capture the selection.
                // My first test was to use a selection that contained shell script...
                // This breaks. And fixing it is not easy. See https://unix.stackexchange.com/a/600214/128132.
                // So perhaps we should write this to file, and see if we can get bash to interpret this as a
                // string. We'll use an env var to indicate there is a selection so we don't need to read a
                // file in the general no-selection case, and we don't have to clear the file after having
                // used the selection.
                //
                const selectionText = editor.document.getText(selection);
                fs.writeFileSync(CFG.selectionFile, selectionText);
                ret += envVarToString('HAS_SELECTION', '1');
            } else {
                ret += envVarToString('HAS_SELECTION', '0');
            }
        }
    }
    // useTypeFilter should only be try if we activated the corresponding command
    if (CFG.useTypeFilter && CFG.findWithinFilesFilter.size > 0) {
        ret += envVarToString('TYPE_FILTER', "'" + [...CFG.findWithinFilesFilter].reduce((x, y) => x + ':' + y) + "'");
    }
    if (cmd.script === 'resume_search') {
        ret += envVarToString('RESUME_SEARCH', '1');
    }
    ret += cmdPath;
    if (withArgs) {
        let paths = getWorkspaceFoldersAsString();
        ret += ` ${paths}`;
    }
    return ret;
}

function getIgnoreGlobs() {
    const exclude = vscode.workspace.getConfiguration('search.exclude');  // doesn't work though the docs say it should?
    const globs: string[] = [];
    Object.entries(exclude).forEach(([k, v]) => {
        // Messy proxy object stuff
        if (typeof v === 'function') { return; }
        if (v) { globs.push(`!${k}`); }
    });
    return globs;
}

function getIgnoreString() {
    const globs = getIgnoreGlobs();
    // We separate by colons so we can have spaces in the globs
    return globs.reduce((x, y) => x + `${y}:`, '');
}

/**
 * Runs the extract_references tool on the current file
 */
async function executeExtractReferences() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found. Please open a file first.');
        return;
    }

    const sourceFilePath = editor.document.uri.fsPath;

    // Create target file path by adding '.prompt' before the extension
    const parsedPath = path.parse(sourceFilePath);
    const targetFilePath = path.join(
        parsedPath.dir,
        `${parsedPath.name}.prompt${parsedPath.ext}`
    );

    // Get the path to the compiled extract_references.js script
    const extractReferencesPath = path.join(CFG.extensionPath, 'out', 'extract_references.js');

    // Check if the script exists
    if (!fs.existsSync(extractReferencesPath)) {
        vscode.window.showErrorMessage(`Error: extract_references.js not found at ${extractReferencesPath}. Make sure the extension has been compiled.`);
        return;
    }

    // Save the current file if it has unsaved changes
    if (editor.document.isDirty) {
        await editor.document.save();
    }

    // Create a terminal and run the command
    if (!term || term.exitStatus !== undefined) {
        createTerminal();
        if (os.platform() !== 'win32') {
            term.sendText('bash');
            term.sendText('export PS1="::: Terminal allocated for AIPromptCompiler. Do not use. ::: "; clear');
        }
    }

    // Build the command to run extract_references script with node
    let command = `node "${extractReferencesPath}" "${sourceFilePath}" "${targetFilePath}"`;

    term.sendText('asdfr pathFormat:' + CFG.linkFilePathFormat);
    // If linkFile is configured to use relative paths, add the base path parameter
    if (CFG.linkFilePathFormat === 'relative') {
        const basePath = getBasePath();
        term.sendText('asdfr basePath:' + basePath);
        if (basePath) {
            command += ` --base-path "${basePath}"`;
        }
    }

    term.sendText(command);
    term.show();

    // Check if target file already exists
    const targetFileExists = fs.existsSync(targetFilePath);

    // Customize the message based on whether we're creating or overwriting
    const action = targetFileExists ? "Overwriting" : "Creating";
    vscode.window.showInformationMessage(`AIPromptCompiler: ${action} file reference extraction: ${path.basename(targetFilePath)}`);

    // Open the target file when it's created
    const checkFile = setInterval(() => {
        if (fs.existsSync(targetFilePath)) {
            clearInterval(checkFile);
            vscode.window.showTextDocument(vscode.Uri.file(targetFilePath));
        }
    }, 500);

    // Clear the interval after 10 seconds to avoid waiting forever
    setTimeout(() => clearInterval(checkFile), 10000);
}

/**
 * Handle the lineRangeCopy command that copies a reference to the selected text in the format ${file_path[start_line-end_line]}
 * If there is no selection, it will just copy the file path in the format ${file_path}
 */
async function executeLineRangeCopy() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found. Please open a file first.');
        return;
    }

    const document = editor.document;
    const selection = editor.selection;

    // Get the file path
    let filePath = document.uri.fsPath;

    // Handle relative path if needed based on existing linkFile settings
    if (CFG.linkFilePathFormat === 'relative') {
        filePath = getRelativePath(filePath);
    }

    let formattedText;

    // Check if there is a selection
    if (selection && !selection.isEmpty) {
        // Get the start and end line numbers (1-based line numbers)
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;

        // Create the formatted text with line range: ${/path/to/file.ext[33-45]}
        formattedText = `\${${filePath}[${startLine}-${endLine}]}`;
    } else {
        // No selection, just copy the file path: ${/path/to/file.ext}
        formattedText = `\${${filePath}}`;
    }

    // Copy to clipboard
    vscode.env.clipboard.writeText(formattedText);

    // Show a notification
    vscode.window.showInformationMessage(`AIPromptCompiler: Copied reference to clipboard: ${formattedText}`);
}

async function executeTerminalCommand(cmd: string) {
    getIgnoreGlobs();
    if (!CFG.flightCheckPassed && !CFG.disableStartupChecks) {
        if (!reinitialize()) {
            return;
        }
    }

    // Special case for extract references command
    if (cmd === "extractReferences") {
        executeExtractReferences();
        return;
    }

    // Special case for lineRangeCopy command
    if (cmd === "lineRangeCopy") {
        executeLineRangeCopy();
        return;
    }

    // Set linkFile mode flag if it's the linkFile command
    CFG.isLinkFileMode = (cmd === "linkFile");

    if (cmd === "resumeSearch") {
        // Run the last-run command again
        if (os.platform() === 'win32') {
            vscode.window.showErrorMessage('Resume search is not implemented on Windows. Sorry! PRs welcome.');
            return;
        }
        if (CFG.lastCommand === '') {
            vscode.window.showErrorMessage('Cannot resume the last search because no search was run yet.');
            return;
        }
        commands["resumeSearch"].uri = commands[CFG.lastCommand].uri;
        commands["resumeSearch"].preRunCallback = commands[CFG.lastCommand].preRunCallback;
        commands["resumeSearch"].postRunCallback = commands[CFG.lastCommand].postRunCallback;
    } else if (cmd.startsWith("find") || cmd === "linkFile") { // Keep track of last-run cmd, but we don't want to resume `listSearchLocations` etc
        CFG.lastCommand = cmd;
    }

    if (!term || term.exitStatus !== undefined) {
        createTerminal();
        if (os.platform() !== 'win32') {
            term.sendText('bash');
            term.sendText('export PS1="::: Terminal allocated for AIPromptCompiler. Do not use. ::: "; clear');
        }
    }

    assert(cmd in commands);
    const cb = commands[cmd].preRunCallback;
    let cbResult = true;
    if (cb !== undefined) { cbResult = await cb(); }
    if (cbResult === true) {
        term.sendText(getCommandString(commands[cmd]));
        if (CFG.showMaximizedTerminal) {
            vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
        }
        if (CFG.restoreFocusTerminal) {
            previousActiveTerminal = vscode.window.activeTerminal ?? null;
        }
        term.show();
        const postRunCallback = commands[cmd].postRunCallback;
        if (postRunCallback !== undefined) { postRunCallback(); }
    }
}

function envVarToString(name: string, value: string) {
    // Note we add a space afterwards
    return (os.platform() === 'win32')
        ? `$Env:${name}=${value}; `
        : `${name}=${value} `;
}
