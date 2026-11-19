# Auto Flow Media

Carry a complete offline video in one `.afm` file and play its highest-quality remote rendition when the connection can sustain it. A game can ship a small cinematic with its installer. An editor can travel with a proxy and keep a stable reference to the original media.

**Developer preview.** This repository ships a packer, inspector, extractor, local reference resolver and browser player. The current playback profile uses seekable MP4 over HTTP. HLS, native game-engine integrations, editor plug-ins and provider-specific sign-in are future work.

## Try it

Install Node.js 22 or newer. For the generated demo, install FFmpeg with the libx264 and AAC encoders on your PATH. From the repository root:

```sh
node demo.mjs
node server.mjs
```

Open **http://127.0.0.1:8080**, select `demo/example.afm`, then press Play if the browser requires it. Start with remote playback disabled to see the 180p proxy. Enable remote playback to see the 720p rendition after buffering. Disable it or disconnect the media source to return to the proxy. Buffered video can continue until its available buffer runs low. Drag the timeline to check seeking. For a real disconnection test, use a remote media host, since disconnecting Wi-Fi leaves loopback accessible. The generated 24-second test pattern and tone require no footage downloads. The demo refuses to overwrite existing output.

## Use your own media

Choose local quality by encoding a self-contained proxy MP4 at the resolution and bitrate you want. The packer preserves its bytes. Prepare the remote rendition from the same edit.

```sh
node afm.mjs pack proxy.mp4 shot.afm shot-001 cut-3 https://media.example.org/v1/resolve
node afm.mjs inspect shot.afm
node afm.mjs extract shot.afm restored.mp4
node --test test.mjs
```

The resolver maps an asset and revision to the current storage location. Supply your own endpoint or run the loopback example with `node server.mjs catalog.json`. Example catalog:

```json
[{
  "assetId": "shot-001",
  "revision": "cut-3",
  "playback": "https://media.example.org/video/shot-001-high.mp4",
  "original": "https://media.example.org/originals/shot-001.mov"
}]
```

A NAS HTTP gateway, CDN or cloud-storage adapter can implement this contract. The URL must deliver the video bytes. A provider share page requires an adapter to resolve it. Handle provider login and expiring URLs in your resolver. The browser asks permission to contact the displayed resolver and keeps local audio throughout remote video playback. Two simultaneous video decoders may increase power use. Frame-accurate mastering and HDR workflows require host integration and separate validation.

## Integration and community

- [File layout, resolver contract and playback rules](SPEC.md)
- [Contribution guide](CONTRIBUTING.md) and [community conduct](CODE_OF_CONDUCT.md)
- [Private security reports](SECURITY.md)
- [MIT License](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

