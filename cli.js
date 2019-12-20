#!/usr/bin/env node

const compiler = require('./compiler')
const writer = require('./writer')

const args = require('yargs')
  .command('build [docs]', 'build project', (yargs) => {
    yargs
      .positional('docs', {
        describe: 'docs to retrive snippets from'
      })
  }, (argv) => {
    compiler.build(process.cwd(), argv.docs)
  })
  .command('write [docs]', 'write snippet to docs', (yargs) => {
    yargs
      .positional('docs', {
        describe: 'docs to write snippets to'
      })
  }, (argv) => {
    writer.write(process.cwd(), argv.docs)
  })
  .argv

