#!/usr/bin/env node

const creator = require('./creator')
const writer = require('./writer')

const args = require('yargs')
  .command('writeDocument [lang] [docs]', 'write snippet to docs', (yargs) => {
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
  .command('newCase [name]', 'generate new test case from template', () => {
  }, (argv) => {
    creator.create(process.cwd(), argv.docs)
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

