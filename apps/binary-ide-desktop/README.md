# Binary IDE Desktop

Electron desktop shell for Binary IDE.

This app is designed around the local Binary Host service:

- the renderer talks to `http://127.0.0.1:7777` by default
- the main process tries to start `services/binary-host/dist/server.js`
- the CLI can keep using the same host contract or bypass it for direct hosted debugging

Current status:

- guided workspace shell
- auth/bootstrap surface
- Binary Host health + preferences visibility
- hosted agent run streaming through the local host API
- release metadata for Windows, macOS, and Linux packaging

To turn this into a distributable product, install `electron` and `electron-builder` in this package and connect the publish URL to your artifact bucket.
