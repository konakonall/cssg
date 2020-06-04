#!/usr/bin/env node

const tester = require('./tester')
const writer = require('./writer')
const compiler = require('./compiler')

const args = require('yargs')
  .command('testcase', 'generate testcase from sources', () => {
  }, (argv) => {
    tester.build(process.cwd(), argv.docs)
  })
  .command('write [docs]', 'write snippet to docs', (yargs) => {
    yargs
      .positional('docs', {
        describe: 'docs to write snippets to'
      })
  }, (argv) => {
    writer.write(process.cwd(), argv.docs)
  })
  .command('extract [dest] [lang]', 'extract snippet to examples', (yargs) => {
    yargs
      .positional('dest', {
        describe: 'dest to generate example from docs'
      })
      .positional('lang', {
        describe: 'the language'
      })
  }, (argv) => {
    compiler.build(process.cwd(), argv.docs, argv.lang)
  })
  .argv

