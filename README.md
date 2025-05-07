# VS Dify Embed

A Visual Studio Code extension that embeds Dify AI assistants in the VS Code sidebar.

## Features

- Display Dify AI assistants directly within VS Code
- Manage multiple assistants with easy switching via dropdown menu
- Toggle sidebar visibility with command and keyboard shortcut
- Network connectivity detection with error handling

## Requirements

- Visual Studio Code version 1.60.0 or higher
- Access to the System Department LAN for connecting to Dify assistants

## Installation

1. Download the extension package (.vsix file)
2. Open VS Code
3. Go to Extensions view (Ctrl+Shift+X)
4. Click on the "..." menu in the top-right of the Extensions view
5. Select "Install from VSIX..." and choose the downloaded file

## Usage

1. Click on the Dify Assistant icon in the Activity Bar (sidebar)
2. Select an assistant from the dropdown menu
3. Interact with the assistant directly within VS Code

### Keyboard Shortcuts

- Toggle Dify Assistant sidebar: `Ctrl+Shift+D` (Windows/Linux) or `Cmd+Shift+D` (Mac)

## Extension Settings

This extension contributes the following settings:

* `vs-dify-embed.enable`: Enable/disable the extension
* `vs-dify-embed.urllist`: List of assistants with name and URL pairs

### Managing Assistants

To add or modify assistants:

1. Open VS Code Settings (File > Preferences > Settings)
2. Search for "VS Dify Embed"
3. Edit the `vs-dify-embed.urllist` setting to add, remove, or modify assistants

Example configuration:

```json
"vs-dify-embed.urllist": [
  {
    "name": "General Assistant",
    "url": "http://ai.hokkaido-np.co.jp/chatbot/ghyJ5maWmgRrXo7G"
  },
  {
    "name": "Code Assistant",
    "url": "http://ai.hokkaido-np.co.jp/chatbot/another-id"
  }
]
```

## Troubleshooting

- **Connection Error**: If you see a connection error, ensure you are connected to the System Department LAN. You can click the "リロード" (Reload) button to retry the connection.
- **No Assistants Available**: Add assistants in the extension settings as described above.

## License

This extension is licensed under the MIT License.
