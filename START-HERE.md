# Auto Flow Media Toolpack · Alpha v1

Unzip the entire download into a writable folder. Open a terminal in the folder containing this guide. The same files and commands are used on Windows, macOS and Linux.

## Play the included media

Install Node.js 24 or newer, then run:

```sh
node server.mjs
```

Open http://127.0.0.1:8080 and choose **demo/example.afm**. The file contains the complete 180p video. Enable remote playback to switch to the included 720p version served over loopback. The demo runs without an Internet connection or FFmpeg. Press Ctrl+C in the terminal to stop the server.

## Make or inspect a file

Install FFmpeg and FFprobe 7.1 or newer on PATH, including the libx264 encoder, for encoding and timeline checks. Node, codecs and FFmpeg are supplied separately.

```sh
node afm.mjs inspect demo/example.afm
node afm.mjs extract demo/example.afm restored.mp4
node prepare.mjs encode master.mp4 480 28 custom.afm film cut-1 https://media.example.org/v1/resolve
node prepare.mjs pair proxy.mp4 master.mp4 paired.afm film cut-1 https://media.example.org/v1/resolve
```

Replace the example source paths and HTTPS endpoint with your own. For a private workspace with multiple users, follow [Team setup](TEAM.md) to configure certificates, create an administrator and import the paired media.

[File specification](SPEC.md) · [Tool reference](README.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

The sample picture and audio were generated with FFmpeg testsrc2 and sine. The equivalent generation script is demo.mjs. Run it in a clean source checkout to generate a fresh sample. The alpha targets desktop toolchains and a browser with MP4/H.264/AAC support. Native mobile SDKs and editing or game-engine plug-ins are future work.
