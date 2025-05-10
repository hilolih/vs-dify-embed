"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // ログ出力用のチャンネルを作成
    const outputChannel = vscode.window.createOutputChannel('VS Dify Embed');
    outputChannel.appendLine('VS Dify Embed extension activated');
    // 設定を取得
    const config = vscode.workspace.getConfiguration('vs-dify-embed');
    const isEnabled = config.get('enable');
    if (!isEnabled) {
        outputChannel.appendLine('Extension is disabled via configuration');
        return;
    }
    // WebViewプロバイダーを作成
    const provider = new DifyWebViewProvider(context.extensionUri, outputChannel);
    // WebViewプロバイダーを登録
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('dify-assistant', provider));
    /**
     * 選択テキストをDifyに送るための共通処理
     * @param {string} promptText - Difyに送るプロンプトテキスト
     */
    async function copyTextToDify(promptText) {
        // アクティブなエディタがあるかチェック
        const editor = vscode.window.activeTextEditor;
        let selectedText = '';
        if (editor) {
            // エディタからの選択テキストを取得
            selectedText = editor.document.getText(editor.selection);
        }
        if (!selectedText) {
            vscode.window.showInformationMessage('テキストが選択されていません');
            return;
        }
        // テキストをクリップボードにコピー
        await vscode.env.clipboard.writeText(promptText + "\n" + selectedText);
        // Difyサイドバーを表示（存在しなければ）
        await vscode.commands.executeCommand('workbench.view.extension.dify-sidebar');
        // ユーザーにペーストを促すメッセージを表示
        vscode.window.showInformationMessage('クリップボードにコピーされました。Difyに貼り付けてください');
    }
    const translateCommand = vscode.commands.registerCommand('vs-dify-embed.translate', async () => {
        const promptText = `
            以下の文章を日本語に翻訳してください。
            段落ごとにはじめに英語の文章を記載し、次に日本語の翻訳を記載してください。

            ## 文章
        `.split('\n').map(line => line.trim()).join('\n');
        await copyTextToDify(promptText);
    });
    context.subscriptions.push(translateCommand);
    const copy4mailReply = vscode.commands.registerCommand('vs-dify-embed.copy4mailReply', async () => {
        const promptText = `
            以下の文章は私あてに届いたメールです。
            返事を書きたいので3つの選択肢を提示してください

            ## メール内容
        `.split('\n').map(line => line.trim()).join('\n');
        await copyTextToDify(promptText);
    });
    context.subscriptions.push(copy4mailReply);
    // サイドバーを切り替えるコマンドを登録
    const toggleCommand = vscode.commands.registerCommand('vs-dify-embed.toggleSidebar', () => {
        vscode.commands.executeCommand('workbench.panel.extension.dify-sidebar.focus');
    });
    context.subscriptions.push(toggleCommand);
    // 設定変更を監視
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vs-dify-embed')) {
            provider.updateConfiguration();
        }
    }));
}
exports.activate = activate;
/**
 * Dify アシスタント用のWebViewプロバイダー
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
     * 設定から構成を更新
     */
    updateConfiguration() {
        const config = vscode.workspace.getConfiguration('vs-dify-embed');
        this.assistants = config.get('urllist') || [];
        if (this.assistants.length > 0) {
            this.currentAssistant = this.currentAssistant || this.assistants[0];
        }
        else {
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
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        // Webviewのオプションを設定
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        // 初期HTMLコンテンツを設定
        webviewView.webview.html = this.getWebviewContent();
        // Webviewからのメッセージを処理
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
     * 名前でアシスタントを選択
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
     * Webview用のHTMLコンテンツを生成
     * @returns {string} HTMLコンテンツ
     */
    getWebviewContent() {
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
                            // クロスオリジン制限のため、iframeのコンテンツにアクセスできない
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
                                message: 'Failed to load Dify assistant: ' + error.message
                            });
                        });

                        // リロードボタンのクリックを処理
                        reloadButton.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'log',
                                message: 'Reloading iframe'
                            });
                            
                            // srcプロパティを再設定してiframeをリロード
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
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map