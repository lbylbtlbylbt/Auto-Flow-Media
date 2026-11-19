# Auto Flow Media, draft 0.1

## File layout

An AFM file is one self-contained MP4 followed by a terminal top-level ISO BMFF user-type box. All integers below are unsigned big-endian. Every preceding top-level box must have a finite size. The offline media must include its own playable tracks and seek metadata.

| Bytes | Meaning |
| --- | --- |
| 4 | Total box size, equal to N + 28 |
| 4 | ASCII `uuid` |
| 16 | User type, hex `473100a249014ff5a73cd10e0ddf44ef` |
| N | UTF-8 JSON manifest, up to 65536 bytes |
| 4 | N |

A reader can locate the box from the final four bytes. Check its bounds, type, UUID, size and version before use. Adobe Font Metrics shares the extension. Identify the media by content. Extracting all bytes preceding the terminal box restores the input MP4 exactly.

## Manifest and resolution

Required keys are integer `version` (1) and nonempty strings `assetId`, `revision` and `resolverUrl`. The last is an absolute HTTP(S) endpoint. Use HTTPS for remote deployments. Unknown optional keys can be ignored. A revision identifies one immutable edit of an asset.

POST a UTF-8 JSON object containing assetId and revision to the resolver. A successful response echoes both identifiers and contains `playback`, an absolute URL for the highest-quality browser-compatible rendition in this profile. An optional `original` URL identifies the editing master. Return HTTP 404 for unknown revisions. Responses for other revisions must not be played. A resolver on another origin must permit the player's origin and handle CORS preflight for JSON POST.

## Playback profile

The browser reference supports seekable progressive MP4. Prepare a remote rendition with the same first presentation time, frame timeline, duration and aspect ratio as the local track. Serve byte ranges and put the MP4 movie header first. Select a codec supported by the target device. Keep local audio as the playback clock. A renderer may display remote video only while it has playable data at the matching time. On starvation, failure or seek, display local video until remote data is ready again.

An implementation may use other delivery profiles by explicit negotiation in a future version. This draft has no mandatory central registry or cloud service.

