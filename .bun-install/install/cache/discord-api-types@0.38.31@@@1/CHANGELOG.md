## [0.38.31](https://github.com/discordjs/discord-api-types/compare/0.38.30...0.38.31) (2025-10-23)


### Bug Fixes

* **APIModalInteractionResponseCallbackComponent:** remove `APIFileUploadComponent` ([#1406](https://github.com/discordjs/discord-api-types/issues/1406)) ([e37f802](https://github.com/discordjs/discord-api-types/commit/e37f802e392fdce948c2a15ae26088f8ae625793))
* missing name and size property on APIFileComponent ([#1404](https://github.com/discordjs/discord-api-types/issues/1404)) ([7d6a934](https://github.com/discordjs/discord-api-types/commit/7d6a934f66c2a2d063bae16eb6fb323022ece192))
* tsdoc unstable tag is block not modifier ([#1405](https://github.com/discordjs/discord-api-types/issues/1405)) ([6e5563e](https://github.com/discordjs/discord-api-types/commit/6e5563e2b727684b44e2851b09fdf5590e08a1f8))


### Features

* **APIAuditLogChange:** add some missing channel change types ([#1409](https://github.com/discordjs/discord-api-types/issues/1409)) ([ea2b922](https://github.com/discordjs/discord-api-types/commit/ea2b922d12618c54139fb37986697a1a2bd33393))
* **GuildFeature:** add `PinPermissionMigrationComplete` ([#1407](https://github.com/discordjs/discord-api-types/issues/1407)) ([c5c0312](https://github.com/discordjs/discord-api-types/commit/c5c0312867e70aefb803f9988c46e6214a028be6))
* publishing with OIDC ([62e5b4a](https://github.com/discordjs/discord-api-types/commit/62e5b4a95cc7d5b71384d81f96d0e583d117cee5))
* **Webhooks:** add entitlement update and delete events ([#1408](https://github.com/discordjs/discord-api-types/issues/1408)) ([be8b372](https://github.com/discordjs/discord-api-types/commit/be8b3726630bd0b0f76615cb5d7e759a95de71e4))



## [0.38.30](https://github.com/discordjs/discord-api-types/compare/0.38.29...0.38.30) (2025-10-13)


### Features

* Add support for file upload components ([#1372](https://github.com/discordjs/discord-api-types/issues/1372)) ([51b2d4e](https://github.com/discordjs/discord-api-types/commit/51b2d4e1c91a2d10244baccf1fdeee767df2289f))



## [0.38.29](https://github.com/discordjs/discord-api-types/compare/0.38.28...0.38.29) (2025-10-06)


### Bug Fixes

* edit self result ([#1393](https://github.com/discordjs/discord-api-types/issues/1393)) ([9665e02](https://github.com/discordjs/discord-api-types/commit/9665e0236734cf224e88da4a6ede4dc535ce53a5))



## [0.38.28](https://github.com/discordjs/discord-api-types/compare/0.38.27...0.38.28) (2025-10-04)


### Bug Fixes

* move `applied_tags` back to thread channels ([#1391](https://github.com/discordjs/discord-api-types/issues/1391)) ([00c4694](https://github.com/discordjs/discord-api-types/commit/00c46946a02ace495031c6d257b0820c4a0652cc))



## [0.38.27](https://github.com/discordjs/discord-api-types/compare/0.38.26...0.38.27) (2025-10-04)


### Bug Fixes

* `[@unstable](https://github.com/unstable)` screening ([#1389](https://github.com/discordjs/discord-api-types/issues/1389)) ([95b186d](https://github.com/discordjs/discord-api-types/commit/95b186deb7410ff5a667a1cbac5e7b6dd915f6fe))
* add `RESTPutAPIGuildIncidentActionsResult` ([#1388](https://github.com/discordjs/discord-api-types/issues/1388)) ([0c6d424](https://github.com/discordjs/discord-api-types/commit/0c6d4249b6e39b52607235b273bf0c46caa331dc))
* Narrow thread-related properties for channels ([#1377](https://github.com/discordjs/discord-api-types/issues/1377)) ([18cf4a5](https://github.com/discordjs/discord-api-types/commit/18cf4a514e644d039f18f55d4062318dbeb1c3f6))
* **RESTPutAPIGuildIncidentActionsJSONBody:** add `null` ([#1387](https://github.com/discordjs/discord-api-types/issues/1387)) ([6295858](https://github.com/discordjs/discord-api-types/commit/6295858de5d7bde4b2b289ef301d994ed78bf964))



## [0.38.26](https://github.com/discordjs/discord-api-types/compare/0.38.25...0.38.26) (2025-09-18)


### Bug Fixes

* add guild_id back to GatewayVoiceStateUpdateDispatchData ([#1346](https://github.com/discordjs/discord-api-types/issues/1346)) ([e52ac85](https://github.com/discordjs/discord-api-types/commit/e52ac85e9d60b4032bb21cd958cf032cad50643f))



## [0.38.25](https://github.com/discordjs/discord-api-types/compare/0.38.24...0.38.25) (2025-09-15)


### Features

* add RateLimited gateway event ([#1334](https://github.com/discordjs/discord-api-types/issues/1334)) ([14963d6](https://github.com/discordjs/discord-api-types/commit/14963d61d488af2be8d3655651fd0677ad4c46ed))



## [0.38.24](https://github.com/discordjs/discord-api-types/compare/0.38.23...0.38.24) (2025-09-10)


### Features

* **RESTPatchAPICurrentGuildMemberJSONBody:** Add `banner`, `avatar`, and `bio` ([#1356](https://github.com/discordjs/discord-api-types/issues/1356)) ([35a4084](https://github.com/discordjs/discord-api-types/commit/35a40846473eebfe5245656ee5437347ff2fa88f))
* **RESTPostAPIChannelThreadsResult:** narrow response ([#1364](https://github.com/discordjs/discord-api-types/issues/1364)) ([8eb66a1](https://github.com/discordjs/discord-api-types/commit/8eb66a1512e5b8c57ba7e4a85a18380664ac6219))
* Update invite types ([#1365](https://github.com/discordjs/discord-api-types/issues/1365)) ([35867c1](https://github.com/discordjs/discord-api-types/commit/35867c19e6942e82ac6b2bcd93f61853b0b41666))



## [0.38.23](https://github.com/discordjs/discord-api-types/compare/0.38.22...0.38.23) (2025-09-05)


### Bug Fixes

* add missing text display in modal submission ([#1362](https://github.com/discordjs/discord-api-types/issues/1362)) ([464a9c8](https://github.com/discordjs/discord-api-types/commit/464a9c8cbf613428c3da6b3a9ebd0da4bd827c2b))
* **RESTPatchAPIWebhookWithTokenMessageJSONBody:** add `flags` ([#1354](https://github.com/discordjs/discord-api-types/issues/1354)) ([af3907b](https://github.com/discordjs/discord-api-types/commit/af3907b10690c224dcd3106127fd67491262cc6c))


### Features

* add 400001 ([#1352](https://github.com/discordjs/discord-api-types/issues/1352)) ([ae09e2b](https://github.com/discordjs/discord-api-types/commit/ae09e2b9e47460b07907fc3b6e317bc1ae426663))
* More label components and text display in modals ([#1351](https://github.com/discordjs/discord-api-types/issues/1351)) ([fa05a75](https://github.com/discordjs/discord-api-types/commit/fa05a7503f59017efc16ba2ca6cfb3fc99d331a3))



## [0.38.22](https://github.com/discordjs/discord-api-types/compare/0.38.21...0.38.22) (2025-08-29)


### Features

* Support select in modals ([#1321](https://github.com/discordjs/discord-api-types/issues/1321)) ([3659c59](https://github.com/discordjs/discord-api-types/commit/3659c59ce7b3ee8c0281bf28499e733e1bc0752b))



## [0.38.21](https://github.com/discordjs/discord-api-types/compare/0.38.20...0.38.21) (2025-08-21)


### Features

* guest invites ([#1290](https://github.com/discordjs/discord-api-types/issues/1290)) ([1a37ae3](https://github.com/discordjs/discord-api-types/commit/1a37ae3eea156108e1add538b1d42c5fc2ce08ee))
* **PermissionFlagsBits:** add `PinMessages` ([#1340](https://github.com/discordjs/discord-api-types/issues/1340)) ([b05df17](https://github.com/discordjs/discord-api-types/commit/b05df17466ade5bf58578b8a230d9cb5ec9e1024))



## [0.38.20](https://github.com/discordjs/discord-api-types/compare/0.38.19...0.38.20) (2025-08-14)



## [0.38.19](https://github.com/discordjs/discord-api-types/compare/0.38.18...0.38.19) (2025-08-12)


### Features

* **GatewayActivity:** add url & status display type fields ([#1326](https://github.com/discordjs/discord-api-types/issues/1326)) ([5f9c1e1](https://github.com/discordjs/discord-api-types/commit/5f9c1e1b1c9f1a63d80718629fb2775b7bae62b3))



## [0.38.18](https://github.com/discordjs/discord-api-types/compare/0.38.17...0.38.18) (2025-07-31)


### Bug Fixes

* Deprecate API related to guild ownership ([#1316](https://github.com/discordjs/discord-api-types/issues/1316)) ([4afd0c1](https://github.com/discordjs/discord-api-types/commit/4afd0c13fde05fa7117ecdeaf20534545cfdb005))


### Features

* **GuildFeature:** add `GUILD_TAGS` ([#1315](https://github.com/discordjs/discord-api-types/issues/1315)) ([03f02a5](https://github.com/discordjs/discord-api-types/commit/03f02a5a9ee2e533b58b7790c4deb7ad571e5a92))



## [0.38.17](https://github.com/discordjs/discord-api-types/compare/0.38.16...0.38.17) (2025-07-24)


### Features

* **auditLog:** add `AUTO_MODERATION_QUARANTINE_USER` ([#1310](https://github.com/discordjs/discord-api-types/issues/1310)) ([a72e454](https://github.com/discordjs/discord-api-types/commit/a72e4545a3409388a9c5ec0b5555ecc258de0ac2))
* **GuildMemberFlags:** add `AutoModQuarantinedGuildTag` ([#1309](https://github.com/discordjs/discord-api-types/issues/1309)) ([a41e646](https://github.com/discordjs/discord-api-types/commit/a41e646d3d9b9f6bb15c2f6165043ef8042b26bf))



## [0.38.16](https://github.com/discordjs/discord-api-types/compare/0.38.15...0.38.16) (2025-07-13)


### Bug Fixes

* **APIApplicationCommandChannelOption:** exclude directory channels ([#1300](https://github.com/discordjs/discord-api-types/issues/1300)) ([574e5c1](https://github.com/discordjs/discord-api-types/commit/574e5c12bddd2c515fd2b96b5705b5ef9f9d2787))



## [0.38.15](https://github.com/discordjs/discord-api-types/compare/0.38.14...0.38.15) (2025-07-03)


### Bug Fixes

* **CDNRoutes:** correct `guildTagBadge` route ([#1291](https://github.com/discordjs/discord-api-types/issues/1291)) ([1fee633](https://github.com/discordjs/discord-api-types/commit/1fee6339bf05a98900d8703207c77b8e6d047f24))


### Features

* user guild tags ([#1287](https://github.com/discordjs/discord-api-types/issues/1287)) ([3245f7d](https://github.com/discordjs/discord-api-types/commit/3245f7de92c40d3b74014dbf97a2c0eafea8bcd2))



## [0.38.14](https://github.com/discordjs/discord-api-types/compare/0.38.13...0.38.14) (2025-06-30)


### Features

* role gradient colors ([#1281](https://github.com/discordjs/discord-api-types/issues/1281)) ([7fbb3e3](https://github.com/discordjs/discord-api-types/commit/7fbb3e3310bde5ea0e977afb83ea21bda0220633))
* support new pinned messages routes ([#1254](https://github.com/discordjs/discord-api-types/issues/1254)) ([71c6d26](https://github.com/discordjs/discord-api-types/commit/71c6d2609f1713827e95c5f617011c053cd3eb6a))
* **voice:** add close codes 4021 and 4022 ([#1283](https://github.com/discordjs/discord-api-types/issues/1283)) ([6b05db5](https://github.com/discordjs/discord-api-types/commit/6b05db5a2f9ea540e34e8429c07b96411d418b73))



## [0.38.13](https://github.com/discordjs/discord-api-types/compare/0.38.12...0.38.13) (2025-06-23)


### Features

* **APIUser:** add `collectibles` ([#1274](https://github.com/discordjs/discord-api-types/issues/1274)) ([77cb327](https://github.com/discordjs/discord-api-types/commit/77cb32746f47247a4229910db8ec64f844038529))



## [0.38.12](https://github.com/discordjs/discord-api-types/compare/0.38.11...0.38.12) (2025-06-16)


### Features

* **APIApplication:** add `approximate_user_authorization_count` ([#1272](https://github.com/discordjs/discord-api-types/issues/1272)) ([91d8516](https://github.com/discordjs/discord-api-types/commit/91d851628d2078e70b79e4aa7e464297eca745ce))
* **APIUnfurledMediaItem:** add `attachment_id` ([#1273](https://github.com/discordjs/discord-api-types/issues/1273)) ([b2da18c](https://github.com/discordjs/discord-api-types/commit/b2da18c634c4e20112ce13a8e0a5e6db50063acc))



## [0.38.11](https://github.com/discordjs/discord-api-types/compare/0.38.10...0.38.11) (2025-06-04)


### Bug Fixes

* **voice:** add `max_dave_protocol_version` to identify ([#1260](https://github.com/discordjs/discord-api-types/issues/1260)) ([83d34ef](https://github.com/discordjs/discord-api-types/commit/83d34ef00c4e25d5050c7fc47562b3faa9125215))
* **voice:** add clients connect and client disconnect recieve payload ([#1261](https://github.com/discordjs/discord-api-types/issues/1261)) ([121fb47](https://github.com/discordjs/discord-api-types/commit/121fb47f4c0c51d6149bcf051ffc5bae04b1bba8))
* **voice:** fix remaining payload typos ([#1262](https://github.com/discordjs/discord-api-types/issues/1262)) ([d71276c](https://github.com/discordjs/discord-api-types/commit/d71276cb5f3423a81780494d041694356b8cb49c))


### Features

* voice v8 payloads & MLS voice opcodes ([#1257](https://github.com/discordjs/discord-api-types/issues/1257)) ([ebf313c](https://github.com/discordjs/discord-api-types/commit/ebf313c49c1d78cb1aaf238cfbae7c114f6215cf))



## [0.38.10](https://github.com/discordjs/discord-api-types/compare/0.38.9...0.38.10) (2025-06-02)



## [0.38.9](https://github.com/discordjs/discord-api-types/compare/0.38.8...0.38.9) (2025-05-31)


### Bug Fixes

* discriminated thread channel types ([#1247](https://github.com/discordjs/discord-api-types/issues/1247)) ([72b8c83](https://github.com/discordjs/discord-api-types/commit/72b8c830ee6ed369085644e93b3e27849b0274ed))
* optional `client_id` and `client_secret` in access token data ([#1248](https://github.com/discordjs/discord-api-types/issues/1248)) ([b360b2e](https://github.com/discordjs/discord-api-types/commit/b360b2e6a767fa34d48b2f02fd19511a2db98ecb))


### Features

* deauthorised webhook events ([#1253](https://github.com/discordjs/discord-api-types/issues/1253)) ([9daac44](https://github.com/discordjs/discord-api-types/commit/9daac44f1d056115755e92fcc22995a9c05012be))



## [0.38.8](https://github.com/discordjs/discord-api-types/compare/0.38.7...0.38.8) (2025-05-15)



## [0.38.7](https://github.com/discordjs/discord-api-types/compare/0.38.6...0.38.7) (2025-05-15)



## [0.38.6](https://github.com/discordjs/discord-api-types/compare/0.38.5...0.38.6) (2025-05-15)


### Bug Fixes

* wrong exports reported by ae ([#1239](https://github.com/discordjs/discord-api-types/issues/1239)) ([a5d949e](https://github.com/discordjs/discord-api-types/commit/a5d949e650fbc325c6b619da00edfa66d28abc72))


### Features

* experimental new docs gen ([#1240](https://github.com/discordjs/discord-api-types/issues/1240)) ([3af2ae2](https://github.com/discordjs/discord-api-types/commit/3af2ae2b85550c83ec9bf1e124226d16e6a8ca7e))



## [0.38.5](https://github.com/discordjs/discord-api-types/compare/0.38.4...0.38.5) (2025-05-12)


### Bug Fixes

* imports ([#1237](https://github.com/discordjs/discord-api-types/issues/1237)) ([c64362a](https://github.com/discordjs/discord-api-types/commit/c64362a711940a5fb5b0cb56c374ebc003fb3b0d))


### Features

* `APIWebhookSourceChannel` ([#1235](https://github.com/discordjs/discord-api-types/issues/1235)) ([ca20659](https://github.com/discordjs/discord-api-types/commit/ca206593efd1dd8f09a59c832baef0187a7cc963))
* `APIWebhookSourceGuild` ([#1236](https://github.com/discordjs/discord-api-types/issues/1236)) ([21420c3](https://github.com/discordjs/discord-api-types/commit/21420c3028afd8cc0e73cd1081c6ecdd02c81571))
* invite channel ([#1232](https://github.com/discordjs/discord-api-types/issues/1232)) ([0479caf](https://github.com/discordjs/discord-api-types/commit/0479cafa1bedd549d54b7cc6c915fc6beb2ba6ec))



## [0.38.4](https://github.com/discordjs/discord-api-types/compare/0.38.3...0.38.4) (2025-05-08)


### Features

* Specific typings for application emojis ([#1228](https://github.com/discordjs/discord-api-types/issues/1228)) ([4b0a3af](https://github.com/discordjs/discord-api-types/commit/4b0a3af12badba5221604a3304efaeb3d0b46dd7))



## [0.38.3](https://github.com/discordjs/discord-api-types/compare/0.38.2...0.38.3) (2025-05-05)



## [0.38.2](https://github.com/discordjs/discord-api-types/compare/0.38.1...0.38.2) (2025-05-01)



# [0.38.1](https://github.com/discordjs/discord-api-types/compare/0.37.120...0.38.1) (2025-04-22)


### Features

* components v2 ([9f769c3](https://github.com/discordjs/discord-api-types/commit/9f769c319eed0cb3d26d5a5c0cb06f8f4a78c071))
* **CDNQuery:** add ImageSize type ([527ac2f](https://github.com/discordjs/discord-api-types/commit/527ac2fe0f80d88e62c025bcdab48d251ac171d6))

### BREAKING CHANGES

* Certain Component alias types have been renamed (for example APIMessageActionRowComponent is now APIComponentInMessageActionRow



## [0.37.120](https://github.com/discordjs/discord-api-types/compare/0.37.119...0.37.120) (2025-04-10)


### Bug Fixes

* Ensure autocomplete option values resolve to string for numerical types ([#1198](https://github.com/discordjs/discord-api-types/issues/1198)) ([cfac62e](https://github.com/discordjs/discord-api-types/commit/cfac62e44a02a535b8ed412dae263b8c31475c4a))


### Features

* **APIBaseInteraction:** add `attachment_size_limit` ([#1214](https://github.com/discordjs/discord-api-types/issues/1214)) ([5b6f0d4](https://github.com/discordjs/discord-api-types/commit/5b6f0d43a4e4886a924af840b388c3f482b79f5e))
* **RPC:** types ([#1200](https://github.com/discordjs/discord-api-types/issues/1200)) ([ac4d59d](https://github.com/discordjs/discord-api-types/commit/ac4d59d17edfa77cf28c644f8797204035508a0a))
* **webhook:** add `with_components` query param ([#1208](https://github.com/discordjs/discord-api-types/issues/1208)) ([def67db](https://github.com/discordjs/discord-api-types/commit/def67dbe90206a2a5c7d08ce734a2db6a9175ca3))



## [0.37.119](https://github.com/discordjs/discord-api-types/compare/0.37.118...0.37.119) (2025-02-02)


### Bug Fixes

* route escaping round three ([d5cdb37](https://github.com/discordjs/discord-api-types/commit/d5cdb37a8f06128e472f1ef13ec4d7823f956e7d))



## [0.37.118](https://github.com/discordjs/discord-api-types/compare/0.37.117...0.37.118) (2025-01-27)


### Features

* **APIGuild:** add `incidents_data` ([#822](https://github.com/discordjs/discord-api-types/issues/822)) ([8fe9c07](https://github.com/discordjs/discord-api-types/commit/8fe9c072b3188c51bb3713dae640ba227a266438))
* **MessageFlags:** add HasSnapshot ([#1141](https://github.com/discordjs/discord-api-types/issues/1141)) ([d446be5](https://github.com/discordjs/discord-api-types/commit/d446be5ecdcc3889e30a8af1ce2ac598ffe1b49d))



## [0.37.117](https://github.com/discordjs/discord-api-types/compare/0.37.116...0.37.117) (2025-01-20)



## [0.37.116](https://github.com/discordjs/discord-api-types/compare/0.37.115...0.37.116) (2025-01-16)


### Features

* **VoiceCloseCodes:** add `BadRequest` ([#1191](https://github.com/discordjs/discord-api-types/issues/1191)) ([d9b6935](https://github.com/discordjs/discord-api-types/commit/d9b6935b01665db70ddf8971be5ee42c96f12706))



## [0.37.115](https://github.com/discordjs/discord-api-types/compare/0.37.114...0.37.115) (2025-01-02)



## [0.37.114](https://github.com/discordjs/discord-api-types/compare/0.37.113...0.37.114) (2024-12-23)


### Bug Fixes

* reset pattern index after testing an input ([ee53ef7](https://github.com/discordjs/discord-api-types/commit/ee53ef7306e73d6b9bf341503231186ef27403fb)), closes [/github.com/discordjs/discord-api-types/issues/1181#issuecomment-2558971449](https://github.com//github.com/discordjs/discord-api-types/issues/1181/issues/issuecomment-2558971449)



## [0.37.113](https://github.com/discordjs/discord-api-types/compare/0.37.112...0.37.113) (2024-12-22)


### Bug Fixes

* skip encoded url parts from re-encoding ([fc4e7be](https://github.com/discordjs/discord-api-types/commit/fc4e7bebc50fe67a0aa5c49a95793e53d3ff0da9))


### Features

* **ConnectionService:** `Bluesky` and `Mastodon` ([#1174](https://github.com/discordjs/discord-api-types/issues/1174)) ([61592d6](https://github.com/discordjs/discord-api-types/commit/61592d6a85232a6d675a6faeddc096ae3467df6a))
* **payloads:** add entrypoint command payloads ([#1166](https://github.com/discordjs/discord-api-types/issues/1166)) ([bcb13de](https://github.com/discordjs/discord-api-types/commit/bcb13de75b6b45e2a5c1ebde5fa77719123b7993))



## [0.37.112](https://github.com/discordjs/discord-api-types/compare/0.37.111...0.37.112) (2024-12-19)


### Features

* **APISubscription:** add `renewal_sku_ids` ([#1172](https://github.com/discordjs/discord-api-types/issues/1172)) ([fb7c6b8](https://github.com/discordjs/discord-api-types/commit/fb7c6b8903bded49c379ba61a520818ba5ab15ba))



## [0.37.111](https://github.com/discordjs/discord-api-types/compare/0.37.110...0.37.111) (2024-12-09)



## [0.37.110](https://github.com/discordjs/discord-api-types/compare/0.37.109...0.37.110) (2024-11-28)


### Features

* add Chrunchyroll ([#1159](https://github.com/discordjs/discord-api-types/issues/1159)) ([92b1ce2](https://github.com/discordjs/discord-api-types/commit/92b1ce2faee4c4b43bfe524e78cfde1fbbfa5792))



## [0.37.109](https://github.com/discordjs/discord-api-types/compare/0.37.108...0.37.109) (2024-11-26)


### Features

* New entitlement endpoint behaviour ([#1145](https://github.com/discordjs/discord-api-types/issues/1145)) ([079fcd6](https://github.com/discordjs/discord-api-types/commit/079fcd6c006759193ea0b4b97d0d5a34c0459041))



## [0.37.108](https://github.com/discordjs/discord-api-types/compare/0.37.107...0.37.108) (2024-11-25)


### Features

* webhook events ([#1128](https://github.com/discordjs/discord-api-types/issues/1128)) ([ced86e4](https://github.com/discordjs/discord-api-types/commit/ced86e4b42c170c855ee148fb9bdb699ddf1a15b))



## [0.37.107](https://github.com/discordjs/discord-api-types/compare/0.37.106...0.37.107) (2024-11-21)


### Bug Fixes

* **security:** escape path parameters ([1ba3472](https://github.com/discordjs/discord-api-types/commit/1ba34729386c9b9dece237e761114f6d1ef11143))



## [0.37.106](https://github.com/discordjs/discord-api-types/compare/0.37.105...0.37.106) (2024-11-21)



## [0.37.105](https://github.com/discordjs/discord-api-types/compare/0.37.104...0.37.105) (2024-11-14)


### Features

* **_interactions:** Support partial guild objects ([#1142](https://github.com/discordjs/discord-api-types/issues/1142)) ([408165e](https://github.com/discordjs/discord-api-types/commit/408165e96fdd08d56183cf3c5348ee08e8aec056))
* full message object on message update ([#1140](https://github.com/discordjs/discord-api-types/issues/1140)) ([3512262](https://github.com/discordjs/discord-api-types/commit/35122621946ab797d4c0b83cecdec1c3df05b6e0))
* guild member banners ([#1057](https://github.com/discordjs/discord-api-types/issues/1057)) ([3f489f1](https://github.com/discordjs/discord-api-types/commit/3f489f18dccf5efe9e4983e66606998fafffc4dd))



## [0.37.104](https://github.com/discordjs/discord-api-types/compare/0.37.103...0.37.104) (2024-11-07)


### Bug Fixes

* add missing soundboard types ([#1134](https://github.com/discordjs/discord-api-types/issues/1134)) ([88d8bed](https://github.com/discordjs/discord-api-types/commit/88d8bed1caa88b604fec8f60ae1450f556c26c8e))
* **isInteractionButton:** handle `ButtonStyle.Premium` ([#1135](https://github.com/discordjs/discord-api-types/issues/1135)) ([736479c](https://github.com/discordjs/discord-api-types/commit/736479cab3332f6be122965963d37c8d4c99fc7f))



## [0.37.103](https://github.com/discordjs/discord-api-types/compare/0.37.102...0.37.103) (2024-10-21)


### Features

* audit log change key for boost bar ([#1120](https://github.com/discordjs/discord-api-types/issues/1120)) ([0fe6059](https://github.com/discordjs/discord-api-types/commit/0fe605975312829702df02b6432fce6d58a00e1f))
* soundboard audit log events ([#1122](https://github.com/discordjs/discord-api-types/issues/1122)) ([76fc8f0](https://github.com/discordjs/discord-api-types/commit/76fc8f035b4c92329896eb8110eaa8d640bf8ec8))



## [0.37.102](https://github.com/discordjs/discord-api-types/compare/0.37.101...0.37.102) (2024-10-14)


### Features

* recurrence rule change key on audit logs ([#1112](https://github.com/discordjs/discord-api-types/issues/1112)) ([4746e8d](https://github.com/discordjs/discord-api-types/commit/4746e8d48600edf905037a9cb9507884876d9508))
* soundboard ([#1113](https://github.com/discordjs/discord-api-types/issues/1113)) ([8d46830](https://github.com/discordjs/discord-api-types/commit/8d468300467db1c0a1726b4dfc6e92018e40e800))



## [0.37.101](https://github.com/discordjs/discord-api-types/compare/0.37.100...0.37.101) (2024-09-23)


### Bug Fixes

* **rest/oauth2:** correct string literal types containing bot scope ([#1101](https://github.com/discordjs/discord-api-types/issues/1101)) ([2ae2324](https://github.com/discordjs/discord-api-types/commit/2ae232477a1362eb0bd5c4aeee4a97bfbca7b2a2))


### Features

* add `VoiceChannelEffectSend` event ([#739](https://github.com/discordjs/discord-api-types/issues/739)) ([240226f](https://github.com/discordjs/discord-api-types/commit/240226f3d2d32df378400671a6bf31ceb2468a3c))
* missing subscription dispatch types ([#1105](https://github.com/discordjs/discord-api-types/issues/1105)) ([2b653a0](https://github.com/discordjs/discord-api-types/commit/2b653a00b3acb04979b7656142f3d8ef986fd561))



## [0.37.100](https://github.com/discordjs/discord-api-types/compare/0.37.99...0.37.100) (2024-09-05)


### Bug Fixes

* **APIMessageSnapshot:** mark `guild_id` as deprecated ([#1084](https://github.com/discordjs/discord-api-types/issues/1084)) ([3f3fe21](https://github.com/discordjs/discord-api-types/commit/3f3fe21e153f2fbe6c76ba1cc916367551b175b6))
* **GatewayGuildDeleteDispatchData:** make `unavailable` optional ([#1092](https://github.com/discordjs/discord-api-types/issues/1092)) ([258fb72](https://github.com/discordjs/discord-api-types/commit/258fb72f38c0513030dc5e1ae60e34fc3f83006d))
* replace deprecated `RESTAPIPollCreate` with `RESTAPIPoll` ([#1091](https://github.com/discordjs/discord-api-types/issues/1091)) ([d3b5187](https://github.com/discordjs/discord-api-types/commit/d3b5187c77f845eba29ab56de41408bcea7e9cb4))


### Features

* add subscriptions ([#1078](https://github.com/discordjs/discord-api-types/issues/1078)) ([8f78190](https://github.com/discordjs/discord-api-types/commit/8f781909f1f5a0d1db8c3e134f4e9e1e22837277))
* **APIMessageSnapshotFields:** add more fields ([#1085](https://github.com/discordjs/discord-api-types/issues/1085)) ([3de4ca8](https://github.com/discordjs/discord-api-types/commit/3de4ca8933be23ac05bf780957aea99e4a70c2fe))
* **ConnectionService:** add Amazon Music connection ([#1074](https://github.com/discordjs/discord-api-types/issues/1074)) ([011d439](https://github.com/discordjs/discord-api-types/commit/011d439971e1f5ee11ba7caea5ed10131cafd6a6))
* entry point commands and interaction callback response ([#1077](https://github.com/discordjs/discord-api-types/issues/1077)) ([b4b70d8](https://github.com/discordjs/discord-api-types/commit/b4b70d8bdcdbc175497366e6bb74dd3bc22c6738))
* **FormattingPatterns:** `GuildNavigation` and `LinkedRole` ([#1089](https://github.com/discordjs/discord-api-types/issues/1089)) ([0938b66](https://github.com/discordjs/discord-api-types/commit/0938b664cef8fd3758506a2f689bb20ead616bb4))
* **MessageType:** `PurchaseNotification` and `PollResult` ([#1040](https://github.com/discordjs/discord-api-types/issues/1040)) ([344274b](https://github.com/discordjs/discord-api-types/commit/344274b56c25b9a35a64fc61b170c177ee702e95))
* **RESTJSONErrorCodes:** add `40018`, `40019`, and `40094` ([#1056](https://github.com/discordjs/discord-api-types/issues/1056)) ([93e649a](https://github.com/discordjs/discord-api-types/commit/93e649a20de0fda31b3276f8affb3cf6890ea693))
* **RESTPatchAPIWebhookWithTokenMessageJSONBody:** `poll` ([#1067](https://github.com/discordjs/discord-api-types/issues/1067)) ([f770290](https://github.com/discordjs/discord-api-types/commit/f7702907172f84b57175b6f6c80eb2de210f6a7b))



## [0.37.99](https://github.com/discordjs/discord-api-types/compare/0.37.98...0.37.99) (2024-09-02)


### Features

* **GuildMemberFlags:** `IsGuest` and `DmSettingsUpsellAcknowledged` ([#1079](https://github.com/discordjs/discord-api-types/issues/1079)) ([2803e8d](https://github.com/discordjs/discord-api-types/commit/2803e8df2f2105099a1dc6e04193355a926718b9))
* remove unstable from stable fields ([#1086](https://github.com/discordjs/discord-api-types/issues/1086)) ([4b64f84](https://github.com/discordjs/discord-api-types/commit/4b64f84ddf0390f0a8979f57623c5f8c9051484d))



## [0.37.98](https://github.com/discordjs/discord-api-types/compare/0.37.97...0.37.98) (2024-08-26)


### Features

* **RESTAPIAttachment:** add more properties ([#1073](https://github.com/discordjs/discord-api-types/issues/1073)) ([f019f0f](https://github.com/discordjs/discord-api-types/commit/f019f0fe97ad47471dd6656e5fb148dc5761e1e0))



## [0.37.97](https://github.com/discordjs/discord-api-types/compare/0.37.96...0.37.97) (2024-08-22)



## [0.37.96](https://github.com/discordjs/discord-api-types/compare/0.37.95...0.37.96) (2024-08-20)


### Bug Fixes

* nullable `recurrence_rule` on patch ([#1063](https://github.com/discordjs/discord-api-types/issues/1063)) ([19d2aeb](https://github.com/discordjs/discord-api-types/commit/19d2aeb4a82dc781558240a674c36eadce270abf))
* nullable fields for scheduled event editing ([#1064](https://github.com/discordjs/discord-api-types/issues/1064)) ([f67043b](https://github.com/discordjs/discord-api-types/commit/f67043b3f46eea7286e959d223b78d140deac318))



## [0.37.95](https://github.com/discordjs/discord-api-types/compare/0.37.94...0.37.95) (2024-08-19)


### Bug Fixes

* interface name ([#1059](https://github.com/discordjs/discord-api-types/issues/1059)) ([147e459](https://github.com/discordjs/discord-api-types/commit/147e459a16c8b0e15a0dd50f75d62c6dd9098815))


### Features

* recurring scheduled events ([#1058](https://github.com/discordjs/discord-api-types/issues/1058)) ([fbfbc6b](https://github.com/discordjs/discord-api-types/commit/fbfbc6b23f2696f6db5fad8ea1543327d5b3cf07))
* **RESTJSONErrorCodes:** `UnknownStickerPack` ([#1055](https://github.com/discordjs/discord-api-types/issues/1055)) ([906dd8e](https://github.com/discordjs/discord-api-types/commit/906dd8e241be6acdf4d6d7b10ce4e7c139b0fd8b))
* **Routes:** voice state endpoint ([#1046](https://github.com/discordjs/discord-api-types/issues/1046)) ([1b1a865](https://github.com/discordjs/discord-api-types/commit/1b1a865efe4d95b34055616ed18dc3613b58f317))



## [0.37.94](https://github.com/discordjs/discord-api-types/compare/0.37.93...0.37.94) (2024-08-15)


### Features

* add Get Sticker Pack endpoint ([#1053](https://github.com/discordjs/discord-api-types/issues/1053)) ([822956f](https://github.com/discordjs/discord-api-types/commit/822956fe788f8eeda5da683189973bd6667cbc96))
* **APIApplication:** `approximate_user_install_count` ([#1052](https://github.com/discordjs/discord-api-types/issues/1052)) ([d504763](https://github.com/discordjs/discord-api-types/commit/d5047639e691cc26e865cc6c06a312e09f0fb4c7))
* **RESTOAuth2:** add RESTPostOAuth2TokenRevocationQuery ([#1050](https://github.com/discordjs/discord-api-types/issues/1050)) ([6ead98b](https://github.com/discordjs/discord-api-types/commit/6ead98b78218830fee308a0425d9078957a662b2))
* **Routes:** get method on role endpoint ([#1051](https://github.com/discordjs/discord-api-types/issues/1051)) ([ea1a6c3](https://github.com/discordjs/discord-api-types/commit/ea1a6c3c86ec0d4c663e2191a488a3716ecdd7cc))



## [0.37.93](https://github.com/discordjs/discord-api-types/compare/0.37.92...0.37.93) (2024-07-22)


### Bug Fixes

* **CDNRoutes:** inconsistency in route and wrong JSDoc ([#1033](https://github.com/discordjs/discord-api-types/issues/1033)) ([eb7b3d9](https://github.com/discordjs/discord-api-types/commit/eb7b3d90dd6a847b80d051006a597e77d70caab2))


### Features

* add support for message forwarding ([#971](https://github.com/discordjs/discord-api-types/issues/971)) ([2c1ff0e](https://github.com/discordjs/discord-api-types/commit/2c1ff0ea3443fb500315d6c69674a875a11addf6))
* application emojis ([#1036](https://github.com/discordjs/discord-api-types/issues/1036)) ([5f22a6b](https://github.com/discordjs/discord-api-types/commit/5f22a6bacabef6b11e170a6f67694359bb3180e8))
* **ConnectionService:** add `Roblox` ([#1032](https://github.com/discordjs/discord-api-types/issues/1032)) ([4f66b4d](https://github.com/discordjs/discord-api-types/commit/4f66b4dd049d2ace638374c09a06272bd517ad3a))
* **RESTAPIPartialCurrentUserGuild:** add `banner` ([#1028](https://github.com/discordjs/discord-api-types/issues/1028)) ([da9496f](https://github.com/discordjs/discord-api-types/commit/da9496f291fff364b8d35b02363b93933c19823a))



## [0.37.92](https://github.com/discordjs/discord-api-types/compare/0.37.91...0.37.92) (2024-07-04)


### Bug Fixes

* **RESTAPIPollCreate:** optional properties ([#1022](https://github.com/discordjs/discord-api-types/issues/1022)) ([c05998d](https://github.com/discordjs/discord-api-types/commit/c05998de274ef7a8d570db9d23c9ad9c228eeccc))



## [0.37.91](https://github.com/discordjs/discord-api-types/compare/0.37.90...0.37.91) (2024-06-27)


### Features

* **APIAttachment:** add `title` ([#1015](https://github.com/discordjs/discord-api-types/issues/1015)) ([897fd90](https://github.com/discordjs/discord-api-types/commit/897fd90bf2705d6ff5eebbb21fa8e735fc1e1e22))



## [0.37.90](https://github.com/discordjs/discord-api-types/compare/0.37.89...0.37.90) (2024-06-18)


### Features

* add premium buttons ([#1010](https://github.com/discordjs/discord-api-types/issues/1010)) ([088dbe0](https://github.com/discordjs/discord-api-types/commit/088dbe016fdb72fb751931938bf7240c34fa64c0))



## [0.37.89](https://github.com/discordjs/discord-api-types/compare/0.37.88...0.37.89) (2024-06-13)


### Features

* Add use external apps permission ([#999](https://github.com/discordjs/discord-api-types/issues/999)) ([d63bea7](https://github.com/discordjs/discord-api-types/commit/d63bea7dfc748472b2e5ed4e2d45752acc1a3d2a))



## [0.37.88](https://github.com/discordjs/discord-api-types/compare/0.37.87...0.37.88) (2024-06-10)


### Bug Fixes

* **APIGuildMember:** make user required and omit in messages ([#998](https://github.com/discordjs/discord-api-types/issues/998)) ([98544fa](https://github.com/discordjs/discord-api-types/commit/98544fa56aa7d6e98b23ead4e898a5f8424a437a))


### Features

* **AuditLogEvent:** home settings events ([#1000](https://github.com/discordjs/discord-api-types/issues/1000)) ([c6a72a5](https://github.com/discordjs/discord-api-types/commit/c6a72a55e5aa77413cfdb639b1c89b1a0774b624))
* **MessageType:** add incident related types ([#1004](https://github.com/discordjs/discord-api-types/issues/1004)) ([173f9ed](https://github.com/discordjs/discord-api-types/commit/173f9ed0fa9daf838c050aa246bc533f4c788c3b))
* **RouteBases:** Add media URL ([#1001](https://github.com/discordjs/discord-api-types/issues/1001)) ([fdc0408](https://github.com/discordjs/discord-api-types/commit/fdc04089e17e682c7db46990580a853c7b852957))



## [0.37.87](https://github.com/discordjs/discord-api-types/compare/0.37.86...0.37.87) (2024-06-03)


### Bug Fixes

* Correct types for `APIAuditLogChangeKey$Add` and `APIAuditLogChangeKey$Remove` ([#955](https://github.com/discordjs/discord-api-types/issues/955)) ([f859a96](https://github.com/discordjs/discord-api-types/commit/f859a96974e3188a18df575466e09b32fb70fbda))


### Features

* **AutoModeration:** add blocking words in member profile ([#740](https://github.com/discordjs/discord-api-types/issues/740)) ([5097460](https://github.com/discordjs/discord-api-types/commit/509746003a5544fc1b1a28a5a58a3cfe27e200ca))



## [0.37.86](https://github.com/discordjs/discord-api-types/compare/0.37.85...0.37.86) (2024-05-27)



## [0.37.85](https://github.com/discordjs/discord-api-types/compare/0.37.84...0.37.85) (2024-05-23)


### Features

* add gateway events payload for super reactions ([#878](https://github.com/discordjs/discord-api-types/issues/878)) ([16a6a46](https://github.com/discordjs/discord-api-types/commit/16a6a4683204cbf101372a233e235ebf6cb4df4e))
* add type query param for get reactions endpoint ([#879](https://github.com/discordjs/discord-api-types/issues/879)) ([ddb2bde](https://github.com/discordjs/discord-api-types/commit/ddb2bde07776f0b9f370ab8ff6bf5c95be0138fd))
* **APIMessage:** add `call` ([#983](https://github.com/discordjs/discord-api-types/issues/983)) ([79d9875](https://github.com/discordjs/discord-api-types/commit/79d9875c5d480b4ff4817edfecb58cd5c19c0d7b))



## [0.37.84](https://github.com/discordjs/discord-api-types/compare/0.37.83...0.37.84) (2024-05-16)


### Features

* **RESTJSONErrorCodes:** add error code 40333 ([#854](https://github.com/discordjs/discord-api-types/issues/854)) ([65eebd9](https://github.com/discordjs/discord-api-types/commit/65eebd92d636d4ea8e3319c8df84208f1d6ce94f))
* support avatar decorations ([#834](https://github.com/discordjs/discord-api-types/issues/834)) ([7650ce4](https://github.com/discordjs/discord-api-types/commit/7650ce4f7244c04f30e31938965e5023aa858945))
* user-installable apps ([#921](https://github.com/discordjs/discord-api-types/issues/921)) ([c457b8d](https://github.com/discordjs/discord-api-types/commit/c457b8d0596561fd1122e1d96bd168b322de368e))



## [0.37.83](https://github.com/discordjs/discord-api-types/compare/0.37.82...0.37.83) (2024-04-27)


### Features

* **APIAuditLogChange:** add missing keys ([#964](https://github.com/discordjs/discord-api-types/issues/964)) ([4e37de7](https://github.com/discordjs/discord-api-types/commit/4e37de7f72ad6b9502d3e3db97b10910d9970a92))
* one time premium app purchases ([#966](https://github.com/discordjs/discord-api-types/issues/966)) ([c9f2c5b](https://github.com/discordjs/discord-api-types/commit/c9f2c5b020b4c7a36330fe06463106e9cfd38fca))



## [0.37.82](https://github.com/discordjs/discord-api-types/compare/0.37.81...0.37.82) (2024-04-25)


### Features

* **APIInvite:** add `type` ([#858](https://github.com/discordjs/discord-api-types/issues/858)) ([c4ee790](https://github.com/discordjs/discord-api-types/commit/c4ee7907c2acf334e898862ed3d7d468dbdaaf5f))
* **AuditLogEvent:** onboarding events ([#795](https://github.com/discordjs/discord-api-types/issues/795)) ([fddb225](https://github.com/discordjs/discord-api-types/commit/fddb2257db7aac29129ec5d941c46fba167e2de8))
* **ConnectionService:** add `domain` ([#818](https://github.com/discordjs/discord-api-types/issues/818)) ([3ae6d72](https://github.com/discordjs/discord-api-types/commit/3ae6d722fd0b5aa18eb932a51172bba144c2d4ff))



## [0.37.81](https://github.com/discordjs/discord-api-types/compare/0.37.80...0.37.81) (2024-04-22)


### Bug Fixes

* **Polls:** correct APIPollAnswer properties ([#962](https://github.com/discordjs/discord-api-types/issues/962)) ([308d7d4](https://github.com/discordjs/discord-api-types/commit/308d7d40f45b7e3e78a6b13350d3ad7c8fd81b47))



## [0.37.80](https://github.com/discordjs/discord-api-types/compare/0.37.79...0.37.80) (2024-04-22)


### Features

* add support for polls ([#925](https://github.com/discordjs/discord-api-types/issues/925)) ([a36449a](https://github.com/discordjs/discord-api-types/commit/a36449a0283b733c59f5fdc0d6c3f2f786f0514d))



## [0.37.79](https://github.com/discordjs/discord-api-types/compare/0.37.78...0.37.79) (2024-04-04)


### Features

* **ConnectionService:** add bungie connection ([#907](https://github.com/discordjs/discord-api-types/issues/907)) ([22b5f47](https://github.com/discordjs/discord-api-types/commit/22b5f4778778baec7f414c4b253e96b0949de948))



## [0.37.78](https://github.com/discordjs/discord-api-types/compare/0.37.77...0.37.78) (2024-04-01)


### Features

* bot banners ([#906](https://github.com/discordjs/discord-api-types/issues/906)) ([495148d](https://github.com/discordjs/discord-api-types/commit/495148dc466fcc3cd47ff62377369a97a9cec13d))
* **Guild:** add `RESTPostAPIGuildBulkBan` result and json body ([#910](https://github.com/discordjs/discord-api-types/issues/910)) ([61ce329](https://github.com/discordjs/discord-api-types/commit/61ce329f614d5bc923c3ab4d2b318aa2e66c767b))
* **RESTJSONErrorCodes:** Add `500_000` ([#908](https://github.com/discordjs/discord-api-types/issues/908)) ([4db44b5](https://github.com/discordjs/discord-api-types/commit/4db44b553d7164415b9f20468716beb5223fcec0))
* **Routes:** Add `guildBulkBan()` route ([#909](https://github.com/discordjs/discord-api-types/issues/909)) ([7dcad58](https://github.com/discordjs/discord-api-types/commit/7dcad582ce2fa16ac7bde35f5b158648c2c7c9bf))



## [0.37.77](https://github.com/discordjs/discord-api-types/compare/0.37.76...0.37.77) (2024-03-28)


### Features

* **APIAuditLogChange:** add `APIAuditLogChangeKeySystemChannelFlags` ([#933](https://github.com/discordjs/discord-api-types/issues/933)) ([47c9ad0](https://github.com/discordjs/discord-api-types/commit/47c9ad0e7043c098d103107e95f8a97e67ad3eb4))



## [0.37.76](https://github.com/discordjs/discord-api-types/compare/0.37.75...0.37.76) (2024-03-21)



## [0.37.75](https://github.com/discordjs/discord-api-types/compare/0.37.74...0.37.75) (2024-03-18)



## [0.37.74](https://github.com/discordjs/discord-api-types/compare/0.37.73...0.37.74) (2024-03-14)



## [0.37.73](https://github.com/discordjs/discord-api-types/compare/0.37.71...0.37.73) (2024-03-07)



## [0.37.72](https://github.com/discordjs/discord-api-types/compare/0.37.71...0.37.72) (2024-03-07)



## [0.37.71](https://github.com/discordjs/discord-api-types/compare/0.37.70...0.37.71) (2024-02-26)

### Features

- add initial support for super reactions ([#744](https://github.com/discordjs/discord-api-types/issues/744)) ([150dc46](https://github.com/discordjs/discord-api-types/commit/150dc46b8739ca9cf10a46bb48d390f70c679b6e))

## [0.37.70](https://github.com/discordjs/discord-api-types/compare/0.37.69...0.37.70) (2024-02-15)

### Features

- **RESTPostAPIChannelMessageJSONBody:** add enforce_nonce ([#874](https://github.com/discordjs/discord-api-types/issues/874)) ([9564941](https://github.com/discordjs/discord-api-types/commit/9564941b3ae51c8bc9b1f915d66b43775089db18))

## [0.37.69](https://github.com/discordjs/discord-api-types/compare/0.37.68...0.37.69) (2024-02-08)

### Features

- **Locale:** add `SpanishLATAM` ([#859](https://github.com/discordjs/discord-api-types/issues/859)) ([0cfe05d](https://github.com/discordjs/discord-api-types/commit/0cfe05dad8271513a2ef58e4f183c530555c7c2d))

## [0.37.68](https://github.com/discordjs/discord-api-types/compare/0.37.67...0.37.68) (2024-02-05)

### Bug Fixes

- **CDNRoutes:** fix store page wrong extension ([#867](https://github.com/discordjs/discord-api-types/issues/867)) ([6f541d5](https://github.com/discordjs/discord-api-types/commit/6f541d58d278f1e610916250c003c1344831e3ad))
- **CDNRoutes:** make format optional and default to png ([#869](https://github.com/discordjs/discord-api-types/issues/869)) ([55efcca](https://github.com/discordjs/discord-api-types/commit/55efcca4f8480f96243d9d802ce632833ac8e3ff))

## [0.37.67](https://github.com/discordjs/discord-api-types/compare/0.37.66...0.37.67) (2023-12-28)

### Bug Fixes

- **GatewayThreadDispatch:** properly type thread create/update/delete dispatches ([#861](https://github.com/discordjs/discord-api-types/issues/861)) ([819d852](https://github.com/discordjs/discord-api-types/commit/819d85207ae7e07322e404a5ef9e3eb283b4aa03))

## [0.37.66](https://github.com/discordjs/discord-api-types/compare/0.37.65...0.37.66) (2023-12-07)

### Features

- **RESTPostAPIWebhookWithTokenJSONBody:** add `applied_tags` ([#855](https://github.com/discordjs/discord-api-types/issues/855)) ([b4226bb](https://github.com/discordjs/discord-api-types/commit/b4226bb708763ebe04d9f7abcafa148bb5588ba4))

## [0.37.65](https://github.com/discordjs/discord-api-types/compare/0.37.64...0.37.65) (2023-11-23)

### Bug Fixes

- **TextChannelType:** Remove forum and media channels ([#849](https://github.com/discordjs/discord-api-types/issues/849)) ([9574881](https://github.com/discordjs/discord-api-types/commit/957488134e48c482324e9678dd53c11bf946b6cd))

## [0.37.64](https://github.com/discordjs/discord-api-types/compare/0.37.63...0.37.64) (2023-11-20)

### Features

- **PermissionFlagsBits:** split up expressions and events perms ([#790](https://github.com/discordjs/discord-api-types/issues/790)) ([ca05ee5](https://github.com/discordjs/discord-api-types/commit/ca05ee5eb21acdba866de7997cbf980d598e3ee1))

## [0.37.63](https://github.com/discordjs/discord-api-types/compare/0.37.62...0.37.63) (2023-11-09)

### Bug Fixes

- **RESTPutAPIGuildOnboardingJSONBody:** optional keys and flattened emoji ([#839](https://github.com/discordjs/discord-api-types/issues/839)) ([a8efb19](https://github.com/discordjs/discord-api-types/commit/a8efb1949ad4b554d5c59f7b55a251ee12abc93d))

## [0.37.62](https://github.com/discordjs/discord-api-types/compare/0.37.61...0.37.62) (2023-10-30)

### Features

- **RESTJSONErrorCodes:** add `40074` and `50057` ([#844](https://github.com/discordjs/discord-api-types/issues/844)) ([28ed370](https://github.com/discordjs/discord-api-types/commit/28ed3701e6105d0d15fb988194c13079a27e4369))

## [0.37.61](https://github.com/discordjs/discord-api-types/compare/0.37.60...0.37.61) (2023-10-23)

### Features

- premium app subscriptions ([#833](https://github.com/discordjs/discord-api-types/issues/833)) ([ba08061](https://github.com/discordjs/discord-api-types/commit/ba080619170b484f671011abe3b0a61c0e69cca9))

## [0.37.60](https://github.com/discordjs/discord-api-types/compare/0.37.59...0.37.60) (2023-10-05)

### Features

- Application patch and new properties ([#810](https://github.com/discordjs/discord-api-types/issues/810)) ([17f42e0](https://github.com/discordjs/discord-api-types/commit/17f42e0b38d431505ee56cdeb0bb85bff94e97c6))

## [0.37.59](https://github.com/discordjs/discord-api-types/compare/0.37.58...0.37.59) (2023-10-02)

### Features

- **RESTPostAPIStageInstanceJSONBody:** add `guild_scheduled_event_id` ([#656](https://github.com/discordjs/discord-api-types/issues/656)) ([ecef5b4](https://github.com/discordjs/discord-api-types/commit/ecef5b492bd54b3c61c04a6784fd39c29e282780))

## [0.37.58](https://github.com/discordjs/discord-api-types/compare/0.37.57...0.37.58) (2023-09-25)

### Bug Fixes

- **RESTPatchAPIChannelJSONBody:** add missing `applied_tags` field ([#828](https://github.com/discordjs/discord-api-types/issues/828)) ([a4cdbbf](https://github.com/discordjs/discord-api-types/commit/a4cdbbfdf87f32e6108140260f163afeca3e0788))

### Features

- default select menu values ([#824](https://github.com/discordjs/discord-api-types/issues/824)) ([1290c94](https://github.com/discordjs/discord-api-types/commit/1290c942abdd8c2d9bf97aa2807f45073970f823))

## [0.37.57](https://github.com/discordjs/discord-api-types/compare/0.37.56...0.37.57) (2023-09-21)

### Features

- **ConnectionService:** support twitter rebrand update ([#819](https://github.com/discordjs/discord-api-types/issues/819)) ([32ba5ce](https://github.com/discordjs/discord-api-types/commit/32ba5ce36ce3b89293d540b06b74c2643ced7119))

## [0.37.56](https://github.com/discordjs/discord-api-types/compare/0.37.55...0.37.56) (2023-08-31)

### Bug Fixes

- **RESTPostAPIChannelMessageJSONBody:** `number` for attachment ids ([#811](https://github.com/discordjs/discord-api-types/issues/811)) ([1eb0161](https://github.com/discordjs/discord-api-types/commit/1eb01618a3d7421012b0423aea7a8bde032c08fc))
- standard stickers are now free ([#789](https://github.com/discordjs/discord-api-types/issues/789)) ([018d889](https://github.com/discordjs/discord-api-types/commit/018d889d9aeb35b64dd914ade9ac93e8b98390ac))

### Features

- add support for teams update ([#813](https://github.com/discordjs/discord-api-types/issues/813)) ([a26629c](https://github.com/discordjs/discord-api-types/commit/a26629c0e83504299af4bc5eb85e101c63b9ced8))
- **APIAuditLogOptions:** add `integration_type` ([#809](https://github.com/discordjs/discord-api-types/issues/809)) ([31c8549](https://github.com/discordjs/discord-api-types/commit/31c8549fe3e461ad120a3af434e27c61091bbb9c))

## [0.37.55](https://github.com/discordjs/discord-api-types/compare/0.37.54...0.37.55) (2023-08-24)

## [0.37.54](https://github.com/discordjs/discord-api-types/compare/0.37.53...0.37.54) (2023-08-17)

### Bug Fixes

- **Guild:** union with never type ([#797](https://github.com/discordjs/discord-api-types/issues/797)) ([b919e72](https://github.com/discordjs/discord-api-types/commit/b919e721bca4ff19340a40b58f6a20d34641bb05))

### Features

- Add Media channels ([#777](https://github.com/discordjs/discord-api-types/issues/777)) ([138b9f2](https://github.com/discordjs/discord-api-types/commit/138b9f2bf2fa7dcaada81de222543fa8a03bd52f))

## [0.37.53](https://github.com/discordjs/discord-api-types/compare/0.37.52...0.37.53) (2023-08-14)

### Features

- **GatewayActivityUpdateData:** allow sending state ([#801](https://github.com/discordjs/discord-api-types/issues/801)) ([e095e09](https://github.com/discordjs/discord-api-types/commit/e095e09b0b5e3c85107705de124858e1fbb29bf0))

## [0.37.52](https://github.com/discordjs/discord-api-types/compare/0.37.51...0.37.52) (2023-08-07)

### Bug Fixes

- **RESTPatchAPIChannelJSONBody:** `available_tags` requires `name` only ([#802](https://github.com/discordjs/discord-api-types/issues/802)) ([5261124](https://github.com/discordjs/discord-api-types/commit/52611242fb73ac56d8cfedd8953ce558bf6e842e))

## [0.37.51](https://github.com/discordjs/discord-api-types/compare/0.37.50...0.37.51) (2023-07-31)

### Bug Fixes

- **Presence:** cannot receive invisible status ([#799](https://github.com/discordjs/discord-api-types/issues/799)) ([1071d24](https://github.com/discordjs/discord-api-types/commit/1071d24362bbf1d39d528f73c3233f22aee99778))

## [0.37.50](https://github.com/discordjs/discord-api-types/compare/0.37.49...0.37.50) (2023-07-20)

### Features

- onboarding updates, mode field, and error codes ([#773](https://github.com/discordjs/discord-api-types/issues/773)) ([773556a](https://github.com/discordjs/discord-api-types/commit/773556aa329750839262874b4af6c4113d9906d3))

## [0.37.49](https://github.com/discordjs/discord-api-types/compare/0.37.48...0.37.49) (2023-07-17)

### Features

- **APIApplication:** approx guild count and get self application endpoint ([#728](https://github.com/discordjs/discord-api-types/issues/728)) ([874f135](https://github.com/discordjs/discord-api-types/commit/874f13573b35fe1e5e40549d007aebe5ec3bbcc0))
- **APIAttachment:** add `flags` ([#783](https://github.com/discordjs/discord-api-types/issues/783)) ([7f9a7e5](https://github.com/discordjs/discord-api-types/commit/7f9a7e5b94529fbcd254ffdd1fcac1ceff62e890))
- **APIRole:** role flags ([#782](https://github.com/discordjs/discord-api-types/issues/782)) ([488b5ad](https://github.com/discordjs/discord-api-types/commit/488b5adf04d3b2c7f457bea787c2a5d1b0bf8ba6))
- **APIUser:** add avatar decorations ([#664](https://github.com/discordjs/discord-api-types/issues/664)) ([f556455](https://github.com/discordjs/discord-api-types/commit/f556455ba6e396e1b798e85f71d2a58e1aacf043))
- **AuditLogEvent:** Add creator monetisation events ([#787](https://github.com/discordjs/discord-api-types/issues/787)) ([47f78bc](https://github.com/discordjs/discord-api-types/commit/47f78bcc691ee6d551f2eb441e427384a928dd11))
- **GatewayMessageReactionAddDispatch:** add `message_author_id` ([#754](https://github.com/discordjs/discord-api-types/issues/754)) ([82d7024](https://github.com/discordjs/discord-api-types/commit/82d7024dfd0e30178e9e38647bfa882fdddd1681))

## [0.37.48](https://github.com/discordjs/discord-api-types/compare/0.37.47...0.37.48) (2023-07-10)

## [0.37.47](https://github.com/discordjs/discord-api-types/compare/0.37.46...0.37.47) (2023-06-29)

### Features

- **Guild:** add join raid and mention raid protection ([#677](https://github.com/discordjs/discord-api-types/issues/677)) ([844ad56](https://github.com/discordjs/discord-api-types/commit/844ad568c4e6bb379aee59e4e2256a8281276991))

## [0.37.46](https://github.com/discordjs/discord-api-types/compare/0.37.45...0.37.46) (2023-06-19)

### Features

- **RESTJSONErrorCodes:** add error `50131` ([#753](https://github.com/discordjs/discord-api-types/issues/753)) ([300e31b](https://github.com/discordjs/discord-api-types/commit/300e31b51490c81bfd96c2ed5e0f810a7e3ee4ae))

## [0.37.45](https://github.com/discordjs/discord-api-types/compare/0.37.44...0.37.45) (2023-06-15)

## [0.37.44](https://github.com/discordjs/discord-api-types/compare/0.37.43...0.37.44) (2023-06-15)

### Features

- guild onboarding ([#713](https://github.com/discordjs/discord-api-types/issues/713)) ([eced39c](https://github.com/discordjs/discord-api-types/commit/eced39cc3fa305e336d5752827812cb790ac485d))

## [0.37.43](https://github.com/discordjs/discord-api-types/compare/0.37.42...0.37.43) (2023-05-29)

### Features

- **RESTJSONErrorCodes:** add error `50178` ([#752](https://github.com/discordjs/discord-api-types/issues/752)) ([30fb497](https://github.com/discordjs/discord-api-types/commit/30fb4978b76f30a00453470f643d71e8f1d1f817))

## [0.37.42](https://github.com/discordjs/discord-api-types/compare/0.37.41...0.37.42) (2023-05-08)

### Bug Fixes

- allow sending empty choices with autocomplete: true ([#762](https://github.com/discordjs/discord-api-types/issues/762)) ([0e6b19d](https://github.com/discordjs/discord-api-types/commit/0e6b19d2bcfe6e9806d3d20125668b3464845517))

## [0.37.41](https://github.com/discordjs/discord-api-types/compare/0.37.40...0.37.41) (2023-05-01)

### Bug Fixes

- **GatewayGuildMembersChunkDispatchData:** Omit `guild_id` for presences ([#761](https://github.com/discordjs/discord-api-types/issues/761)) ([5079b16](https://github.com/discordjs/discord-api-types/commit/5079b164db3ac3bda25675a553a586f099555667))
- **types:** move `types` condition to the front ([#763](https://github.com/discordjs/discord-api-types/issues/763)) ([9dce6ed](https://github.com/discordjs/discord-api-types/commit/9dce6ed392b64e602c3cc05946bc0f30bac7279e))

## [0.37.40](https://github.com/discordjs/discord-api-types/compare/0.37.39...0.37.40) (2023-04-24)

### Features

- add support for voice messages ([#749](https://github.com/discordjs/discord-api-types/issues/749)) ([3dac5b9](https://github.com/discordjs/discord-api-types/commit/3dac5b93e7568ba2fbd3bc30d229d2df80f96eed))

## [0.37.39](https://github.com/discordjs/discord-api-types/compare/0.37.38...0.37.39) (2023-04-17)

### Bug Fixes

- **RESTPostAPIChannelMessagesThreadsJSONBody:** mark `auto_archive_duration` as optional ([ca6a95d](https://github.com/discordjs/discord-api-types/commit/ca6a95d69c7b93f564f10cce422faf5ea4133be7))

### Features

- **APIGuild:** add `max_stage_video_channel_users` ([#550](https://github.com/discordjs/discord-api-types/issues/550)) ([9a66d21](https://github.com/discordjs/discord-api-types/commit/9a66d21f4913c63ed7c192cf9340febe603bf516))

## [0.37.38](https://github.com/discordjs/discord-api-types/compare/0.37.37...0.37.38) (2023-04-10)

### Features

- **APIBaseInteraction:** add `channel` ([#741](https://github.com/discordjs/discord-api-types/issues/741)) ([311b7a2](https://github.com/discordjs/discord-api-types/commit/311b7a2eb9bdc6ad9d6ed7af2b7faf6f95631698))
- **RESTJSONErrorCodes:** add error `50163` ([#725](https://github.com/discordjs/discord-api-types/issues/725)) ([9074621](https://github.com/discordjs/discord-api-types/commit/9074621085d0e2d7b32b82c0bf0604e3cf42bbdf))

## [0.37.37](https://github.com/discordjs/discord-api-types/compare/0.37.36...0.37.37) (2023-03-23)

### Bug Fixes

- add missing `RESTGetAPIWebhookWithTokenQuery` ([#735](https://github.com/discordjs/discord-api-types/issues/735)) ([2a78a51](https://github.com/discordjs/discord-api-types/commit/2a78a517d2a3511913a8b2b74bba942db097b577))

### Features

- add various new flags ([#733](https://github.com/discordjs/discord-api-types/issues/733)) ([4723d29](https://github.com/discordjs/discord-api-types/commit/4723d29c9ee17c3efa8e8e86351754dee13428ef))
- **RESTGetAPICurrentUserGuildsQuery:** add `with_counts` ([#641](https://github.com/discordjs/discord-api-types/issues/641)) ([0cd9b0d](https://github.com/discordjs/discord-api-types/commit/0cd9b0debbf17f60267bf2f42349fcebea5bf588))
- **RESTPostAPIGuildChannelJSONBody:** add `default_thread_rate_limit_per_user` ([#730](https://github.com/discordjs/discord-api-types/issues/730)) ([8f9370d](https://github.com/discordjs/discord-api-types/commit/8f9370d2592d6a450820bee52fe153eb00ba830f))

## [0.37.36](https://github.com/discordjs/discord-api-types/compare/0.37.35...0.37.36) (2023-03-13)

### Features

- **AutoModeration:** add `custom_message` field support ([#727](https://github.com/discordjs/discord-api-types/issues/727)) ([0d47c69](https://github.com/discordjs/discord-api-types/commit/0d47c69ca80909205f14004aaf26645f367c06d0))

## [0.37.35](https://github.com/discordjs/discord-api-types/compare/0.37.34...0.37.35) (2023-02-17)

### Bug Fixes

- `StageRaiseHand` should be unstable ([#722](https://github.com/discordjs/discord-api-types/issues/722)) ([85051ea](https://github.com/discordjs/discord-api-types/commit/85051eaab7e262b4f60e3f5565bf8a7a5225513e))

## [0.37.34](https://github.com/discordjs/discord-api-types/compare/0.37.33...0.37.34) (2023-02-16)

### Bug Fixes

- **GuildSystemChannelFlags:** "suppress" typo ([#719](https://github.com/discordjs/discord-api-types/issues/719)) ([8d37bc5](https://github.com/discordjs/discord-api-types/commit/8d37bc5e30f76552bca402c858cc67bb8a5ddc9c))

### Features

- add `managed` field to `ChannelType.GroupDM` ([#698](https://github.com/discordjs/discord-api-types/issues/698)) ([8477deb](https://github.com/discordjs/discord-api-types/commit/8477deb6a832b0c985fa0f6d1df4b99eaeab2a87))
- **CDNRoutes:** add `storePageAsset()` ([#695](https://github.com/discordjs/discord-api-types/issues/695)) ([4cf6fd2](https://github.com/discordjs/discord-api-types/commit/4cf6fd2cecd92a9c3ffa32368ccc7b1994295be3))
- **ConnectionService:** add `instagram` ([#701](https://github.com/discordjs/discord-api-types/issues/701)) ([c65e214](https://github.com/discordjs/discord-api-types/commit/c65e214fddeb3aa959034ac14de39edab38ff0f3))
- **RESTJSONErrorCodes:** add error `30011` ([#697](https://github.com/discordjs/discord-api-types/issues/697)) ([41b31eb](https://github.com/discordjs/discord-api-types/commit/41b31ebfd62a8dba32da1e748c49877924c0602d))
- **RESTJSONErrorCodes:** add error `30060` ([#720](https://github.com/discordjs/discord-api-types/issues/720)) ([20153f6](https://github.com/discordjs/discord-api-types/commit/20153f6fe24676d73bcb41e92c6d9d52961f1f73))
- **RESTJSONErrorCodes:** add error `30061` ([#717](https://github.com/discordjs/discord-api-types/issues/717)) ([d609efc](https://github.com/discordjs/discord-api-types/commit/d609efc746df620925237575dd24fd0f38213f09))

## [0.37.33](https://github.com/discordjs/discord-api-types/compare/0.37.32...0.37.33) (2023-02-11)

### Bug Fixes

- **GatewayDispatchPayload:** add missing GuildAuditLogEntry ([#715](https://github.com/discordjs/discord-api-types/issues/715)) ([602c16e](https://github.com/discordjs/discord-api-types/commit/602c16eee12e85a8052f40c695314a42b1d15979))

## [0.37.32](https://github.com/discordjs/discord-api-types/compare/0.37.31...0.37.32) (2023-02-09)

### Features

- **MessageType:** add `SuppressNotifications` ([#710](https://github.com/discordjs/discord-api-types/issues/710)) ([b14aea6](https://github.com/discordjs/discord-api-types/commit/b14aea65f886db047ea9fcbd1b8f49f1bc38f594))

## [0.37.31](https://github.com/discordjs/discord-api-types/compare/0.37.30...0.37.31) (2023-01-30)

## [0.37.30](https://github.com/discordjs/discord-api-types/compare/0.37.29...0.37.30) (2023-01-26)

### Features

- **APIGuildMember:** add support for guild member flags ([#700](https://github.com/discordjs/discord-api-types/issues/700)) ([e902671](https://github.com/discordjs/discord-api-types/commit/e902671411b518504b9adc6b0d7310501fd531ad))
- **GatewayDispatchEvents:** add `GuildAuditLogEntryCreate` ([#692](https://github.com/discordjs/discord-api-types/issues/692)) ([31ca234](https://github.com/discordjs/discord-api-types/commit/31ca234decd6d62b503aadd88111a2af3778f455))

## [0.37.29](https://github.com/discordjs/discord-api-types/compare/0.37.28...0.37.29) (2023-01-23)

## [0.37.28](https://github.com/discordjs/discord-api-types/compare/0.37.27...0.37.28) (2023-01-12)

### Bug Fixes

- **GuildIntegration:** `enabled` and `user` are present on bots ([#660](https://github.com/discordjs/discord-api-types/issues/660)) ([b10e9bb](https://github.com/discordjs/discord-api-types/commit/b10e9bbe5ab450df065fc78da85d49f335db2b82))

### Features

- Add role subscription data and system channel flags ([#686](https://github.com/discordjs/discord-api-types/issues/686)) ([792c60b](https://github.com/discordjs/discord-api-types/commit/792c60b3328d8440de79546bf43d6b317400c788))
- **APIRoleTags:** add `guild_connections` ([#675](https://github.com/discordjs/discord-api-types/issues/675)) ([3dbe985](https://github.com/discordjs/discord-api-types/commit/3dbe985b6e05e6aa68248e79f45d550e783bc6a7))
- **APIThreadMember:** add support for thread member pagination ([#689](https://github.com/discordjs/discord-api-types/issues/689)) ([e2fb5ee](https://github.com/discordjs/discord-api-types/commit/e2fb5ee4886a33bb752a75d5894f726f6f76340f))
- **ConnectionService:** add TikTok ([#632](https://github.com/discordjs/discord-api-types/issues/632)) ([af06df6](https://github.com/discordjs/discord-api-types/commit/af06df6cae224a60e7a35e356028677e8736ed89))
- **RESTJSONErrorCodes:** add error `50091` ([#671](https://github.com/discordjs/discord-api-types/issues/671)) ([8869e92](https://github.com/discordjs/discord-api-types/commit/8869e923362740e491f267d71073d4266d36cb42))
- role subscriptions ([#665](https://github.com/discordjs/discord-api-types/issues/665)) ([0b4058b](https://github.com/discordjs/discord-api-types/commit/0b4058bdd48b74fcd9944dcf4b6f98d5e0bee105))
- **StickerFormatType:** add `GIF` ([#688](https://github.com/discordjs/discord-api-types/issues/688)) ([a6bcb3f](https://github.com/discordjs/discord-api-types/commit/a6bcb3f0fe7bc4edceee61b7cdab0e46db9c7109))

## [0.37.27](https://github.com/discordjs/discord-api-types/compare/0.37.26...0.37.27) (2023-01-09)

### Features

- **MessageType:** add missing types ([#681](https://github.com/discordjs/discord-api-types/issues/681)) ([7d55b33](https://github.com/discordjs/discord-api-types/commit/7d55b33bacb96e156f41fb67a1819c07c8fa959f))

## [0.37.26](https://github.com/discordjs/discord-api-types/compare/0.37.25...0.37.26) (2023-01-05)

### Features

- add RESTJSONErrorCode `40062` and RESTRateLimit.code ([#620](https://github.com/discordjs/discord-api-types/issues/620)) ([4a25caf](https://github.com/discordjs/discord-api-types/commit/4a25caf506c685a8e0af630eef3bd3d2735d64ed))
- **RESTGetAPIAuditLogQuery:** support `after` ([#682](https://github.com/discordjs/discord-api-types/issues/682)) ([bb2ef84](https://github.com/discordjs/discord-api-types/commit/bb2ef843133b29e3042bdfde20b5adb1c3639e01))
- **RESTJSONErrorCodes:** add error `30058` ([#676](https://github.com/discordjs/discord-api-types/issues/676)) ([921bffd](https://github.com/discordjs/discord-api-types/commit/921bffd1b210b6cf2dc6971e451fa0a9e6f6c185))
- **RESTJSONErrorCodes:** add error `50067` ([#640](https://github.com/discordjs/discord-api-types/issues/640)) ([6e4a611](https://github.com/discordjs/discord-api-types/commit/6e4a6115ae44aca5c0b61f621ad75829632850f4))

## [0.37.25](https://github.com/discordjs/discord-api-types/compare/0.37.24...0.37.25) (2022-12-29)

## [0.37.24](https://github.com/discordjs/discord-api-types/compare/0.37.23...0.37.24) (2022-12-19)

### Bug Fixes

- **APIApplicationRoleConnection:** `metadata` values can be numbers ([#673](https://github.com/discordjs/discord-api-types/issues/673)) ([8df9f14](https://github.com/discordjs/discord-api-types/commit/8df9f14a24b714d3b009711eec894cad1e199881))

## [0.37.23](https://github.com/discordjs/discord-api-types/compare/0.37.22...0.37.23) (2022-12-15)

### Bug Fixes

- **APIChannel:** correctly type present properties based on channel type ([#669](https://github.com/discordjs/discord-api-types/issues/669)) ([2a5413d](https://github.com/discordjs/discord-api-types/commit/2a5413def49dbb413227d9b02be500b9184b731d))
- **Interactions:** make app_permissions required ([#652](https://github.com/discordjs/discord-api-types/issues/652)) ([89bc0f4](https://github.com/discordjs/discord-api-types/commit/89bc0f40b60434a768abac95188a2e4e47c2acd9))

### Features

- add role connections ([#651](https://github.com/discordjs/discord-api-types/issues/651)) ([d7b666c](https://github.com/discordjs/discord-api-types/commit/d7b666c739bb848ead5a3af09e37e64ed962014b))
- **APIApplicationCommand:** add `nsfw` field ([#637](https://github.com/discordjs/discord-api-types/issues/637)) ([c3fda99](https://github.com/discordjs/discord-api-types/commit/c3fda99637b4d7688111180f90d6aa41c008ed17))
- **APIGuildForumChannel:** add `default_forum_layout` ([#658](https://github.com/discordjs/discord-api-types/issues/658)) ([190242a](https://github.com/discordjs/discord-api-types/commit/190242a59d5512fdc766217ec9f7c9c54a7b2dcb))
- **Locale:** add Indonesian locale ([#643](https://github.com/discordjs/discord-api-types/issues/643)) ([2b75d13](https://github.com/discordjs/discord-api-types/commit/2b75d13b393f8f9011ec68617cb4e9f9d3fa09e7))

## [0.37.22](https://github.com/discordjs/discord-api-types/compare/0.37.21...0.37.22) (2022-12-12)

### Bug Fixes

- **APIChannel:** correctly type `name` based on channel type ([#666](https://github.com/discordjs/discord-api-types/issues/666)) ([995126e](https://github.com/discordjs/discord-api-types/commit/995126e2cc1494f9fad2ad7c44ecc87898994e44))

## [0.37.21](https://github.com/discordjs/discord-api-types/compare/0.37.20...0.37.21) (2022-12-05)

## [0.37.20](https://github.com/discordjs/discord-api-types/compare/0.37.19...0.37.20) (2022-11-24)

## [0.37.19](https://github.com/discordjs/discord-api-types/compare/0.37.18...0.37.19) (2022-11-21)

### Bug Fixes

- **APIGuildChannel:** make position of guild channel non optional ([#647](https://github.com/discordjs/discord-api-types/issues/647)) ([9d72e82](https://github.com/discordjs/discord-api-types/commit/9d72e82e07e3a3bb9a894081d955bdc5c6b64089))
- **channel:** add missing type aliases ([#648](https://github.com/discordjs/discord-api-types/issues/648)) ([2695dad](https://github.com/discordjs/discord-api-types/commit/2695dade8be818cf5bacbe69ec9aca0b50b9f9b0))

### Features

- **GuildFeatures:** Add `APPLICATION_COMMAND_PERMISSIONS_V2` ([#646](https://github.com/discordjs/discord-api-types/issues/646)) ([a1869a6](https://github.com/discordjs/discord-api-types/commit/a1869a6a6d4e15adf7a3cf64cade1ed051b330fc))

## [0.37.18](https://github.com/discordjs/discord-api-types/compare/0.37.17...0.37.18) (2022-11-14)

### Features

- **UserFlags:** add `ActiveDeveloper` ([#638](https://github.com/discordjs/discord-api-types/issues/638)) ([65da837](https://github.com/discordjs/discord-api-types/commit/65da837673142267a92aea28ecd65d3c05aa0706))

## [0.37.17](https://github.com/discordjs/discord-api-types/compare/0.37.16...0.37.17) (2022-11-07)

### Features

- **APIAutoMod:** add support for regex matching ([#603](https://github.com/discordjs/discord-api-types/issues/603)) ([88a60f7](https://github.com/discordjs/discord-api-types/commit/88a60f78efb6498d861b33d54c809d9d1b39b3d7))

## [0.37.16](https://github.com/discordjs/discord-api-types/compare/0.37.15...0.37.16) (2022-10-31)

### Bug Fixes

- **docs:** update gateway documentation links ([#628](https://github.com/discordjs/discord-api-types/issues/628)) ([7040d9b](https://github.com/discordjs/discord-api-types/commit/7040d9b33370a5d1d7d3c3cb10a25c0e5fb7d0b8))
- export `RESTGetAPIVoiceRegionsResult` with the correct name ([#627](https://github.com/discordjs/discord-api-types/issues/627)) ([69aa717](https://github.com/discordjs/discord-api-types/commit/69aa7179028e0a011e6ba246cc1faa55f463c619))
- **UserFlags:** hardcode the value of `Quarantined` ([#624](https://github.com/discordjs/discord-api-types/issues/624)) ([5091f6e](https://github.com/discordjs/discord-api-types/commit/5091f6e70774fd97ec7dd3ae3f500c3850f81d94))

## [0.37.15](https://github.com/discordjs/discord-api-types/compare/0.37.14...0.37.15) (2022-10-27)

### Bug Fixes

- `default_thread_rate_limit_per_user` is only for forum channels ([#596](https://github.com/discordjs/discord-api-types/issues/596)) ([88ce291](https://github.com/discordjs/discord-api-types/commit/88ce2910fb3640d9be165ac9f6488cc7e4c32663))
- add missing gateway dispatch payloads to gateway event union ([#619](https://github.com/discordjs/discord-api-types/issues/619)) ([348dd41](https://github.com/discordjs/discord-api-types/commit/348dd416d1c94231fdfda88fa0ef03b34a384bb4))
- **APIGuild:** change type of `afk_timeout` to allowed values ([#590](https://github.com/discordjs/discord-api-types/issues/590)) ([aaa57b4](https://github.com/discordjs/discord-api-types/commit/aaa57b4fe96b4f045b312c1a6a2ed17f9fcb3552))

### Features

- add some missing REST types ([#612](https://github.com/discordjs/discord-api-types/issues/612)) ([8d25f23](https://github.com/discordjs/discord-api-types/commit/8d25f233a5366f1d43de942f465e696c73f26c86))
- **Components:** new select menus ([#602](https://github.com/discordjs/discord-api-types/issues/602)) ([df1452d](https://github.com/discordjs/discord-api-types/commit/df1452dc28f2fddb32a20912ca3ca3634556a3da))
- **GuildFeature:** add `DeveloperSupportServer` ([#618](https://github.com/discordjs/discord-api-types/issues/618)) ([8c1484e](https://github.com/discordjs/discord-api-types/commit/8c1484ebbe95afbd850b22262d6223b2f3d40017))
- **RESTJSONErrorCodes:** add 50039 error ([#607](https://github.com/discordjs/discord-api-types/issues/607)) ([131637f](https://github.com/discordjs/discord-api-types/commit/131637fbd20573750a60df2281f94b339443c82c))
- **UserPremiumType:** add `NitroBasic` ([#616](https://github.com/discordjs/discord-api-types/issues/616)) ([9448e9b](https://github.com/discordjs/discord-api-types/commit/9448e9befdfff38ecbf186e5dc9c1fcd88596422))

## [0.37.14](https://github.com/discordjs/discord-api-types/compare/0.37.13...0.37.14) (2022-10-15)

### Bug Fixes

- **APIAutoModeration:** export v10 json payloads and correct route types ([#608](https://github.com/discordjs/discord-api-types/issues/608)) ([bce0795](https://github.com/discordjs/discord-api-types/commit/bce07950fdfec7ae5e96ce3158f73cfb5db0a890))

### Features

- **RESTJSONErrorCodes:** add error `50073` ([#594](https://github.com/discordjs/discord-api-types/issues/594)) ([70826ed](https://github.com/discordjs/discord-api-types/commit/70826ed76e4b4880fb7425a07d04921823954c95))

## [0.37.13](https://github.com/discordjs/discord-api-types/compare/0.37.12...0.37.13) (2022-10-14)

### Features

- **APIAutoModeration:** add support for auto moderation ([#418](https://github.com/discordjs/discord-api-types/issues/418)) ([b216f7a](https://github.com/discordjs/discord-api-types/commit/b216f7a8bee2c02fe0e75189fe31f95973bfbe2e))

## [0.37.12](https://github.com/discordjs/discord-api-types/compare/0.37.11...0.37.12) (2022-10-06)

## [0.37.11](https://github.com/discordjs/discord-api-types/compare/0.37.10...0.37.11) (2022-09-26)

### Features

- **APIGuildForumChannel:** add `default_sort_order` ([#589](https://github.com/discordjs/discord-api-types/issues/589)) ([143b003](https://github.com/discordjs/discord-api-types/commit/143b003fbe5a86eda225e9da1d0914d6e48cddfd))
- **APIGuildForumChannel:** update and add missing features ([#575](https://github.com/discordjs/discord-api-types/issues/575)) ([0f118d3](https://github.com/discordjs/discord-api-types/commit/0f118d382f94151b1c9be42620520c91b20a05f6))

## [0.37.10](https://github.com/discordjs/discord-api-types/compare/0.37.9...0.37.10) (2022-09-15)

### Features

- add `RESTRateLimit` ([#585](https://github.com/discordjs/discord-api-types/issues/585)) ([f4d3f4d](https://github.com/discordjs/discord-api-types/commit/f4d3f4d5b1c1b6e42c2a8f8184f43d67b586c8c1))
- **APIConnection:** add `two_way_link` ([#546](https://github.com/discordjs/discord-api-types/issues/546)) ([d452f63](https://github.com/discordjs/discord-api-types/commit/d452f6346bd4953a8d777f3818797c4285b1b842))
- **APIGuild:** document afk timeout values ([#570](https://github.com/discordjs/discord-api-types/issues/570)) ([32f5a7b](https://github.com/discordjs/discord-api-types/commit/32f5a7b9814b69da7fc3772ec1f0307d39cda087))

## [0.37.9](https://github.com/discordjs/discord-api-types/compare/0.37.8...0.37.9) (2022-09-12)

### Features

- **ConnectionService:** add new connections ([#548](https://github.com/discordjs/discord-api-types/issues/548)) ([afd3b55](https://github.com/discordjs/discord-api-types/commit/afd3b55c08b0cf75cc4f5a06d3574b6cf532cb6c))

## [0.37.8](https://github.com/discordjs/discord-api-types/compare/0.37.7...0.37.8) (2022-09-08)

### Features

- **GuildFeature:** add `InvitesDisabled` ([#549](https://github.com/discordjs/discord-api-types/issues/549)) ([2708cb9](https://github.com/discordjs/discord-api-types/commit/2708cb9dcaa07d19ca71e9ca211e78939b9d1ff4))

## [0.37.7](https://github.com/discordjs/discord-api-types/compare/0.37.6...0.37.7) (2022-09-05)

### Bug Fixes

- **ChannelType:** bring back old names ([b08f2e3](https://github.com/discordjs/discord-api-types/commit/b08f2e34dbe9afccca6f565db6c7b27a21453d85))

## [0.37.6](https://github.com/discordjs/discord-api-types/compare/0.37.5...0.37.6) (2022-09-05)

### Bug Fixes

- **APIModalSubmission:** `components` is not optional ([#574](https://github.com/discordjs/discord-api-types/issues/574)) ([f69b586](https://github.com/discordjs/discord-api-types/commit/f69b586d0148afd017e6da70ab8d745b6ba04ba4))
- **GuildChannelType:** add missing `GuildCategory` type ([#579](https://github.com/discordjs/discord-api-types/issues/579)) ([815c68f](https://github.com/discordjs/discord-api-types/commit/815c68fe46034029200a8e2903748a3d2e6af7b9))
- **RESTPatchAPIGuildVoiceStateCurrentMemberJSONBody:** `channel_id` is optional ([#547](https://github.com/discordjs/discord-api-types/issues/547)) ([b7b855b](https://github.com/discordjs/discord-api-types/commit/b7b855b2005bb3989810850d6e00bec443a15c92))

### Features

- **APIGuildIntegration:** add `scopes` ([#563](https://github.com/discordjs/discord-api-types/issues/563)) ([73d15dd](https://github.com/discordjs/discord-api-types/commit/73d15ddcbbc676efac876602a3cd726bfe4c378a))
- **ApplicationFlags:** add `ApplicationCommandBadge` ([#537](https://github.com/discordjs/discord-api-types/issues/537)) ([48f0f56](https://github.com/discordjs/discord-api-types/commit/48f0f562bab10d2a1e331474fb963af8631b788b))
- **RESTPutAPIGuildBanJSONBody:** add `delete_message_seconds` ([#534](https://github.com/discordjs/discord-api-types/issues/534)) ([4e362d5](https://github.com/discordjs/discord-api-types/commit/4e362d52608e99d466b43cd37ec6b6bb1222b660))

## [0.37.5](https://github.com/discordjs/discord-api-types/compare/0.37.4...0.37.5) (2022-08-25)

### Features

- **FormattingPatterns:** add `ApplicationCommand` ([#525](https://github.com/discordjs/discord-api-types/issues/525)) ([0098889](https://github.com/discordjs/discord-api-types/commit/00988894995f7ac5e8ddc34125704a230329137c))

## [0.37.4](https://github.com/discordjs/discord-api-types/compare/0.37.3...0.37.4) (2022-08-22)

### Features

- add common JSON error types ([#568](https://github.com/discordjs/discord-api-types/issues/568)) ([956f289](https://github.com/discordjs/discord-api-types/commit/956f289e885763a620cb67a36e7e42683b5c08bf))
- **ApplicationCommand:** export base chat input types ([#569](https://github.com/discordjs/discord-api-types/issues/569)) ([248484e](https://github.com/discordjs/discord-api-types/commit/248484e55613e2da3f1d659395e1f4c010cb51b5))

## [0.37.3](https://github.com/discordjs/discord-api-types/compare/0.37.2...0.37.3) (2022-08-18)

### Features

- **RESTJSONErrorCodes:** add 240000 ([#565](https://github.com/discordjs/discord-api-types/issues/565)) ([5bb50ae](https://github.com/discordjs/discord-api-types/commit/5bb50ae7ea6859845c9d9996f02ac42c61413df0))

## [0.37.2](https://github.com/discordjs/discord-api-types/compare/0.37.1...0.37.2) (2022-08-11)

### Bug Fixes

- **GatewayGuildMembersChunkDispatchData:** make chunk pagination properties mandatory ([#558](https://github.com/discordjs/discord-api-types/issues/558)) ([0e03e39](https://github.com/discordjs/discord-api-types/commit/0e03e39aa2bf8f1b9a58113a3242c4722e64922b))
- **GatewayRequestGuildMembersData:** limit being required with user_ids ([#559](https://github.com/discordjs/discord-api-types/issues/559)) ([dc3d5df](https://github.com/discordjs/discord-api-types/commit/dc3d5df0a2931eff63991987166634661d5bd1d8))
- **RESTGetAPIChannelUsersThreadsArchivedResult:** add `has_more` missing field ([#543](https://github.com/discordjs/discord-api-types/issues/543)) ([796f6d8](https://github.com/discordjs/discord-api-types/commit/796f6d8a3b2f55d2a120137801e0450ddf30576e))

### Features

- add search that might or might not work ([f8a9c8b](https://github.com/discordjs/discord-api-types/commit/f8a9c8b5c6bdd73bcbf9dd6fff66fafac2594ba4))
- **APIVoiceChannel:** support text in voice, properties `last_message_id` and `rate_limit_per_user` ([#544](https://github.com/discordjs/discord-api-types/issues/544)) ([4488d8f](https://github.com/discordjs/discord-api-types/commit/4488d8fd2611a6547fc6149ba1cec5682340a119))
- **GatewayReadyDispatchData:** add `resume_gateway_url` ([#552](https://github.com/discordjs/discord-api-types/issues/552)) ([9a50367](https://github.com/discordjs/discord-api-types/commit/9a50367dad3a06fbca6e8d1fdd98fbf144595d4e))

## [0.37.1](https://github.com/discordjs/discord-api-types/compare/0.37.0...0.37.1) (2022-08-04)

# [0.37.0](https://github.com/discordjs/discord-api-types/compare/0.36.3...0.37.0) (2022-07-28)

### Code Refactoring

- **RESTJSONErrorCodes:** use `MaximumThreadParticipantsReached` instead in error code 30033 ([#540](https://github.com/discordjs/discord-api-types/issues/540)) ([cecf17b](https://github.com/discordjs/discord-api-types/commit/cecf17b4158fbebb3ee508518a9e9a7b1297356f))

### BREAKING CHANGES

- **RESTJSONErrorCodes:** `MaximumThreadParticipants` was renamed to `MaximumThreadParticipantsReached` for consistency with the rest of the codes

## [0.36.3](https://github.com/discordjs/discord-api-types/compare/0.36.2...0.36.3) (2022-07-21)

### Features

- **APIConnection:** add `ConnectionService` to `type` ([#491](https://github.com/discordjs/discord-api-types/issues/491)) ([4577ac2](https://github.com/discordjs/discord-api-types/commit/4577ac2609f4a861505bc41f4293f482db251cdc))
- **APIThreadChannel:** add fields about new message counter capability ([#532](https://github.com/discordjs/discord-api-types/issues/532)) ([2b53b20](https://github.com/discordjs/discord-api-types/commit/2b53b20b84b7434b9a35b715d8ebdeb040835dca))
- **GatewayGuildCreateDispatchData:** add missing `unavailable` ([#504](https://github.com/discordjs/discord-api-types/issues/504)) ([59e2477](https://github.com/discordjs/discord-api-types/commit/59e247729fcd27be839c88516939ec22843781ce))
- **RESTJSONErrorCodes:** add `ApplicationNotYetAvailable` ([#507](https://github.com/discordjs/discord-api-types/issues/507)) ([09a1141](https://github.com/discordjs/discord-api-types/commit/09a114133c7599cc14d4a0eb61425162091c45ee))
- **RESTJSONErrorCodes:** add error `30034` ([#530](https://github.com/discordjs/discord-api-types/issues/530)) ([0a2e778](https://github.com/discordjs/discord-api-types/commit/0a2e7787c672ffb4af83e055df632aae36811445))
- **RESTJSONErrorCodes:** add error `50132` ([#505](https://github.com/discordjs/discord-api-types/issues/505)) ([907d88a](https://github.com/discordjs/discord-api-types/commit/907d88ada93221802a4aefe7dc0ca3b2b73f94f0))
- **RESTJSONErrorCodes:** add error `50146` ([#527](https://github.com/discordjs/discord-api-types/issues/527)) ([e78de0c](https://github.com/discordjs/discord-api-types/commit/e78de0c83ba93145a2302ddea2e55b5050291c52))
- **RESTJSONErrorCodes:** add new errors ([#506](https://github.com/discordjs/discord-api-types/issues/506)) ([65b672e](https://github.com/discordjs/discord-api-types/commit/65b672e2afd2135333272d4e7b771eba237a21b6))

## [0.36.2](https://github.com/discordjs/discord-api-types/compare/0.36.1...0.36.2) (2022-07-14)

### Features

- **RESTJSONErrorCodes:** add error `30032` ([#521](https://github.com/discordjs/discord-api-types/issues/521)) ([f2c3451](https://github.com/discordjs/discord-api-types/commit/f2c3451c2a8bc91bcca65372d2944a07a3c34a9a))
- **RESTPutAPIApplicationGuildCommandsJSONBody:** add missing `id` ([#522](https://github.com/discordjs/discord-api-types/issues/522)) ([4af2ea9](https://github.com/discordjs/discord-api-types/commit/4af2ea91415a5662171d342379c4bd33bfa5a6d5))

## [0.36.1](https://github.com/discordjs/discord-api-types/compare/0.36.0...0.36.1) (2022-07-04)

### Features

- **APIApplicationCommandStringOption:** add `min_length` and `max_length` ([#513](https://github.com/discordjs/discord-api-types/issues/513)) ([2cade98](https://github.com/discordjs/discord-api-types/commit/2cade98ed0a0a074254fbc1580fc56d0e0b3dc9c))

# [0.36.0](https://github.com/discordjs/discord-api-types/compare/0.35.0...0.36.0) (2022-06-30)

### Features

- **APIBaseInteraction:** add `app_permissions` ([#509](https://github.com/discordjs/discord-api-types/issues/509)) ([0c65d40](https://github.com/discordjs/discord-api-types/commit/0c65d40af00499233830ce272a2a274bcd5b9e8c))
- **MessageType:** update names ([#498](https://github.com/discordjs/discord-api-types/issues/498)) ([12072b7](https://github.com/discordjs/discord-api-types/commit/12072b70a0c70e1e1f9de920789e26829268de12))
- **RESTJSONErrorCodes:** add error 20024 ([#480](https://github.com/discordjs/discord-api-types/issues/480)) ([34908aa](https://github.com/discordjs/discord-api-types/commit/34908aa4ceeca4b58276cc207f5bdb77cef04296))

### BREAKING CHANGES

- **MessageType:** The following message types have been renamed:

* `GuildMemberJoin` -> `UserJoin`
* `UserPremiumGuildSubscription` -> `GuildBoost`
* `UserPremiumGuildSubscriptionTier1` -> `GuildBoostTier1`
* `UserPremiumGuildSubscriptionTier2` -> `GuildBoostTier2`
* `UserPremiumGuildSubscriptionTier3` -> `GuildBoostTier3`

# [0.35.0](https://github.com/discordjs/discord-api-types/compare/0.34.0...0.35.0) (2022-06-23)

### Code Refactoring

- **GatewayIdentifyProperties:** remove `$` prefix from keys ([#493](https://github.com/discordjs/discord-api-types/issues/493)) ([3b10c60](https://github.com/discordjs/discord-api-types/commit/3b10c60faa5943501ab1f7cfa0d5f3c5317cdbbd))

### Features

- **APIEmbedVideo:** add missing `proxy_url` property ([#496](https://github.com/discordjs/discord-api-types/issues/496)) ([56d491f](https://github.com/discordjs/discord-api-types/commit/56d491fa6808d9a8762bff606ca8feb5e11f13a4))
- **REST:** add `CDNRoutes` ([#502](https://github.com/discordjs/discord-api-types/issues/502)) ([0609886](https://github.com/discordjs/discord-api-types/commit/06098869d552139fadcc204b5ce4e1a7e5352b68))
- **UserFlags:** add `Quarantined` flag ([#495](https://github.com/discordjs/discord-api-types/issues/495)) ([fc3aa1c](https://github.com/discordjs/discord-api-types/commit/fc3aa1c9110e4730c6b8ba3e36815ecd2da66c68))

### BREAKING CHANGES

- **GatewayIdentifyProperties:** The fields for identify no longer use the `$` prefix for the values.

# [0.34.0](https://github.com/discordjs/discord-api-types/compare/0.33.5...0.34.0) (2022-06-13)

### Code Refactoring

- separate `MESSAGE_CREATE` fields from `APIMessage` object ([#434](https://github.com/discordjs/discord-api-types/issues/434)) ([0bb2204](https://github.com/discordjs/discord-api-types/commit/0bb2204b5ddd32b791641a33d52669bc739bc208))

### Features

- add guild mfa endpoint and error `50017` ([#476](https://github.com/discordjs/discord-api-types/issues/476)) ([292c6b5](https://github.com/discordjs/discord-api-types/commit/292c6b58ee9384db2ce06addb80d2ea2bcd32de2))
- **RESTJSONErrorCodes:** add 220003 error ([#466](https://github.com/discordjs/discord-api-types/issues/466)) ([20653b3](https://github.com/discordjs/discord-api-types/commit/20653b34819f6adf8116bef2a1e5edc3233c4117))

### BREAKING CHANGES

- Certain fields that come only through the gateway are now correctly typed as such

## [0.33.5](https://github.com/discordjs/discord-api-types/compare/0.33.4...0.33.5) (2022-06-07)

### Bug Fixes

- **GatewayGuildCreateDispatch:** add missing `GatewayGuildCreateDispatch` ([#477](https://github.com/discordjs/discord-api-types/issues/477)) ([d268e0b](https://github.com/discordjs/discord-api-types/commit/d268e0bff7429e1cde43174fdf6d2342569860d5))
- **RESTPostAPIWebhookWithTokenJSONBody:** `thread_name` should be optional ([#479](https://github.com/discordjs/discord-api-types/issues/479)) ([eff8892](https://github.com/discordjs/discord-api-types/commit/eff8892b03656cfc2b709c6c30edb98e38bf2a1e))

### Features

- **RESTJSONErrorCodes:** add error `30052` ([#469](https://github.com/discordjs/discord-api-types/issues/469)) ([d854317](https://github.com/discordjs/discord-api-types/commit/d8543177cd978a19daa32fbb183892b6f8c24772))

## [0.33.4](https://github.com/discordjs/discord-api-types/compare/0.33.3...0.33.4) (2022-06-06)

### Features

- **RESTPostAPIWebhookWithTokenJSONBody:** add `thread_name` ([#463](https://github.com/discordjs/discord-api-types/issues/463)) ([8e5f07e](https://github.com/discordjs/discord-api-types/commit/8e5f07e2eebc14e5777dbfb932ef54f252165524))

## [0.33.3](https://github.com/discordjs/discord-api-types/compare/0.33.2...0.33.3) (2022-06-04)

### Bug Fixes

- **AddUndefinedToPossiblyUndefinedProperties:** recurse down objects ([#471](https://github.com/discordjs/discord-api-types/issues/471)) ([43c372d](https://github.com/discordjs/discord-api-types/commit/43c372d81722e48b105d5121a2cfdf614f1e7704))

## [0.33.2](https://github.com/discordjs/discord-api-types/compare/0.33.1...0.33.2) (2022-06-01)

### Bug Fixes

- **docs-site:** website link colors ([#457](https://github.com/discordjs/discord-api-types/issues/457)) ([51e664d](https://github.com/discordjs/discord-api-types/commit/51e664d8e826e7f0aa467c000f3a1707fc283a36))
- **GatewayGuildCreateDispatch:** add extra fields that were missing ([#458](https://github.com/discordjs/discord-api-types/issues/458)) ([15fcd1b](https://github.com/discordjs/discord-api-types/commit/15fcd1b2a85e8d1e136416a66326a4aadcc301fb))
- **RestPostAPIBaseApplicationJSONBody:** make `default_member_permissions` optional ([#460](https://github.com/discordjs/discord-api-types/issues/460)) ([6a813be](https://github.com/discordjs/discord-api-types/commit/6a813be83382e1606f1921cf00179fe1ce75c04f))

## [0.33.1](https://github.com/discordjs/discord-api-types/compare/0.33.0...0.33.1) (2022-05-26)

### Bug Fixes

- **RESTPostAPIApplicationGuildCommands:** correct types due to unions ([#447](https://github.com/discordjs/discord-api-types/issues/447)) ([6d85ad6](https://github.com/discordjs/discord-api-types/commit/6d85ad6b1d707b980f9897ea68dd4b7573b3a770))

### Features

- **RESTJSONErrorCodes:** add error `50600` ([#444](https://github.com/discordjs/discord-api-types/issues/444)) ([5ef49f4](https://github.com/discordjs/discord-api-types/commit/5ef49f41cecaa1d5937428a5c58f1d88bfc61266))
- **RESTPostAPIGuildChannels:** update post body fields ([#419](https://github.com/discordjs/discord-api-types/issues/419)) ([748db34](https://github.com/discordjs/discord-api-types/commit/748db34e30338cf4a9fd8ce7b86d1d5c7dde63b1))

# [0.33.0](https://github.com/discordjs/discord-api-types/compare/0.32.1...0.33.0) (2022-05-16)

### Code Refactoring

- **GuildFeature:** thread archive durations are no longer boost locked ([#412](https://github.com/discordjs/discord-api-types/issues/412)) ([1737ade](https://github.com/discordjs/discord-api-types/commit/1737adea1fc3d5050db30266e49c63277b7a77fc))
- separate `GUILD_CREATE` fields from `APIGuild` object ([#423](https://github.com/discordjs/discord-api-types/issues/423)) ([17f5caa](https://github.com/discordjs/discord-api-types/commit/17f5caa671da50a79d61393f5a970ce59c5d875e))

### Features

- add support for application command permissions v2 ([#415](https://github.com/discordjs/discord-api-types/issues/415)) ([d3163ca](https://github.com/discordjs/discord-api-types/commit/d3163ca22e5b7d8292f9f6ccd444aa5c93771d92))
- **OAuth2Scopes:** add new OAuth2 scopes ([#435](https://github.com/discordjs/discord-api-types/issues/435)) ([8f16f45](https://github.com/discordjs/discord-api-types/commit/8f16f452ac7dc8988617d1211fc6a9547d254795))
- **rest:** add missing guild routes results ([#438](https://github.com/discordjs/discord-api-types/issues/438)) ([1afce87](https://github.com/discordjs/discord-api-types/commit/1afce87fbef8e43ee040010e36019a4ebc6fecfe))

### BREAKING CHANGES

- APIGuild now correctly shows just the properties that are obtainable through rest/GUILD_UPDATE, while the extra fields have been moved to GatewayGuildCreateDispatchData to correctly represent the data received
- **GuildFeature:** `SevenDayThreadArchive` and `ThreeDayThreadArchive` have been removed as they are no longer valid

## [0.32.1](https://github.com/discordjs/discord-api-types/compare/0.32.0...0.32.1) (2022-05-05)

### Features

- **RESTJSONErrorCodes:** add error `50080` ([#408](https://github.com/discordjs/discord-api-types/issues/408)) ([43cfbcb](https://github.com/discordjs/discord-api-types/commit/43cfbcba284a96de6bde101b866ad9ac306992b5))
- **RESTPostAPIGuildForumThreads:** add `message` field ([#416](https://github.com/discordjs/discord-api-types/issues/416)) ([a28c824](https://github.com/discordjs/discord-api-types/commit/a28c824f82014b15a715b51b4426356428bb4ba2))

# [0.32.0](https://github.com/discordjs/discord-api-types/compare/0.31.2...0.32.0) (2022-04-25)

### Bug Fixes

- add `position` property to create channel options ([#409](https://github.com/discordjs/discord-api-types/issues/409)) ([3fe53ce](https://github.com/discordjs/discord-api-types/commit/3fe53ced9f0e61473a8b92d0503c51084e6a58f3))

### Code Refactoring

- **APIGuildIntegration:** make `enabled` optional ([#406](https://github.com/discordjs/discord-api-types/issues/406)) ([1212eb9](https://github.com/discordjs/discord-api-types/commit/1212eb933e6bf1d82b1b41164030bd317e9c59eb))

### BREAKING CHANGES

- **APIGuildIntegration:** `enabled` is now properly marked as optional

## [0.31.2](https://github.com/discordjs/discord-api-types/compare/0.31.1...0.31.2) (2022-04-18)

### Features

- **RESTPostAPIGuildChannelJSONBody:** add `default_auto_archive` prop ([#400](https://github.com/discordjs/discord-api-types/issues/400)) ([6a192b1](https://github.com/discordjs/discord-api-types/commit/6a192b132c11f13d95ea3e7ed1eb556600f2f415))

## [0.31.1](https://github.com/discordjs/discord-api-types/compare/0.31.0...0.31.1) (2022-04-11)

### Features

- **APIApplicationCommandInteractionData:** add `guild_id` ([#396](https://github.com/discordjs/discord-api-types/issues/396)) ([bc6e97f](https://github.com/discordjs/discord-api-types/commit/bc6e97f309b1f5e0bc0063ada3aed77f34214e9f))
- **APIGuildForum:** add support for forums, part 1 ([#398](https://github.com/discordjs/discord-api-types/issues/398)) ([bf08484](https://github.com/discordjs/discord-api-types/commit/bf084849885dd15b19f4f46aa260815037131600))
- student hubs ([#215](https://github.com/discordjs/discord-api-types/issues/215)) ([69079ee](https://github.com/discordjs/discord-api-types/commit/69079ee132777977e9a9e163696ffdc8db82fe38))

# [0.31.0](https://github.com/discordjs/discord-api-types/compare/0.30.0...0.31.0) (2022-04-04)

### Code Refactoring

- **APIGroupDMChannel:** make `name` nullable ([#347](https://github.com/discordjs/discord-api-types/issues/347)) ([ed0049b](https://github.com/discordjs/discord-api-types/commit/ed0049b78f4008460b0c7a2ec68eb38f018be3bd))
- remove `summary` from applications ([#386](https://github.com/discordjs/discord-api-types/issues/386)) ([f0ab4e8](https://github.com/discordjs/discord-api-types/commit/f0ab4e8c48895f8daee7fa296b8319a98fb7d4e1))
- remove store channels ([#364](https://github.com/discordjs/discord-api-types/issues/364)) ([25677ff](https://github.com/discordjs/discord-api-types/commit/25677fff43533b3b11b88f01efe98f0875014cb5))

### Features

- add `RESTGetAPIGuildBansQuery` ([#391](https://github.com/discordjs/discord-api-types/issues/391)) ([b1bf7bf](https://github.com/discordjs/discord-api-types/commit/b1bf7bf0f9a37fa391a67e4b5b1dd288821d0ebb))
- **APIApplication:** app authorization links and tags ([#239](https://github.com/discordjs/discord-api-types/issues/239)) ([93eab11](https://github.com/discordjs/discord-api-types/commit/93eab113cdcfd3bdd868f1d86bb4bc2a5247d844))
- **APIApplicationCommand:** add missing localization props ([#383](https://github.com/discordjs/discord-api-types/issues/383)) ([9c12718](https://github.com/discordjs/discord-api-types/commit/9c1271816312382be3471cb2fdbb6260e973b4f6))
- **APIAuditLogChange:** add `APIAuditLogChangeKeyImageHash` ([#379](https://github.com/discordjs/discord-api-types/issues/379)) ([f532002](https://github.com/discordjs/discord-api-types/commit/f532002574b655d87151c325be6c02fe6f65bbe0))
- **GuildFeatures:** add animated banners ([#219](https://github.com/discordjs/discord-api-types/issues/219)) ([c23f2ac](https://github.com/discordjs/discord-api-types/commit/c23f2accf998ffa0c068d222fd9f34228a86a699))
- **RESTPostAPIStageInstanceJSONBody:** add `send_start_notification` ([#378](https://github.com/discordjs/discord-api-types/issues/378)) ([b764e8d](https://github.com/discordjs/discord-api-types/commit/b764e8dc1a92e254161f3a443e17148a81240b66))

### BREAKING CHANGES

- The deprecated `summary` field has been removed
- Store channels have been removed, alongside their types
- **APIGroupDMChannel:** The `name` field is now also nullable for Group DM Channels

# [0.30.0](https://github.com/discordjs/discord-api-types/compare/0.29.0...0.30.0) (2022-03-24)

### Bug Fixes

- **APIGuildIntegrationType:** correct name of type ([#366](https://github.com/discordjs/discord-api-types/issues/366)) ([fa740eb](https://github.com/discordjs/discord-api-types/commit/fa740eb16c8bba9d2c9c915d2e0139e5e1211040))

### Features

- **APIApplicationCommand:** add command localization ([#370](https://github.com/discordjs/discord-api-types/issues/370)) ([f702988](https://github.com/discordjs/discord-api-types/commit/f70298811242d946cee01b112c34382f0e54cb78))

### Reverts

- fix(GatewayVoiceState): some fields are optional instead of nullable ([#367](https://github.com/discordjs/discord-api-types/issues/367)) ([e822e45](https://github.com/discordjs/discord-api-types/commit/e822e45b3b6e07eb85a45039975cb33636765f5e))

### BREAKING CHANGES

- **APIGuildIntegrationType:** `APIGuildInteractionType` is now correctly named `APIGuildIntegrationType`

# [0.29.0](https://github.com/discordjs/discord-api-types/compare/0.28.0...0.29.0) (2022-03-10)

### Bug Fixes

- **GatewayVoiceState:** some fields are optional instead of nullable ([#345](https://github.com/discordjs/discord-api-types/issues/345)) ([fddff21](https://github.com/discordjs/discord-api-types/commit/fddff2167c858832d6c61f3efca8d944fd356a85))
- **RESTJSONErrorCodes:** typo in error `30046` ([#362](https://github.com/discordjs/discord-api-types/issues/362)) ([854aa36](https://github.com/discordjs/discord-api-types/commit/854aa3691c4d16a2c7fec7421cf25ea03a030e55))

### Code Refactoring

- **APIGuildScheduledEventBase:** make `description` nullable ([#359](https://github.com/discordjs/discord-api-types/issues/359)) ([e5710d0](https://github.com/discordjs/discord-api-types/commit/e5710d0e42d4f597bc9ed5594619a5032bf59bcb))
- make things optional and nullable where applicable ([#361](https://github.com/discordjs/discord-api-types/issues/361)) ([10fdeaa](https://github.com/discordjs/discord-api-types/commit/10fdeaa68df9b3b61b20b8d90b9587d03d95a450))
- **RESTJSONErrorCodes:** update error `50008` key ([#338](https://github.com/discordjs/discord-api-types/issues/338)) ([9a57848](https://github.com/discordjs/discord-api-types/commit/9a578489ad05b2ba8ed8d496db19cb86fa572ef7))

### Features

- **APIInviteGuild:** add boost count ([#323](https://github.com/discordjs/discord-api-types/issues/323)) ([cb92843](https://github.com/discordjs/discord-api-types/commit/cb92843991307d59c61d017d8ab1adcd469b4512))
- **APIStageInstance:** add `guild_scheduled_event_id` ([#350](https://github.com/discordjs/discord-api-types/issues/350)) ([d06d2d6](https://github.com/discordjs/discord-api-types/commit/d06d2d6a9a8ccc84337b2ce9c59430694ae93e8a))
- **RESTJSONErrorCodes:** add error `10065` ([#336](https://github.com/discordjs/discord-api-types/issues/336)) ([e8127b8](https://github.com/discordjs/discord-api-types/commit/e8127b89f89c4612fab0d3702ce512e41ab75b6e))

### BREAKING CHANGES

- **RESTJSONErrorCodes:** `MaximumNumberOfEditsToMessagesOlderThanOneHourReached` is no longer mistyped as `MaxmimumNumberOfEditsToMessagesOlderThanOneHourReached`
- **APIGuildScheduledEventBase:** The type for `description` can also be null, not just optional
- **RESTJSONErrorCodes:** The error code `50008` has been renamed from `CannotSendMessagesInVoiceChannel` to `CannotSendMessagesInNonTextChannel`
- The deprecated `asset` field for stickers is correctly marked as optional now. The `image` field for Guild Scheduled Events is now correctly typed as optional.
- **GatewayVoiceState:** `channel_id` and `request_to_speak_timestamp` are correctly typed as optional, not nullable now.

# [0.28.0](https://github.com/discordjs/discord-api-types/compare/0.27.3...0.28.0) (2022-03-07)

### Code Refactoring

- **PermissionFlagsBits:** rename `StartEmbeddedActivities` to `UseEmbeddedActivities` ([#342](https://github.com/discordjs/discord-api-types/issues/342)) ([3e3acb5](https://github.com/discordjs/discord-api-types/commit/3e3acb5297e3e546fbb7fc82acddb50170ffc1de))

### Features

- add support for TS module: NodeNext ([#356](https://github.com/discordjs/discord-api-types/issues/356)) ([e9ee696](https://github.com/discordjs/discord-api-types/commit/e9ee6966c38c82544536ece85af0c1b3bd592bfc))
- **MessageComponentInteraction:** export specific interaction aliases ([#353](https://github.com/discordjs/discord-api-types/issues/353)) ([3503a4f](https://github.com/discordjs/discord-api-types/commit/3503a4fd384be8459a1628a6f019a1bc164c0386))
- **Utils:** add more typeguard functions to determine the interaction types ([#355](https://github.com/discordjs/discord-api-types/issues/355)) ([dec7717](https://github.com/discordjs/discord-api-types/commit/dec7717bc76ac86c8b7d45ed4e0b506e532f7cb9))

### BREAKING CHANGES

- **PermissionFlagsBits:** The `StartEmbeddedActivities` permission flag has been renamed to `UseEmbeddedActivities`

## [0.27.3](https://github.com/discordjs/discord-api-types/compare/0.27.2...0.27.3) (2022-02-24)

### Bug Fixes

- **APIApplicationCommandAutocompleteInteraction:** make `options` field required for v10 (PR [#332](https://github.com/discordjs/discord-api-types/issues/332) redo) ([#339](https://github.com/discordjs/discord-api-types/issues/339)) ([8d432f2](https://github.com/discordjs/discord-api-types/commit/8d432f2ebe54904cc0285b1e05706ca105ece7b8))

## [0.27.2](https://github.com/discordjs/discord-api-types/compare/0.27.1...0.27.2) (2022-02-17)

### Bug Fixes

- **APIApplicationCommandAutocompleteInteraction:** make `options` field required ([#332](https://github.com/discordjs/discord-api-types/issues/332)) ([5396daf](https://github.com/discordjs/discord-api-types/commit/5396daf0dbbe7ed54d94c621649b746b1131dee9))
- **APIInteractionResponse:** add `APIModalInteractionResponse` to union ([#333](https://github.com/discordjs/discord-api-types/issues/333)) ([a8f19e6](https://github.com/discordjs/discord-api-types/commit/a8f19e6a19cbefd99c8c8bd35e565ab3584c9eeb))

### Features

- api v10 ([#331](https://github.com/discordjs/discord-api-types/issues/331)) ([8e87b3e](https://github.com/discordjs/discord-api-types/commit/8e87b3e1ce35201503623839602c44fe2a52a27b))

## [0.27.1](https://github.com/discordjs/discord-api-types/compare/0.27.0...0.27.1) (2022-02-14)

### Bug Fixes

- **APIInteraction:** add modal submit interaction & make `data` required in APIModalSubmit ([#321](https://github.com/discordjs/discord-api-types/issues/321)) ([f88727b](https://github.com/discordjs/discord-api-types/commit/f88727bd80d32f3ddf4374b1fd46ce50c36eea4d))
- **APIInteractions:** export ApplicationCommandAutocomplete ([#309](https://github.com/discordjs/discord-api-types/issues/309)) ([5056da5](https://github.com/discordjs/discord-api-types/commit/5056da523af6154fbf2fbcf10e30ce437ec42ce8))
- **CI:** skip pull request checks for runs that don't include the token ([#327](https://github.com/discordjs/discord-api-types/issues/327)) ([0ad06fc](https://github.com/discordjs/discord-api-types/commit/0ad06fc639d7f8bdff135a58d435e6cb15029842))
- make `data` required in autocomplete interaction and add separate dm/guild types ([#322](https://github.com/discordjs/discord-api-types/issues/322)) ([7abeb2e](https://github.com/discordjs/discord-api-types/commit/7abeb2e0391d6e47517edba63342ba9c4adc4fcb))

### Features

- **RESTJSONErrorCodes:** add error 40060 ([#320](https://github.com/discordjs/discord-api-types/issues/320)) ([72e9617](https://github.com/discordjs/discord-api-types/commit/72e9617fee6e05d2eb4b715c0261d316ff0e1f1e))

# [0.27.0](https://github.com/discordjs/discord-api-types/compare/0.26.1...0.27.0) (2022-02-10)

### Bug Fixes

- **GatewayThreadCreateDispatchData:** `newly_created` is optional, and `true` when present ([#312](https://github.com/discordjs/discord-api-types/issues/312)) ([87b9b08](https://github.com/discordjs/discord-api-types/commit/87b9b0885a3734b376e64da51d7667b74558f7e5))

### Code Refactoring

- **ActivityType:** change `Game` to `Playing` ([#298](https://github.com/discordjs/discord-api-types/issues/298)) ([08a8b28](https://github.com/discordjs/discord-api-types/commit/08a8b28ee1ed2041744d922db35dab24f3861469))
- **UserFlags:** remove `None` ([#308](https://github.com/discordjs/discord-api-types/issues/308)) ([8e13cd8](https://github.com/discordjs/discord-api-types/commit/8e13cd80c66d11d93157a053e329ad98ece4a457))

### Features

- **APIGuildPreview:** add `stickers` ([#279](https://github.com/discordjs/discord-api-types/issues/279)) ([310c68f](https://github.com/discordjs/discord-api-types/commit/310c68f034812072ca3cacbeaff1f5b9454e3409))
- **APIInteraction:** add locale props to interactions ([#273](https://github.com/discordjs/discord-api-types/issues/273)) ([03b8d3f](https://github.com/discordjs/discord-api-types/commit/03b8d3fee032fb77213389019baa2b80377dcfdc))
- **APIMessageInteraction:** add `member` field ([#299](https://github.com/discordjs/discord-api-types/issues/299)) ([80ed7ba](https://github.com/discordjs/discord-api-types/commit/80ed7ba1c1ebb2e12d3a04339d4ff0209be9bbef))
- **APIScheduledEvent:** add `image` prop ([#303](https://github.com/discordjs/discord-api-types/issues/303)) ([663c4e9](https://github.com/discordjs/discord-api-types/commit/663c4e97fbe2029ab040388b50d5600bfe281c4f))
- **APIThreadMetadata:** add `create_timestamp` field ([#301](https://github.com/discordjs/discord-api-types/issues/301)) ([d95d956](https://github.com/discordjs/discord-api-types/commit/d95d9562dcc514556f3a4ced3e8f3ee4c5ed1282))
- **ApplicationCommand:** attachment application command option type ([#272](https://github.com/discordjs/discord-api-types/issues/272)) ([71c4e6a](https://github.com/discordjs/discord-api-types/commit/71c4e6aecd044ce5282742c0e47bff7b64b890f7))
- **GatewayThreadCreateDispatch:** Add `newly_created` field ([#311](https://github.com/discordjs/discord-api-types/issues/311)) ([7e54215](https://github.com/discordjs/discord-api-types/commit/7e542152da2e58f44c2314d5bd3b04a518fa979e))
- **Interactions:** add modal and text input interactions ([#243](https://github.com/discordjs/discord-api-types/issues/243)) ([bf0f66b](https://github.com/discordjs/discord-api-types/commit/bf0f66b60a97f79c0e80ace5b408baee343bc82c))
- **Locales:** add locale string enum ([#297](https://github.com/discordjs/discord-api-types/issues/297)) ([b07d5a0](https://github.com/discordjs/discord-api-types/commit/b07d5a0c2273b6b51b44542b638a768c36d0f184))
- **MessageFlags:** add `FailedToMentionSomeRolesInThread` ([#280](https://github.com/discordjs/discord-api-types/issues/280)) ([76588d9](https://github.com/discordjs/discord-api-types/commit/76588d9d384f71ace05d96de17889e4490874462))
- **RESTPostAPIChannelMessage, RESTPostAPIWebhookMessage:** add flags for creation ([#300](https://github.com/discordjs/discord-api-types/issues/300)) ([4194bd9](https://github.com/discordjs/discord-api-types/commit/4194bd9054a7e4b004f9244706f423292a8a0e56))
- **RESTJSONErrorCodes:** add error 30042 ([#305](https://github.com/discordjs/discord-api-types/issues/305)) ([9c2b185](https://github.com/discordjs/discord-api-types/commit/9c2b185367b1ea2e432355d76af8f19e8fca7398))
- **RESTJSONErrorCodes:** add error 30046 ([#304](https://github.com/discordjs/discord-api-types/issues/304)) ([56d3975](https://github.com/discordjs/discord-api-types/commit/56d39756c0d973ec56fe6e1eeb75d827f50aac81))
- **RESTJSONErrorCodes:** add error 40004 ([#314](https://github.com/discordjs/discord-api-types/issues/314)) ([269a75c](https://github.com/discordjs/discord-api-types/commit/269a75ccf7b413bfc031849713e919ebb8d87a1a))
- **RESTJSONErrorCodes:** add error 50068 ([#302](https://github.com/discordjs/discord-api-types/issues/302)) ([7655e20](https://github.com/discordjs/discord-api-types/commit/7655e2024800abc4431011668b83373e0868485e))
- **RESTJSONErrorCodes:** add error code 50086 ([#286](https://github.com/discordjs/discord-api-types/issues/286)) ([51fb37c](https://github.com/discordjs/discord-api-types/commit/51fb37cbba44677870f0f916bd1416bdbd34e052))
- **RESTPatchAPIGuildMember:** add `communication_disabled_until` field ([#289](https://github.com/discordjs/discord-api-types/issues/289)) ([5056b0f](https://github.com/discordjs/discord-api-types/commit/5056b0f2b3798480dbbc193fd80dedfefedff4fc))
- **RESTPatchAPIGuildMember:** add modify current member and deprecate nick route ([#262](https://github.com/discordjs/discord-api-types/issues/262)) ([9a982ff](https://github.com/discordjs/discord-api-types/commit/9a982ff8d9592a02d78f24295efd756dc0c69fa8))
- **RouteBases:** add base for guild scheduled events ([#293](https://github.com/discordjs/discord-api-types/issues/293)) ([83f29b6](https://github.com/discordjs/discord-api-types/commit/83f29b692839cc51869bcafdaf387b68731e0a28))
- **UserFlags:** add `Spammer` flag ([#294](https://github.com/discordjs/discord-api-types/issues/294)) ([03f12d7](https://github.com/discordjs/discord-api-types/commit/03f12d71eef2661ee5290152952ea1adc9a92383))

### types

- Add tagged `type` unions for channel types ([#200](https://github.com/discordjs/discord-api-types/issues/200)) ([2c1fbda](https://github.com/discordjs/discord-api-types/commit/2c1fbda621fc1c1ea227295c578e6d8486dbc4f2))

### BREAKING CHANGES

- **Interactions:** `APIBaseMessageComponent` was renamed to `APIBaseComponent`
- **UserFlags:** The `None` user flag is bye-bye (although I doubt anyone is using it)
- All of the channel types are now split based on their type. As such, you will need to assert the type (either by checking it with the enum or by casting the data as the correct channel) before accessing data.
  _If you encounter any missing properties due to this, please open an issue! This is a big change, and we hope nothing is missing_

- **ActivityType:** `Game` was renamed to `Playing`

## [0.26.1](https://github.com/discordjs/discord-api-types/compare/0.26.0...0.26.1) (2022-01-02)

### Bug Fixes

- **APIApplicationCommandOption:** correct type for integer and number ([#284](https://github.com/discordjs/discord-api-types/issues/284)) ([fe1f531](https://github.com/discordjs/discord-api-types/commit/fe1f5313a8fc13d0a2433738cce9be37f5d9eeb5))

### Features

- **APIAuditLogChangeData:** Add `communication_disabled_until` ([#281](https://github.com/discordjs/discord-api-types/issues/281)) ([0cf51ab](https://github.com/discordjs/discord-api-types/commit/0cf51abc267bd6246a7952e7f6a23fa8c5db290a))
- **APIGuildScheduledEvent:** add more precise types for stage instance/voice/external events ([#278](https://github.com/discordjs/discord-api-types/issues/278)) ([751aee6](https://github.com/discordjs/discord-api-types/commit/751aee6fa7d4c542324a30e9b9bc641b0e7a8bf4))
- **ApplicationFlags:** add embedded application flags ([#277](https://github.com/discordjs/discord-api-types/issues/277)) ([9f4f59c](https://github.com/discordjs/discord-api-types/commit/9f4f59c8e55f78caf614e27e28b6bca939665ca5))

# [0.26.0](https://github.com/discordjs/discord-api-types/compare/0.25.2...0.26.0) (2021-12-24)

### Bug Fixes

- **APIInvite:** channel can be null ([#182](https://github.com/discordjs/discord-api-types/issues/182)) ([c67d426](https://github.com/discordjs/discord-api-types/commit/c67d426e3d3634eb0756f07029b9176cfc5873ce))
- **GatewayStageInstance:** Stage Instance dispatches not included in `GatewayDispatchPayload` ([#267](https://github.com/discordjs/discord-api-types/issues/267)) ([46db72d](https://github.com/discordjs/discord-api-types/commit/46db72da2fd14a51047b4e66e934738785e72d96))
- **NonDispatchPayload:** `t` & `s` fields are always null on non-dispatch payloads ([#259](https://github.com/discordjs/discord-api-types/issues/259)) ([315ce35](https://github.com/discordjs/discord-api-types/commit/315ce3584917635b93a26123470f37a10bd8d846))
- only a partial object is needed when updating attachments ([#263](https://github.com/discordjs/discord-api-types/issues/263)) ([7ab780b](https://github.com/discordjs/discord-api-types/commit/7ab780b3aefb3c8c34a8114db3ace6c4e6ae3206))
- **StickerPack:** Optional `banner_asset_id` ([#270](https://github.com/discordjs/discord-api-types/issues/270)) ([7eee39d](https://github.com/discordjs/discord-api-types/commit/7eee39d86c0d40857d0bf6fc0d4d1e31cda1895c))

### Features

- Add API error code `50055` ([#256](https://github.com/discordjs/discord-api-types/issues/256)) ([b01716b](https://github.com/discordjs/discord-api-types/commit/b01716bf22fba617c0a09084ff607127366432b6))
- Add API error code 50109 ([#268](https://github.com/discordjs/discord-api-types/issues/268)) ([bfc5e46](https://github.com/discordjs/discord-api-types/commit/bfc5e46f5374289997219c35aa0b992dfaa4ec40))
- add support for user guild member read oauth2 scope and route ([#254](https://github.com/discordjs/discord-api-types/issues/254)) ([e9d02a1](https://github.com/discordjs/discord-api-types/commit/e9d02a19fc3b4fad2f488b0db3b63d6301878730))
- **APIAuditLog:** add `guild_scheduled_events` prop ([#251](https://github.com/discordjs/discord-api-types/issues/251)) ([c7efcd5](https://github.com/discordjs/discord-api-types/commit/c7efcd55059673ab9fc8e6ef9711050700274057))
- **APIGuildMember:** add guild timeouts ([#235](https://github.com/discordjs/discord-api-types/issues/235)) ([0bbc972](https://github.com/discordjs/discord-api-types/commit/0bbc9721f6e18eb559c40e207f60218e7862d4ea))
- **GatewayThreadMemberUpdateDispatchData:** add `guild_id` extra field ([#266](https://github.com/discordjs/discord-api-types/issues/266)) ([2c72242](https://github.com/discordjs/discord-api-types/commit/2c72242a03bd5adfd0fc145bf5645d1bad59254e))
- **RESTJSONErrorCodes:** add error 20029 ([#257](https://github.com/discordjs/discord-api-types/issues/257)) ([9e619fc](https://github.com/discordjs/discord-api-types/commit/9e619fc460337d53c85fc3977c89489c14bd8254))
- bring in support for TS 4.5's `exactOptionalPropertyTypes` ([#275](https://github.com/discordjs/discord-api-types/issues/275)) ([c20e5ae](https://github.com/discordjs/discord-api-types/commit/c20e5ae2a9edcca529e233a4deb634bc760076d2))

### Cleanups

- Make application command option union easier to use ([#250](https://github.com/discordjs/discord-api-types/issues/250)) ([8bbb819](https://github.com/discordjs/discord-api-types/commit/8bbb81942b3f87e46273bb75a12e2db4ef7ee797))
- **ChatInputCommandOptions:** cleanup chat input options ([#274](https://github.com/discordjs/discord-api-types/issues/274)) ([7fe78ce](https://github.com/discordjs/discord-api-types/commit/7fe78cec25a07dcd5d7ba2af3a5d773620c2d3cf))

### BREAKING CHANGES

- **StickerPack:** `banner_asset_id` is now optional. Reference PR: https://github.com/discord/discord-api-docs/pull/4245
- **APIInvite:** this marks the channel property of invites as possibly null
- **ChatInputCommandOptions:** A lot of the options were renamed and split up to clean up internal code.
  All option interfaces that ended in a plural (`*Options`) have had their pluralization removed (`*Option` now).
  `APIApplicationCommandInteractionDataOptionWithValues` has been renamed to `APIApplicationCommandInteractionDataBasicOption`,
  and every `*InteractionDataOptions{Type}` interfaces have been renamed to `*InteractionData{Type}Option`
  (i.e.: `ApplicationCommandInteractionDataOptionString` -> `APIApplicationCommandInteractionDataStringOption`).

## [0.25.2](https://github.com/discordjs/discord-api-types/compare/0.25.1...0.25.2) (2021-11-30)

### Bug Fixes

- **APISelectMenuComponent:** `options` property is required ([#248](https://github.com/discordjs/discord-api-types/issues/248)) ([51dee6e](https://github.com/discordjs/discord-api-types/commit/51dee6e0e5bb4d749b9f0436e7ec9d4793e56567))

### Features

- **Guild:** boost progress bars ([#227](https://github.com/discordjs/discord-api-types/issues/227)) ([47382b6](https://github.com/discordjs/discord-api-types/commit/47382b6183a1d232053fef23691d423f8af88f88))

## [0.25.1](https://github.com/discordjs/discord-api-types/compare/0.25.0...0.25.1) (2021-11-30)

### Bug Fixes

- **deno:** faulty import paths for guild scheduled events ([#245](https://github.com/discordjs/discord-api-types/issues/245)) ([44c0f05](https://github.com/discordjs/discord-api-types/commit/44c0f05cb2fc2b9ea50745530ae94a669a839594))

# [0.25.0](https://github.com/discordjs/discord-api-types/compare/0.24.0...0.25.0) (2021-11-29)

### Bug Fixes

- **APIApplicationCommandOption:** remove `default` property ([#242](https://github.com/discordjs/discord-api-types/issues/242)) ([faa8bf4](https://github.com/discordjs/discord-api-types/commit/faa8bf494bc79b844ce73e1892461e8440dc7abc))
- correct types for autocomplete interaction data ([#234](https://github.com/discordjs/discord-api-types/issues/234)) ([691abb5](https://github.com/discordjs/discord-api-types/commit/691abb581fb17093b5fa139f3ff53cbc0ad0b2a1))
- correct types for REST attachments ([#238](https://github.com/discordjs/discord-api-types/issues/238)) ([fa54b9d](https://github.com/discordjs/discord-api-types/commit/fa54b9de5522b9fa9d5367650950f8b0e44f6e14))
- make subcommand options optional ([#241](https://github.com/discordjs/discord-api-types/issues/241)) ([7379a34](https://github.com/discordjs/discord-api-types/commit/7379a345e820703a59a2d754c8ee7c0f0c710e09))

### Code Refactoring

- **UserFlags:** update flag names ([#229](https://github.com/discordjs/discord-api-types/issues/229)) ([f2d62e3](https://github.com/discordjs/discord-api-types/commit/f2d62e3cdf6128357f65e946fe1926cf915a6395))

### Features

- add guild scheduled event ([#186](https://github.com/discordjs/discord-api-types/issues/186)) ([d333962](https://github.com/discordjs/discord-api-types/commit/d333962715a58bd5ac14ad80e900b43b02777794))
- **RESTPostAPIChannelThreadsJSONBody:** add `rate_limit_per_user` ([#237](https://github.com/discordjs/discord-api-types/issues/237)) ([1e52e0c](https://github.com/discordjs/discord-api-types/commit/1e52e0ceab31465c7bbd820e332ef219ad715916))
- add max/min option for number-based options ([#221](https://github.com/discordjs/discord-api-types/issues/221)) ([bc1d03e](https://github.com/discordjs/discord-api-types/commit/bc1d03e527b9d37fac6d76cfbb51f4eeb8238e7b))
- add maze api error ([#228](https://github.com/discordjs/discord-api-types/issues/228)) ([7a15c97](https://github.com/discordjs/discord-api-types/commit/7a15c9786333fb6f2259f42536cfbf2cf0e43db8))
- **ActivityFlags:** add new flags ([#207](https://github.com/discordjs/discord-api-types/issues/207)) ([0f51d8e](https://github.com/discordjs/discord-api-types/commit/0f51d8e83f8aa53efde5c01849aaf09b91d15cbd))
- **ApplicationFlags:** add message content intent flags ([#226](https://github.com/discordjs/discord-api-types/issues/226)) ([d189e36](https://github.com/discordjs/discord-api-types/commit/d189e36c49cd230f98798ff57b668a6fe56df11b))
- **Attachments:** multi uploads and alt text ([#223](https://github.com/discordjs/discord-api-types/issues/223)) ([fdf133e](https://github.com/discordjs/discord-api-types/commit/fdf133ef45d3871defb46e47079c2acdd65e69d7))
- **GuildSystemChannelFlags:** add suppress member join sticker replies flag ([#222](https://github.com/discordjs/discord-api-types/issues/222)) ([4021dae](https://github.com/discordjs/discord-api-types/commit/4021dae44b331198d164a7c93dbc1242184efdf7))
- **Interactions:** add autocomplete api types ([#205](https://github.com/discordjs/discord-api-types/issues/205)) ([3b9320d](https://github.com/discordjs/discord-api-types/commit/3b9320dbf2cbbae7db44f00e8deaf336ab052e8b))
- **UserFlags:** add `BOT_HTTP_INTERACTIONS` flag ([#212](https://github.com/discordjs/discord-api-types/issues/212)) ([a015f96](https://github.com/discordjs/discord-api-types/commit/a015f96fcb4a74866f884db87732876095788111))

### BREAKING CHANGES

- **UserFlags:** All user flags now follow the internal name, with descriptions added for what they represent. This means you'll have to do some minor renaming in your code if you check for flags.
- **APIApplicationCommandOption:** If you were using the `default` property for ApplicationCommandOptions, it has been removed, as Discord wasn't even taking it into account anymore.
- The types for autocomplete interactions have been corrected.

# [0.24.0](https://github.com/discordjs/discord-api-types/compare/0.23.1...0.24.0) (2021-10-16)

### Bug Fixes

- **APISelectMenuComponent:** make options field optional ([#209](https://github.com/discordjs/discord-api-types/issues/209)) ([0c592a0](https://github.com/discordjs/discord-api-types/commit/0c592a0950431f43143bf1c32589bce2dd842b44))

### Code Refactoring

- **APIVoiceRegion:** removed `vip` property ([#214](https://github.com/discordjs/discord-api-types/issues/214)) ([7db6953](https://github.com/discordjs/discord-api-types/commit/7db69531d86fe5bdd462747b1e1287ee6b2dc496))

### Features

- **APIApplicationCommand:** add `channel_types` field to channel options ([#198](https://github.com/discordjs/discord-api-types/issues/198)) ([77396b5](https://github.com/discordjs/discord-api-types/commit/77396b557c6f3d4f85cfc4cd3b253638bc5b449d))
- **APIAttachment:** add ephemeral field ([#199](https://github.com/discordjs/discord-api-types/issues/199)) ([2aee879](https://github.com/discordjs/discord-api-types/commit/2aee87960070cb56979d3ced453c8cd64e81f150))
- **APIGuildMember:** add per guild avatars ([#208](https://github.com/discordjs/discord-api-types/issues/208)) ([0331518](https://github.com/discordjs/discord-api-types/commit/0331518c49c4761f900bacd8ca8a92e38b36b6e9))
- **APIRole:** add role icons ([#204](https://github.com/discordjs/discord-api-types/issues/204)) ([1076822](https://github.com/discordjs/discord-api-types/commit/1076822b90a1b6facf74aa3f2a6750566b3feb53))
- **InteractionResolvedChannels:** add `parent_id` and `thread_metadata` fields to resolved channels ([#210](https://github.com/discordjs/discord-api-types/issues/210)) ([64e4e52](https://github.com/discordjs/discord-api-types/commit/64e4e5246cd61eadf35591b8afdf4c5922fd4086))
- **PermissionFlagBits:** update thread permissions ([#181](https://github.com/discordjs/discord-api-types/issues/181)) ([68d97ae](https://github.com/discordjs/discord-api-types/commit/68d97aed1425002677acdf1d5444b36d3cfcc322))
- **PermissionFlagsBits:** add `StartEmbeddedActivities` ([#197](https://github.com/discordjs/discord-api-types/issues/197)) ([4bbe1ea](https://github.com/discordjs/discord-api-types/commit/4bbe1eaa867da810a1d039b21c3fc78208a50801))
- **RESTJSONErrorCodes:** add error 50101 ([#202](https://github.com/discordjs/discord-api-types/issues/202)) ([b453d75](https://github.com/discordjs/discord-api-types/commit/b453d75e4d13d34836247929be56c042cbc4b762))
- **Routes:** add missing OAuth2 routes ([#218](https://github.com/discordjs/discord-api-types/issues/218)) ([9dd3446](https://github.com/discordjs/discord-api-types/commit/9dd3446b64f31ae0831944f5c608095d650142d7))

### BREAKING CHANGES

- **APIVoiceRegion:** The `vip` property has been removed.

## [0.23.1](https://github.com/discordjs/discord-api-types/compare/0.23.0...0.23.1) (2021-09-08)

### Bug Fixes

- **RESTPostAPIBaseApplicationCommandsJSONBody:** omit `version` field ([#195](https://github.com/discordjs/discord-api-types/issues/195)) ([43cc755](https://github.com/discordjs/discord-api-types/commit/43cc755e3390437d11f7733477a2c86afd6daf23))

# [0.23.0](https://github.com/discordjs/discord-api-types/compare/0.22.0...0.23.0) (2021-09-07)

### Bug Fixes

- **AuditLog:** correct `nickname` type ([#189](https://github.com/discordjs/discord-api-types/issues/189)) ([64937e2](https://github.com/discordjs/discord-api-types/commit/64937e2311bf5e688f6789d9e66827e980e4e01c))
- **Embed:** correct certain optional types as being required ([#192](https://github.com/discordjs/discord-api-types/issues/192)) ([e628f0f](https://github.com/discordjs/discord-api-types/commit/e628f0f6f089a0840b9d69bea930dd3ad7fa7462))
- import causing error 404 on deno ([#178](https://github.com/discordjs/discord-api-types/issues/178)) ([8fcd0f2](https://github.com/discordjs/discord-api-types/commit/8fcd0f2222a77a1a0b19888d699e98d450268cc8))

### chore

- **Gateway:** remove `APPLICATION_COMMAND_*` events ([#191](https://github.com/discordjs/discord-api-types/issues/191)) ([d590caf](https://github.com/discordjs/discord-api-types/commit/d590caf359b61aa77780385437929f443cbf4a26))

### Features

- **APIApplicationCommand:** add `version` field ([#193](https://github.com/discordjs/discord-api-types/issues/193)) ([ecbed18](https://github.com/discordjs/discord-api-types/commit/ecbed180424c0975c52208f0f803b08f105df04a))
- **APIUser:** add `banner` and `accent_color` ([#183](https://github.com/discordjs/discord-api-types/issues/183)) ([b07b903](https://github.com/discordjs/discord-api-types/commit/b07b9030c134fdaf53f500d319c88067c1a8a175))
- **Interactions:** context menu items ([#166](https://github.com/discordjs/discord-api-types/issues/166)) ([fdc1c1a](https://github.com/discordjs/discord-api-types/commit/fdc1c1a5b411d8ef3d635ad90bd97c2b1bf77cf1))
- **JSONErrorCodes:** add `160002` ([#190](https://github.com/discordjs/discord-api-types/issues/190)) ([8b49887](https://github.com/discordjs/discord-api-types/commit/8b49887c7f732fe88cadb1e6ca17e0dc12db25f9))
- **MessageType:** add ContextMenuCommand and rename ApplicationCommand to ChatInputCommand ([#180](https://github.com/discordjs/discord-api-types/issues/180)) ([0024823](https://github.com/discordjs/discord-api-types/commit/0024823d053c15491011eb6d11c314e299689ba5))
- **Threads:** add `invitable` ([#185](https://github.com/discordjs/discord-api-types/issues/185)) ([b6babf2](https://github.com/discordjs/discord-api-types/commit/b6babf2ee2c66817ac99752d14feed2d574ecb14))

### BREAKING CHANGES

- **Gateway:** The three Application Command events have been removed
- **Embed:**
  - `APIEmbedAuthor#name` is required, not optional
  - `APIEmbedThumbnail#url` is required, not optional
  - `APIEmbedImage#url` is required, not optional

# [0.22.0](https://github.com/discordjs/discord-api-types/compare/0.21.0...0.22.0) (2021-07-31)

### Bug Fixes

- **Gateway:** thread list sync now sends an array as documented ([#174](https://github.com/discordjs/discord-api-types/issues/174)) ([a93235c](https://github.com/discordjs/discord-api-types/commit/a93235c9df2bc36a337c03e8ba08986e6e377483))
- **MessageComponent:** correct type for emoji ([#176](https://github.com/discordjs/discord-api-types/issues/176)) ([b75b05f](https://github.com/discordjs/discord-api-types/commit/b75b05f0d50014335fefc8bb8969d519ed0076d3))

### chore

- **ApplicationCommandOptionType:** casing changes for subcommands ([#175](https://github.com/discordjs/discord-api-types/issues/175)) ([f93b6be](https://github.com/discordjs/discord-api-types/commit/f93b6be2528c80f8dc038282a7d6ddb3c4685c2f))

### Features

- thread updates ([#167](https://github.com/discordjs/discord-api-types/issues/167)) ([47100bc](https://github.com/discordjs/discord-api-types/commit/47100bcf2c154146baecb359e1c00ecca9939ffa))

### BREAKING CHANGES

- **ApplicationCommandOptionType:** This renames `SubCommand` to `Subcommand`, and `SubCommandGroup` to `SubcommandGroup`
- `Routes#channelJoinedArchivedThreads` is now spelled right (from `Routes#channelJoinedArhivedThreads`)
- **Gateway:** `GatewayThreadListSync#members` is now an array of APIThreadMember instead of a Record of GatewayThreadListSyncMember

# [0.21.0](https://github.com/discordjs/discord-api-types/compare/0.20.1...0.21.0) (2021-07-30)

### Bug Fixes

- change resolved index types to string ([#169](https://github.com/discordjs/discord-api-types/issues/169)) ([d338409](https://github.com/discordjs/discord-api-types/commit/d338409410854cc1f97f9903fdc2565e1f45e778))
- export APIPingInteraction ([#168](https://github.com/discordjs/discord-api-types/issues/168)) ([ef2a0ae](https://github.com/discordjs/discord-api-types/commit/ef2a0aeb07cdd04b47e6cb0d40dd8a1b2a77b491))
- **APIInteraction:** bring back Ping type ([#164](https://github.com/discordjs/discord-api-types/issues/164)) ([ff75eb3](https://github.com/discordjs/discord-api-types/commit/ff75eb3f5dfd7597968c26133d125cfe40ee5838))

### Features

- **ApplicationCommandOptionType:** add Number (10) ([#153](https://github.com/discordjs/discord-api-types/issues/153)) ([6f15e53](https://github.com/discordjs/discord-api-types/commit/6f15e537dfee5bda383572cd725c05246c97ca62))
- **Globals:** revert template bigint type to string type ([#171](https://github.com/discordjs/discord-api-types/issues/171)) ([f299507](https://github.com/discordjs/discord-api-types/commit/f2995073e033b050ab459c42b480e626f3f6ae8e))

### Reverts

- fix: change resolved index types to string ([#172](https://github.com/discordjs/discord-api-types/issues/172)) ([647905e](https://github.com/discordjs/discord-api-types/commit/647905e16bfeb689e644695657ac5f05920c0c4c))

### BREAKING CHANGES

- **Globals:** The type for Snowflake and Permissions is reverted from the `${bigint}` template type back to a normal string type

## [0.20.2](https://github.com/discordjs/discord-api-types/compare/0.21.0...0.20.2) (2021-07-21)

### Bug Fixes

- **APIInteraction:** bring back Ping type ([#164](https://github.com/discordjs/discord-api-types/issues/164)) ([ff75eb3](https://github.com/discordjs/discord-api-types/commit/ff75eb3f5dfd7597968c26133d125cfe40ee5838))

## [0.20.1](https://github.com/discordjs/discord-api-types/compare/0.20.0...0.20.1) (2021-07-20)

### Features

- **Interactions:** add interaction response and followup route ([#162](https://github.com/discordjs/discord-api-types/issues/162)) ([f99f07f](https://github.com/discordjs/discord-api-types/commit/f99f07f72e95a9537a955eb942b52e345c1067d6))

# [0.20.0](https://github.com/discordjs/discord-api-types/compare/0.19.0...0.20.0) (2021-07-20)

### chore

- Add more missing stuff ([#160](https://github.com/discordjs/discord-api-types/issues/160)) ([d009554](https://github.com/discordjs/discord-api-types/commit/d009554caed6c738c4a801f00806ab7cc4ac7e16))

### Code Refactoring

- change `xID` to `xId` ([#159](https://github.com/discordjs/discord-api-types/issues/159)) ([323e531](https://github.com/discordjs/discord-api-types/commit/323e531a77aa75397ee1ce59f0db35b08b80b606))
- rename `isStyledButton` to `isInteractionButton` ([#158](https://github.com/discordjs/discord-api-types/issues/158)) ([634f64d](https://github.com/discordjs/discord-api-types/commit/634f64d4ce143bd0a6b9ccf0ffb1241c21550958))

### Features

- **PermissionFlagsBits:** add `UseExternalStickers` (1n << 37n) ([#154](https://github.com/discordjs/discord-api-types/issues/154)) ([5dccc6b](https://github.com/discordjs/discord-api-types/commit/5dccc6b2a3711e14d499ee9a2122403a80da99fe))
- **RESTJSONErrorCodes:** add sticker errors ([#155](https://github.com/discordjs/discord-api-types/issues/155)) ([8dbeca0](https://github.com/discordjs/discord-api-types/commit/8dbeca0fc91cafef59eb8ee30bcfee9ab14a422c))

### BREAKING CHANGES

- `GatewayGuildMemberUpdateDispatchData#joined_at` is properly marked as nullable now
- In v9, `thread_id` was incorrectly placed in `RESTPostAPIWebhookWithTokenJSONBody` and has been moved to `RESTPostAPIWebhookWithTokenQuery`
- All types that contained the `ID` word in them have had it renamed to `Id` (ex: `APIButtonComponentWithCustomID` is now `APIButtonComponentWithCustomId`)
- The `isStyledButton` util has been renamed to `isInteractionButton`

# [0.19.0](https://github.com/discordjs/discord-api-types/compare/0.18.1...0.19.0) (2021-07-19)

### Bug Fixes

- **FormattingPatterns:** fix StyledTimestamp ([#147](https://github.com/discordjs/discord-api-types/issues/147)) ([dd12c6a](https://github.com/discordjs/discord-api-types/commit/dd12c6ac9902d1b300a167f0acd9fba5192aaa91))
- **RESTOAuth2:** correct casing of `OAuth` ([#134](https://github.com/discordjs/discord-api-types/issues/134)) ([f0b2766](https://github.com/discordjs/discord-api-types/commit/f0b2766d5b55bd9b8b8ba9c506a868dafcdca568))
- **RESTPostAPIWebhookWithTokenJSONBody:** add missing components ([#152](https://github.com/discordjs/discord-api-types/issues/152)) ([ca933ae](https://github.com/discordjs/discord-api-types/commit/ca933ae84d54456f0a443e5e8bd10b7613271f62))
- fix autopublish CD ([#140](https://github.com/discordjs/discord-api-types/issues/140)) ([8627c9d](https://github.com/discordjs/discord-api-types/commit/8627c9d2195aaa0a97de2fdf9f64ba0c0ff6db02))

### chore

- Get up to date _again_ ([#156](https://github.com/discordjs/discord-api-types/issues/156)) ([86e0736](https://github.com/discordjs/discord-api-types/commit/86e0736726fb4ef13736510fa6d69f20383d5ea5))
- **RESTErrorCodes:** correct casing for OAuth ([ca6612e](https://github.com/discordjs/discord-api-types/commit/ca6612e0a4f313731009a37a81c3a0834e6a0cd8))

### Code Refactoring

- **Enums:** make property casing consistent ([#131](https://github.com/discordjs/discord-api-types/issues/131)) ([aa5e26d](https://github.com/discordjs/discord-api-types/commit/aa5e26d92b587bf9b4fc33e038a6d3c8586597c2))

### Features

- **Stickers:** sticker packs, sticker routes, and guild stickers ([#145](https://github.com/discordjs/discord-api-types/issues/145)) ([4a83629](https://github.com/discordjs/discord-api-types/commit/4a836293d5224a6cad19c50bc074a9ef9b0f0af4))
- add stage instance related typings to audit logs ([#151](https://github.com/discordjs/discord-api-types/issues/151)) ([836e8fb](https://github.com/discordjs/discord-api-types/commit/836e8fb29491f8df72c0caf2eb5c05ed2bda3191))
- **APIGuild:** add `nsfw_level` ([#149](https://github.com/discordjs/discord-api-types/issues/149)) ([5256ac7](https://github.com/discordjs/discord-api-types/commit/5256ac7f97d35200f1676721a80ad0f57d05cab7))
- **Channel:** add embeds to post / patch ([#143](https://github.com/discordjs/discord-api-types/issues/143)) ([13d483e](https://github.com/discordjs/discord-api-types/commit/13d483ef2e53373438e8b03fed681232626b2670))
- **FormattingPatterns:** add timestamp ([#146](https://github.com/discordjs/discord-api-types/issues/146)) ([16eae7e](https://github.com/discordjs/discord-api-types/commit/16eae7eafe9ef6001f664a30c0f78d6982d2e54c))
- **RESTErrors:** add types for rest errors ([#122](https://github.com/discordjs/discord-api-types/issues/122)) ([7b47fc9](https://github.com/discordjs/discord-api-types/commit/7b47fc96809aed2b28e15064f308651b08a5b74d))
- **Threads:** add typed thread creation ([#148](https://github.com/discordjs/discord-api-types/issues/148)) ([f393ba5](https://github.com/discordjs/discord-api-types/commit/f393ba520d7d6d2aacaca7b3ca5d355fab614f6e))
- add typings for stage instance ([#144](https://github.com/discordjs/discord-api-types/issues/144)) ([e36ef9e](https://github.com/discordjs/discord-api-types/commit/e36ef9e1d225d8e8c849c3198e628202eedbd20b))
- **Interactions:** components and component interactions ([#132](https://github.com/discordjs/discord-api-types/issues/132)) ([036bb03](https://github.com/discordjs/discord-api-types/commit/036bb035c9d6ddf780bab5af4884861d08f04d24))
- **Threads:** add default auto archive and minor tweaks ([#142](https://github.com/discordjs/discord-api-types/issues/142)) ([d2b6276](https://github.com/discordjs/discord-api-types/commit/d2b62761194064b38e38045a72ee8b38c920ada6))
- api v9 and threads ([#133](https://github.com/discordjs/discord-api-types/issues/133)) ([d1498c3](https://github.com/discordjs/discord-api-types/commit/d1498c3ce2eaea11c9946726ef758f7de489253b))

### BREAKING CHANGES

- `APISelectOption` has been renamed to `APISelectMenuOption`
- APISelectMenuOption#default is now properly marked as optional

- Updated OAuth2 Application types
- `APIApplication#owner` is now marked as optional, per the docs

- Correct APIAuditLogChangeKeyNick's key
- This renames APIAuditLogChangeKeyNick's key from `mute` to `nick`

- Add `application_id` to APIMessage
- Correct type of `id` and `user_id` in APIThreadMember
- The type of `id` and `user_id` in APIThreadMember are now marked as optional; read the TSDoc for when it's actually optional

- Correctly version API route in RouteBases
- This changes the `RouteBases.api` to be versioned based on the API version you're importing. **Make sure to update your code to handle that**

- Added new guild features
  ref: https://github.com/discordjs/discord-api-types/pull/156/commits/4d36e533cffecbcce13e968a7803e5a68e021106

- Cleaned up interaction types
- While this shouldn't be necessary, this is a warning that types for interactions HAVE changed and you may need to update your code. For the most part, the types _should_ be the same, more accurate and strictly typed. You will also see that every type of interaction has a Guild/DM counterpart exported (ex: APIApplicationCommandGuildInteraction vs APIApplicationCommandInteraction, where the former has all the guild properties, while the latter has all properties that depend on context marked as optional).

- Add message property to MessageComponent interactions
- **RESTErrorCodes:** This properly capitalizes certain error codes with the right OAuth capitalization
- **RESTOAuth2:** `RESTGetAPIOauth2CurrentApplicationResult` and `RESTGetAPIOauth2CurrentAuthorizationResult` have been renamed to `RESTGetAPIOAuth2CurrentApplicationResult ` and `RESTGetAPIOAuth2CurrentAuthorizationResult`, to correct the casing of `OAuth`

- **Enums:** Enum keys have been normalized, and they are all PascalCased now (for API v8 and above). API v6 did not receive these changes.

## [0.18.1](https://github.com/discordjs/discord-api-types/compare/0.18.0...0.18.1) (2021-05-03)

### Bug Fixes

- **APIInvite:** `expires_at` is nullable ([#128](https://github.com/discordjs/discord-api-types/issues/128)) ([44b956a](https://github.com/discordjs/discord-api-types/commit/44b956ad858a457e7671ced38529b433b02efbde))

### Features

- add new interfaces for interaction-related structures ([#129](https://github.com/discordjs/discord-api-types/issues/129)) ([bd638b9](https://github.com/discordjs/discord-api-types/commit/bd638b97e5d26abd8a4f1edbd0f56ddc7d3a30a0))
- **APIInvite:** add `expires_at` field and `with_expiration` param ([#127](https://github.com/discordjs/discord-api-types/issues/127)) ([82ca0ce](https://github.com/discordjs/discord-api-types/commit/82ca0ce5c44ad2e93b3c4875baa82720ea8dd221))
- **ApplicationCommandOptionType:** add `MENTIONABLE` (9) ([#126](https://github.com/discordjs/discord-api-types/issues/126)) ([91afb0b](https://github.com/discordjs/discord-api-types/commit/91afb0bb49015c02b6000c27d07e703011dc540d))

# [0.18.0](https://github.com/discordjs/discord-api-types/compare/0.16.0...0.18.0) (2021-04-18)

### Bug Fixes

- **APIInvite:** `channel` is not optional ([#123](https://github.com/discordjs/discord-api-types/issues/123)) ([abe0513](https://github.com/discordjs/discord-api-types/commit/abe05136fd169f483fe09a213259b4cbd526497b))

### Code Refactoring

- **Invite:** rename `InviteTargetUserType` to `InviteTargetType` ([#124](https://github.com/discordjs/discord-api-types/issues/124)) ([bc9ab45](https://github.com/discordjs/discord-api-types/commit/bc9ab4556ca8a7c8e4c7942c87fa322c91b733dc))

### BREAKING CHANGES

- **Invite:** `InviteTargetUserType` is renamed to `InviteTargetType`, to match the documentation.
  - Reference: https://github.com/discord/discord-api-docs/pull/2690

# [0.17.0](https://github.com/discordjs/discord-api-types/compare/0.16.0...0.17.0) (2021-04-17)

### Bug Fixes

- **APIChannel:** `rtc_region` is optional ([#118](https://github.com/discordjs/discord-api-types/issues/118)) ([617f507](https://github.com/discordjs/discord-api-types/commit/617f507427fae6456de228a23809ab04c1df13f6))

### Code Refactoring

- **APISticker:** remove `preview_asset` ([#119](https://github.com/discordjs/discord-api-types/issues/119)) ([9817623](https://github.com/discordjs/discord-api-types/commit/9817623291ec852a831c3de225e90a65d83dac7f))

### Features

- **WebhookMessage:** add `GET` route types ([#120](https://github.com/discordjs/discord-api-types/issues/120)) ([3294fb1](https://github.com/discordjs/discord-api-types/commit/3294fb15ae6c259c1b53b7f2eca4ea8dca2f2372))

### BREAKING CHANGES

- **APISticker:** This removes the `preview_asset` property from sticket objects
  - Reference: https://github.com/discord/discord-api-docs/commit/b9b8db2
- **APIChannel:** This corrects the fact that `rtc_region` isn't present on non-voice-like channels

# [0.16.0](https://github.com/discordjs/discord-api-types/compare/0.15.1...0.16.0) (2021-04-14)

### Features

- **Guild:** add `nsfw` property ([#116](https://github.com/discordjs/discord-api-types/issues/116)) ([21b572b](https://github.com/discordjs/discord-api-types/commit/21b572b7f25a320e40f8ca2e63d6bd8b111403aa))
- **RESTJSONErrorCode:** add `UnknownInteraction` error code ([#115](https://github.com/discordjs/discord-api-types/issues/115)) ([ced37d0](https://github.com/discordjs/discord-api-types/commit/ced37d0a5ebdc80887662529922c57e2531e1e5b))

### docs

- **Routes:** add `GET` routes to `webhookMessages` ([#114](https://github.com/discordjs/discord-api-types/issues/114)) ([6451679](https://github.com/discordjs/discord-api-types/commit/6451679c9acb9d7fde593914452577669473841d))

### BREAKING CHANGES

- **Routes:** possibly a breaking change due to the fact that the messageID is now strictly typed as a Snowflake or `@me`
  - Reference: discord/discord-api-docs#2410

## [0.15.1](https://github.com/discordjs/discord-api-types/compare/0.15.0...0.15.1) (2021-04-12)

### Bug Fixes

- **TypeScript:** imports not working in TypeScript ([4738c33](https://github.com/discordjs/discord-api-types/commit/4738c33b062d359a1c2fbb35cdd2daf128ab6e5b))

# [0.15.0](https://github.com/discordjs/discord-api-types/compare/0.14.0...0.15.0) (2021-04-11)

### Bug Fixes

- **APIApplicationCommand:** default_permission ([#111](https://github.com/discordjs/discord-api-types/issues/111)) ([9420c3e](https://github.com/discordjs/discord-api-types/commit/9420c3e0af7b2486f0e49bb680ed98e0d9f5c625))
- **Scripts:** `await` in `versions` script, log any errors from deno one ([9113eb1](https://github.com/discordjs/discord-api-types/commit/9113eb133c4627445e2bcd4583c243dde74a20ee))

### BREAKING CHANGES

- **APIApplicationCommand:** This renames the `default_permissions` property to `default_permission`, the correct spelling.

# [0.14.0](https://github.com/discordjs/discord-api-types/compare/0.13.3...0.14.0) (2021-04-11)

### Bug Fixes

- **APIMessage:** correct type for `application` ([ed2cbe8](https://github.com/discordjs/discord-api-types/commit/ed2cbe82c56f872ee01a9eb6991ef70dc22d8c1f))
- **GatewayGuildMemberUpdateDispatchData:** correct types ([14f14e2](https://github.com/discordjs/discord-api-types/commit/14f14e227955af41ed2823f11c6e8d03d12549ba))
- **GatewayPresenceUpdateData:** `activities` may not be `null` ([bb3cb04](https://github.com/discordjs/discord-api-types/commit/bb3cb04e016840f66eecbe39c2e07aea8ea12bc8))
- **GatewayVoiceServerUpdateDispatchData:** `endpoint` is nullable ([e8203a1](https://github.com/discordjs/discord-api-types/commit/e8203a1112a834ce9aaae4ab95f711d3aaffc20f))
- **GuildWelcomeScreenChannel:** document missing `description` property ([238695b](https://github.com/discordjs/discord-api-types/commit/238695b44d8547d51782e3d9d9729e2db85bc444))
- **OAuth2:** `scope` can be optional / not required ([bbe56a9](https://github.com/discordjs/discord-api-types/commit/bbe56a97564ce8c317f291080327484f0d987e1c))
- **OAuth2:** remove invalid parameters from refresh token request ([1c02450](https://github.com/discordjs/discord-api-types/commit/1c024507f3f55b922565845c2bedac615ffa24d5))
- **RPC:** version `RPC` same as` rest`, export again in `shortcuts` ([67e0ba1](https://github.com/discordjs/discord-api-types/commit/67e0ba1834e6d9de9ad00bd452f5e8da59ff1cc6))
- **Utils:** correct import for deno users ([42dd75f](https://github.com/discordjs/discord-api-types/commit/42dd75f2581b2a8862e4f0446b42ff838f923de0))

### chore

- **Gateway:** remove `guild_subscriptions` ([ab8b289](https://github.com/discordjs/discord-api-types/commit/ab8b289ac8f99fe1a998ef06320ad9046aafa1d2))
- **GatewayReady:** un-document `private_channels` ([457edf4](https://github.com/discordjs/discord-api-types/commit/457edf4ed43327fb871d3b1638745b905518ef91))
- **Integrations:** remove routes that bots can no longer interact with ([577c5bd](https://github.com/discordjs/discord-api-types/commit/577c5bd040dd1dc258ca6c414cf6ac69ae84916c))
- **MessageGetReactions:** remove `before` pagination ([0ec26b7](https://github.com/discordjs/discord-api-types/commit/0ec26b731cda570f34e59e05a8c21f272b1fd64e))
- **Oauth2Scopes:** remove `rpc.api` ([7ee8511](https://github.com/discordjs/discord-api-types/commit/7ee85113ea8107106460889a2eaa42b251ee05d0))
- **Permissions:** rename `USE_APPLICATION_COMMANDS` to `USE_SLASH_COMMANDS` ([2aa7f7a](https://github.com/discordjs/discord-api-types/commit/2aa7f7a7b8da3d4d46a7743830562d996d32120b))
- **UserFlags:** un-document `SYSTEM` flag ([1774d4c](https://github.com/discordjs/discord-api-types/commit/1774d4c4749d303f24bfb3c754cf79a4ca7ef699))

### Code Refactoring

- restructure module ([81cdfc2](https://github.com/discordjs/discord-api-types/commit/81cdfc2d9c523d98edd0a69f976879e848e1167b))

### Features

- **APIApplication:** document `terms_of_service` and `privacy_policy` ([598cbfb](https://github.com/discordjs/discord-api-types/commit/598cbfb958a67d5ba61696ba877ea0bae4c4be55))
- **APIAttachment:** add `content_type` ([2d432d1](https://github.com/discordjs/discord-api-types/commit/2d432d145eb8a009b092b27b6231252d7b2f2823))
- **APIChannel:** add `rtc_region` ([#108](https://github.com/discordjs/discord-api-types/issues/108)) ([07ba907](https://github.com/discordjs/discord-api-types/commit/07ba9072429dec85a13479dc211ec1f9d8788acf))
- **APIChannel:** add `video_quality_mode` ([#106](https://github.com/discordjs/discord-api-types/issues/106)) ([d8d7bcc](https://github.com/discordjs/discord-api-types/commit/d8d7bccea617ad0d1150b9d2aed3b26ec1e4f99a))
- **APIInteraction:** add type-check utilities ([3307201](https://github.com/discordjs/discord-api-types/commit/33072011c2ea9ace8350dedc0cd1068660dc2ece))
- **Exports:** add `globals` to the exported sub-modules ([5d35f61](https://github.com/discordjs/discord-api-types/commit/5d35f61334480af983c4767373ef05e395da2e18))
- **Gateway:** add `INTEGRATION_*` events ([9c3fab0](https://github.com/discordjs/discord-api-types/commit/9c3fab052619609eb543ff400c2b813b69c6b99f))
- **GuildWelcomeScreen:** document `welcome-screen` endpoint ([169ecde](https://github.com/discordjs/discord-api-types/commit/169ecde47a6a911309630e952ab26b805ac87cf0))
- **Interactions:** add batch command create / update ([edfe70a](https://github.com/discordjs/discord-api-types/commit/edfe70a1eeec9be1104ec68a20d95e83512b3268))
- **Interactions:** add Slash Command Permissions ([f517f35](https://github.com/discordjs/discord-api-types/commit/f517f3596f458a2c2e4c4a26d5c13bbed4c4a71f))
- **Invites:** document `target_application` & correct property names ([97c8ab3](https://github.com/discordjs/discord-api-types/commit/97c8ab3f5165c6f161e9338e944cff8b296756d5))
- **MessageFlags:** `EPHEMERAL` desc and added `LOADING` ([#109](https://github.com/discordjs/discord-api-types/issues/109)) ([4462255](https://github.com/discordjs/discord-api-types/commit/4462255168af2ad66c9c7405500e80d3fa41de33))
- **PatchAPIWebhookMessage:** add `file` property ([fc2f3c5](https://github.com/discordjs/discord-api-types/commit/fc2f3c58cf5ea2a8c0a1a14a62a16f432b1776e2))
- **Webhook:** add & document `url` property ([77e5bb6](https://github.com/discordjs/discord-api-types/commit/77e5bb624d86e4bc8696c8dac4f513c27eb8aff1))
- invite reminder system message type and flag ([#105](https://github.com/discordjs/discord-api-types/issues/105)) ([b90714f](https://github.com/discordjs/discord-api-types/commit/b90714f677c67c009ddb6d00734ab8998c194350))
- stage channels! ([#107](https://github.com/discordjs/discord-api-types/issues/107)) ([6cd7542](https://github.com/discordjs/discord-api-types/commit/6cd75426c6d7da145b40a656e4c1a1d3d26bfb1f))

### BREAKING CHANGES

- **APIInteraction:** This commit removes the `guild_id` property from `APIDMInteraction`
  which allows type-checks to work with the `in` operator.
  Because of that, we also provide utility functions that help with those type checks.
  Use them in your code by importing the `Utils` object, or by directly importing them.
  Check the README for examples
- **OAuth2:** This commit removes parameters that are not expected
  in the refresh token request body

Reference: https://github.com/discord/discord-api-docs/commit/eaa12cbc8f96cf7cfe8c530f88e60582c24ca5dd

- **GatewayReady:** This property has been deprecated for a while, and was
  returning an empty array for bot users. This commit removes it entirely

Reference: https://github.com/discord/discord-api-docs/commit/f36156dbb641f5c4d4f4593f345bfd6e27fdee08

- **Permissions:** This commit brings consistency with the documentation,
  where the permission is documented as `USE_SLASH_COMMANDS`, whereas the
  client has it as `USE_APPLICATION_COMMANDS` internally

Reference: https://github.com/discord/discord-api-docs/commit/c7d25885c5cd80a49b31609a40b70603b35f9dec

- **MessageGetReactions:** This query parameter is not usable and was not respected
  by the API.

Reference: https://github.com/discord/discord-api-docs/commit/f72b084773d4d3989fb19be4fb4d9cf276a1e6b3

- **OAuth2:** This removes the `scope` property from the authorization
  code flow, as it is not expected there.

Reference: https://github.com/discord/discord-api-docs/commit/57965033ab4216a0bb853e85d6912531cd5a9981

- **Gateway:** This removes `guild_subscriptions`, as it has been
  deprecated in favor of `intents`.

Reference: https://github.com/discord/discord-api-docs/commit/8de017436d37e56fab14cb8f68f0448a45ebc731

- **Oauth2Scopes:** This removes the `rpc.api` scope, as it has been removed
  from the documentation.

Reference: https://github.com/discord/discord-api-docs/commit/2641d9808f676e7316483d152cdb37ed1168f968

- **APIMessage:** This removes the `APIMessageApplication` interface, as it has
  been removed from the documentation, being replaced with the OAuth2 application.

Reference: https://github.com/discord/discord-api-docs/commit/ff0c831e424f1bc17dd3cde62da48d5c3d933e88

- **APIApplication:** This renames the `GatewayPresenceLimit` flag to
  `GatewayPresenceLimited`, for consistency with `GatewayGuildMembersLimited`
  and the documented name.

Reference: https://github.com/discord/discord-api-docs/commit/39b254bed1cc396c475e508a3f2bf328815605c9

- **GatewayVoiceServerUpdateDispatchData:** Any code that expects `endpoint` to never be null needs
  to be updated, and the conditions specified in the documentation need
  to be respected regarding that.

Reference: https://github.com/discord/discord-api-docs/commit/e887382fafd4c4417f7ba62963984f25bcb643f6

- **Invites:** This renames `target_user_type` to `target_type`,
  the actual value the API expects.

Reference: https://github.com/discord/discord-api-docs/commit/1b4e363e324eb1f49a47e32cb0108fbe276c8e0e

- **GatewayPresenceUpdateData:** Clearing `activities` is done by setting them to an empty
  array, not by setting them to `null`.

Reference: https://github.com/discord/discord-api-docs/commit/5bf598b864fb89262fce07137f68ce6e7e583432

- **UserFlags:** This removes a flag that bots should not use, as Discord
  said this is an internal flag.

Reference: https://github.com/discord/discord-api-docs/commit/9293f0d490ac6acf9d627e429e5a8131b303b528

- **Integrations:** This removes the 3 routes that bots can no longer access.

Reference: https://github.com/discord/discord-api-docs/commit/efe4e5808b6826d40302e265a5ae9b5b65d92fe7

- **Exports:** Certain objects from this file have been moved to their
  appropriate spot (such as JSON Error Codes)
- Files have been moved around in order to keep them
  organized. Exports might also be missing, so please report if that is the
  case.

## [0.13.3](https://github.com/discordjs/discord-api-types/compare/0.13.2...0.13.3) (2021-03-28)

## [0.13.2](https://github.com/discordjs/discord-api-types/compare/0.13.1...0.13.2) (2021-03-28)

### Bug Fixes

- **ApplicationCommandInteractionDataOptionSubCommandGroup:** typo ([#102](https://github.com/discordjs/discord-api-types/issues/102)) ([15c171c](https://github.com/discordjs/discord-api-types/commit/15c171c558a10cd6d1c4880e725af0e63dd82255))

## [0.13.1](https://github.com/discordjs/discord-api-types/compare/0.13.0...0.13.1) (2021-03-27)

### Bug Fixes

- **APIInteractionResponse:** `data` should not always be present ([#100](https://github.com/discordjs/discord-api-types/issues/100)) ([ffcd95d](https://github.com/discordjs/discord-api-types/commit/ffcd95d597a5d1c5b3ea072cd1dfb44f079de4b7))

# [0.13.0](https://github.com/discordjs/discord-api-types/compare/0.12.1...0.13.0) (2021-03-27)

### Bug Fixes

- **deno:** replace `const enum` exports in deno with normal `enum`s ([#89](https://github.com/discordjs/discord-api-types/issues/89)) ([7343fab](https://github.com/discordjs/discord-api-types/commit/7343fabe82e4321808bac784aed600afa8cf4249))
- **RESTPostAPIChannelMessageJSONBody:** mark `tts` as a full boolean ([#96](https://github.com/discordjs/discord-api-types/issues/96)) ([9d8d090](https://github.com/discordjs/discord-api-types/commit/9d8d090c9c6cd5be1f7b578b2f6a6387544f3359))
- **RESTPostAPIGuildsJSONBody:** make some fields nullable ([#91](https://github.com/discordjs/discord-api-types/issues/91)) ([ae1900d](https://github.com/discordjs/discord-api-types/commit/ae1900dc2f65065153b1bf2437348e63b63db49e))

### Features

- **APIApplication:** add ApplicationFlags ([#92](https://github.com/discordjs/discord-api-types/issues/92)) ([92f76f1](https://github.com/discordjs/discord-api-types/commit/92f76f1a3c8acf80689b994e9bfaec70d198aaa1))
- **APIApplicationCommandInteractionData:** add `resolved` ([#86](https://github.com/discordjs/discord-api-types/issues/86)) ([24155ae](https://github.com/discordjs/discord-api-types/commit/24155aeb71d46de48353ce01bfb48e197a84e59b))
- **APIBaseInteraction:** add application_id ([#98](https://github.com/discordjs/discord-api-types/issues/98)) ([0582f88](https://github.com/discordjs/discord-api-types/commit/0582f883c517e5fdc2373ac0a85717a7bfeec018))
- **APIInteraction:** DM slash commands and property descriptions ([#84](https://github.com/discordjs/discord-api-types/issues/84)) ([d0b3106](https://github.com/discordjs/discord-api-types/commit/d0b310675848f4724e47c490b06d828f7ede204c))
- **APIInteractionResponse, APIInteractionResponseType:** update for UI changes ([#90](https://github.com/discordjs/discord-api-types/issues/90)) ([eafe7ba](https://github.com/discordjs/discord-api-types/commit/eafe7ba96fc6e771579850a8a7de36adade8efdc))
- **APIMessage:** add `interaction` ([#93](https://github.com/discordjs/discord-api-types/issues/93)) ([0f29b32](https://github.com/discordjs/discord-api-types/commit/0f29b32e05abe89f70f72989024b9c63493782fa))
- **APIMessageReferenceSend:** add `fail_if_not_exists` ([#82](https://github.com/discordjs/discord-api-types/issues/82)) ([855f36d](https://github.com/discordjs/discord-api-types/commit/855f36d9309ae69f57da723648d3791e3134089e))
- **PermissionFlagsBits:** add `USE_APPLICATION_COMMANDS` ([#85](https://github.com/discordjs/discord-api-types/issues/85)) ([ceb787b](https://github.com/discordjs/discord-api-types/commit/ceb787ba36ed05f25f9acab86496d3054cb15013))
- **rest:** api base routes ([#87](https://github.com/discordjs/discord-api-types/issues/87)) ([466fa95](https://github.com/discordjs/discord-api-types/commit/466fa95b0e239b7984275959886b995a5020640a))
- add Application Command events ([#75](https://github.com/discordjs/discord-api-types/issues/75)) ([da2c2e9](https://github.com/discordjs/discord-api-types/commit/da2c2e9ada39482fce095c47339b40d6c24e683a))
- add GET single Application Command ([#76](https://github.com/discordjs/discord-api-types/issues/76)) ([5826da2](https://github.com/discordjs/discord-api-types/commit/5826da22e30839b1f9fcd73479f8bc0f213001bd))
- implement FormatPatterns ([#79](https://github.com/discordjs/discord-api-types/issues/79)) ([4e4a084](https://github.com/discordjs/discord-api-types/commit/4e4a0840036eddb89a1d49d69f59905dba206afb))
- **OAuth2:** add `/oauth2/[@me](https://github.com/me)` route ([#73](https://github.com/discordjs/discord-api-types/issues/73)) ([84759d1](https://github.com/discordjs/discord-api-types/commit/84759d19bc4cd0f33f0a94608c1af2b4d6a820c6))
- **Webhook:** add Edit Webhook Message result and error 50027 ([#71](https://github.com/discordjs/discord-api-types/issues/71)) ([4c77a5d](https://github.com/discordjs/discord-api-types/commit/4c77a5d90acf627574eff571a92a6703c6ea2d13))

## [0.12.1](https://github.com/discordjs/discord-api-types/compare/0.12.0...0.12.1) (2021-01-05)

### Bug Fixes

- run deno workflow only on branch push ([#66](https://github.com/discordjs/discord-api-types/issues/66)) ([0ef4620](https://github.com/discordjs/discord-api-types/commit/0ef46202f6c8c257e6300e634b675e7e1b6ffa90))

### Features

- add Snowflake and Permissions types ([#69](https://github.com/discordjs/discord-api-types/issues/69)) ([549a6f0](https://github.com/discordjs/discord-api-types/commit/549a6f023698f05829f1dfdf1190c027a994d6cd))

# [0.12.0](https://github.com/discordjs/discord-api-types/compare/0.11.2...0.12.0) (2021-01-01)

### Bug Fixes

- **APIApplication:** flags should be omitted in REST, not optional everywhere ([#57](https://github.com/discordjs/discord-api-types/issues/57)) ([664ad80](https://github.com/discordjs/discord-api-types/commit/664ad800ccdfb84cc1547dd151c0f6e16157e04b))
- **RESTPatchAPIChannelJSONBody:** add missing bitrate field ([#60](https://github.com/discordjs/discord-api-types/issues/60)) ([15892ec](https://github.com/discordjs/discord-api-types/commit/15892ec870ff818d7f66bd9b57969638e5f17e1f))

### Features

- **GatewayActivity:** add missing fields ([#39](https://github.com/discordjs/discord-api-types/issues/39)) ([dccdfe0](https://github.com/discordjs/discord-api-types/commit/dccdfe044fb4c02b6cfc910e2d39e469ebd9c75a))

## [0.11.2](https://github.com/discordjs/discord-api-types/compare/0.11.1...0.11.2) (2020-12-20)

## [0.11.1](https://github.com/discordjs/discord-api-types/compare/0.11.0...0.11.1) (2020-12-19)

### Bug Fixes

- **APIAuditLogEntry:** user_id is not nullable ([#52](https://github.com/discordjs/discord-api-types/issues/52)) ([2b89beb](https://github.com/discordjs/discord-api-types/commit/2b89beb52b66a4865124b75069ca6bc3d5886c48))
- **RESTPostAPIGuildsJSONBody:** system_channel_flags is optional ([#53](https://github.com/discordjs/discord-api-types/issues/53)) ([ba4c0d7](https://github.com/discordjs/discord-api-types/commit/ba4c0d78f4ba3755f524b5f63420a36580a1a08e))

# [0.11.0](https://github.com/discordjs/discord-api-types/compare/0.10.0...0.11.0) (2020-12-19)

### Bug Fixes

- **APIGuildMember:** drop nullability of `pending` prop ([#49](https://github.com/discordjs/discord-api-types/issues/49)) ([c2f0dee](https://github.com/discordjs/discord-api-types/commit/c2f0deeebd28fa3a09f795d1b263ff8fd5d9ae4d))
- **RESTPatchAPIGuildJSONBody:** multiple properties are actually nullable ([#48](https://github.com/discordjs/discord-api-types/issues/48)) ([018fc4f](https://github.com/discordjs/discord-api-types/commit/018fc4f8ea4d50f719820001822778079a055fa3))

# [0.10.0](https://github.com/discordjs/discord-api-types/compare/0.9.1...0.10.0) (2020-12-09)

### Features

- server templates ([#25](https://github.com/discordjs/discord-api-types/issues/25)) ([7d873f7](https://github.com/discordjs/discord-api-types/commit/7d873f73c7a8c64630c57d3eaf33d8c4913ed835))

## [0.9.1](https://github.com/discordjs/discord-api-types/compare/0.9.0...0.9.1) (2020-11-22)

# [0.9.0](https://github.com/discordjs/discord-api-types/compare/0.8.0...0.9.0) (2020-11-22)

### Features

- **Message:** reply updates ([#34](https://github.com/discordjs/discord-api-types/issues/34)) ([21b9ae4](https://github.com/discordjs/discord-api-types/commit/21b9ae4aaf29c276d1a6ccc4c79ace8d64a53e9d))
- **Message:** Stickers ([#32](https://github.com/discordjs/discord-api-types/issues/32)) ([39ea1f4](https://github.com/discordjs/discord-api-types/commit/39ea1f4429e5194576200635f885ab102763060b))

# [0.8.0](https://github.com/discordjs/discord-api-types/compare/0.7.0...0.8.0) (2020-11-03)

### Bug Fixes

- webhookPlatform route ([#36](https://github.com/discordjs/discord-api-types/issues/36)) ([666a0c7](https://github.com/discordjs/discord-api-types/commit/666a0c71528e385677570b5359ba266276202a95))
- **GatewayPresence:** correct type for sent activity objects ([#30](https://github.com/discordjs/discord-api-types/issues/30)) ([61db1ee](https://github.com/discordjs/discord-api-types/commit/61db1eee256037588ef27533c234cb01f1f699a4))

# [0.7.0](https://github.com/discordjs/discord-api-types/compare/0.6.0...0.7.0) (2020-10-18)

### Bug Fixes

- **GatewayHeartbeat:** d is nullable ([#26](https://github.com/discordjs/discord-api-types/issues/26)) ([0982610](https://github.com/discordjs/discord-api-types/commit/098261073163eeb4fcfc217dea3511ccea1f27c5))
- **GatewayIdentify:** use correct presence interface ([#28](https://github.com/discordjs/discord-api-types/issues/28)) ([91c63f0](https://github.com/discordjs/discord-api-types/commit/91c63f05ca1e8e92c4c1df124365405fe8d34108))

### Features

- **APIGuildWidgetMember:** add activity and use proper status type ([#24](https://github.com/discordjs/discord-api-types/issues/24)) ([f058ed6](https://github.com/discordjs/discord-api-types/commit/f058ed6aa1f7593c22e4a3f0c9dd2f4bbd0190dc))

# [0.6.0](https://github.com/discordjs/discord-api-types/compare/0.5.0...0.6.0) (2020-10-04)

### Bug Fixes

- **APIChannel:** position is optional ([#21](https://github.com/discordjs/discord-api-types/issues/21)) ([061a147](https://github.com/discordjs/discord-api-types/commit/061a147fbb381738b28ca3fb73fa1a7be0e1b108))
- **RESTPostAPIGuildsJSONBody:** use correct types ([#22](https://github.com/discordjs/discord-api-types/issues/22)) ([dcf8ddf](https://github.com/discordjs/discord-api-types/commit/dcf8ddf25b26a9c72dbb1b5712503e6d5e516ad1))

### Features

- v8 support ([#14](https://github.com/discordjs/discord-api-types/issues/14)) ([11b95c8](https://github.com/discordjs/discord-api-types/commit/11b95c86099e609128a8ca76d06d43498fae72f5))

# [0.5.0](https://github.com/discordjs/discord-api-types/compare/0.4.1...0.5.0) (2020-09-19)

### Bug Fixes

- correct typos ([#18](https://github.com/discordjs/discord-api-types/issues/18)) ([97c7b4e](https://github.com/discordjs/discord-api-types/commit/97c7b4ea24852f49b5f952e81a0e6f21ed405316))
- **APIUser:** premium_type is optional ([#19](https://github.com/discordjs/discord-api-types/issues/19)) ([8cf1ba3](https://github.com/discordjs/discord-api-types/commit/8cf1ba3f4f3c28f962afad4bfcc02f5bb897286a))
- **GatewayIdentifyProperties:** rename `device` to `$device` ([#17](https://github.com/discordjs/discord-api-types/issues/17)) ([9e5c5b5](https://github.com/discordjs/discord-api-types/commit/9e5c5b5aac30e931255f39790123b4bd3458a16f))

## [0.4.1](https://github.com/discordjs/discord-api-types/compare/0.4.0...0.4.1) (2020-09-18)

### Features

- add oauth2 types ([#16](https://github.com/discordjs/discord-api-types/issues/16)) ([10fdeba](https://github.com/discordjs/discord-api-types/commit/10fdeba1286e385e087d6c9405872f948507f183))

# [0.4.0](https://github.com/discordjs/discord-api-types/compare/0.3.0...0.4.0) (2020-09-16)

### Features

- **ActivityType:** add Competing activity type ([#11](https://github.com/discordjs/discord-api-types/issues/11)) ([94d0a16](https://github.com/discordjs/discord-api-types/commit/94d0a1680532412c8d5f9659056f87a37d1def7d))

# [0.3.0](https://github.com/discordjs/discord-api-types/compare/v0.2.0...0.3.0) (2020-09-14)

### Bug Fixes

- **APIMessage:** Correct APIMessage#mentions type ([#9](https://github.com/discordjs/discord-api-types/issues/9)) ([fe1868b](https://github.com/discordjs/discord-api-types/commit/fe1868b04f8a9f4be1c09ffba0afa60f4def8595))

# [0.2.0](https://github.com/discordjs/discord-api-types/compare/v0.1.1...v0.2.0) (2020-09-10)

### Bug Fixes

- **Readme:** add missing semicolon ([#1](https://github.com/discordjs/discord-api-types/issues/1)) ([5e3e101](https://github.com/discordjs/discord-api-types/commit/5e3e1016b5fe274d33503d36771fc276fd384ccf))

## [0.1.1](https://github.com/discordjs/discord-api-types/compare/767a833a12a8268b9f1b780f338da6f28cefa5cd...v0.1.1) (2020-08-22)

### Bug Fixes

- set target version to ES2020 ([767a833](https://github.com/discordjs/discord-api-types/commit/767a833a12a8268b9f1b780f338da6f28cefa5cd))
