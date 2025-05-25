import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext): void {
    // ログ出力用のチャンネルを作成
    const outputChannel = vscode.window.createOutputChannel('VS Dify Embed');
    outputChannel.appendLine('VS Dify Embed extension activated');

    // 設定を取得
    const config = vscode.workspace.getConfiguration('dify-embed');
    const isEnabled = config.get<boolean>('enable');

    if (!isEnabled) {
        outputChannel.appendLine('Extension is disabled via configuration');
        return;
    }

    // WebViewプロバイダーを作成
    const provider = new DifyWebViewProvider(context.extensionUri, outputChannel);

    // WebViewプロバイダーを登録
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('dify-assistant', provider)
    );

    /**
     * 選択テキストをDifyに送るための共通処理
     * @param {string} promptText - Difyに送るプロンプトテキスト
     */
    async function copyTextToDify(promptText: string): Promise<void> {
        // アクティブなエディタがあるかチェック
        const editor = vscode.window.activeTextEditor;
        let selectedText = '';

        if (editor) {
            // エディタからの選択テキストを取得
            selectedText = editor.document.getText(editor.selection);
        }
        // debug
        const previewText = selectedText.length > 20 ? selectedText.substring(0, 20) : selectedText;
        outputChannel.appendLine(`selected Text: ${previewText}...`);

        if (!selectedText) {
            vscode.window.showInformationMessage('テキストが選択されていません');
            outputChannel.appendLine('No text selected');
            return;
        }
        // テキストをクリップボードにコピー
        await vscode.env.clipboard.writeText(promptText + "\n" + selectedText);

        // Difyサイドバーを表示（存在しなければ）
        await vscode.commands.executeCommand('workbench.view.extension.dify-sidebar');

        // ユーザーにペーストを促すメッセージを表示
        vscode.window.showInformationMessage('クリップボードにコピーされました。Difyに貼り付けてください');
    }

    // プロンプト選択コマンドを登録
    const selectPromptCommand = vscode.commands.registerCommand('dify-embed.selectPrompt', async () => {
        // 設定からプロンプトを取得
        const config = vscode.workspace.getConfiguration('dify-embed');
        const prompts: Array<{ label: string, prompt: string }> = config.get('prompts') || [];

        if (prompts.length === 0) {
            vscode.window.showInformationMessage('プロンプトが設定されていません。設定から追加してください。');
            return;
        }

        // プロンプト選択用のクイックピックを表示
        const selectedItem = await vscode.window.showQuickPick(
            prompts.map(p => ({ label: p.label, description: p.prompt.split('\n')[0], prompt: p.prompt })),
            {
                placeHolder: 'プロンプトを選択してください',
                matchOnDescription: true,
                matchOnDetail: true
            }
        );

        if (selectedItem) {
            await copyTextToDify(selectedItem.prompt);
        }
    });

    context.subscriptions.push(selectPromptCommand);

    // サイドバーを切り替えるコマンドを登録
    const toggleCommand = vscode.commands.registerCommand('dify-embed.toggleSidebar', () => {
        vscode.commands.executeCommand('workbench.panel.extension.dify-sidebar.focus');
    });

    context.subscriptions.push(toggleCommand);

    // 設定変更を監視
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('dify-embed')) {
                provider.updateConfiguration();
            }
        })
    );
}

/**
 * Dify アシスタント用のWebViewプロバイダー
 */
class DifyWebViewProvider implements vscode.WebviewViewProvider {
    private extensionUri: vscode.Uri;
    private outputChannel: vscode.OutputChannel;
    private view: vscode.WebviewView | null;
    private assistants: Array<{ name: string, url: string }>;
    private currentAssistant: { name: string, url: string } | null;

    /**
     * @param {vscode.Uri} extensionUri
     * @param {vscode.OutputChannel} outputChannel
     */
    constructor(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
        this.extensionUri = extensionUri;
        this.outputChannel = outputChannel;
        this.view = null;
        this.assistants = [];
        this.currentAssistant = null;
        this.updateConfiguration();
    }

    /**
     * 設定から構成を更新
     */
    public async updateConfiguration(): Promise<void> {
        const config = vscode.workspace.getConfiguration('dify-embed');
        this.assistants = config.get<Array<{ name: string, url: string }>>('urllist') || [];
        this.outputChannel.appendLine(`設定が更新されました`);

        if (this.assistants.length > 0) {
            this.currentAssistant = this.currentAssistant || this.assistants[0];
        } else {
            this.currentAssistant = null;
        }

        if (this.view) {
            this.view.webview.html = await this.getWebviewContent();
        }
    }

