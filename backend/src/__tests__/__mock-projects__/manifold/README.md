# Manifold

This [monorepo][] has basically everything involved in running and operating Manifold.

## Getting started

0. Make sure you have [Yarn 1.x][yarn]
1. `$ cd web`
2. `$ yarn`
3. `$ yarn dev:dev`
4. Your site will be available on http://localhost:3000

See [`web/README.md`][web-readme] for more details on hacking on the web client.

## General architecture

Manifold's public API and web app are hosted by [Vercel][vercel]. Our data has been stored in Firebase's database [Cloud Firestore][cloud-firestore] but we are currently migrating it to SQL hosted on [Supabase][supabase].

We often use firebase and supabase directly on the client to get the data. However, for complicated operations (like buying shares) we have a separate internal HTTP API deployed in a docker container in google cloud. This is seperate from the public-facing api hosted via Vercel; see [`functions/README.md`][functions-readme] for more details.

## Directory overview

- [web/](./web/): UI and business logic for the client. Where most of the site lives. The public API endpoints are also in here.

- [backend/](./backend/): All the rest of the stuff we run on GCP.

- [common/](./common/): Typescript library code shared between `web/` & `backend/`. If you want to look at how the market math
  works, most of that's in here (it gets called from the `bet` and `sellBet` endpoints in `functions/`.) Also
  contains in `common/envs` configuration for the different environments (i.e. prod, dev, Manifold for Teams instances.)

- [docs/](./docs/): Manifold's public documentation that lives at https://docs.manifold.markets.

## Contributing

We're pretty new to open-source culture so please be patient and let us know how we can do better. Feel free to open issues, submit PRs, and chat about the process on [Discord][discord]. We would prefer [small PRs][small-prs] that we can effectively evaluate and review - check in with us first if you want to work on a big change.

By contributing to this codebase, you are agreeing to the terms of the [Manifold CLA](./.github/CONTRIBUTING.md).

If you need additional access to any infrastructure in order to work on something (e.g. Vercel, Firebase, Supabase) let us know about that on [Discord][discord] as well.

[vercel]: https://vercel.com/
[monorepo]: https://semaphoreci.com/blog/what-is-monorepo
[yarn]: https://classic.yarnpkg.com/lang/en/docs/install/
[web-readme]: ./web/README.md
[functions-readme]: ./backend/functions/README.md
[supabase]: https://supabase.com/
[cloud-firestore]: https://firebase.google.com/docs/firestore
[cloud-functions]: https://firebase.google.com/docs/functions
[small-prs]: https://google.github.io/eng-practices/review/developer/small-cls.html
[discord]: https://discord.gg/3Zuth9792G

[![Mutable.ai Auto Wiki](https://img.shields.io/badge/Auto_Wiki-Mutable.ai-blue)](https://wiki.mutable.ai/manifoldmarkets/manifold)
