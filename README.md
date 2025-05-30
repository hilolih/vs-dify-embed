# VS Dify Embed

VS Code サイドバーに Dify AI アシスタントを埋め込む Visual Studio Code 拡張機能です。

## 機能

- Dify AI アシスタントを VS Code 内に直接表示
- ドロップダウンメニューで複数のアシスタントを簡単に切り替え
- コマンドとキーボードショートカットでサイドバーの表示/非表示を切り替え
- ネットワーク接続状態の検出とエラー処理

## 要件

- Visual Studio Code バージョン 1.60.0 以上
- Dify アシスタントに接続するためのシステム部門 LAN へのアクセス

## インストール

1. 拡張機能パッケージ（.vsix ファイル）をダウンロード
2. VS Code を開く
3. 拡張機能ビュー（Ctrl+Shift+X）に移動
4. 拡張機能ビューの右上にある「...」メニューをクリック
5. 「VSIX からインストール...」を選択し、ダウンロードしたファイルを選択

## 使い方

1. アクティビティバー（サイドバー）の Dify アシスタントアイコンをクリック
2. ドロップダウンメニューからアシスタントを選択
3. VS Code 内でアシスタントと直接対話

### キーボードショートカット

- Dify アシスタントサイドバーの表示/非表示: `Ctrl+Shift+D`（Windows/Linux）または `Cmd+Shift+D`（Mac）

## 拡張機能の設定

この拡張機能は以下の設定を提供します：

* `dify-embed.enable`: 拡張機能の有効/無効
* `dify-embed.urllist`: 名前と URL のペアを持つアシスタントのリスト

### アシスタントの管理

アシスタントを追加または変更するには：

1. VS Code の設定を開く（ファイル > 基本設定 > 設定）
2. 「VS Dify Embed」を検索
3. `dify-embed.urllist` 設定を編集してアシスタントを追加、削除、または変更

設定例：

```json
"dify-embed.urllist": [
  {
    "name": "一般アシスタント",
    "url": "http://ai.hokkaido-np.co.jp/chatbot/ghyJ5maWmgRrXo7G"
  },
  {
    "name": "コードアシスタント",
    "url": "http://ai.hokkaido-np.co.jp/chatbot/another-id"
  }
]
```

## トラブルシューティング

- **接続エラー**: 接続エラーが表示された場合、システム部門LANに接続されていることを確認してください。「リロード」ボタンをクリックして接続を再試行できます。
- **アシスタントが利用できない**: 上記の説明に従って、拡張機能の設定でアシスタントを追加してください。

## ライセンス

この拡張機能は MIT ライセンスの下で提供されています。