    /**
     * @param {vscode.WebviewView} webviewView
     * @param {vscode.WebviewViewResolveContext} context
     * @param {vscode.CancellationToken} _token
     */
    async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.view = webviewView;

        // Webviewのオプションを設定
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        // 初期HTMLコンテンツを設定
        webviewView.webview.html = await this.getWebviewContent();

        // Webviewからのメッセージを処理
        webviewView.webview.onDidReceiveMessage(async message => {
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
     * 名前でアシスタントを選択
     * @param {string} assistantName 
     */
    private async selectAssistant(assistantName: string): Promise<void> {
        const assistant = this.assistants.find(a => a.name === assistantName);
        if (assistant) {
            this.currentAssistant = assistant;
            if (this.view) {
                this.view.webview.html = await this.getWebviewContent();
            }
        }
    }

    /**
     * Webview用のHTMLコンテンツを生成
     * @returns {Promise<string>} HTMLコンテンツ
     */
    private async getWebviewContent(): Promise<string> {
        let isUrlAccessible = false;
        if (this.currentAssistant && this.currentAssistant.url) {
            isUrlAccessible = await this.checkUrlAccessibility(this.currentAssistant.url);
        }

        // アシスタントが設定されていない場合
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

        // アシスタント用のドロップダウンオプションを生成
        const assistantOptions = this.assistants.map(assistant => {
            const selected = this.currentAssistant && assistant.name === this.currentAssistant.name ? 'selected' : '';
            return `<option value="${assistant.name}" ${selected}>${assistant.name}</option>`;
        }).join('');

        // 現在のアシスタントURL
        const currentUrl = this.currentAssistant ? this.currentAssistant.url : '';
        const errorOverlayClass = isUrlAccessible ? "error-overlay hidden" : "error-overlay";

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
                    <div id="error-overlay" class="${errorOverlayClass}">
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

                        // アシスタント選択の変更を処理
                        assistantSelector.addEventListener('change', (event) => {
                            const assistantName = event.target.value;
                            vscode.postMessage({
                                command: 'selectAssistant',
                                assistantName: assistantName
                            });
                        });

                        // iframeが正常に読み込まれたかチェック
                        iframe.addEventListener('load', () => {
                            // ロードイベントが発生したら、iframeが正常に読み込まれたと仮定
                            // クロスオリジン制限のため、iframeのコンテンツにアクセスできない場合があるが、
                            // 'load'イベント自体はiframeのドキュメントがロード完了したことを示す
                            errorOverlay.classList.add('hidden');
                            vscode.postMessage({
                                command: 'log',
                                message: 'Iframe load event fired'
                            });
                        });

                        // iframeの読み込みエラーを処理
                        iframe.addEventListener('error', (error) => {
                            errorOverlay.classList.remove('hidden');
                            vscode.postMessage({
                                command: 'error',
                                message: 'Failed to load Dify assistant: ' + (error ? error.message : 'Unknown iframe error')
                            });
                        });
                        // Note: The iframe load and error events are secondary checks.
                        // The primary check is now done via checkUrlAccessibility before rendering.
                        // The error-overlay visibility is initially set based on that check.

                        // リロードボタンのクリックを処理
                        reloadButton.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'log',
                                message: 'Reloading iframe by user'
                            });
                            // Request a full webview refresh to re-check accessibility
                             vscode.postMessage({ command: 'selectAssistant', assistantName: assistantSelector.value });
                        });
                    })();
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Checks if a URL is accessible.
     * @param {string} url The URL to check.
     * @returns {Promise<boolean>} True if the URL is accessible, false otherwise.
     */
    public async checkUrlAccessibility(url: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const protocol = url.startsWith('https') ? https : http;
            const request = protocol.get(url, { timeout: 5000 }, (response) => {
                const statusCode = response.statusCode || 0;
                if (statusCode >= 200 && statusCode < 300) {
                    this.outputChannel.appendLine(`URL ${url} is accessible with status code ${statusCode}`);
                    resolve(true);
                } else {
                    this.outputChannel.appendLine(`URL ${url} returned status code ${statusCode}`);
                    resolve(false);
                }
                // Consume response data to free up memory
                response.resume();
            });

            request.on('error', (err) => {
                this.outputChannel.appendLine(`Error checking URL ${url}: ${err.message}`);
                resolve(false);
            });

            request.on('timeout', () => {
                this.outputChannel.appendLine(`Timeout checking URL ${url}`);
                request.destroy(); // or request.abort() in newer Node.js versions
                resolve(false);
            });
        });
    }
}

export function deactivate(): void { }
