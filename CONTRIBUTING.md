# 🛠️ Contributing

## 💻 Setting up development environment

To set up a development environment, you need to have nodejs installed. Make sure that it is at least the current LTS version.
Then, install the dependencies, by running `npm install` in the root of the repository.

```sh
npm install
```

## ✏️ Make your changes

The repository is setup as a monorepo. This means that there are multiple packages in the repository. The important folders are `packages`, `examples` and `docs`.
All packages are in the `packages` folder. In the folder are some sub-folders to structurize the packages. The `examples` folder contains examples. The `docs` folder contains markdown files that are used to build the documentation website with `vitepress`.

- `docs`: Contains the documentation pages for SignalDB.
- `examples`: Contains all SignalDB examples.
- `packages`:
  - `base`: Contains all base packages of SignalDB.
    - `core`: Contains `@signaldb/core`
    - `sync`: Contains `@signaldb/sync`
  - `integrations`: Contains all integrations to frameworks like React for example.
  - `reactivity-adapters`: Contains all reactivity adapters of SignalDB.
  - `storage-adapters`: Contains all storage adapters of SignalDB.

## ✅ Committing your changes

SignalDB uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages. Please make sure that your commit messages follow the conventions.

## 🧪 Running the tests

SignalDB uses `vitest` for testing. To run the tests, you can use the `npm test` command.

```sh
npm test
```

## 📊 100% coverage

SignalDB aims for 100% test coverage. If you add a new feature, please add tests for it and make sure that all additions are covered. You can check the test coverage by running `npm run coverage`. [codecov.io](https://app.codecov.io/gh/maxnowack/signaldb) will run automatically to check the coverage of your PR.

```sh
npm run coverage
```

Sometimes there are edge cases that are really hard to test. In that case, you can use `istanbul ignore` statements. Please explain why you have choosen to use them in your PR!

## 📝 Changelog

Please also add at least one entry to the `[Unreleased]` section in the `CHANGELOG.md` of the package you've changed. You'll find the `CHANGELOG.md` in the folder of the specific package, right next to the `package.json`. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),

## 📚 Documentation

When you make changes to the API, please also update the documentation in the `docs` folder. The documentation is written in Markdown and uses [VitePress](https://vitepress.dev) for rendering. There a some scripts in the root `package.json` to run or build the documentation. Use `npm run docs:dev` to start a local development server if you want to see how your changes look like.

```sh
npm run docs:dev
```

## ❓ Questions

If you have any questions, feel free to [open a disscussion on GitHub](https://github.com/maxnowack/signaldb/discussions/new/choose) or join our [Discord server](https://discord.gg/qMvXKXxBTp).
