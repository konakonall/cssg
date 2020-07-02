#!/usr/bin/env node

const creator = require('./creator')
const writer = require('./writer')
const cssg = require('./cssg')

const args = require('yargs')
  .command('init [path]', 'init cssg config', (yargs) => {
    yargs
      .demandOption(['path'])
      .describe({
        path: '本地配置文件目录'
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
  .command('add [name]', 'generate new test case from template', (yargs) => {
    yargs
      .demandOption(['name'])
      .describe({
        name: 'Case Name'
      })
  }, (argv) => {
    creator.add(process.cwd(), argv.name)
  })
  .argv

  

