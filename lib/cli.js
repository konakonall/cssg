#!/usr/bin/env node

const tester = require('./tester')
const writer = require('./writer')
const compiler = require('./compiler')

const args = require('yargs')
  .command('write [lang] [docs]', 'write snippet to docs', (yargs) => {
    yargs
      .require('docs', {
        describe: 'docs to write snippets to'
      })
      .required('lang', {
        describe: 'the language'
      })
  }, (argv) => {
    writer.write(process.cwd(), argv.docs)
  })
  .command('testcase', 'generate testcase from sources', () => {
  }, (argv) => {
    tester.build(process.cwd(), argv.docs)
  })
  .command('extract [dest] [lang]', 'extract snippet to examples', (yargs) => {
    yargs
      .required('dest', {
        describe: 'dest to generate example from docs'
      })
      .required('lang', {
        describe: 'the language'
      })
  }, (argv) => {
    compiler.build(process.cwd(), argv.docs, argv.lang)
  })
  .argv

