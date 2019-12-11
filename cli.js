#!/usr/bin/env node

const compiler = require('./compiler')
const writer = require('./writer')
const tester = require('./tester')

const args = require('yargs')
  .command('build [docs]', 'build project', (yargs) => {
    yargs
      .positional('docs', {
        describe: 'docs to retrive snippets from'
      })
  }, (argv) => {
    tester.build(process.cwd(), argv.docs)
  })
  .argv

