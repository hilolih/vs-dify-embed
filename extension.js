const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('VS Dify Embed');
    outputChannel.appendLine('VS Dify Embed extension activated');

    // Get configuration
    const config = vscode.workspace.getConfiguration('dify-embed');
    const isEnabled = config.get('enable');

    if (!isEnabled) {
        outputChannel.appendLine('Extension is disabled via configuration');
        return;
    }

    // Create WebView provider
    const provider = new DifyWebViewProvider(context.extensionUri, outputChannel);

    // Register the WebView provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('dify-assistant', provider)
    );

    // Register command to toggle sidebar
    const toggleCommand = vscode.commands.registerCommand('dify-embed.toggleSidebar', () => {
        vscode.commands.executeCommand('workbench.panel.extension.dify-sidebar.focus');
    });

    context.subscriptions.push(toggleCommand);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('dify-embed')) {
                provider.updateConfiguration();
            }
        })
    );
}

/**
 * WebView provider for Dify Assistant
 */
class DifyWebViewProvider {
    /**
     * @param {vscode.Uri} extensionUri
     * @param {vscode.OutputChannel} outputChannel
     */
    constructor(extensionUri, outputChannel) {
        this.extensionUri = extensionUri;
        this.outputChannel = outputChannel;
        this.view = null;
        this.assistants = [];
        this.currentAssistant = null;
        this.updateConfiguration();
    }

    /**
     * Update configuration from settings
     */
    updateConfiguration() {
        const config = vscode.workspace.getConfiguration('dify-embed');
        this.assistants = config.get('urllist') || [];

        if (this.assistants.length > 0) {
            this.currentAssistant = this.currentAssistant || this.assistants[0];
        } else {
            this.currentAssistant = null;
        }

        if (this.view) {
            this.view.webview.html = this.getWebviewContent();
        }
    }

    /**
     * @param {vscode.WebviewView} webviewView
     * @param {vscode.WebviewViewResolveContext} context
     * @param {vscode.CancellationToken} _token
     */
    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;

        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        // Set initial HTML content
        webviewView.webview.html = this.getWebviewContent();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'selectAssistant':
                    this.selectAssistant(message.assistantName);
                    break;
                case 'error':
                    this.outputChannel.appendLine(`Error: ${message.message}`);
                    vscode.window.showErrorMessage(`Dify Assistant Error: ${message.message}`);
                    break;
                case 'log':
                    this.outputChannel.appendLine(`Log: ${message.message}`);
                    break;
            }
        });
    }

    /**
     * Select an assistant by name
     * @param {string} assistantName 
     */
    selectAssistant(assistantName) {
        const assistant = this.assistants.find(a => a.name === assistantName);
        if (assistant) {
            this.currentAssistant = assistant;
            if (this.view) {
                this.view.webview.html = this.getWebviewContent();
            }
        }
    }

    /**
     * Generate the HTML content for the webview
     * @returns {string} HTML content
     */
    getWebviewContent() {
        // If no assistants are configured
        if (this.assistants.length === 0) {
            return `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Dify Assistant</title>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            color: var(--vscode-foreground);
                            padding: 10px;
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                        }
                        .error {
                            color: var(--vscode-errorForeground);
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">
                        No assistants configured. Please add assistants in the extension settings.
                    </div>
                </body>
                </html>
            `;
        }

        // Generate dropdown options for assistants
        const assistantOptions = this.assistants.map(assistant => {
            const selected = assistant.name === this.currentAssistant.name ? 'selected' : '';
            return `<option value="${assistant.name}" ${selected}>${assistant.name}</option>`;
        }).join('');

        // Current assistant URL
        const currentUrl = this.currentAssistant ? this.currentAssistant.url : '';

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Dify Assistant</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        margin: 0;
                        overflow: hidden;
                    }
                    .controls {
                        margin-bottom: 10px;
                        display: flex;
                        align-items: center;
                    }
                    select {
                        flex-grow: 1;
                        height: 28px;
                        background-color: var(--vscode-dropdown-background);
                        color: var(--vscode-dropdown-foreground);
                        border: 1px solid var(--vscode-dropdown-border);
                        padding: 0 5px;
                    }
                    .iframe-container {
                        flex-grow: 1;
                        border: 1px solid var(--vscode-panel-border);
                        overflow: hidden;
                        position: relative;
                    }
                    iframe {
                        width: 100%;
                        height: 100%;
                        border: none;
                    }
                    .error-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-errorForeground);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-direction: column;
                        padding: 20px;
                        text-align: center;
                        z-index: 10;
                    }
                    .reload-button {
                        margin-top: 15px;
                        padding: 6px 12px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 2px;
                        cursor: pointer;
                    }
                    .reload-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    .hidden {
                        display: none;
                    }
                </style>
            </head>
            <body>
                <div class="controls">
                    <select id="assistant-selector">
                        ${assistantOptions}
                    </select>
                </div>
                <div class="iframe-container">
                    <iframe id="dify-iframe" src="${currentUrl}" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-top-navigation allow-same-origin"></iframe>
                    <div id="error-overlay" class="error-overlay hidden">
                        <h3>Connection Error</h3>
                        <p>Unable to connect to the Dify assistant. Please check your network connection and ensure you are on the System Department LAN.</p>
                        <button id="reload-button" class="reload-button">リロード</button>
                    </div>
                </div>

                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        const iframe = document.getElementById('dify-iframe');
                        const errorOverlay = document.getElementById('error-overlay');
                        const assistantSelector = document.getElementById('assistant-selector');
                        const reloadButton = document.getElementById('reload-button');

                        // Handle assistant selection change
                        assistantSelector.addEventListener('change', (event) => {
                            const assistantName = event.target.value;
                            vscode.postMessage({
                                command: 'selectAssistant',
                                assistantName: assistantName
                            });
                        });

                        // Check if iframe loaded successfully
                        iframe.addEventListener('load', () => {
                            // Simply assume the iframe loaded successfully when the load event fires
                            // We can't access the iframe content due to cross-origin restrictions
                            errorOverlay.classList.add('hidden');
                            vscode.postMessage({
                                command: 'log',
                                message: 'Iframe load event fired'
                            });
                        });

                        // Handle iframe load error
                        iframe.addEventListener('error', (error) => {
                            errorOverlay.classList.remove('hidden');
                            vscode.postMessage({
                                command: 'error',
                                message: 'Failed to load Dify assistant: ' + error.message
                            });
                        });

                        // Handle reload button click
                        reloadButton.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'log',
                                message: 'Reloading iframe'
                            });
                            
                            // Reload the iframe by setting the src attribute again
                            const currentSrc = iframe.src;
                            iframe.src = '';
                            setTimeout(() => {
                                iframe.src = currentSrc;
                            }, 100);
                        });
                    })();
                </script>
            </body>
            </html>
        `;
    }
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
