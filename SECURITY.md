# Security policy

For private media, deploy the [HTTPS team service](TEAM.md). Its dashboard and playback gateway enforce workspace membership. The original loopback demo resolver is intended for public sample media. Keep TLS keys, access keys, private media and the workspace database outside the source repository.

Security fixes currently target the main branch. Use the repository's [private vulnerability reporting form](https://github.com/lbylbtlbylbt/Auto-Flow-Media/security/advisories/new). Include the affected commit, platform, impact and minimal reproduction. Keep private footage, credentials and signed media URLs out of reports.

The reference server binds to loopback. Deploy a production resolver behind HTTPS with authorization for each asset and revision. Treat AFM metadata and resolver responses as untrusted input. The reference player displays the resolver origin and requires opt-in before contacting it. Store provider credentials outside AFM files. A remote media host receives ordinary network request information when remote playback is enabled.
