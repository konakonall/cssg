#!/usr/bin/env node

const creator = require('./creator')
const writer = require('./writer')
const cssg = require('./cssg')

const args = require('yargs')
  .command('config', 'show local config', (yargs) => {
  }, (argv) => {
    console.log(cssg.getLocalConf())
  })
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
        name: 'Case 名称'
      })
  }, (argv) => {
    creator.add(process.cwd(), argv.name)
  })
  .command('compile [docset] [lang]', 'generate new test case from template', (yargs) => {
    yargs
      .demandOption(['docset', 'lang'])
      .describe({
        docset: 'qcloud 文档仓库本地路径',
        lang: 'SDK语言'
      })
  }, (argv) => {
    creator.compile(process.cwd(), argv.docset, argv.lang)
  })
  .argv

  

