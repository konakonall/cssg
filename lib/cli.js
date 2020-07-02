#!/usr/bin/env node

const creator = require('./creator')
const writer = require('./writer')
const cssg = require('./cssg')

const args = require('yargs')
  .command('config [path]', 'init cssg config', (yargs) => {
    yargs
      .demandOption(['path'])
      .describe({
        path: '本地配置文件路径'
      })
  }, (argv) => {
    cssg.init(argv.path)
  })
  .command('write [lang]', 'write snippet to docs', (yargs) => {
    yargs
      .demandOption(['lang'])
      .describe({
        lang: 'SDK语言'
      })
  }, (argv) => {
    writer.write(process.cwd(), argv.lang)
  })
  .command('case [lang] [name]', 'generate new test case from template', (yargs) => {
    yargs
      .demandOption(['lang, name'])
      .describe({
        name: 'Case Name'
      })
  }, (argv) => {
    creator.create(process.cwd(), argv.name)
  })
  .argv

  

